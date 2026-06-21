# 流式 SQLite 工具调用与提示词机制重构实施说明

## Summary

目标是把当前“静态提示词 + 假定可查库”的小说生成链路，重构为“真实流式工具调用 + SQLite 按需查询 + 可持续续写上下文”的体系。实施完成后，模型在流式生成章节时必须能够动态查询 SQLite 中的游戏本体数据和当前战役事实，且工具调用过程能够进入消息历史，在续写时继续可见。

当前状态的核心缺陷如下：

- `src/lib/ai-tools.ts` 已定义 3 个 SQLite 工具，但 `src/lib/ai-client.ts` 的 `streamChat()` 只是原始 `/chat/completions` SSE 文本流，不发送 `tools`，也不处理 `tool_calls`。
- `src/app/api/novels/generate/route.ts` 在流式正文生成时传了 `{ tools: novelTools }`，但 `streamChat()` 忽略该参数，因此这是死参数。
- 前端 `NovelMessage` 已定义 `tool` 角色，但 `src/app/campaigns/[id]/novel/page.tsx` 与服务端生成链路都没有真正写入、回放或消费工具消息。
- 提示词写着“你可以使用工具查询游戏数据库”，但系统实际上不具备这种能力，属于提示词和执行链路不一致。
- 首章提示词会一次性展开大量帝国/编年史信息；后续章节只靠浏览器堆叠消息和连续性摘要，不能针对模糊术语、事件链阶段、科技名词重新查库。
- `stellaris-lore.md` 只适合作为世界观参考，不能承担当前战役事实源职责。

本次重构的强约束：

- 不考虑不支持流式工具调用的模型。
- 流式生成必须保留。
- SQLite 查询必须是只读、可控、低噪音的。
- 小说生成、章节大纲、连续性提取三条链路要共享同一套事实源和提示词纪律。

## Architecture Changes

### 1. AI Client 从“纯文本流”升级为“流式工具调用编排器”

重构 `src/lib/ai-client.ts`，拆成 3 层职责：

1. Provider 创建层
   - 保留 `createOpenAICompatible()`。
   - Provider 创建时启用 `includeUsage: true`。
   - 对聊天模型统一走 AI SDK 的流式能力，不再自己手写裸 SSE 解析作为主路径。
   - 如需要保留当前原始 SSE 实现，只作为紧急 fallback 分支，不参与默认小说生成链路。

2. 工具感知的流式生成层
   - 新增 `streamChatWithTools(messages, config, options)`。
   - 输入：
     - `messages`
     - `config`
     - `tools`
     - `maxSteps`
     - `onToolCallStart`
     - `onToolResult`
   - 输出统一为异步事件流，事件类型固定：
     - `text-delta`
     - `tool-call`
     - `tool-result`
     - `usage`
     - `finish`
     - `error`
   - 该层负责：
     - 把工具定义真正传给模型；
     - 接收模型的流式 `tool-call` 事件；
     - 执行对应 SQLite 工具；
     - 把 tool result 重新送回模型继续生成；
     - 直到模型 `finishReason === stop`。

3. 非流式完成层
   - `completeChat()` 也支持 `tools`，用于：
     - 连续性提取
     - 章节大纲
     - 任何非正文流式任务
   - 这样后续若大纲也要查 SQLite，不需要再补一套工具链。

实现要求：

- 统一消息格式，内部使用 AI SDK 可接受的 message 结构，允许 `system | user | assistant | tool`。
- 工具调用最多执行 `maxSteps = 8`，防止死循环。
- 如果模型请求不存在的工具、参数无效、结果为空，返回结构化错误 tool result，而不是直接抛异常结束整章生成。
- 流中如果发生工具错误，允许模型看到错误并自行继续改问，只有 AI 客户端级错误才终止请求。
- `TokenUsage` 扩展为支持最终汇总 usage；正文流式结束时通过 `done` 事件一并返回。

### 2. 生成链路从“浏览器拼消息”改为“服务端构造事实上下文 + 工具能力”

重构 `src/app/api/novels/generate/route.ts` 的职责：

