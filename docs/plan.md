# Stellaris Novel Generator — Next.js 项目计划

## Context

用户拥有 4 个群星战役、39 个存档文件。需要构建一个完整的 Web 应用：上传存档 → 自动提取里程碑 → AI 生成小说。使用 DeepSeek API 生成。群星游戏目录（含 localisation、events、anomalies 等）需预解析存入本地 SQLite，后续从 SQLite 查询。纯 Node.js/TypeScript 技术栈（零 Python 依赖），SQLite 本地存储，AI 服务可配置（支持任意 OpenAI 兼容 API）。

## Architecture Overview

```
┌────────────────────────── Next.js App (纯JS/TS) ──────────────────┐
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ 首页     │   │ 战役列表 │   │ 时间轴   │   │ 小说阅读器   │ │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └──────┬───────┘ │
│       │              │              │                 │          │
│       │         ┌────┴──────┐       │          ┌──────┴───────┐ │
│       │         │  设置页   │       │          │ AI配置       │ │
│       │         │ 游戏目录  │       │          │ AK/URL/模型  │ │
│       │         └───────────┘       │          └──────────────┘ │
│                             │                                    │
│  ┌──────────────────────────┴──────────────────────────────────┐ │
│  │                    Next.js API Routes                        │ │
│  │  /api/saves/upload    /api/campaigns    /api/novels/gen      │ │
│  │  /api/milestones      /api/import       /api/settings        │ │
│  └────┬──────────────────────────┬─────────────────────────────┘ │
│       │                          │                                │
│  ┌────┴──────────┐    ┌──────────┴──────────┐                     │
│  │ better-sqlite3│    │ JS 解析引擎          │                     │
│  │ stellaris.db  │    │ lib/parser/          │                     │
│  │ (本地单文件)  │    │ → save-parser.ts     │ ← 存档解析(Buffer)  │
│  └────┬──────────┘    │ → game-importer.ts   │ ← 游戏文件→DB       │
│       │               └──────────┬──────────┘                     │
│       │                          │                                │
│  ┌────┴──────────┐    ┌──────────┴──────────┐                     │
│  │ SQLite        │    │ Stellaris Game Dir   │                     │
│  │ 含settings表  │    │ localisation/ etc.   │                     │
│  └───────────────┘    └─────────────────────┘                     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │      用户配置的 AI 服务 (OpenAI 兼容 API)                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**技术栈：纯 Node.js/TypeScript**。零 Python 依赖。存档解析用 Node.js `Buffer` 直接操作二进制数据，游戏文件导入用内置 `fs` + 文本解析。无需 `child_process`，所有逻辑在同一个 Node.js 进程中完成。

## Database Schema (SQLite + better-sqlite3)

单文件 `stellaris.db`，启动时自动创建。所有数据都在本地，无需数据库服务。

```sql
-- 游戏静态数据 (从群星游戏目录预导入)
CREATE TABLE game_data (
    key TEXT PRIMARY KEY,        -- 如 anomaly.35, tech_titans
    zh_name TEXT,                -- 中文名
    description TEXT,            -- 完整描述
    category TEXT                -- anomaly/tech/tradition/ethics/event/crisis 等
);

-- 存档数据
CREATE TABLE campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,          -- 战役名(如"汉帝国战役")
    source_dir TEXT,             -- 存档来源目录
    save_count INTEGER,
    date_start TEXT,             -- 最早存档日期
    date_end TEXT,               -- 最晚存档日期
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE saves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES campaigns(id),
    filename TEXT NOT NULL,
    game_date TEXT,              -- 游戏内日期 如 "2559.06.11"
    empire_name TEXT,
    empire_size INTEGER,
    military_power INTEGER,
    tech_power INTEGER,
    victory_rank INTEGER,
    authority TEXT,
    ethics TEXT,                 -- JSON array string
    civics TEXT,                 -- JSON array string
    origin TEXT,
    species_name TEXT,
    species_traits TEXT,         -- JSON array string
    raw_json TEXT,               -- 完整解析结果的JSON
    uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id INTEGER REFERENCES saves(id),
    campaign_id INTEGER REFERENCES campaigns(id),
    event_date TEXT,
    event_type TEXT,             -- war/colonization/anomaly/megastructure/crisis 等
    title TEXT,
    description TEXT,
    importance TEXT,             -- critical/major/minor/info
    game_key TEXT,               -- 关联 game_data.key
    raw_flag TEXT,               -- 原始存档flag
    raw_value TEXT               -- flag值
);

