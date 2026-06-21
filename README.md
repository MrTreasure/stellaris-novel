# 银河编年史 · Stellaris Novel Generator

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
3. 点击「保存到当前浏览器」
4. 点击「测试连接」确认可用
5. 支持所有 OpenAI 兼容 API

AI 配置仅保存在当前浏览器的 `localStorage`，不会写入服务端 SQLite。生成小说时，浏览器会随当次请求将配置发送给生成接口，用于调用所选的 AI 服务。

## 小说生成与连续性

小说、背景设定、章节概要和连续性档案均保存在当前浏览器，不写入服务端数据库。清理浏览器数据或更换浏览器后，本地小说不会自动保留，请及时使用「下载整部小说」导出 Markdown 文件。

当前生成流程：

1. 根据存档中的帝国资料、实力变化和重大事件构建小说背景。
2. 将用户填写的额外背景设定加入每次生成请求。
3. 生成后将章节正文保存到浏览器。
4. 额外调用一次 AI 连续性编辑流程，为章节生成 200–350 字概要。
5. 更新长篇连续性档案，包括：
   - 人物及其当前状态
   - 势力及相互关系
   - 不可违背的既定事实
   - 尚未解决的伏笔
   - 正在推进的游戏事件链
   - 当前时间和总体局势
6. 续写下一章时向 AI 提供：
   - 全部历史章节概要
   - 最近一章的完整正文
   - 当前连续性档案
   - 额外背景设定
   - 帝国档案和游戏事件时间线

该机制用于减少跨章节的人物状态冲突、设定遗忘、重复介绍和伏笔中断。用户可在小说页面打开「连续性档案」查看章节概要、人物、势力、事件链和未解决伏笔。

重写章节时会同时提供原章节、历史概要和连续性档案。重写完成后，该章概要及整体连续性档案会重新生成。

### 事件链支持状态

当前小说系统能够维护已经识别出的事件链及其跨章节状态，但完整的 Stellaris 游戏脚本关系图尚未实现。完整事件链增强仍属于后续计划，需要解析游戏事件节点、选项分支、特殊项目、异常、考古遗址、局势及 flag 关系。

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

- **拖拽上传** 或从存档目录批量导入存档
- **实力演变图表** 展示帝国规模、军力和科技变化
- **帝国编年史** 按时间线和分类展示里程碑事件
- **战争信息** 在存档可用时识别宣战方和敌对帝国
- **AI 生成小说** 基于真实游戏数据创作章节
- **重写与续写** 支持自定义修改指令和跨章节连续性
- **背景设定** 后续章节持续遵循用户补充的世界设定
- **章节概要与连续性档案** 自动维护人物、势力、伏笔和事件链
- **浏览器本地保存** API 配置和小说内容不写入服务端数据库
- **整部下载** 将小说、背景设定和连续性档案导出为 Markdown
- **科幻风格 UI** 使用游戏素材和深空暗色主题

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
