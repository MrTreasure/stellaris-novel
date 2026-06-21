import type { DatabaseSync } from 'node:sqlite';

export type RelevanceDecision = 'include' | 'context' | 'exclude';

export interface ResolvedChronicleEvent {
  title: string;
  description: string;
  category: string;
  sourceNodeId: string | null;
  chainId: string | null;
  chainName: string | null;
  chainStage: string | null;
  dataSource: string;
  confidence: number;
  relevance: RelevanceDecision;
  relevanceReason: string;
}

interface EventCandidate {
  nodeId: string;
  operation: string;
  scope: string;
  nodeType: string;
  titleKey: string | null;
  descKey: string | null;
  zhTitle: string | null;
  zhDescription: string | null;
  filePath: string | null;
  rawText: string | null;
  hideWindow: boolean;
  isAdvisor: boolean;
  isTutorial: boolean;
  isInitialization: boolean;
  playerOnly: boolean;
  chainId: string | null;
  chainName: string | null;
  chainCategory: string | null;
  stageOrder: number | null;
  stageType: string | null;
}

interface ResolverIndex {
  localisation: Map<string, { name: string; description: string; category: string }>;
  flags: Map<string, EventCandidate[]>;
  nodeTransitions: Map<string, { edgeType: string; optionName: string; targetTitle: string }[]>;
}

const cache = new WeakMap<DatabaseSync, ResolverIndex>();