-- 小说
CREATE TABLE novels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES campaigns(id),
    title TEXT NOT NULL,
    status TEXT DEFAULT 'draft', -- draft/generating/completed
    total_chapters INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_id INTEGER REFERENCES novels(id),
    chapter_number INTEGER,
    title TEXT,
    content TEXT,
    era_start TEXT,              -- 本章游戏时间段起
    era_end TEXT,                -- 本章游戏时间段止
    source_milestones TEXT,      -- JSON: 引用的里程碑ID
    created_at TEXT DEFAULT (datetime('now'))
);

-- 应用配置 (用户设置)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,        -- api_key, base_url, model, stellaris_dir
    value TEXT NOT NULL
);
```

**settings 表预置行：**
| key | 默认值 | 说明 |
|---|---|---|
| `api_key` | (空) | AI API Key，如 `sk-xxx` |
| `base_url` | `https://api.deepseek.com` | OpenAI 兼容 API 地址 |
| `model` | `deepseek-chat` | 模型名，可选换其他 |
| `stellaris_dir` | (空) | 群星游戏安装目录 |

## Project Structure

```
stellaris-novel/
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── data/
│   └── stellaris.db              # SQLite 单文件 (自动创建)
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # 首页：上传存档
│   │   ├── campaigns/
│   │   │   ├── page.tsx          # 战役列表
│   │   │   └── [id]/
│   │   │       ├── page.tsx      # 战役详情+时间轴
│   │   │       └── novel/
│   │   │           └── page.tsx  # 小说阅读/生成
│   │   ├── api/
│   │   │   ├── saves/
│   │   │   │   ├── upload/route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── campaigns/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── milestones/
│   │   │   │   └── route.ts
│   │   │   ├── novels/
│   │   │   │   ├── route.ts
│   │   │   │   └── generate/route.ts
│   │   │   └── import/
│   │   │       └── route.ts       # POST 导入游戏数据
│   │   └── settings/
│   │       └── page.tsx
│   ├── components/
│   │   ├── ui/
│   │   ├── SaveUploader.tsx       # 拖拽上传
│   │   ├── Timeline.tsx           # 时间轴
│   │   ├── StatsChart.tsx         # 实力曲线 (Recharts)
│   │   ├── NovelReader.tsx        # 小说阅读器
│   │   └── MilestoneCard.tsx      # 里程碑卡片
│   ├── lib/
│   │   ├── db.ts                 # SQLite (better-sqlite3)
│   │   ├── ai-client.ts          # OpenAI 兼容 API 客户端
│   │   ├── utils.ts
│   │   └── parser/               # 纯 JS 群星解析引擎
│   │       ├── save-parser.ts    # .sav 存档解析 (Buffer/ZIP/PDS)
│   │       └── game-importer.ts  # 游戏目录→SQLite 导入
│   └── types/
│       └── index.ts
└── .env                          # 可选回退默认值
```

**零外部依赖**：Python × | child_process × | 所有解析逻辑在 Node.js 内完成。

## Data Flow

### ① 游戏数据导入 (一次性)
```
设置页面 → 配置游戏目录 → POST /api/import
→ game-importer.ts 解析:
   localisation/l_simp_chinese.yml → 逐行正则提取 key + zh_name + desc
   common/anomalies/*.txt          → anomaly ID + 分类
   events/*.txt                    → 事件完整文本
   common/technology/*.txt          → 科技树
   ...
→ 写入 SQLite game_data 表 → 返回导入统计
```

### ② 存档上传解析
```
上传 .sav → POST /api/saves/upload → 暂存临时目录
→ save-parser.ts:
   Buffer 读取 → adm-zip 解压 → 提取 gamestate
   二进制搜索定位 country section
   正则 + Buffer 操作提取 stats/flags/wars/anomalies
→ 写入 saves + milestones 表
→ JOIN game_data 补全中文名和描述
→ 返回解析结果 JSON
```