- 服务端始终拥有上下文构造主导权。
- 前端不再完全信任自己保存的 `messages` 就是最终请求。
- 服务端在收到请求后，按以下顺序构造 `finalMessages`：

1. 如果是首章
   - 调用 `buildBasePrompt(campaignId)` 生成：
     - `systemPrompt`
     - `initialUserContext`
   - 作为消息起点。

2. 如果是续写/重写
   - 接收前端历史消息，但先经过服务端标准化：
     - 校验 role；
     - 保留已有 `tool` 消息；
     - 去掉不合法的孤立 tool 结果；
     - 检查 assistant tool call 是否都有 tool result。
   - 再额外拼接当前章所需的章节级上下文消息。

3. 统一附加章节级上下文
   - `outline`
   - `continuity`
   - `latest chapter summary`
   - `background setting`
   - 当前章节目标说明

4. 统一调用 `streamChatWithTools(..., { tools: novelTools })`

结果：

- 首章和续写都能动态查 SQLite；
- 后续章节不依赖“首章时静态塞进去的知识还没被上下文挤掉”。

### 3. 战役事实层与通用 SQLite 数据层分离

新增一层只读事实聚合模块，例如 `src/lib/novel-context.ts` 或 `src/lib/novel-facts.ts`，职责如下：

- 读取当前战役：
  - `campaign`
  - `saves`
  - `latest save`
  - `getResolvedCampaignMilestones()`
  - `detectEventChains()`
  - `latest raw_json` 摘要
- 输出 3 类数据：

1. 基础档案
   - 帝国名称、物种、政体、伦理、理念、特质、规模、军力、科技、殖民地等。

2. 战役事实摘要
   - 时间轴中的关键事件
   - 已识别事件链
   - 当前战争、外交、考古、局势、舰队、领袖

3. 工具查询支撑数据
   - 当前战役事件索引
   - latest save 中的动态名称映射
   - 关键 raw_json 路径的已清洗摘要

这层的设计目的是把“本局已发生的事实”和“游戏通用知识”隔离开，避免模型把 `stellaris-lore.md`、`game_data` 里的通用定义错当成当前战役已发生事实。

## Tooling Specification

### 1. 保留并重构现有工具

现有 3 个工具不删除，但要改成结构化输出：

- `search_game_knowledge`
- `lookup_event_chain`
- `lookup_technology`

改造要求：

- 不返回大段拼接字符串。
- 统一返回 JSON 字符串，字段稳定、短小、可引用。
- 每个工具返回结果都包括：
  - `matched`
  - `confidence`
  - `source`
  - `results`

例如 `lookup_technology` 返回：

```json
{
  "matched": true,
  "confidence": 0.94,
  "source": "game_techs+game_data",
  "results": [
    {
      "id": "tech_titans",
      "name": "泰坦",
      "description": "...",
      "tier": 5,
      "area": "engineering",
      "category": "voidcraft"
    }
  ]
}
```

### 2. 新增工具集合

新增以下只读工具，全部放在 `src/lib/ai-tools.ts`，统一由 `novelTools` 导出。

#### `lookup_localization`

用途：
- 精确查询某个 key 的中文名、描述、分类。

输入：
- `key: string`
- `variants?: string[]`

查询源：
- `game_data`

返回：
- `key`
- `name`
- `description`
- `category`
- `matched_variant`

#### `lookup_event_or_flag`

用途：
- 通过 flag、事件 key、中文标题、节点 ID 查询事件详情。

输入：
- `query: string`
- `campaign_id?: number`

查询顺序：
1. `game_event_flags.flag_name`
2. `game_event_nodes.id/title_key/zh_title`
3. `game_data.key/zh_name`
4. 如果传了 `campaign_id`，再从当前战役 milestones 中找实际出现记录

返回：
- `query`
- `matched`
- `candidate_count`
- `best_match`
  - `flag`
  - `node_id`
  - `title`
  - `description`
  - `chain_id`
  - `chain_stage`
  - `category`
  - `choices`
  - `possible_next_nodes`
  - `appeared_in_campaign`

#### `lookup_trait_or_civic_or_ethic`

