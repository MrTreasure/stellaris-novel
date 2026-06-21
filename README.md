# 银河编年史 · Stellaris Novel Generator

基于《群星》(Stellaris) 游戏存档的银河史诗小说生成器。上传 `.sav` 存档 → 自动提取帝国兴衰史 → 识别事件链 → AI 创作太空歌剧小说。

## 技术栈

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **SQLite** (Node.js 内置 `node:sqlite`, 零外部依赖)
- **纯 Node.js Buffer 解析** (直接操作 Buffer 解析 PDS 格式, 无磁盘写入)
- **Vercel AI SDK v6** (`ai` + `@ai-sdk/openai`, `provider.chat()` → `/chat/completions`)
- **DeepSeek V4 API** (1M token 上下文, 兼容 OpenAI Chat Completions 协议)
- **IndexedDB** (`idb-keyval`, 数百MB 浏览器存储)

## 快速开始

```bash
npm install
node scripts/preload-all.mjs   # 一次性离线导入游戏数据
npm run dev                     # http://localhost:3000
```

## 核心架构

详见 [`docs/architecture.md`](docs/architecture.md)

### 编年史解析引擎

`chronicle-resolver.ts` + `chronicle-builder.ts` + `chronicle-query.ts`

存档上传后，系统通过事件关系图反向解析每一个 flag：
1. `game_event_flags` 查 flag → 事件节点 → `game_event_nodes` (zh_title/type/category)
2. 节点关联事件链 → `game_event_chains` (chain_id/zh_name/stage)
3. 相关性判定 (include/context/exclude) — 基于节点属性过滤教程/顾问/初始化噪声
4. 置信度评分 — flag 精确匹配=100, 前缀匹配递减

所有标记和名称从 SQLite 游戏数据解析，不使用硬编码字典。

### 事件链关系图

基于 Stellaris 游戏脚本离线构建 (~9,100 节点, ~7,600 边, ~8,000 flag, ~960 链)：

- **数据源**: `events/`, `common/anomalies/`, `common/archaeological_site_types/`, `common/special_projects/`, `common/on_actions/`, `common/event_chains/`
- **节点属性**: hide_window, is_advisor, is_tutorial, is_initialization, player_only
- **边类型**: option, immediate, after, on_success, on_fail, on_action, stage
- **事件链阶段**: 从 counter 定义自动生成 (如 `yuht_artifacts = { max = 6 }` → 6 阶段)
- **增量同步**: SHA256 哈希, 游戏升级后仅处理变化文件

运行 `node scripts/preload-relations.mjs` 单独构建; `node scripts/test-pipeline.mjs` 验证。

### AI 生成流水线

```
首次进入 → 自动生成章节大纲 → 流式返回 + 弹窗实时展示 → 存储 IndexedDB
每次生成 → 全量 messages 提交 (1M token 上下文, >500K 滑动窗口)
         → 大纲注入 + 连续性档案 + campaign_id 明确标注
         → AI SDK streamText + 8 个工具自动调用循环
         → NDJSON 流式返回文本块 + 工具调用事件
         → 右侧面板展示生成阶段 + 工具调用次数
         → AI 连续性编辑 → 更新档案
```

AI 可自动调用 8 个 SQLite 查询工具：本地化查找、事件/flag 查询、特质/理念/伦理查询、战役事实查询、事件链进度查询、通用知识搜索、事件链定义查询、科技查询。工具支持多关键词分词搜索和事件链 ID 模糊匹配（自动处理前缀/后缀变体）。

## 项目结构

