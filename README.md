# 银河编年史 · Stellaris Novel Generator

基于《群星》(Stellaris) 游戏存档的银河史诗小说生成器。上传 `.sav` 存档 → 自动提取帝国兴衰史 → 识别事件链 → AI 创作太空歌剧小说。

## 技术栈

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **SQLite** (Node.js 内置 `node:sqlite`, 零外部依赖)
- **纯 Node.js 解析引擎** (直接操作 Buffer 解析 PDS 格式)
- **通用 PDS 脚本解析器** (解析 Stellaris 事件/异常/考古/局势等游戏脚本)
- **Vercel AI SDK v6** (`streamText` + `@ai-sdk/openai-compatible`, 内置工具调用循环)
- **OpenAI 兼容 API** (支持 DeepSeek / Claude / GPT / 本地 Ollama 等)
- **SSE 流式输出 + 工具调用** (AI 可查询 SQLite 获取游戏背景知识)
- **IndexedDB 浏览器存储** (数百MB+ 容量, 保存完整对话历史)

## 快速开始

```bash
# 1. 安装依赖 (含 Vercel AI SDK, IndexedDB wrapper, Zod)
npm install

# 2. 预加载游戏数据 (一次性离线导入, 包含 ~9.3万条本地化 + 事件关系图)
node scripts/preload-all.mjs

# 3. 启动开发服务器
npm run dev

# 4. 打开浏览器
# http://localhost:3000 → 上传 .sav 文件或批量导入
# http://localhost:3000/settings → 配置 AI API Key
```

## 配置 AI 服务

1. 访问 `/settings` 页面
2. 填入 API Key、Base URL、模型名
3. 点击「保存到当前浏览器」
4. 点击「测试连接」确认可用
5. 支持所有 OpenAI 兼容 API

AI 配置保存在当前浏览器的 `localStorage`。小说数据（章节、连续对话历史、连续性档案）保存在 IndexedDB（容量远超 localStorage 的 5MB 限制）。生成小说时，浏览器随当次请求将配置和完整对话历史发送给生成接口。

## 存档解析

系统直接读取 `.sav` 文件（ZIP 格式）中的 PDS 二进制数据，提取以下内容：

| 类别 | 提取内容 |
|---|---|
| 帝国信息 | 名称、物种、政体、伦理、理念、起源 |
| 军事实力 | 舰队战力、舰船数量、著名舰队 |
| 人口经济 | 总人口、殖民地、派系及支持率 |
| 领袖 | 领袖分布、5级以上领袖及特质 |
| 外交 | 联邦、星海共同体、贸易协定、附庸、宿敌 |
| 战争 | 活跃战争、参战方、战争目标、厌战度 |
| 事件 | 已触发事件ID、事件链 flag |
| 考古 | 遗址名称、当前阶段、总阶段数 |
| 局势 | 活跃局势类型、进度、目标 |
| 世界构建 | 星区、建筑、间谍行动、星海共同体决议 |

解析器兼容 Butler v2.x 和 Corvus v4.x 存档格式。

## 事件链关系图

基于 Stellaris 游戏脚本文件构建完整的事件关系图，支持从存档识别多阶段事件链：

- **数据源**: `events/`, `common/anomalies/`, `common/archaeological_site_types/`, `common/special_projects/`, `common/on_actions/`, `common/event_chains/`
- **规模**: ~8,880 节点, ~7,668 边, ~7,864 flag 标记, ~970 事件链
- **边类型**: option(4,246), immediate(1,850), on_success(690), stage(475), after(320), on_visible(52), on_fail(35)
- **识别逻辑**: 对比存档中实际出现的 flag、事件ID、考古遗址阶段与关系图，推断每条事件链的当前阶段和玩家选择
- **编年史展示**: 按事件链聚合里程碑，显示进行中/已完成/失败状态
- **增量同步**: 基于 SHA256 哈希，游戏升级后只重新解析变化的文件

运行 `node scripts/preload-relations.mjs` 单独构建关系图；`node scripts/test-pipeline.mjs` 验证全链路。

## 小说生成与连续性

小说、背景设定、章节和连续性档案保存在浏览器 IndexedDB 中。全量对话历史（system/user/assistant/tool 消息数组）在每次生成时完整提交给 AI，充分利用 DeepSeek V4 1M token 上下文窗口，确保模型始终看到前文章节的完整正文和上下文。

当前生成流程：

1. 首次生成时从服务端获取初始消息（系统提示词 + 帝国数据上下文）。
2. 用户填写的额外背景设定注入到首次用户消息和后续续写消息中。
3. 每次续写追加新的用户消息（含连续性档案摘要 + 最近一章概要），全量对话历史一起提交。
4. AI 生成时可通过 3 个工具查询 SQLite 数据库获取游戏名词背景知识。
5. 生成后保存 assistant 回复到对话历史，为下轮续写提供完整上下文。
6. 调用 AI 连续性编辑流程，为章节生成 200–350 字概要。
7. 更新长篇连续性档案，包括：
   - 人物及其当前状态
   - 势力及相互关系
   - 不可违背的既定事实
   - 尚未解决的伏笔
   - 进行中 / 已完成的事件链
   - 事件链玩家选择及后果
   - 未解决的事件链线索
   - 当前时间和总体局势
8. Token 用量追踪：每次生成后显示输入/缓存/输出 token 消耗，超出 500K 时触发滑动窗口截断早期对话。

**AI 工具调用**（模型可在写作中自动查询）：

| 工具 | 查询目标 | 数据表 |
|---|---|---|
| `search_game_knowledge` | 物种、科技、势力、事件等名词的中文名和背景 | `game_data` |
| `lookup_event_chain` | 事件链阶段、节点、分支详情 | `game_event_chains` + `chain_nodes` |
| `lookup_technology` | 科技等级、领域、分类 | `game_techs` + `game_data` |