用途：
- 精确解释伦理、理念、特质、传统、飞升等高频术语。

输入：
- `query: string`
- `type?: "trait" | "civic" | "ethic" | "tradition" | "ascension" | "auto"`

查询源：
- `game_data`
- 必要时补 `game_techs` / 其他已入库表

返回：
- 标准化名词说明结果列表

#### `lookup_campaign_fact`

用途：
- 查询当前战役内的已发生事实。

输入：
- `campaign_id: number`
- `query: string`
- `scope?: "timeline" | "leaders" | "fleets" | "wars" | "diplomacy" | "archaeology" | "situations" | "all"`

查询源：
- `getResolvedCampaignMilestones()`
- `getSaves()`
- latest `raw_json`

返回：
- 命中记录列表，字段包含时间、标题、描述、来源。

#### `lookup_campaign_event_chain`

用途：
- 查询“本局里这条事件链现在到哪一步”，而不是通用链定义。

输入：
- `campaign_id: number`
- `chain_query: string`

查询源：
- `detectEventChains()`
- `getResolvedCampaignMilestones()`
- `game_event_chain_nodes`

返回：
- `status`
- `current_stage`
- `observed_nodes`
- `started_at`
- `updated_at`
- `relevant_milestones`

### 3. 工具实现约束

- 所有工具只读。
- 所有 SQL 使用参数化查询。
- 所有工具设置结果条数上限：
  - 搜索类默认 `limit <= 5`
  - 链节点类默认 `limit <= 12`
- 所有工具都要做输入清洗：
  - trim
  - 长度限制
  - 去除控制字符
- 所有工具都要输出结构化错误：
  - `matched: false`
  - `error_code`
  - `message`
- 工具返回内容不要超过模型上下文可承受的大小：
  - 单次工具结果建议不超过 2KB 到 4KB 文本

## Prompting Specification

### 1. System Prompt 重写

当前 system prompt 的问题是“写作要求很多，但事实纪律和工具使用纪律不够强”。重构后 system prompt 必须分为 4 段。

#### A. 角色与目标
- 你是银河史诗小说作者。
- 任务是基于真实战役数据撰写小说章节。

#### B. 事实优先级
固定写清楚：

1. 当前战役已解析事实最高优先级。
2. SQLite 中的游戏事件/科技/本地化定义用于解释名词与事件。
3. `stellaris-lore.md` 只作为通用世界观参考。
4. 如果工具未确认，不得写成确定事实。

#### C. 工具使用纪律
固定规则：

- 遇到以下情况必须先查工具：
  - 事件标题含糊
  - 同名链或多候选科技
  - 不确定物种/特质/理念含义
  - 不确定事件链阶段、选择、后果
  - 想引用游戏术语但不确定中文表达
- 优先查当前战役事实，再查通用游戏定义。
- 不要为了润色频繁重复查同一术语；已确认信息应复用。

#### D. 写作纪律
保留现有写作要求，但删掉和现实能力不符的表述。必须追加两条：

- 如果工具结果显示信息不足，用模糊但不冲突的表达，不得补完不存在的细节。
- 如果工具结果与已有对话冲突，以当前战役事实和最近工具结果为准。

### 2. Initial User Context 改写

当前 `buildPrompt()` 一次性塞入完整帝国档案、全部重大事件、全部链摘要，规模偏大。要改成“分层摘要 + 可查工具”。

建议结构：

- `## 帝国档案`
- `## 当前战役关键阶段`
  - 早期
  - 中期
  - 晚期
- `## 当前局势`
  - 战争
  - 外交
  - 考古/局势
  - 著名领袖/舰队
- `## 已识别事件链摘要`
- `## 写作任务`
  - 第 N 章目标
  - 时间段
  - 应承接的上一章信息
  - 可通过工具补查细节

压缩规则：

- 时间轴不直接无上限全量拼接。
- 默认只内联关键里程碑，例如：
  - `importance !== info`
  - 链阶段事件
  - 战争/危机/殖民/科技/探索大节点
- 其余细节交给工具补查。

### 3. 续写消息构造策略

