# 游戏数据同步方案 v3

> 版本: v3 | 日期: 2026-06-20 | 状态: 实现中

## 核心原则

**数据预加载 = 离线脚本，非运行时功能**

```
开发流程:
  1. node scripts/preload-all.mjs     ← 一次性离线导入
  2. npm run dev / npm start          ← 运行时只读 SQLite

游戏更新后:
  1. node scripts/preload-all.mjs     ← 再次运行,增量同步
  2. npm run dev                      ← 继续使用
```

不需要 Web UI 触发的导入功能。不需要 `/api/import` 路由。

## 数据源

| 目录 | 文件 | 格式 | 表 |
|---|---|---|---|
| `localisation/simp_chinese/` | 135 | YAML `key: "value"` | `game_data` |
| `events/` | 170 | PDS `key = { ... }` | `game_events` |
| `common/technology/` | 35 | PDS | `game_techs` |
| `common/anomalies/` | 18 | PDS | `game_anomalies` |
| `common/traditions/` | 33 | PDS | `game_traditions` |

版本来源: `launcher-settings.json` → `rawVersion`

## 数据库表

同 v3 原设计，5 张主表 + 1 张哈希追踪表。

## 离线脚本: `scripts/preload-all.mjs`

```
入口脚本,调用各子模块:

  1. 扫描所有数据源目录
  2. SHA256 每个文件 → 对比 game_data_files
  3. 仅处理变化的文件
  4. 首次: 全量批量写入 (~3s)
     升级: 只写差异 (~1s)
  5. 写入 game_data_files 哈希记录
  6. 写入 settings.game_version

子模块:
  scripts/preload-localisation.mjs   ← localisation 解析+同步
  scripts/preload-events.mjs         ← events 解析+同步
  scripts/preload-techs.mjs          ← technology 解析+同步
  scripts/preload-anomalies.mjs      ← anomaly 解析+同步
  scripts/preload-traditions.mjs     ← tradition 解析+同步
  scripts/shared.mjs                 ← SHA256/批量写入/文件扫描

执行:
  node scripts/preload-all.mjs
```

## 运行时 API

```
/api/saves/batch-import  ← 从存档目录批量导入(已有)
/api/saves/upload         ← 上传单个存档(已有)
/api/campaigns            ← 战役 CRUD(已有)
/api/novels/generate      ← AI 生成(已有)
/api/settings             ← AI 配置(已有)

无 /api/import  ← 已移除
```

## 设置页

保留 AI 配置（AK/URL/模型），移除游戏目录配置和导入按钮。数据同步完全由命令行 `preload-all.mjs` 负责。

## 涉及文件

| 文件 | 变更 |
|---|---|
| `scripts/shared.mjs` | 新增: SHA256/批量写入/文件扫描 |
| `scripts/preload-all.mjs` | 新增: 入口脚本 |
| `scripts/preload-localisation.mjs` | 新增: localisation 同步 |
| `scripts/preload-events.mjs` | 新增: events 同步 |
| `scripts/preload-techs.mjs` | 新增: techs 同步 |
| `scripts/preload-anomalies.mjs` | 新增: anomalies 同步 |
| `scripts/preload-traditions.mjs` | 新增: traditions 同步 |
| `src/lib/db.ts` | 修改: 新增表结构 |
| `src/app/settings/page.tsx` | 修改: 移除游戏目录配置 |
| `src/app/api/import/` | **删除** |
