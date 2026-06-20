# 游戏数据同步方案 v3

> 版本: v3 | 日期: 2026-06-20 | 状态: 待实现

## 一、数据源

群星安装目录 (本机: `G:/SteamLibrary/steamapps/common/Stellaris/`)

| 目录 | 文件数 | 格式 | 用途 |
|---|---|---|---|
| `localisation/simp_chinese/` | 135 | YAML `key: "value"` | 中文名+描述 |
| `events/` | 170 | PDS `key = { ... }` | 事件脚本 |
| `common/technology/` | 35 | PDS | 科技树 |
| `common/anomalies/` | 18 | PDS | 异常分类 |
| `common/traditions/` | 33 | PDS | 传统树 |

每个数据源的版本来源: `launcher-settings.json` → `rawVersion` (当前 `v4.4.3`)

## 二、数据库表

```sql
CREATE TABLE game_data (
    key         TEXT PRIMARY KEY,   -- localisation key
    zh_name     TEXT,               -- 中文名
    description TEXT,               -- 中文描述
    category    TEXT                -- 分类
);

CREATE TABLE game_events (
    id          TEXT PRIMARY KEY,   -- 事件ID 如 'anomaly.5'
    title_key   TEXT,               -- 引用 game_data.key
    desc_key    TEXT,               -- 引用 game_data.key
    options     TEXT,               -- JSON: [{name, effects}]
    triggers    TEXT,               -- JSON: 触发条件
    raw_data    TEXT,               -- 完整 PDS 原始文本
    file_path   TEXT                -- 来源文件路径
);

CREATE TABLE game_techs (
    id          TEXT PRIMARY KEY,
    tier        INTEGER,
    area        TEXT,               -- physics/society/engineering
    category    TEXT,
    cost        INTEGER,
    raw_data    TEXT,
    file_path   TEXT
);

CREATE TABLE game_anomalies (
    id          TEXT PRIMARY KEY,
    level       INTEGER,
    spawn_chance TEXT,
    outcomes    TEXT,               -- JSON: 触发的事件列表
    raw_data    TEXT,
    file_path   TEXT
);

CREATE TABLE game_traditions (
    id          TEXT PRIMARY KEY,
    tree        TEXT,               -- 所属传统树
    effects     TEXT,               -- JSON
    raw_data    TEXT,
    file_path   TEXT
);

CREATE TABLE game_data_files (
    file_path   TEXT PRIMARY KEY,   -- 相对路径
    file_hash   TEXT NOT NULL,      -- SHA256 hex
    data_type   TEXT,               -- 'localisation'/'event'/'tech'/'anomaly'/'tradition'
    entry_count INTEGER,
    updated_at  TEXT
);

-- 版本记录
-- settings 表: key='game_version', value='v4.4.3'
```

## 三、哈希检测机制

```
步骤 1: 扫描每个数据目录
  对每个文件 → Node.js crypto.createHash('sha256').update(content).digest('hex')

步骤 2: 对比 DB
  SELECT file_hash FROM game_data_files WHERE file_path = ?
  → hash 相同: 跳过
  → hash 不同: 标记为"需要处理"
  → DB 中不存在: 标记为"新增文件"

步骤 3: 汇总
  changedFiles = { file1, file2, ... }
  if changedFiles.length === 0 → 跳过全部
```

## 四、首次导入 (game_version = null)

```
第 1 步: 哈希检测 (0.2s)
  扫描所有目录 → 所有 391 个文件都是"新"的 → 全部标记

第 2 步: 解析 (串行, 每个数据类型独立)
  a. localisation 135 文件 → entries[] → 按 category 分 30 个桶
  b. events 170 文件        → events[]
  c. technology 35 文件     → techs[]
  d. anomaly 18 文件        → anomalies[]
  e. tradition 33 文件      → traditions[]

第 3 步: 写入 (每类一个事务)
  BEGIN TRANSACTION
    DELETE FROM game_data        -- 清空
    每个 category 桶: INSERT VALUES (?,?,?,?) ×1000/批
  COMMIT
  BEGIN TRANSACTION
    DELETE FROM game_events
    每1000条: INSERT INTO game_events VALUES (...)
  COMMIT
  ... (对 techs / anomalies / traditions 同样操作)

第 4 步: 记录哈希
  INSERT OR REPLACE INTO game_data_files (file_path, file_hash, data_type, entry_count, ...)
    VALUES (?, ?, ?, ?, datetime('now'))
  对全部 391 个文件

第 5 步: 记录版本
  INSERT OR REPLACE INTO settings (key, value) VALUES ('game_version', 'v4.4.3')

耗时: ~3s
内存: 逐分类处理,峰值 ~1500 条
```

## 五、版本升级 (game_version = 'v4.4.3' → 'v4.5.0')

### 场景假设

Steam 更新 Stellaris → 以下文件发生变化:

| 变化类型 | 示例 | 数量 |
|---|---|---|
| 新增文件 | `biogenesis_dlc_l_simp_chinese.yml` | ~10 |
| 修改文件 | 平衡性调整修改 `technology/` 中几个文件 | ~5 |
| 未变文件 | 上次已导入的绝大部分文件 | ~376 |

### 完整流程