续写时不要只是把浏览器里堆积的消息原样送出。改成服务端控制的“滑动窗口 + 连续性 + 工具历史”。

保留顺序：

1. system prompt
2. 最近若干轮高价值历史消息
3. 最近工具结果中仍有参考价值的部分
4. 连续性档案
5. 最近一章摘要
6. 本章任务 user message

窗口策略：

- 永远保留 system prompt
- 永远保留最近 2 章对应的 user/assistant/tool 回合
- 更早的章节正文只保留 summary，不保留全文
- 历史工具结果如果已被连续性摘要吸收，可丢弃
- 当前章强相关的工具结果必须保留

这样既能控制 token，又能保持可查证链路。

## Frontend / API Contract

### 1. `NovelMessage` 正式升级

沿用 `src/lib/browser-storage.ts` 的 `NovelMessage`，但从占位变成真实协议。

支持的消息角色与结构：

- `system`
- `user`
- `assistant`
- `tool`

`tool` 消息至少包含：

- `role: "tool"`
- `tool_name`
- `tool_call_id`
- `content`

如果 AI SDK 内部需要更细颗粒结构，可以在服务端转换，但前端本地存储保持简化版即可。

### 2. 章节生成 API

`POST /api/novels/generate` 保持现有字段，但明确语义：

- `campaign_id`
- `chapter_number`
- `mode`
- `messages`
- `continuity`
- `config`

服务端处理规则：

- `messages` 是候选历史，不是最终权威请求。
- 服务端要重新标准化并补充上下文。
- 返回 NDJSON 仍保留当前协议：
  - `chunk`
  - `done`
  - `error`

新增返回字段：

- `done.usage`
- `done.tool_calls_used`
- 可选 `done.context_stats`
  - `input_message_count`
  - `tool_message_count`
  - `estimated_tokens`

### 3. 提示词预览 API / UI

当前“完整提示词预览”实际上只展示首章静态 `system/user`。需要拆成两种预览：

1. 初始提示词预览
   - 展示 `buildBasePrompt()` 的 system/user
   - 用于调试首章输入

2. 实际请求预览
   - 展示服务端标准化后的本次真实消息数组
   - 包含 tool 消息摘要
   - 用于调试续写与上下文裁剪

文案修正：

- 删除“含 3 个工具定义”这种错误说明
- 改成“显示将发送给模型的消息上下文；工具规格与执行结果由服务端管理”

## Implementation Breakdown

### Phase 1. 重构 AI Client

修改 `src/lib/ai-client.ts`：

- 抽出 `createProvider(config)`
- 实现 `streamChatWithTools()`
- 实现支持工具的 `completeChat()`
- 统一 usage 提取
- 保留原 `streamChat()` 仅作兼容包装，内部直接调用 `streamChatWithTools()` 无工具版本

完成标志：

- 服务端能在单个请求中完成 “模型发起 tool call -> 本地执行 -> 模型继续流式输出”

### Phase 2. 重构工具定义

修改 `src/lib/ai-tools.ts`：

- 现有工具统一结构化输出
- 新增 `lookup_localization`
- 新增 `lookup_event_or_flag`
- 新增 `lookup_trait_or_civic_or_ethic`
- 新增 `lookup_campaign_fact`
- 新增 `lookup_campaign_event_chain`

必要时新增辅助模块，例如：

- `src/lib/ai-tool-utils.ts`
- `src/lib/novel-facts.ts`

完成标志：

- 模型可以分别查“游戏定义”和“本局事实”
- 结果结构稳定，不再是拼接文本

### Phase 3. 重构 Prompt Builder

修改 `src/app/api/novels/generate/route.ts`：

- 拆出：
  - `buildBasePrompt(campaignId)`
  - `buildChapterContext(args)`
  - `buildSystemPrompt(loreText)`
- `buildPrompt()` 不再直接拼一个巨大 intro 字符串
- 服务端统一掌控首章与续写上下文拼接

必要时新增模块：

- `src/lib/novel-prompt.ts`

完成标志：

- system prompt、首章上下文、续写上下文三者职责清晰
- 续写时不再仅依赖浏览器拼接 user message

