# 银河编年史 — 技术架构

## 数据流总览

```
Stellaris 游戏目录 (E:/SteamLibrary/...)
  │
  ├─ localisation/simp_chinese/ → [preload-localisation.mjs] → game_data (129K 条目)
  ├─ events/*.txt               → [preload-events.mjs]        → game_events (9.8K 事件)
  ├─ common/anomalies/*.txt     → [preload-anomalies.mjs]    → game_anomalies
  ├─ common/event_chains/*.txt  ┐
  ├─ common/on_actions/*.txt    ├─ [preload-relations.mjs]   → game_event_nodes (9.1K)
  ├─ common/special_projects/*  │                               game_event_edges (7.6K)
  └─ events/*.txt (re-parsed)   ┘                               game_event_flags (8K)
                                                                 game_event_chains (964)
                                                                 game_event_chain_nodes (708)
  ▼ SQLite (data/stellaris.db) — 运行时只读

用户上传 .sav 文件
  │
  ├─ [save-parser.ts] parseSaveBuffer(buffer)
  │   ├─ AdmZip 解压 → meta + gamestate
  │   ├─ Buffer 扫描提取 → ParsedSave
  │   │   ├─ 帝国信息 (物种/政体/伦理/理念/起源)
  │   │   ├─ 统计数据 (规模/军力/科技/舰队/人口)
  │   │   ├─ Flags (全文件分块扫描, 白名单过滤)
  │   │   ├─ 舰队/领袖/外交/战争/考古/局势
  │   │   └─ Colonies/Crises/Techs/Megastructures
  │   └─ Buffer 直接解析, 无磁盘写入
  │
  └─ [chronicle-builder.ts] buildChronicleMilestones()
      │
      ├─ 遍历 ParsedSave.timeline_events
      │   ├─ 每个 flag → game_event_flags 反查事件节点
      │   ├─ 节点信息 (zh_title/type/category)
      │   ├─ 关联事件链 (chain_id/chain_name/stage)
      │   └─ 相关性评分 (include/context/exclude)
      │
      ├─ 战争事件 → 里程碑
      ├─ 殖民地事件 → 里程碑
      ├─ 科技事件 → 里程碑 (flag匹配 game_techs)
      ├─ 舰队/领袖/考古/局势快照 → 信息性里程碑
      └─ 跨存档去重 (flag+date+value 联合键)
      ▼
  milestones 表 (含 relevance/chain_id/source_node_id)
```

## 编年史解析引擎

### chronicle-resolver.ts

核心解析函数 `resolveChronicleEvent(flagName, db)`：

1. **反查事件节点** — `game_event_flags` 根据 flag_name → node_id → `game_event_nodes`
2. **关联事件链** — node_id → `game_event_chain_nodes` → `game_event_chains`
3. **相关性判定** (RelevanceDecision):
   - `include` — 玩家相关事件 (非教程/非顾问/非隐藏)
   - `context` — 背景事件 (初始化/系统标记)
   - `exclude` — 排除 (教程/顾问/隐藏窗口事件)
4. **置信度** — 基于 flag 匹配度 (精确匹配=100, 前缀匹配递减)
5. **数据来源标注** — flag/extracted/chronicle

### chronicle-builder.ts

将 ParsedSave 转换为里程碑的核心函数 `buildChronicleMilestones()`：

- 接受现有里程碑做跨存档去重 (flag+date+value+game_key 联合键)
- 快照数据 (舰队/领袖/考古) 标记为信息级别 (importance=info)
- 生成名称清洗 (去掉物种编号前缀如 `HUM2_`、`MOL3_`)
- 每个里程碑附带完整的 source_node_id/chain_id/chain_stage 元数据

### chronicle-query.ts

`getResolvedCampaignMilestones()` — 统一查询入口：
- 优先从 raw_json 动态生成 (最新数据)
- 回退到数据库中已有的里程碑 (旧存档)
- 支持 includeContext 选项过滤低相关性事件

## 事件链检测

### event-chain-detector.ts

`detectEventChains(evidence)` — 存档证据 → 事件链状态：

1. 加载全部 964 条事件链定义
2. 对每条链评估：
   - 从 chain_nodes 获取阶段节点
   - 检查存档中是否有对应的 flag
   - 检查是否有已触发事件 ID
   - 通过 `findRelatedChainFlags` 模糊匹配链名相关 flag
3. 判定状态：
   - `completed` — 结束阶段 flag 存在 或 最终节点已观察
   - `active` — 起始阶段 flag 存在但未到达结局
   - `unknown` — 无相关证据

## 存档解析器

### save-parser.ts

纯 TypeScript Buffer 解析，不依赖任何 PDS 库：

