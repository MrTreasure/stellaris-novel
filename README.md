# 银河编年史 · Stellaris Novel Generator

基于《群星》(Stellaris) 游戏存档的银河史诗小说生成器。上传 `.sav` 存档 → 自动提取帝国数百年兴衰史 → 识别事件链因果网络 → AI 创作太空歌剧编年史小说。

**在线访问**: [stellaris.mrtreasure.cc](https://stellaris.mrtreasure.cc)

---

## 它能做什么

你花费数十小时在群星中经历了一场波澜壮阔的银河史诗——第一次接触、远古先驱者的秘密、席卷银河的战争、化身天灾的抉择。但游戏结束后，这一切只存在于冰冷的存档文件里。

**银河编年史** 将这些数据转化为一部真正的太空歌剧小说：

- **智能编年史重建**：从存档 flag 反向解析事件，通过 9,100 个事件节点的关系图还原因果链，过滤教程噪声，评估每个里程碑的相关性
- **AI 辅助创作**：DeepSeek V4 模型自动查询游戏数据库理解专有名词含义、事件链阶段和已发生事实，以规范中文撰写每章 2,500-3,500 字
- **长篇连续性管理**：自动追踪人物状态、势力关系、未解决伏笔和进行中的事件链，每章生成后更新连续性档案
- **全程可控**：大纲可编辑，章节可删除，提示词可预览修改，背景设定可自定义注入

## 功能一览

| 功能 | 说明 |
|------|------|
| 存档上传 | 支持 Butler v2.x / Corvus v4.x 格式，纯 Buffer 内存解析，无磁盘写入 |
| 编年史仪表盘 | 关键里程碑时间轴、事件链进度、帝国数据统计、实力演变趋势 |
| 自动大纲 | 首次进入自动生成 8-15 章大纲，流式返回实时可见，支持手动编辑 |
| 流式生成 | NDJSON 流，逐字渲染；右侧面板显示生成阶段和字符计数 |
| AI 工具调用 | 8 个 SQLite 查询工具，模型自动触发——搜索本地化、事件链、战役事实 |
| 连续性档案 | 10 个维度追踪（人物、势力、伏笔、事件链选择/后果/线索、既定事实等） |
| 长篇上下文 | 全量 messages 提交，1M token 窗口；超 500K 时自动滑动窗口保留最近 15 章 |
| 章节管理 | 删除章节自动清理对应对话历史，重写章节替换内容 |
| 批量导入 | 支持按时间顺序批量导入多个存档，自动增量更新里程碑 |
| 完全本地 | AI 配置存 IndexedDB，不写服务端；数据可导出为 Markdown |

## 使用流程

```
1. 设置 AI →      /settings    填入 DeepSeek API Key
2. 上传存档 →     首页拖拽 .sav  自动解析 + 生成里程碑
3. 浏览编年史 →   /campaigns/1  查看帝国历程和事件链
4. 进入小说 →     /campaigns/1/novel  自动生成大纲
5. 创作章节 →     点击"开始创作"  AI 流式写作 + 自动查背景
6. 续写 →         每章完成后可续写下一章，连续性自动管理
7. 导出 →         下载完整 Markdown 小说
```

## 技术栈

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **SQLite** — Node.js 内置 `node:sqlite`，零外部数据库依赖
- **纯 Buffer 解析** — 直接操作 ZIP Buffer 提取 PDS 二进制 gamestate
- **Vercel AI SDK v6** — `@ai-sdk/openai` 官方 provider，`provider.chat()` 调用 Chat Completions API
- **DeepSeek V4** — 1M token 上下文，兼容 OpenAI 协议
- **IndexedDB** — `idb-keyval`，支持数百 MB 浏览器端存储
- **129K 本地化条目** — 从游戏 `localisation/simp_chinese/` 递归导入，所有游戏名词中文化

## 核心架构

详见 [`docs/architecture.md`](docs/architecture.md)

### 存档解析引擎 → `src/lib/parser/save-parser.ts`

`parseSaveBuffer(buffer)` 从内存 ZIP Buffer 中提取 16 类、50+ 字段的游戏数据，无需磁盘写入：

| 类别 | 核心字段 | 典型数量 |
|------|----------|----------|
| 帝国信息 | 名称、物种（含亚种）、政体（民主/寡头/帝制/企业/格式塔）、伦理（8 种）、理念（技术官僚、议会制等）、起源（繁荣统一、虚空居者等） | 1 帝国 |
| 军事实力 | 舰队总战力、军用/民用舰船数、著名舰队（名称、指挥官、舰船数、战力） | 5-15 舰队 |
| 人口经济 | 总人口、殖民地名称及分布、派系名称及支持率、8 种基础资源 + 凝聚力/影响力 + 稀有资源（泽珞/活体金属/暗物质等） | 10-50 殖民地 |
| 领袖 | 姓名、类型（科学家/总督/司令/将领）、技能等级、特质（考古学家、灵能等）、年龄、在任/死亡状态 | 10-30 名 |
| 外交 | 联邦成员及等级、星海共同体会员、贸易协定、附庸国及宗主、边境状态（开放/关闭）、宿敌、内阁 | 5-20 关系 |
| 战争 | 活跃战争 ID、参战方、战争目标（征服/意识形态/附庸/解放等）、攻击/防御方、厌战度、战争分数 | 0-5 战争 |
| 科技 | 已研究科技清单、当前研究及进度、科技等级（T1-T5）分布、三大领域（物理/社会/工程）分布、重复科技次数 | 50-200 科技 |
| 传统飞升 | 完整传统树（7 类）、已解锁传统数、飞升天赋槽位及已选飞升（8 种） | 0-8 飞升 |
| 事件 flag | 已触发事件 ID、事件链 flag 含 scope 标记（`ship`/`planet`/`country`/`leader`）、计数器值 | ~3,000+ flag |
| 考古遗址 | 遗址名称、当前阶段/总阶段数、最后完成日期、控制帝国 | 0-10 遗址 |
| 异常 | 已调查异常 ID、分类（天文/生物/物理等）、完成状态 | 10-100 异常 |
| 局势 | 活跃局势类型（天灾/叛乱/赤字/饥荒等）、当前进度、目标进度、月增量 | 0-8 局势 |
| 间谍 | 情报网渗透等级、行动类型、目标帝国 | 0-5 情报网 |
| 地图 | 已探索星系数、拥有的恒星系/殖民地/前哨站、星基等级分布 | 10-200 星系 |
| 帝国规模 | 规模值、超过扩张传统的惩罚系数、规模来源（人口/殖民地/恒星系/区划） | 1 帝国 |
| 事件目标 | `event_target` 记录（已扫描/标记/跟踪的星系、星球、舰船、领袖等） | 10-50 目标 |

兼容 Butler v2.x 和 Corvus v4.x 两种主要存档格式。自动检测版本差异：`leader_class` 字段变迁、name blocks 结构变化、planets 中缺少 colony ticks 等。

### 编年史解析引擎 → `chronicle-resolver.ts` + `chronicle-builder.ts`

存档上传后，系统通过事件关系图反向解析每一个 flag：

1. `game_event_flags` 查 flag → 事件节点 → `game_event_nodes`（zh_title / type / category）
2. 节点关联事件链 → `game_event_chains`（chain_id / zh_name / stage）
3. 相关性判定（include / context / exclude）— 基于节点属性过滤教程/顾问/初始化噪声
4. 置信度评分 — flag 精确匹配 = 100，前缀匹配递减

跨存档去重通过复合键 `flag + game_key + raw_value + date` 实现。所有标记和名称从 SQLite 游戏数据解析，不使用硬编码字典。

### 事件链关系图

基于 Stellaris 游戏脚本离线构建（~9,100 节点, ~7,600 边, ~8,000 flag, ~964 链）：

- **数据源**: `events/`, `common/anomalies/`, `common/archaeological_site_types/`, `common/special_projects/`, `common/on_actions/`, `common/event_chains/`
- **节点属性**: hide_window, is_advisor, is_tutorial, is_initialization, player_only — 用于噪声过滤
- **边类型**: option, immediate, after, on_success, on_fail, on_action, stage
- **事件链阶段**: 从 counter 定义自动生成（如 `yuht_artifacts = { max = 6 }` → 6 个阶段）
- **增量同步**: SHA256 哈希，游戏升级后仅处理变化文件

运行 `node scripts/preload-relations.mjs` 单独构建，`node scripts/test-pipeline.mjs` 验证。

### AI 生成流水线

```
首次进入 → 自动生成章节大纲 → 流式返回 + 弹窗实时展示 → 存储 IndexedDB

每次生成 → 全量 messages 提交（最长 1M token 上下文）
         → 注入：大纲 + 连续性档案 + 背景设定 + campaign_id 明确标注
         → AI SDK streamText + 8 个工具自动调用循环
         → NDJSON 流式返回：文本块 + 工具调用/结果事件
         → 右侧面板：阶段状态 + 字符计数 + 工具调用次数
         → 完成 → AI 连续性编辑 → 更新 10 维档案
```

#### AI 工具列表（8 个只读 SQLite 查询）

| 工具 | 功能 | 数据库表 |
|------|------|----------|
| `lookup_localization` | 精确查询术语的中文名、描述和分类 | `game_data` (129K) |
| `search_game_knowledge` | 多关键词搜索背景知识，分词后合并去重 | `game_data` (129K) |
| `lookup_event_or_flag` | 通过 flag / 事件 ID / 中文标题查事件详情 | `game_event_flags` → `nodes` → `chains` |
| `lookup_event_chain` | 查事件链的通用定义（阶段、节点），自动处理前缀/后缀变体 | `game_event_chains` (964 条) |
| `lookup_campaign_fact` | 查当前战役已发生的实际事实（时间轴/领袖/舰队/战争/考古） | `milestones` + `saves.raw_json` |
| `lookup_campaign_event_chain` | 查询事件链在当前战役中的实际进度 | `chains` → `chain_nodes` → `milestones` |
| `lookup_trait_or_civic_or_ethic` | 查特质/理念/伦理/传统/飞升等术语 | `game_data`（按 category 过滤） |
| `lookup_technology` | 查科技详情（等级/领域/分类/花费） | `game_techs` + `game_data` |

工具支持多关键词分词搜索（空格分隔）和事件链 ID 模糊匹配（自动去 `precursor_` 前缀、`_chain`/`_\d+`/`_\w+` 后缀）。

## 项目结构

```
stellaris-novel/
├── docs/
│   ├── architecture.md              # 技术架构文档
│   ├── event-chain-enhancement.md   # 事件链增强计划
│   ├── ai-streaming-sqlite-plan.md  # AI SDK 集成计划
│   └── stellaris-lore.md            # 群星世界观 (AI prompt 注入)
├── scripts/                         # 离线工具 (Node.js ESM)
│   ├── preload-all.mjs              # 数据同步入口（全量 + 增量）
│   ├── preload-relations.mjs        # 事件关系图构建（9100 节点 + 7600 边）
│   ├── preload-localisation.mjs     # 本地化导入（递归 129K 条目）
│   ├── preload-events.mjs           # 事件脚本导入
│   ├── preload-anomalies.mjs        # 异常分类导入
│   ├── preload-techs.mjs            # 科技树导入
│   ├── preload-traditions.mjs       # 传统树导入
│   ├── test-pipeline.mjs            # 事件链全链路测试
│   ├── test-chronicle-filter.mjs    # 编年史过滤测试
│   ├── test-enriched-parse.mjs      # SAV 解析器集成测试
│   ├── test-tool-calls.mjs          # AI 工具调用调试脚本
│   ├── pds-parser.mjs               # PDS 解析器 (Node.js 版)
│   └── shared.mjs                   # 共享工具（DB / 哈希 / 批量写入）
├── src/
│   ├── app/
│   │   ├── page.tsx                 # 首页（上传 + AI 状态 + 版本显示）
│   │   ├── layout.tsx               # 全局布局（Stellaris 背景图）
│   │   ├── campaigns/[id]/
│   │   │   ├── page.tsx             # 战役详情（编年史 + 事件链 + 统计）
│   │   │   └── novel/page.tsx       # 小说工程（大纲流式 + 生成 + 档案 + 章节管理）
│   │   ├── settings/page.tsx        # AI 配置（API Key / URL / Model）
│   │   └── api/
│   │       ├── campaigns/           # 战役 CRUD + 事件链检测
│   │       ├── saves/               # 上传解析 + 里程碑生成（Buffer，无磁盘 IO）
│   │       ├── novels/generate/     # 小说生成（NDJSON 流式 + 8 工具）
│   │       │   └── outline/         # 大纲生成（流式 NDJSON）
│   │       └── test-ai/             # AI 连接测试
│   ├── lib/
│   │   ├── db.ts                    # SQLite 数据库层（迁移 + CRUD + 事件图查询）
│   │   ├── ai-client.ts             # AI SDK 客户端（provider.chat + streamText）
│   │   ├── ai-tools.ts              # AI 工具定义（8 个 Zod schema + execute）
│   │   ├── chronicle-resolver.ts    # 编年史解析（flag → 节点 → 链 + 相关性评分）
│   │   ├── chronicle-builder.ts     # 编年史构建（ParsedSave → milestones + 去重）
│   │   ├── chronicle-query.ts       # 编年史查询（动态生成 + DB 回退）
│   │   ├── event-chain-detector.ts  # 事件链状态识别（evidence → chain status）
│   │   ├── novel-facts.ts           # 战役事实聚合层（empire + evolution + chains）
│   │   ├── browser-storage.ts       # IndexedDB 存储（小说 / 章节 / 配置）
│   │   ├── lore.ts                  # 世界观加载（stellaris-lore.md）
│   │   └── parser/
│   │       ├── save-parser.ts       # .sav 存档解析（Buffer → 15+ 数据类）
│   │       └── pds-parser.ts        # 通用 PDS 脚本解析器
│   └── types/index.ts               # TypeScript 类型定义
└── public/images/                   # 游戏素材资源
```

## 配置 AI 服务

1. 访问 `/settings` → 填入 API Key / Base URL / Model
2. 默认 model: `deepseek-v4-pro`，默认 Base URL: `https://api.deepseek.com`
3. 点击"测试连接"确认可用
4. 配置仅存浏览器 IndexedDB，不写服务端

支持任何 OpenAI Chat Completions 兼容 API（Claude、GPT、Ollama 等）。

## 数据同步

```bash
node scripts/preload-all.mjs       # 首次全量导入（需指定游戏安装路径）
node scripts/preload-relations.mjs # 单独重建事件图
node scripts/preload-all.mjs       # 游戏版本升级后增量同步
```

## 测试

```bash
node scripts/test-pipeline.mjs         # 事件链全链路
node scripts/test-chronicle-filter.mjs # 编年史过滤性能
node scripts/test-enriched-parse.mjs   # SAV 解析器集成测试
node scripts/test-tool-calls.mjs       # AI 工具调用本地调试
```

## 设计原则

**优先使用游戏数据，避免硬编码。** 所有命名、翻译、过滤、分类规则尽可能从 SQLite 中预加载的游戏数据获取，而非在代码中维护枚举列表。

- 旗帜名称翻译 → 查 `game_data` 表（129K 中文本地化条目）
- 旗帜噪声过滤 → 使用 `game_event_flags` 表作为白名单（3,010 已知游戏旗帜），不在事件图中的即为噪声
- 事件链名称 → 查 `game_event_chains.zh_name`
- 科技信息 → 查 `game_techs` + `game_data`

**批量加载，避免逐条查询。** `loadLocMap()` 将整个 `game_data` 表一次性加载到内存 Map 中，所有后续查找均为 O(1)。

## 环境要求

- Node.js 24+（`node:sqlite` 内置模块）
- 群星游戏安装目录（仅离线预加载时需要，运行时无需访问）
- DeepSeek API Key（或任意 OpenAI 兼容 API）