function cleanGameText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/\\n/g, ' ')
    .replace(/§[A-Za-z0-9!]/g, '')
    .replace(/£\w+£/g, '')
    .replace(/\[[^\]]+\]/g, '…')
    .replace(/\$[^$]+\$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function usableTitle(value: string | null | undefined): string {
  const cleaned = cleanGameText(value);
  if (!cleaned || cleaned === '…' || cleaned.length > 100) return '';
  return cleaned;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildIndex(db: DatabaseSync): ResolverIndex {
  const existing = cache.get(db);
  if (existing) return existing;

  const localisation = new Map<string, { name: string; description: string; category: string }>();
  const locRows = db.prepare(
    `SELECT key, zh_name, description, category
     FROM game_data
     WHERE zh_name IS NOT NULL AND zh_name != ''`,
  ).all() as { key: string; zh_name: string; description: string; category: string }[];
  for (const row of locRows) {
    localisation.set(normalizeKey(row.key), {
      name: cleanGameText(row.zh_name),
      description: cleanGameText(row.description),
      category: row.category || 'event',
    });
  }

  const flags = new Map<string, EventCandidate[]>();
  const nodeColumns = new Set(
    (db.prepare('PRAGMA table_info(game_event_nodes)').all() as { name: string }[])
      .map(column => column.name),
  );
  const optionalColumn = (name: string) => nodeColumns.has(name) ? `COALESCE(n.${name}, 0)` : '0';
  const rows = db.prepare(`
    SELECT
      f.flag_name, f.operation, f.scope,
      n.id AS node_id, n.node_type, n.title_key, n.desc_key,
      n.zh_title, n.zh_description, n.file_path, n.raw_text,
      ${optionalColumn('hide_window')} AS hide_window,
      ${optionalColumn('is_advisor')} AS is_advisor,
      ${optionalColumn('is_tutorial')} AS is_tutorial,
      ${optionalColumn('is_initialization')} AS is_initialization,
      ${optionalColumn('player_only')} AS player_only,
      cn.chain_id, cn.stage_order, cn.stage_type,
      c.zh_name AS chain_name, c.category AS chain_category
    FROM game_event_flags f
    JOIN game_event_nodes n ON n.id = f.node_id
    LEFT JOIN game_event_chain_nodes cn ON cn.node_id = n.id
    LEFT JOIN game_event_chains c ON c.chain_id = cn.chain_id
  `).all() as Record<string, string | number | null>[];

  for (const row of rows) {
    const flag = normalizeKey(String(row.flag_name));
    const rawText = row.raw_text ? String(row.raw_text) : null;
    const filePath = row.file_path ? String(row.file_path) : null;
    const candidate: EventCandidate = {
      nodeId: String(row.node_id),
      operation: String(row.operation),
      scope: String(row.scope || 'country'),
      nodeType: String(row.node_type || 'event'),
      titleKey: row.title_key ? String(row.title_key) : null,
      descKey: row.desc_key ? String(row.desc_key) : null,
      zhTitle: row.zh_title ? String(row.zh_title) : null,
      zhDescription: row.zh_description ? String(row.zh_description) : null,
      filePath,
      rawText,
      hideWindow: Boolean(row.hide_window) || rawText?.includes('"hide_window":true') === true,
      isAdvisor: Boolean(row.is_advisor) || rawText?.includes('"is_advisor_event":true') === true,
      isTutorial: Boolean(row.is_tutorial) || filePath?.includes('tutorial') === true,
      isInitialization: Boolean(row.is_initialization) || filePath?.endsWith('/game_start.txt') === true,
      playerOnly: Boolean(row.player_only) || rawText?.includes('"is_ai":false') === true,
      chainId: row.chain_id ? String(row.chain_id) : null,
      chainName: row.chain_name ? cleanGameText(String(row.chain_name)) : null,
      chainCategory: row.chain_category ? String(row.chain_category) : null,
      stageOrder: row.stage_order === null ? null : Number(row.stage_order),
      stageType: row.stage_type ? String(row.stage_type) : null,
    };
    const list = flags.get(flag) || [];
    list.push(candidate);
    flags.set(flag, list);
  }

  const nodeTransitions = new Map<string, { edgeType: string; optionName: string; targetTitle: string }[]>();
  const edgeRows = db.prepare(`
    SELECT e.source_id, e.edge_type, e.option_name_key,
      e.target_id, target.zh_title AS target_title
    FROM game_event_edges e
    LEFT JOIN game_event_nodes target ON target.id = e.target_id
  `).all() as {
    source_id: string;
    edge_type: string;
    option_name_key: string | null;
    target_id: string;
    target_title: string | null;
  }[];
  for (const edge of edgeRows) {
    const optionLoc = edge.option_name_key ? lookupLocalisation({ localisation, flags, nodeTransitions }, edge.option_name_key) : null;
    const optionName = usableTitle(optionLoc?.name);
    const targetTitle = usableTitle(edge.target_title)
      || usableTitle(lookupLocalisation({ localisation, flags, nodeTransitions }, edge.target_id)?.name)
      || '';
    if (!optionName && !targetTitle) continue;
    const current = nodeTransitions.get(edge.source_id) || [];
    if (current.length < 4) {
      current.push({ edgeType: edge.edge_type, optionName, targetTitle });
      nodeTransitions.set(edge.source_id, current);
    }
  }

  const index = { localisation, flags, nodeTransitions };
  cache.set(db, index);
  return index;
}

function lookupLocalisation(index: ResolverIndex, key: string): { name: string; description: string; category: string } | null {
  const normalized = normalizeKey(key);
  const variants = [
    normalized,
    normalized.replace(/\.desc$/, ''),
    normalized.replace(/_desc$/, ''),
    normalized.replace(/\.name$/, ''),
    normalized.replace(/_name$/, ''),
    normalized.replace(/_title$/, ''),
    normalized.replace(/\d+$/, ''),
    normalized.replace(/_(site|dig|chain|category|project)$/, ''),
  ];
  for (const variant of variants) {
    const found = index.localisation.get(variant);
    if (found) return found;
  }
  return null;
}

function extractDescriptionKeys(rawText: string | null): string[] {
  if (!rawText) return [];
  try {
    const root = JSON.parse(rawText) as unknown;
    const keys = new Set<string>();
    const visit = (value: unknown, field = '') => {
      if (typeof value === 'string') {
        if (
          (field === 'desc' || field === 'text')
          && /^[A-Za-z0-9_.-]+$/.test(value)
        ) {
          keys.add(value);
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(item => visit(item, field));
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) visit(nested, key);
      }
    };
    visit(root);
    return [...keys];
  } catch {
    return [];
  }
}

function resolveNarrativeDescription(
  index: ResolverIndex,
  candidate: EventCandidate | null,
  directLoc: { name: string; description: string; category: string } | null,
): string {
  const nodeDescription = cleanGameText(candidate?.zhDescription);
  if (nodeDescription) return nodeDescription;

  const lookupKeys = [
    candidate?.descKey,
    candidate?.titleKey,
    candidate?.nodeId,
    ...extractDescriptionKeys(candidate?.rawText || null),
  ].filter((value): value is string => Boolean(value));

  for (const key of lookupKeys) {
    const found = lookupLocalisation(index, key);
    const description = cleanGameText(found?.description || found?.name);
    if (description && description !== usableTitle(candidate?.zhTitle)) return description;
  }
  if (directLoc?.description) return cleanGameText(directLoc.description);
  return '';
}

function buildStructuredDescription(index: ResolverIndex, candidate: EventCandidate | null): string {
  if (!candidate) return '';
  const scopeLabels: Record<string, string> = {
    country: '帝国',
    global: '银河全局',
    planet: '行星',
    star: '恒星系',
    fleet: '舰队',
  };
  const nodeLabels: Record<string, string> = {
    event: '故事事件',
    anomaly: '异常调查',
    archaeology: '考古事件',
    project: '特殊项目',
    situation: '局势事件',
    counter: '事件链进度',
  };
  const parts: string[] = [];
  if (candidate.chainName) {
    parts.push(`属于事件链“${candidate.chainName}”`);
    if (candidate.stageOrder !== null) {
      const stageLabel = candidate.stageType === 'ending'
        ? '结束阶段'
        : candidate.stageType === 'start'
          ? '起始阶段'
          : `第 ${candidate.stageOrder} 阶段`;
      parts.push(stageLabel);
    }
  } else {
    parts.push(nodeLabels[candidate.nodeType] || '游戏事件');
  }
  parts.push(`作用于${scopeLabels[candidate.scope] || candidate.scope}`);
  if (candidate.operation === 'set') parts.push('并在存档中留下完成或推进标记');
  else if (candidate.operation === 'has') parts.push('其状态条件在存档中得到满足');
  let description = `${parts.join('，')}。`;
  const transitions = index.nodeTransitions.get(candidate.nodeId) || [];
  const choices = [...new Set(transitions.map(transition => transition.optionName).filter(Boolean))];
  const targets = [...new Set(transitions.map(transition => transition.targetTitle).filter(Boolean))];
  if (choices.length > 0) description += ` 游戏数据记录的相关选择包括：${choices.join('、')}。`;
  if (targets.length > 0) description += ` 后续可能推进至：${targets.join('、')}。`;
  return description;
}

function inferCategory(candidate: EventCandidate | null, locCategory?: string): string {
  if (candidate?.chainCategory) return candidate.chainCategory;
  if (candidate?.nodeType === 'anomaly' || candidate?.nodeType === 'archaeology' || candidate?.nodeType === 'project') {
    return 'exploration';
  }
  if (candidate?.nodeType === 'counter') return 'event';
  if (locCategory && !['misc', 'other'].includes(locCategory)) return locCategory;
  return 'event';
}

function scoreCandidate(candidate: EventCandidate, firedEvents: Set<string>, playerOwned: boolean): number {
  let score = 0;
  if (candidate.operation === 'set') score += 25;
  else if (candidate.operation === 'has') score += 8;
  else score -= 10;

  if (candidate.scope === 'country' && playerOwned) score += 25;
  else if (candidate.scope === 'country') score -= 20;
  else if (candidate.scope === 'global') score += 2;
  else score -= 8;

  if (firedEvents.has(candidate.nodeId)) score += 90;
  if (usableTitle(candidate.zhTitle)) score += 18;
  if (cleanGameText(candidate.zhDescription) || candidate.descKey || extractDescriptionKeys(candidate.rawText).length > 0) score += 10;
  if (candidate.chainId) score += 16;
  if (candidate.playerOnly) score += 20;
  if (candidate.hideWindow && !candidate.playerOnly && !candidate.chainId) score -= 15;
  if (candidate.isTutorial || candidate.isAdvisor) score -= 120;
  if (candidate.isInitialization) score -= 120;
  return score;
}

function decideRelevance(
  candidate: EventCandidate | null,
  score: number,
  candidates: EventCandidate[],
  firedEvents: Set<string>,
  playerOwned: boolean,
): { relevance: RelevanceDecision; reason: string } {
  if (!candidate) {
    return { relevance: 'exclude', reason: 'SQLite 中没有对应的游戏事件证据' };
  }
  const setters = candidates.filter(item => item.operation === 'set');
  if (setters.length > 0 && setters.every(item => item.isInitialization)) {
    return { relevance: 'exclude', reason: '该状态仅由游戏初始化事件设置' };
  }
  if (setters.length > 0 && setters.every(item => item.isTutorial || item.isAdvisor)) {
    return { relevance: 'exclude', reason: '该状态仅由教程或顾问事件设置' };
  }
  if (candidate.isTutorial || candidate.isAdvisor) {
    return { relevance: 'exclude', reason: '教程或顾问事件' };
  }
  if (candidate.isInitialization) {
    return { relevance: 'exclude', reason: '游戏初始化事件' };
  }
  if (firedEvents.has(candidate.nodeId) && (playerOwned || candidate.playerOnly)) {
    return { relevance: 'include', reason: '存档记录了玩家触发的事件 ID' };
  }
  if (firedEvents.has(candidate.nodeId) && !playerOwned) {
    return { relevance: 'context', reason: '事件曾在银河中触发，但缺少玩家参与证据' };
  }
  if (!playerOwned) {
    const visibleTitle = usableTitle(candidate.zhTitle);
    const distinctTitles = new Set(candidates.map(item => usableTitle(item.zhTitle)).filter(Boolean));
    if (distinctTitles.size > 3) {
      return { relevance: 'context', reason: '同一标记关联多个不同事件，无法可靠确定具体事件' };
    }
    if (
      candidate.operation === 'set'
      && candidate.scope === 'country'
      && visibleTitle
      && !candidate.hideWindow
    ) {
      return { relevance: 'include', reason: '可见的国家事件；旧存档未记录玩家归属，按平衡模式保留' };
    }
    if (candidate.playerOnly && visibleTitle) {
      return { relevance: 'include', reason: '事件脚本明确限定非 AI 玩家' };
    }
    if (candidate.chainId && visibleTitle) {
      return { relevance: 'include', reason: '事件属于游戏事件链；旧存档按平衡模式保留' };
    }
    if (visibleTitle && !candidate.hideWindow && distinctTitles.size <= 3) {
      return { relevance: 'include', reason: '游戏数据提供了明确可见标题；旧存档按平衡模式保留' };
    }
    return { relevance: 'context', reason: '存档扫描到该状态，但无法确认它属于玩家国家' };
  }
  if (candidates.length > 5 && !candidate.chainId) {
    return { relevance: 'context', reason: '同一标记关联多个事件，无法可靠确定玩家看到的节点' };
  }
  if (candidate.scope === 'country' && candidate.operation === 'set' && score >= 45) {
    return { relevance: 'include', reason: '事件直接设置玩家国家状态' };
  }
  if (candidate.chainId && score >= 30) {
    return { relevance: 'include', reason: '事件属于已识别的游戏事件链' };
  }
  if ((candidate.scope === 'global' || candidate.scope === 'star' || candidate.scope === 'fleet') && score < 35) {
    return { relevance: 'context', reason: '只有全局或非玩家实体状态，缺少直接玩家参与证据' };
  }
  if (score >= 35) {
    return { relevance: 'include', reason: '存在足够的玩家相关事件证据' };
  }
  return { relevance: 'context', reason: '保留为事件链上下文，但不单独展示' };
}

export function resolveChronicleEvent(
  db: DatabaseSync,
  rawKey: string,
  options: { firedEvents?: Iterable<string>; fallbackCategory?: string; playerOwned?: boolean } = {},
): ResolvedChronicleEvent {
  const index = buildIndex(db);
  const firedEvents = new Set(options.firedEvents || []);
  const playerOwned = options.playerOwned === true;
  const key = normalizeKey(rawKey);
  const candidates = index.flags.get(key) || index.flags.get(key.replace(/\d+$/, '')) || [];
  const ranked = candidates
    .map(candidate => ({ candidate, score: scoreCandidate(candidate, firedEvents, playerOwned) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.candidate || null;
  const score = ranked[0]?.score ?? 0;
  const loc = lookupLocalisation(index, rawKey);
  const nodeTitle = usableTitle(best?.zhTitle);
  const locTitle = usableTitle(loc?.name);
  const chainTitle = usableTitle(best?.chainName);
  const title = nodeTitle || locTitle || chainTitle || '未识别的游戏事件';
  const narrativeDescription = resolveNarrativeDescription(index, best, loc);
  const description = narrativeDescription || buildStructuredDescription(index, best);
  const decision = decideRelevance(best, score, candidates, firedEvents, playerOwned);
  const confidence = Math.max(0, Math.min(100,
    (best ? 35 : 0) + (nodeTitle ? 25 : 0) + (best?.chainId ? 15 : 0) +
    (firedEvents.has(best?.nodeId || '') ? 25 : 0) - (candidates.length > 5 ? 20 : 0),
  ));

  return {
    title,
    description,
    category: inferCategory(best, loc?.category || options.fallbackCategory),
    sourceNodeId: best?.nodeId || null,
    chainId: best?.chainId || null,
    chainName: best?.chainName || null,
    chainStage: best?.stageOrder === null || best?.stageOrder === undefined
      ? null
      : `${best.stageOrder}${best.stageType ? ` · ${best.stageType}` : ''}`,
    dataSource: best ? 'game_event_graph' : loc ? 'game_data' : 'unresolved',
    confidence,
    relevance: decision.relevance,
    relevanceReason: decision.reason,
  };
}

export function localizeGameKey(
  db: DatabaseSync,
  key: string,
  variants: string[] = [],
): { name: string; description: string; category: string } | null {
  const index = buildIndex(db);
  for (const candidate of [key, ...variants]) {
    const found = lookupLocalisation(index, candidate);
    if (found) return found;
  }
  return null;
}

export function clearChronicleResolverCache(db?: DatabaseSync) {
  if (db) cache.delete(db);
}