```
stellaris-novel/
├── docs/
│   ├── architecture.md              # 技术架构文档
│   ├── event-chain-enhancement.md   # 事件链增强计划
│   ├── ai-streaming-sqlite-plan.md  # AI SDK 集成计划
│   └── stellaris-lore.md            # 群星世界观 (AI prompt)
├── scripts/                         # 离线工具 (Node.js ESM)
│   ├── preload-all.mjs              # 数据同步入口
│   ├── preload-relations.mjs        # 事件关系图构建
│   ├── preload-localisation.mjs     # 本地化导入 (递归子目录)
│   ├── preload-events.mjs           # 事件脚本导入
│   ├── preload-anomalies.mjs        # 异常分类导入
│   ├── preload-techs.mjs            # 科技树导入
│   ├── preload-traditions.mjs       # 传统树导入
│   ├── test-pipeline.mjs            # 事件链测试
│   ├── test-chronicle-filter.mjs    # 编年史过滤测试
│   ├── test-enriched-parse.mjs      # SAV 解析器集成测试
│   ├── test-tool-calls.mjs          # AI 工具调用调试脚本
│   ├── pds-parser.mjs               # PDS 解析器 (Node.js)
│   └── shared.mjs                   # 共享工具
├── src/
│   ├── app/
│   │   ├── page.tsx                 # 首页 (上传+AI状态)
│   │   ├── layout.tsx               # 全局布局 (Stellaris背景图)
│   │   ├── campaigns/[id]/
│   │   │   ├── page.tsx             # 战役详情 (编年史+事件链+统计)
│   │   │   └── novel/page.tsx       # 小说工程 (大纲流式+生成+档案+章节管理)
│   │   ├── settings/page.tsx        # AI 配置
│   │   └── api/
│   │       ├── campaigns/           # 战役 CRUD + 事件链检测
│   │       ├── saves/               # 上传解析 + 里程碑生成 (Buffer, 无磁盘IO)
│   │       ├── novels/generate/     # 小说生成 (NDJSON流式 + 工具调用)
│   │       │   └── outline/         # 大纲生成 (流式)
│   │       └── test-ai/             # AI 连接测试
│   ├── lib/
│   │   ├── db.ts                    # SQLite 数据库层
│   │   ├── ai-client.ts             # AI SDK 客户端 (streamText + provider.chat)
│   │   ├── ai-tools.ts              # AI 工具定义 (8个只读SQLite查询)
│   │   ├── chronicle-resolver.ts    # 编年史解析 (flag→节点→链)
│   │   ├── chronicle-builder.ts     # 编年史构建 (ParsedSave→milestones)
│   │   ├── chronicle-query.ts       # 编年史查询 (动态生成+DB回退)
│   │   ├── event-chain-detector.ts  # 事件链状态识别
│   │   ├── novel-facts.ts           # 战役事实聚合层
│   │   ├── browser-storage.ts       # IndexedDB 存储
│   │   ├── lore.ts                  # 世界观加载
│   │   └── parser/
│   │       ├── save-parser.ts       # .sav 存档解析 (Buffer→ParsedSave)
│   │       └── pds-parser.ts        # 通用 PDS 脚本解析器
│   └── types/index.ts               # TypeScript 类型
└── public/images/                   # 游戏素材
```

## 存档解析

系统通过 `parseSaveBuffer(buffer)` 直接从内存中的 ZIP Buffer 解析, 无磁盘写入。

| 类别 | 提取内容 |
|------|----------|
| 帝国信息 | 名称、物种、政体、伦理、理念、起源 |
| 军事实力 | 舰队战力、舰船数量、著名舰队 |
| 人口经济 | 总人口、殖民地、派系及支持率 |
| 领袖 | 领袖分布、5级以上领袖及特质 |
| 外交 | 联邦、星海共同体、贸易协定、附庸 |
| 战争 | 活跃战争、参战方、战争目标、厌战度 |
| 事件 | 已触发事件ID、事件链 flag (带 scope) |
| 考古 | 遗址名称、当前阶段、总阶段数 |
| 局势 | 活跃局势类型、进度、目标 |

解析器兼容 Butler v2.x 和 Corvus v4.x。

## 配置 AI 服务

1. 访问 `/settings` → 填入 API Key / Base URL / Model
2. 默认 model: `deepseek-v4-pro`, 默认 Base URL: `https://api.deepseek.com`
3. 点击测试连接确认可用
4. 配置仅存浏览器 IndexedDB, 不写服务端

## 数据同步

```bash
node scripts/preload-all.mjs       # 首次全量导入
node scripts/preload-relations.mjs # 单独重建事件图
node scripts/preload-all.mjs       # 游戏升级后增量同步
```

## 测试

```bash
node scripts/test-pipeline.mjs         # 事件链全链路
node scripts/test-chronicle-filter.mjs # 编年史过滤
node scripts/test-enriched-parse.mjs   # SAV 解析器集成测试
node scripts/test-tool-calls.mjs       # AI 工具调用调试
```

## 环境要求

- Node.js 24+ (`node:sqlite`)
- 群星游戏安装目录 (离线预加载用, 运行时无需访问)
- DeepSeek API Key (或任意 OpenAI 兼容 API)