- **数据源**: `.sav` 文件是 ZIP 格式，内含 `meta` (元数据) + `gamestate` (游戏状态)
- **解析策略**: Buffer 二进制扫描 (`indexOf` + `findBlockEnd`)，不完整解析整个文件
- **Flag 提取**: 全文件分块扫描 (每 5MB 一块, 上限 60MB)，正则匹配 `word = 8-9位数字`
- **白名单过滤**: `game_event_flags` 中的已知 flag 保留, 未知的丢弃
- **内存管理**: Buffer → ZIP → 提取 meta/gamestate 即释放 ZIP 引用

### 提取的 ParsedSave 字段

| 字段 | 来源 | 提取方式 |
|------|------|----------|
| game_date, empire_name | meta | 正则解析 |
| empire_info (species/ethics/civics) | gamestate | findKeyValue + findAllValues |
| stats (empire_size/military_power/etc) | gamestate | findKeyValue 在 country 区域 |
| timeline_events (flags) | gamestate | 全文件扫描 flag=tick 模式 |
| colonies | gamestate | 扫描 colony= 标记 |
| fleets/leaders/planets/population | gamestate | findSectionBlock + 内部解析 |
| diplomacy/wars/archaeology/situations | gamestate | 同上 |

## 本地化数据流

### preload-localisation.mjs

- 递归扫描 `localisation/simp_chinese/` (含 `name_lists/`、`random_names/` 子目录)
- YAML 行内注释剥离 (`#moon` 等)
- `_title`/`_name`/`_desc` 后缀标准化
- `$var$` 变量递归解析 (最多 5 轮)
- `[...]` 脚本引用替换为 `…`
- 输出: `game_data` 表 (~130K 条目)

### preload-relations.mjs

构建完整事件关系图，6 个解析阶段：

1. **事件** (`events/*.txt`) → game_event_nodes + edges + flags
2. **异常** (`common/anomalies/*.txt`) → 分类节点 + on_success 边
3. **考古遗址** (`common/archaeological_site_types/*.txt`) → 阶段节点 + stage 边
4. **特殊项目** (`common/special_projects/*.txt`) → on_success/on_fail 边
5. **On Actions** (`common/on_actions/*.txt`) → on_action 入口节点
6. **事件链** (`common/event_chains/*.txt`) → chain 定义 + counter→stage 节点

额外节点属性:
- `hide_window` — 隐藏窗口事件
- `is_advisor` — 顾问提示事件
- `is_tutorial` — 教程事件
- `is_initialization` — 游戏初始化事件
- `player_only` — 仅玩家事件

## AI 生成流水线

```
前端 novel/page.tsx
  │
  ├─ 初始化: GET /api/novels/generate?campaign_id=
  │   └─ 返回 [system, user] 消息 (帝国数据 + 事件 + 事件链)
  │
  ├─ 大纲生成: POST /api/novels/generate/outline
  │   └─ completeChat() → 分析编年史 → 章节大纲文本
  │
  ├─ 章节生成: POST /api/novels/generate
  │   │  body: { messages, config }
  │   │
  │   ├─ streamChat() → SSE fetch → text chunks
  │   │   └─ 每 chunk 通过 NDJSON 流式返回前端
  │   │
  │   └─ 完成后: completeChat() → 连续性编辑 → 更新档案
  │
  └─ 存储: IndexedDB (idb-keyval)
      ├─ messages[] — 完整对话历史
      ├─ chapters[] — 章节正文+概要
      ├─ outline — 章节大纲
      └─ continuity — 连续性档案
```

### 提示词结构

```
System:
  你是资深科幻小说作家...
  【写作要求】12 条约束
  【群星世界观参考】stellaris-lore.md 全文

User (首次):
  帝国档案 (名称/物种/政体/伦理/规模/军力/科技)
  实力演变 (逐存档数据)
  著名领袖 + 著名舰队
  外交局势 + 活跃战争
  考古遗址与局势
  派系
  重大事件时间轴
  已识别事件链
  + 用户背景设定 (如有)
  + 自定义大纲 (如有)

User (续写):
  + 章节大纲
  + 连续性档案摘要
  + 最近一章总结
  + 背景设定
```

## 浏览器存储

| 存储 | 技术 | 内容 |
|------|------|------|
| localStorage | 同步 API | AI 配置 (apiKey/baseUrl/model) |
| IndexedDB | idb-keyval (异步) | LocalNovel (messages/chapters/outline/continuity) |

IndexedDB 单条目容量 → 数百MB，远超 localStorage 5MB 限制。
全量 messages 数组支持 DeepSeek V4 1M token 上下文。

## 安全策略

- **Buffer 解析**: 不上传内容写磁盘, AdmZip 直接从 Buffer 读取
- **路径穿越防护**: 文件名 sanitize, `path.basename()` 限制
- **文件校验**: 仅 `.sav` 后缀, 200MB 上限
- **SQL 注入**: 全参数化查询 (`?` 占位符), 零字符串拼接
- **无认证**: 单用户本地工具定位, 需部署到公网时添加中间件
