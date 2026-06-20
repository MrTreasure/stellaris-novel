# 银河编年史 — 群星小说生成器

基于群星(Stellaris)游戏存档的银河史诗小说生成器。
上传.sav存档 → 自动提取里程碑 → AI生成小说。

## 技术栈
- Next.js 16 (App Router, TypeScript, Tailwind CSS)
- SQLite (Node.js 内置 `node:sqlite`)
- 纯 Node.js/TS 解析引擎 (零 Python 依赖)
- OpenAI 兼容 API (DeepSeek/Claude/OpenAI 等)

## 项目结构
```
src/
├── app/
│   ├── page.tsx                    # 首页: 上传.sav
│   ├── layout.tsx                  # 根布局+导航
│   ├── campaigns/
│   │   ├── page.tsx                # 战役列表
│   │   └── [id]/
│   │       ├── page.tsx            # 战役详情+时间轴+图表
│   │       └── novel/page.tsx      # 小说阅读+AI生成
│   ├── settings/page.tsx           # AI配置+游戏目录
│   └── api/
│       ├── settings/               # 读写AI配置
│       ├── import/                 # 导入游戏数据
│       ├── test-ai/                # 测试AI连接
│       ├── saves/upload/           # 上传解析.sav
│       ├── campaigns/              # 战役CRUD
│       └── novels/                 # 小说+章节API
├── lib/
│   ├── db.ts                       # SQLite数据库层
│   ├── ai-client.ts                # AI API客户端(SSE流式)
│   └── parser/
│       ├── save-parser.ts          # .sav文件解析引擎
│       └── game-importer.ts        # 游戏目录→DB
└── types/index.ts                  # 类型定义
```

## 开发命令
- `npm run dev` — 启动 (http://localhost:3000)
- `npm run build` — 生产构建
- `npm start` — 启动生产服务

## 配置方式
1. 访问 `/settings` 页面
2. 填入 AI API Key、Base URL、模型名
3. 设置群星游戏目录并导入游戏数据
4. 回到首页上传 .sav 文件