工具由 Vercel AI SDK 的 `maxSteps` 自动循环执行，模型遇到陌生专有名词时会主动查询。

**小说写作约束**（注入 System Prompt）：
1. 严格基于事件时间轴，不虚构未发生的事件
2. 不得提前泄露尚未在存档中发生的结局
3. 不得把可能分支写成已发生事实
4. 后续章节必须延续此前事件链选择
5. 同一事件链跨章节时保持核心角色、地点、谜团和语气一致

用户可在小说页面打开「连续性档案」查看完整档案，或点击「模型提示词预览」查看初始系统/用户提示词（含工具定义），支持复制到剪贴板调试。侧边栏实时显示 token 用量统计。

## 项目结构

```
stellaris-novel/
├── docs/                        # 项目文档
│   ├── event-chain-enhancement.md # 事件链增强计划
│   └── stellaris-lore.md        # 群星世界观 (AI prompt 素材)
├── scripts/                     # 离线工具
│   ├── preload-all.mjs          # 游戏数据同步入口
│   ├── preload-relations.mjs    # 事件关系图构建
│   ├── preload-localisation.mjs # 本地化文本导入
│   ├── preload-events.mjs       # 事件脚本导入
│   ├── preload-anomalies.mjs    # 异常分类导入
│   ├── preload-techs.mjs        # 科技树导入
│   ├── preload-traditions.mjs   # 传统树导入
│   ├── test-pipeline.mjs        # 事件链流水线测试
│   ├── test-enriched-parse.mjs  # SAV 解析器集成测试
│   ├── pds-parser.mjs           # PDS 通用解析器 (Node.js)
│   └── shared.mjs               # 共享工具 (DB/哈希/批量写入)
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── page.tsx             # 首页 (上传/导入)
│   │   ├── layout.tsx           # 全局布局 (背景图 + 版本标记)
│   │   ├── campaigns/           # 战役列表/详情 (含事件链视图)
│   │   ├── settings/            # AI 配置
│   │   └── api/                 # API 路由
│   │       ├── campaigns/       # 战役 CRUD + 事件链检测
│   │       ├── saves/           # 上传解析 + 批量导入 + 里程碑生成
│   │       └── novels/          # 小说生成 (SSE 流式)
│   ├── components/              # UI 组件 (图表/图标)
│   ├── lib/                     # 核心逻辑
│   │   ├── db.ts                # 数据库层 (含事件关系图表)
│   │   ├── ai-client.ts         # AI SDK 客户端 (streamText + 工具调用)
│   │   ├── ai-tools.ts          # AI 工具定义 (3 个 SQLite 查询工具)
│   │   ├── flags.ts             # Flag → 中文标题映射
│   │   ├── lore.ts              # 世界观知识库加载
│   │   ├── event-chain-detector.ts # 事件链状态识别
│   │   ├── browser-storage.ts   # 浏览器 IndexedDB 存储
│   │   └── parser/
│   │       ├── save-parser.ts   # .sav 存档解析 (15+ 提取函数)
│   │       └── pds-parser.ts    # PDS 通用解析器 (TypeScript)
│   └── types/                   # TypeScript 类型定义
└── public/images/               # 游戏素材 (PNG 背景等)
```

## 功能

- **拖拽上传** 或从存档目录批量导入存档
- **深度存档解析** 提取帝国/舰队/领袖/外交/战争/考古/事件/局势等完整数据
- **事件链识别** 基于游戏脚本关系图自动检测多阶段事件链及进度
- **实力演变图表** 展示帝国规模、军力、科技、舰队、人口变化
- **帝国编年史** 按时间线和分类展示里程碑事件，事件链卡片聚合
- **AI 生成小说** 基于真实游戏数据 + 事件链状态创作章节
- **AI 工具调用** 模型可自动查询 SQLite 获取物种、科技、事件链等游戏知识
- **全量对话上下文** 每次生成提交完整 messages 历史，利用 1M token 窗口
- **Token 追踪** 实时显示输入/缓存/输出 token 消耗，超 500K 自动滑动窗口
- **提示词预览** 查看和复制组装后的完整系统/用户提示词
- **重写与续写** 支持自定义修改指令和跨章节连续性
- **背景设定** 后续章节持续遵循用户补充的世界设定
- **连续性档案** 自动维护人物、势力、伏笔、事件链选择及后果
- **IndexedDB 存储** 小说内容和对话历史保存在浏览器，API 配置在 localStorage
- **整部下载** 将小说、背景设定和连续性档案导出为 Markdown
- **科幻风格 UI** 使用 Stellaris 游戏背景素材和深空暗色主题

## 数据同步

游戏数据离线预加载到 SQLite，运行时只读，不访问游戏目录：

```bash
# 首次导入 (本地化 + 事件 + 科技 + 异常 + 传统 + 事件关系图)
node scripts/preload-all.mjs

# 单独构建事件关系图
node scripts/preload-relations.mjs

# 游戏升级后增量同步 (SHA256 只处理变化文件)
node scripts/preload-all.mjs
```

## 测试

```bash
# 事件链流水线测试 (PDS 解析器 + 数据库验证)
node scripts/test-pipeline.mjs

# SAV 解析器集成测试 (用真实存档验证各提取函数)
node scripts/test-enriched-parse.mjs
```

## 环境要求

- Node.js 24+ (需要 `node:sqlite`)
- 群星游戏安装目录 (仅用于离线预加载，运行时无需访问)
- OpenAI 兼容 API Key
