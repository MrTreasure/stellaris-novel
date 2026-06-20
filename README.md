# 🌌 银河编年史 · Stellaris Novel Generator

基于《群星》(Stellaris) 游戏存档的银河史诗小说生成器。上传 `.sav` 存档 → 自动提取帝国兴衰史 → AI 创作太空歌剧小说。

## 技术栈

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **SQLite** (Node.js 内置 `node:sqlite`, 零外部依赖)
- **纯 Node.js 解析引擎** (直接操作 Buffer 解析 PDS 格式)
- **OpenAI 兼容 API** (支持 DeepSeek / Claude / GPT / 本地 Ollama 等)
- **SSE 流式输出** (AI 生成实时显示)

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 预加载游戏数据 (一次性的离线导入)
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
3. 点击「测试连接」确认可用
4. 支持所有 OpenAI 兼容 API

## 项目结构

```
stellaris-novel/
├── docs/                        # 项目文档
│   ├── plan.md                  # 架构设计
│   ├── data-import-design.md    # 数据同步方案
│   └── stellaris-lore.md        # 群星世界观 (AI prompt 素材)
├── scripts/                     # 离线工具
│   ├── preload-all.mjs          # 游戏数据同步入口
│   ├── preload-localisation.mjs # 本地化文本导入
│   ├── preload-events.mjs       # 事件脚本导入
│   ├── preload-techs.mjs        # 科技树导入
│   ├── extract-assets.js        # 游戏图片提取
│   └── shared.mjs               # 共享工具
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── page.tsx             # 首页 (上传/导入)
│   │   ├── layout.tsx           # 全局布局
│   │   ├── campaigns/           # 战役列表/详情
│   │   ├── settings/            # AI 配置
│   │   └── api/                 # API 路由
│   ├── components/              # UI 组件
│   ├── lib/                     # 核心逻辑
│   │   ├── db.ts                # 数据库层
│   │   ├── ai-client.ts         # AI API 客户端
│   │   ├── flags.ts             # Flag 名称映射
│   │   ├── lore.ts              # 背景知识加载
│   │   └── parser/              # 存档解析引擎
│   └── types/                   # TypeScript 类型
└── public/images/               # 游戏素材 (PNG)
```

## 功能

- 📂 **拖拽上传** 或从存档目录批量导入 39 个存档
- 📊 **实力演变图表** 帝国规模/军力/科技随时间变化
- 📜 **帝国编年史** 按时间线展示数百个里程碑事件
- 🤖 **AI 生成小说** 基于真实游戏数据创作章章小说
- 🔄 **重写/续写** 支持自定义修改指令
- ⚙️ **背景设定** 可勾选额外世界设定，所有后续章节遵循
- 🌑 **科幻风格 UI** 游戏原始素材 + 暗色主题

## 数据同步

游戏数据离线预加载到 SQLite，运行时只读：

```bash
# 首次导入
node scripts/preload-all.mjs

# 游戏升级后增量同步 (SHA256 只处理变化文件)
node scripts/preload-all.mjs
```

## 环境要求

- Node.js 24+ (需要 `node:sqlite`)
- 群星游戏安装目录 (用于提取素材和游戏数据)
- OpenAI 兼容 API Key