```
═══════════════════════════════════════════════════════════
第 1 步: 版本检测 (0s)
═══════════════════════════════════════════════════════════
  读取 launcher-settings.json → rawVersion = 'v4.5.0'
  读取 DB settings.game_version = 'v4.4.3'
  → 版本不同,触发升级

═══════════════════════════════════════════════════════════
第 2 步: 哈希检测 (0.2s)
═══════════════════════════════════════════════════════════
  扫描 391 个文件 → 计算 SHA256 → 对比 game_data_files
  结果:
    376 个 file_hash 相同 → 跳过
    5 个 file_hash 不同 → 需要处理 (修改)
    10 个 DB 中不存在 → 需要处理 (新增)
    0 个 DB 有但文件不存在 → 记录到日志 (不应发生)

  按 data_type 分组变化:

  ┌──────────────────────────────────────────────────────┐
  │ localisation:                                        │
  │   changed: [                                          │
  │     "simp_chinese/biogenesis_l_simp_chinese.yml",     │
  │     "simp_chinese/biogenesis_bioships_l_simp_chinese.yml",│
  │     "simp_chinese/galactic_community_l_simp_chinese.yml"│
  │   ]                                                   │
  │   new: [                                              │
  │     "simp_chinese/biogenesis_dlc_l_simp_chinese.yml"  │
  │     (5 files from new DLC)                             │
  │   ]                                                   │
  │                                                       │
  │ events:                                               │
  │   changed: [                                          │
  │     "events/biogenesis_events.txt"                    │
  │   ]                                                   │
  │                                                       │
  │ technology:                                           │
  │   changed: [                                          │
  │     "common/technology/00_bio_tech.txt",              │
  │     "common/technology/00_eng_tech.txt"               │
  │   ]                                                   │
  │                                                       │
  │ anomaly: (全部未变)                                    │
  │ tradition: (全部未变)                                  │
  └──────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════
第 3 步: 解析变化文件 (0.3s)
═══════════════════════════════════════════════════════════
  仅解析标记为 changed/new 的文件 (约 8 个,而非全部 391 个)

  localisation:
    parseAllYamlFiles([6个变化文件])
    → newEntries: Map<key, {name, desc}>
    → 按 category 分桶: 只构建受影响的桶
      如: technology → 30 条, civic → 5 条, event → 20 条, ...

  events:
    parseEventFiles([1个变化文件])
    → newEvents: [{id, title_key, desc_key, options, ...}]

  technology:
    parseTechFiles([2个变化文件])
    → newTechs: [{id, tier, area, cost, ...}]

═══════════════════════════════════════════════════════════
第 4 步: 逐分类内存 diff + 批量写入 (0.5s)
═══════════════════════════════════════════════════════════

  【localisation】
  对每个受影响的 category 桶:
    a. 加载旧数据
       SELECT key, zh_name, description FROM game_data
       WHERE category = ?  AND  key IN (?, ?, ...)
       → oldMap: Map<key, {zh_name, desc}>

    b. 内存 diff (三个列表)
       for (const [key, val] of newBucket):
         if (!oldMap.has(key))          → inserts.push({key, name, desc, cat})
         else if (oldMap.get(key).name !== val.name
               || oldMap.get(key).desc !== val.desc)
                                        → updates.push({key, name, desc, cat})
         else                           → 跳过

    c. 事务批量写入
       BEGIN TRANSACTION
         if (inserts.length > 0):
           分1000条/批 INSERT INTO game_data VALUES (k1,n1,d1,c1),(k2,...),...
         if (updates.length > 0):
           分1000条/批 UPDATE game_data SET zh_name=?, description=? WHERE key=?
       COMMIT

  【events】
    for (const evt of newEvents):
      检查 game_events 中是否存在:
        if (!exists)         → INSERT
        if (raw_data不同)    → UPDATE (替换完整的 raw_data)
    (事件数量少,直接逐条处理即可,无需分批)

  【technology】
    同 events 逻辑 (少量,逐条即可)

  【anomaly / tradition】: 全部跳过 (无变化)

═══════════════════════════════════════════════════════════
第 5 步: 更新哈希记录 (0.05s)
═══════════════════════════════════════════════════════════
  对变化/新增的文件:
    INSERT OR REPLACE INTO game_data_files
    VALUES (?, ?, ?, ?, datetime('now'))

═══════════════════════════════════════════════════════════
第 6 步: 更新版本号
═══════════════════════════════════════════════════════════
  UPDATE settings SET value = 'v4.5.0' WHERE key = 'game_version'
```

### 升级耗时分解

| 步骤 | 耗时 | 说明 |
|---|---|---|
| 哈希检测 | 0.2s | 391 个文件 SHA256 |
| 解析变化 | 0.3s | 仅 ~8 个文件 |
| 内存 diff + 写入 | 0.5s | INSERT ~50条, UPDATE ~20条 |
| 更新哈希+版本 | 0.05s | 单条 UPDATE |
| **总计** | **~1s** | |

后续游戏重复升级同样高效——每次只处理 Steam 实际变更的文件。

## 六、数据回滚场景

```
场景: 用户卸载了新 DLC, Steam 回退文件
  → 哈希检测发现某些文件 hash 变化
  → 解析这些文件 → 发现一些 key 变成旧值
  → 正常执行 UPDATE (写回旧值)
  → 无需特殊处理
```

## 七、涉及文件

| 文件 | 用途 |
|---|---|
| `src/lib/parser/shared.ts` | 共享: SHA256/批量写入/文件扫描 |
| `src/lib/parser/localisation-importer.ts` | localisation 解析+同步 |
| `src/lib/parser/event-importer.ts` | event 事件解析+同步 |
| `src/lib/parser/tech-importer.ts` | 科技解析+同步 |
| `src/lib/parser/anomaly-importer.ts` | 异常解析+同步 |
| `src/lib/parser/tradition-importer.ts` | 传统解析+同步 |
| `src/lib/db.ts` | 表结构 + 批量写入辅助 |
| `src/app/api/import/route.ts` | API 入口 |
