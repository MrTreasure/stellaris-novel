# Stellaris 完整事件链增强计划

## 目标

将当前依赖少量硬编码规则的事件识别，升级为基于 Stellaris 游戏脚本的完整事件关系图，使系统能够：

- 识别异常、考古、先驱者、首次接触、危机等多阶段事件链。
- 还原事件入口、阶段推进、玩家选择、分支和结局。
- 在帝国编年史中按事件链聚合展示。
- 在小说生成时保持事件链的因果、选择和悬念连续性。
- 游戏版本更新后通过离线预加载重新同步。

## 本机游戏源文件

```text
E:\SteamLibrary\steamapps\common\Stellaris
```

主要数据目录：

```text
events\
common\anomalies\
common\archaeological_site_types\
common\situation_types\
common\special_projects\
common\on_actions\
common\event_chains\
localisation\simp_chinese\
```

所有导入均为离线只读处理，不在应用运行时修改游戏目录。

## 当前问题

- SQLite 中 `game_events`、`game_anomalies` 和 `game_data` 当前没有预加载数据。
- `game_events` 只设计为保存孤立事件，没有事件间关系。
- 现有解析器主要提取国家 flag，无法确定完整事件链阶段。
- 同一事件链的起点、选项、后续事件和结局会被显示为独立里程碑。
- 小说连续性档案只能根据生成正文推断事件链，缺少游戏脚本提供的确定关系。

## 总体方案

构建离线“事件关系图”：

```text
入口（异常/项目/on_action）
  → 事件
    → 玩家选项
      → 后续事件/特殊项目/局势
        → flag 或变量变化
          → 分支事件
            → 结局
```

存档导入时，将实际出现的 flag、事件、项目和选择映射到关系图，推断每条事件链的当前阶段。

## 第一阶段：扩展数据库

新增或调整以下表。

### `game_event_nodes`

- `id`：事件、异常、项目或局势的唯一 ID。
- `node_type`：event、anomaly、project、situation、archaeology、on_action。
- `title_key`
- `desc_key`
- `zh_title`
- `zh_description`
- `file_path`
- `raw_text`

### `game_event_edges`

- `id`
- `source_id`
- `target_id`
- `edge_type`：option、trigger、immediate、after、on_success、on_fail、on_action。
- `option_name_key`
- `conditions`
- `effects`

### `game_event_flags`

- `node_id`
- `flag_name`
- `operation`：set、remove、has、not_has。
- `scope`：country、planet、fleet、global、event_target。

### `game_event_chains`

- `chain_id`
- `name_key`
- `zh_name`
- `category`
- `root_node_id`
- `source`

### `game_event_chain_nodes`

- `chain_id`
- `node_id`
- `stage_order`
- `stage_type`：start、progress、choice、branch、ending。

## 第二阶段：PDS 脚本解析器

实现通用 PDS 块解析器，避免继续使用简单正则切割。

需要支持：

- 嵌套 `{}`。
- 重复字段。
- 引号字符串、数字、布尔值和标识符。
- `if`、`else_if`、`else`、`random_list`。
- `country_event`、`planet_event`、`ship_event` 等事件类型。
- `option` 中触发的事件。
- `set_country_flag`、`remove_country_flag` 等状态变化。
- `event_target` 和作用域切换。

首先解析以下关系：

- `country_event` / `planet_event` / `ship_event`
- `option`
- `immediate`
- `after`
- `trigger`
- `fire_on_action`
- `country_event = { id = ... }`
- `enable_special_project`
- `begin_event_chain`
- `activate_situation`
- flag 设置、删除和检查

## 第三阶段：完整离线预加载

调整 `scripts/preload-all.mjs`，读取本机游戏目录：

```text
E:\SteamLibrary\steamapps\common\Stellaris
```

预加载顺序：

1. 简体中文本地化。
2. 事件定义。
3. 异常分类及结果事件。
4. 特殊项目。
5. 考古遗址阶段。
6. 局势系统。
7. on_action 入口。
8. 原生 event_chain 定义。
9. 构建节点和边。
10. 根据连通分量及原生定义生成事件链。

继续使用文件哈希实现增量同步。游戏升级后只重新解析变化文件，并重建受影响的关系图。

## 第四阶段：事件链识别

导入新存档时收集：

- 国家、星球和全局 flag。
- 已完成异常。
- 活动和完成的特殊项目。
- 考古遗址及当前阶段。
- 活动局势及进度。
- 已触发事件 ID（如果存档可用）。
- 事件相关变量和 event target。

识别结果应包含：

```ts
interface DetectedEventChain {
  chainId: string;
  name: string;
  category: string;
  status: "active" | "completed" | "failed" | "unknown";
  currentStage: string;
  observedNodes: string[];
  selectedChoices: string[];
  possibleNextNodes: string[];
  startedAt?: string;
  updatedAt?: string;
}
```

仅保存存档中有证据支持的阶段和选择，不将脚本中的所有可能分支误认为已经发生。

## 第五阶段：编年史展示

战役详情页增加事件链视图：

- 按事件链聚合里程碑。
- 显示“开始、推进、选择、结局”阶段。
- 标记进行中、完成、失败或未知。
- 显示玩家实际选择。
- 可展开查看原始独立事件。
- 普通事件仍保留在完整时间线中。

示例：

```text
尤特先驱者事件链 · 已完成

2215 发现尤特遗迹
2241 完成第三处先驱者异常
2305 发现尤特星系
2306 找到尤特母星
```

## 第六阶段：小说连续性

生成小说时向模型提供：

- 已发生事件链的实际阶段。
- 玩家选择及其后果。
- 当前仍未结束的事件链。
- 已知但尚未揭示的线索。
- 完成事件链的结局。

连续性档案新增：

- `activeEventChains`
- `completedEventChains`
- `eventChainChoices`
- `eventChainConsequences`
- `unresolvedEventChainClues`

写作约束：

- 不得提前泄露尚未在存档中发生的结局。
- 不得把可能分支写成已发生事实。
- 后续章节必须延续此前事件链选择。
- 事件链结束后更新人物、势力和世界状态。
- 同一事件链跨章节时应保持核心角色、地点、谜团和语气一致。

## 第七阶段：测试

### 解析测试

- 单事件文件。
- 多层嵌套 option。
- 条件分支和随机分支。
- 异常到事件的映射。
- 特殊项目成功和失败分支。
- flag 设置、检查和删除。

### 集成测试

选择至少以下事件链：

- 一个先驱者事件链。
- 一个异常多阶段事件链。
- 一个考古遗址。
- 一个首次接触链。
- 大可汗或其他中期危机。
- 一个包含明确玩家选项的链。

验证从游戏脚本预加载、存档识别、编年史展示到小说提示词的完整链路。

### 验收标准

- SQLite 中事件节点和边数量与游戏源文件规模相符。
- 事件关系不依赖手工枚举具体事件 ID。
- 新存档可正确识别至少上述测试事件链的阶段。
- 编年史不再将同一链的阶段全部显示为无关事件。
- 小说续写能够引用此前线索和玩家选择。
- 未发生的分支和结局不会进入小说事实。

## 实施顺序

1. 通用 PDS 解析器。
2. 数据库关系图结构。
3. 事件、异常和项目预加载。
4. 关系图构建。
5. 存档事件链状态识别。
6. 编年史事件链 UI。
7. 小说连续性集成。
8. 测试与游戏版本增量同步。

## 非目标

- 不在运行时实时扫描游戏安装目录。
- 不修改 Stellaris 游戏文件。
- 不迁移此前导入的战役或浏览器小说。
- 不用大量硬编码规则代替游戏脚本关系图。