### ③ AI 小说生成
```
POST /api/novels/generate
→ 从 SQLite settings 表读取 api_key, base_url, model
→ 查询 campaign 的所有 milestones (按时间排序)
→ JOIN game_data 获取完整事件描述
→ 组装 context prompt:
   - 帝国设定(伦理/政体/物种/起源)
   - 实力演变数据 (saves 表的多时间点快照)
   - 事件时间轴 (含完整中文描述)
→ 调用 OpenAI 兼容 API (base_url + api_key + model)
   - SSE 流式输出: fetch base_url/chat/completions {stream:true}
→ 流式返回前端 → 完成后存入 chapters 表
   - 危机遭遇详情
→ 调用 DeepSeek API 生成章节
→ 存入 chapters 表
→ 流式返回给前端(SSE)
```

### 4. 前端展示
```
/                      → 拖拽上传 .sav + 最近战役
/campaigns             → 战役卡片列表
/campaigns/[id]        → 实力曲线图 + 事件时间轴
/campaigns/[id]/novel  → 小说阅读器 + AI生成/续写
/settings              → AI服务配置(AK/BaseURL/模型名) + 游戏目录设置
```

## Key Technical Decisions

1. **纯 JS 解析引擎**: 使用 Node.js `Buffer` + `adm-zip` 解析 .sav 文件（ZIP包），直接操作二进制数据提取 PDS 格式的游戏状态。文本格式的群星游戏文件（localisation YAML、events、common）用 `fs` + 正则解析。零外部运行时依赖。

2. **SQLite + better-sqlite3**: 数据库是本地单文件 `data/stellaris.db`，无需安装任何数据库服务。`settings` 表存储 AI 配置和游戏目录路径。

3. **AI 生成 — 用户可配置**: 前端设置页配置 `api_key`、`base_url`、`model`，存入 settings 表。支持 DeepSeek / Claude / OpenAI / 本地 Ollama 等任意 OpenAI 兼容 API。前端不暴露 AK，服务端 API Route 中转调用。

4. **游戏数据导入**: JS 脚本解析群星安装目录，批量写入 SQLite `game_data` 表。所有中文名和描述从 `l_simp_chinese.yml` 提取。

5. **本地化查找**: 里程碑提取时，裸 ID 通过 JOIN `game_data` 获得中文名和描述，无需每次读游戏文件。

## Implementation Steps

### Step 1: 项目初始化
- `npx create-next-app@latest stellaris-novel` (TypeScript, App Router, Tailwind)
- 安装依赖: `better-sqlite3`, `adm-zip`, `recharts`, `react-dropzone`
- 创建目录结构

### Step 2: 数据库
- `lib/db.ts`: 初始化 SQLite，建表（含 settings 表），预置默认值
- 启动时自动执行 migration

### Step 3: JS 解析引擎
- `lib/parser/save-parser.ts`: 用 Buffer + adm-zip 解析 .sav → 提取 stats/flags/wars/anomalies/empire info
- `lib/parser/game-importer.ts`: 读群星游戏目录 → 解析 localisation + events + common → 批量写入 SQLite

### Step 4: API Routes
- `/api/settings` — GET/POST 读写 AI 配置和游戏目录
- `/api/import` — POST 触发游戏数据导入
- `/api/saves/upload` — POST 上传+解析存档
- `/api/campaigns` — GET 列表 / POST 创建
- `/api/milestones` — GET 查询战役里程碑
- `/api/novels/generate` — POST AI 生成（读 settings → 调 OpenAI API → SSE 流式返回）

### Step 5: 前端页面
- `/` 首页：拖拽上传 .sav
- `/campaigns` 战役列表 + `/campaigns/[id]` 详情(时间轴+图表)
- `/campaigns/[id]/novel` 小说阅读/生成页
- `/settings` AI 配置 (AK/URL/模型) + 游戏目录设置

### Step 6: AI 生成管线
- `lib/ai-client.ts`: 通用 OpenAI 兼容 API 客户端
- Prompt 工程: system prompt + 帝国数据 + 事件时间轴
- SSE 流式输出 → 前端逐字显示
- 章节管理: 生成 → 保存 → 续写

## Verification

1. `npm run dev` → http://localhost:3000
2. 设置页：填入 AI API Key + Base URL + Model → 保存
3. 设置页：配置群星游戏目录 → 点击导入 → 确认 game_data 表有数据
4. 上传 .sav 文件 → 确认解析出战役/存档/里程碑
5. 战役详情页 → 验证实力曲线和时间轴
6. 点击"生成小说" → 验证 AI 流式输出 → 确认章节保存
