# 银河编年史 · Stellaris Novel Generator

基于《群星》(Stellaris) 游戏存档的银河史诗小说生成器。上传 `.sav` 存档 → 自动提取帝国兴衰史 → 识别事件链 → AI 创作太空歌剧小说。

## 技术栈

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **SQLite** (Node.js 内置 `node:sqlite`, 零外部依赖)
- **纯 Node.js 解析引擎** (直接操作 Buffer 解析 PDS 格式)
- **通用 PDS 脚本解析器** (解析 Stellaris 事件/异常/考古/局势等游戏脚本)
- **OpenAI 兼容 API** (支持 DeepSeek / Claude / GPT / 本地 Ollama 等)
- **SSE 流式输出** (AI 生成实时显示)

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 预加载游戏数据 (一次性的离线导入, 包含本地化 + 事件 + 科技 + 异常 + 事件关系图)
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

AI 配置仅保存在当前浏览器的 `localStorage`，不会写入服务端 SQLite。生成小说时，浏览器会随当次请求将配置发送给生成接口。

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

小说、背景设定、章节概要和连续性档案均保存在当前浏览器，不写入服务端数据库。清理浏览器数据或更换浏览器后，本地小说不会自动保留，请及时使用「下载整部小说」导出 Markdown 文件。

当前生成流程：

1. 根据存档中的帝国资料、实力变化、舰队/领袖/外交/考古/局势数据构建小说背景。
2. 注入事件链状态（进行中/已完成/玩家选择/事件链后果/未解决线索）。
3. 将用户填写的额外背景设定加入每次生成请求。
4. 生成后将章节正文保存到浏览器。
5. 调用 AI 连续性编辑流程，为章节生成 200–350 字概要。
6. 更新长篇连续性档案，包括：
   - 人物及其当前状态
   - 势力及相互关系
   - 不可违背的既定事实
   - 尚未解决的伏笔
   - 进行中 / 已完成的事件链
   - 事件链玩家选择及后果
   - 未解决的事件链线索
   - 当前时间和总体局势
7. 续写下一章时向 AI 提供：
   - 全部历史章节概要
   - 最近一章的完整正文
   - 当前连续性档案
   - 额外背景设定
   - 帝国档案和游戏事件时间线
   - 舰队战力、领袖、外交、考古和局势数据

**小说写作约束**（注入 System Prompt）：
1. 严格基于事件时间轴，不虚构未发生的事件
2. 不得提前泄露尚未在存档中发生的结局
3. 不得把可能分支写成已发生事实
4. 后续章节必须延续此前事件链选择
5. 同一事件链跨章节时保持核心角色、地点、谜团和语气一致

用户可在小说页面打开「连续性档案」查看完整档案，或点击「模型提示词预览」查看组装后的完整提示词（含系统指令和用户数据），支持复制到剪贴板调试。

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
│   │   ├── ai-client.ts         # AI API 客户端
│   │   ├── flags.ts             # Flag → 中文标题映射
│   │   ├── lore.ts              # 世界观知识库加载
│   │   ├── event-chain-detector.ts # 事件链状态识别
│   │   ├── browser-storage.ts   # 浏览器本地存储
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
- **提示词预览** 查看和复制组装后的完整系统/用户提示词
- **重写与续写** 支持自定义修改指令和跨章节连续性
- **背景设定** 后续章节持续遵循用户补充的世界设定
- **连续性档案** 自动维护人物、势力、伏笔、事件链选择及后果
- **浏览器本地保存** API 配置和小说内容不写入服务端数据库
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