### Phase 4. 接通前端工具消息持久化

修改 `src/app/campaigns/[id]/novel/page.tsx`：

- 允许保存并回放 `tool` 消息
- 生成完成后把工具消息和 assistant 正文一起写入 IndexedDB
- `promptPreview` 拆成两类预览
- `needsWindow` 提示与真实服务端窗口策略保持一致，不再只靠前端粗估

完成标志：

- 下一章续写时，前一章的工具查询结果能够进入历史上下文
- UI 文案与真实行为一致

### Phase 5. 统一 Outline / Continuity 链路

修改：

- `src/app/api/novels/generate/outline/route.ts`
- `extractChapterMemory()` 调用路径

要求：

- 大纲生成可以先不强制使用工具，但接口必须支持工具
- 连续性提取默认不查工具，除非后续发现确有必要
- 三条链路复用同一套 provider 创建和消息标准化逻辑

完成标志：

- 不再存在“正文能用工具，大纲/连续性不能”的并行实现裂缝

## Error Handling and Safeguards

- 工具不存在：
  - 返回 tool result 错误，不中断整个流。
- 工具参数非法：
  - tool result 中返回 `invalid_input`。
- SQLite 查询为空：
  - 返回 `matched: false`，让模型自行决定使用保守措辞。
- 工具循环过多：
  - 超过 `maxSteps` 后强制终止，并向模型返回系统级错误说明。
- 单次工具结果过大：
  - 服务端截断并附带 `truncated: true`。
- 历史消息不完整：
  - 服务端在标准化时修复或剔除坏消息，避免 AI SDK 因缺失 tool result 抛 `MissingToolResultsError`。
- Provider 返回 usage 不稳定：
  - 允许 `usage` 为空，但接口结构保留字段。

## Acceptance Criteria

满足以下条件才算完成：

- 模型在小说正文流式生成时，能真实触发并执行 SQLite 工具调用。
- 服务端消息历史中存在 `tool` 消息，并能在续写时重新发送给模型。
- 首章和续写都支持动态查 SQLite，不再只靠初始静态大上下文。
- `stellaris-lore.md` 仍可注入 system prompt，但不会覆盖战役事实。
- 提示词文本不再虚假宣称工具能力；UI 预览文案和真实行为一致。
- 工具结果主要回答两类问题：
  - 游戏本体定义是什么
  - 这一局里真实发生了什么
- 章节正文流式输出、章节保存、连续性提取、背景设定、大纲生成都不回归。

## Test Plan

### 1. 单元与集成测试

新增测试覆盖：

- `ai-tools`
  - 精确命中
  - 模糊命中
  - 无命中
  - 超长 query
  - campaign fact 查询
- `novel-prompt`
  - system prompt 事实优先级
  - 首章上下文裁剪
  - 续写上下文裁剪
- `ai-client`
  - 工具调用事件流
  - 多步 tool call
  - tool error 后继续生成
  - usage 汇总

### 2. 手工验证场景

场景 A：首章生成
- 模型遇到模糊事件链名时调用 `lookup_campaign_event_chain`
- 正文继续流式输出
- 章节完成后本地保存含 tool 消息

场景 B：续写
- 前一章已有 tool 消息
- 本章继续引用先前链状态
- 遇到新科技再调用 `lookup_technology`

场景 C：冲突事实
- `stellaris-lore.md` 里存在某类通用背景
- 当前战役并未发生
- 模型不会写成已发生事实

场景 D：查询失败
- 工具无命中
- 模型继续用保守、非臆造的表述完成章节

### 3. 基础构建验证

- `npx tsc --noEmit`
- `npm run build`

必要时新增定向测试脚本，例如：

- `scripts/test-ai-tools.mjs`
- `scripts/test-novel-prompt.mjs`

## Assumptions

- 目标模型支持流式工具调用，不为不支持该能力的模型做兼容设计。
- 本轮只做只读 SQLite 工具，不引入任何外部联网检索。
- 不改变现有战役/编年史主数据结构，动态查询基于现有 SQLite 和 `raw_json` 聚合完成。
