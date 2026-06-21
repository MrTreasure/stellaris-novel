# 银河编年史 — 群星小说生成器

基于群星(Stellaris)游戏存档的银河史诗小说生成器。
上传.sav存档 → 自动提取里程碑 → AI生成小说。

## 设计原则

**优先使用游戏数据，避免硬编码。** 所有命名、翻译、过滤、分类规则应尽可能从 SQLite 中预加载的游戏数据（`game_data`、`game_event_flags`、`game_event_chains`、`game_techs` 等表）中获取，而非在代码中维护枚举列表。

- 旗帜名称翻译 → 查 `game_data` 表（129K 中文本地化条目），`flags.ts` 中的硬编码字典仅作为快速回退
- 旗帜噪声过滤 → 使用 `game_event_flags` 表作为白名单（3,010 已知游戏旗帜），不在事件图中的即为噪声。不要写枚举黑名单
- 事件链名称 → 查 `game_event_chains.zh_name`
- 科技信息 → 查 `game_techs` + `game_data`
- 殖民地/舰队/领袖名称 → 查 `game_data` 进行本地化

**批量加载，避免逐条查询。** `loadLocMap()` 将整个 `game_data` 表一次性加载到内存 Map 中（约 129K 条目），所有后续查找均为 O(1) 内存操作。

## 技术栈
- Next.js 16 (App Router, TypeScript, Tailwind CSS)
- SQLite (Node.js 内置 `node:sqlite`，零外部依赖)
- Vercel AI SDK v6 (`ai` + `@ai-sdk/openai-compatible`，工具调用 + SSE 流式)
- IndexedDB 浏览器存储 (`idb-keyval`，数百MB 容量)
- 纯 Node.js/TS 解析引擎（PDS 格式 + .sav ZIP）

## 项目结构
```
src/
├── app/
│   ├── page.tsx                    # 首页: 上传.sav + AI状态
│   ├── layout.tsx                  # 根布局 (Stellaris背景图 + 版本标记)
│   ├── campaigns/
│   │   ├── page.tsx                # 战役列表
│   │   └── [id]/
│   │       ├── page.tsx            # 战役详情 (编年史+事件链+统计)
│   │       └── novel/page.tsx      # 小说阅读+AI生成 (全量上下文)
│   ├── settings/page.tsx           # AI配置
│   └── api/
│       ├── saves/upload/           # 上传解析.sav + 里程碑生成
│       ├── saves/batch-import/     # 批量导入存档目录
│       ├── campaigns/              # 战役CRUD + 事件链检测
│       ├── novels/generate/        # 小说生成 (AI SDK + 工具调用)
│       └── test-ai/                # 测试AI连接
├── lib/
│   ├── db.ts                       # SQLite数据库层 (迁移+CRUD+事件图查询)
│   ├── ai-client.ts                # AI SDK 客户端 (streamText + 工具)
│   ├── ai-tools.ts                 # AI 工具定义 (3个SQLite查询工具)
│   ├── flags.ts                    # Flag→中文标题 (批量locMap + 模式规则)
│   ├── noise-filter.ts             # 白名单噪声过滤器 (基于game_event_flags)
│   ├── event-chain-detector.ts     # 存档→事件链状态识别
│   ├── browser-storage.ts          # IndexedDB 浏览器存储
│   ├── lore.ts                     # 群星世界观知识库加载
│   └── parser/
│       ├── save-parser.ts          # .sav 存档解析 (15+ 提取函数)
│       └── pds-parser.ts           # 通用 PDS 脚本解析器
├── types/index.ts                  # TypeScript 类型定义
└── scripts/
    ├── preload-all.mjs             # 离线数据预加载入口
    ├── preload-relations.mjs       # 事件关系图构建
    ├── preload-localisation.mjs    # 中文本地化导入 (递归子目录)
    ├── pds-parser.mjs              # PDS 解析器 (Node.js版)
    └── shared.mjs                  # 共享工具 (DB/哈希/批量写入)
```

## 游戏数据来源

线上部署后无法访问游戏目录，所有数据运行时从 SQLite 读取：
- `game_data` — 129K 中文本地化 (从 `localisation/simp_chinese/` 递归导入)
- `game_event_nodes` / `game_event_edges` / `game_event_flags` — 事件关系图
- `game_event_chains` / `game_event_chain_nodes` — 事件链定义
- `game_techs` / `game_events` / `game_anomalies` / `game_traditions` — 游戏机制数据

预加载命令：`node scripts/preload-all.mjs`

## 开发命令
- `npm run dev` — 启动 (http://localhost:3000)
- `npm run build` — 生产构建
- `node scripts/preload-all.mjs` — 离线导入游戏数据
- `node scripts/test-pipeline.mjs` — 事件链流水线测试
- `node scripts/test-enriched-parse.mjs` — SAV 解析器集成测试
