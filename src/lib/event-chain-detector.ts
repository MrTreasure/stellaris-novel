// Event chain detector: maps save file evidence to the event relationship graph
// to determine which event chains are active, completed, or failed.

import {
  getEventEdges, getNodeFlags, getAllEventChains, getEventChainNodes, getEventNode,
  type EventChain,
} from './db';

export interface SaveEvidence {
  countryFlags: Set<string>;
  globalFlags: Set<string>;
  planetFlags: Set<string>;
  starFlags: Set<string>;
  completedAnomalies: string[];
  activeProjects: string[];
  completedProjects: string[];
  archaeologySites: { name: string; currentStage: number }[];
  firedEvents: string[];
  milestoneFlags: { flag: string; date: string }[];
}

export interface DetectedEventChain {
  chainId: string;
  name: string;
  category: string;
  status: 'active' | 'completed' | 'failed' | 'unknown';
  currentStage: string;
  observedNodes: string[];
  selectedChoices: string[];
  possibleNextNodes: string[];
  startedAt?: string;
  updatedAt?: string;
}

/** Detect event chains from save evidence */
export function detectEventChains(evidence: SaveEvidence): DetectedEventChain[] {
  const allChains = getAllEventChains();
  const results: DetectedEventChain[] = [];

  for (const chain of allChains) {
    const chainNodes = getEventChainNodes(chain.chain_id);
    const result = evaluateChain(chain, chainNodes, evidence);
    if (result) results.push(result);
  }

  return results;
}

function evaluateChain(
  chain: EventChain,
  chainNodes: { chain_id: string; node_id: string; stage_order: number; stage_type: string }[],
  evidence: SaveEvidence,
): DetectedEventChain | null {
  if (chain.category === 'tutorial') return null;
  const observedNodes: string[] = [];
  const selectedChoices: string[] = [];
  const allFlags = new Set([
    ...evidence.countryFlags,
    ...evidence.globalFlags,
    ...evidence.planetFlags,
    ...evidence.starFlags,
  ]);

  // Sort chain nodes by stage order
  const sortedNodes = [...chainNodes].sort((a, b) => a.stage_order - b.stage_order);

  // Check which nodes in this chain have been observed
  for (const cn of sortedNodes) {
    const node = getEventNode(cn.node_id);
    if (!node) continue;

    // Check if this node's flags are present in save
    const nodeFlags = getNodeFlags(cn.node_id);

    // A node is "observed" if:
    // 1. The event has been fired (in firedEvents list)
    // 2. OR the flags set by this node exist in the save
    if (evidence.firedEvents.includes(node.id)) {
      observedNodes.push(node.id);
      // Check choices
      const edges = getEventEdges(node.id);
      for (const edge of edges) {
        if (edge.edge_type === 'option' && edge.option_name_key) {
          // If the target event has fired, the choice was selected
          if (evidence.firedEvents.includes(edge.target_id)) {
            selectedChoices.push(edge.option_name_key);
          }
        }
      }
      continue;
    }

    // Check if flags set by this node exist
    let nodeFlagMatch = false;
    for (const nf of nodeFlags) {
      if (nf.operation === 'set' && allFlags.has(nf.flag_name)) {
        nodeFlagMatch = true;
        break;
      }
      if (nf.operation === 'has' && evidence.countryFlags.has(nf.flag_name)) {
        // Flag that triggers this node exists
        nodeFlagMatch = true;
        break;
      }
    }
    if (nodeFlagMatch) {
      observedNodes.push(node.id);
    }
  }

  // Determine status based on observed stages
  let status: DetectedEventChain['status'] = 'unknown';
  let currentStage = '';

  const firstStageOrder = sortedNodes[0]?.stage_order;
  const lastStageOrder = sortedNodes.at(-1)?.stage_order;
  const startFlags = sortedNodes
    .filter(node => node.stage_type === 'start' || node.stage_order === firstStageOrder)
    .flatMap(node => getNodeFlags(node.node_id))
    .filter(flag => flag.operation === 'set' || flag.operation === 'has')
    .map(flag => flag.flag_name);
  const hasAnyFlag = startFlags.some(f => allFlags.has(f));
  const completedFlags = sortedNodes
    .filter(node => node.stage_type === 'ending' || node.stage_order === lastStageOrder)
    .flatMap(node => getNodeFlags(node.node_id))
    .filter(flag => flag.operation === 'set' || flag.operation === 'has')
    .map(flag => flag.flag_name);
  const relatedFlags = chain.source === 'native' && sortedNodes.length > 0
    ? findRelatedChainFlags(chain.chain_id, allFlags)
    : [];
  const hasCompletionFlag = completedFlags.some(f => allFlags.has(f))
    || relatedFlags.some(isGenericCompletionFlag);
  const hasRelatedFlag = relatedFlags.length > 0;

  if (hasCompletionFlag) {
    status = 'completed';
    currentStage = '已完成';
  } else if (observedNodes.length === 0 && sortedNodes.length === 0) {
    if (!hasAnyFlag && !hasRelatedFlag) return null;
    status = 'active';
    const matchedFlags = startFlags.filter(f => allFlags.has(f)).concat(relatedFlags);
    currentStage = matchedFlags.length > 0 ? `进行中 (${matchedFlags.length} 个标记)` : '进行中';
  } else if (observedNodes.length === 0 && sortedNodes.length > 0) {
    if (!hasAnyFlag && !hasRelatedFlag) return null;
    status = 'active';
    currentStage = relatedFlags.length > 0
      ? `已发现 ${relatedFlags.length} 个相关标记`
      : '起始阶段';
  } else if (observedNodes.length > 0) {
    const lastStage = sortedNodes[sortedNodes.length - 1];
    const lastObserved = observedNodes[observedNodes.length - 1];
    const lastObservedStage = sortedNodes.find(n => n.node_id === lastObserved);

    if (lastObservedStage?.stage_type === 'ending' || lastObserved === lastStage?.node_id) {
      status = 'completed';
      currentStage = '已完成';
    } else {
      status = 'active';
      const lastIdx = sortedNodes.findIndex(n => n.node_id === lastObserved);
      currentStage = lastIdx >= 0
        ? `阶段 ${sortedNodes[lastIdx].stage_order}/${sortedNodes.length}`
        : `已观察 ${observedNodes.length} 个节点`;
    }
  }

  // Find possible next nodes
  const possibleNextNodes: string[] = [];
  for (const obsNodeId of observedNodes) {
    const edges = getEventEdges(obsNodeId);
    for (const edge of edges) {
      if (!observedNodes.includes(edge.target_id) && !possibleNextNodes.includes(edge.target_id)) {
        possibleNextNodes.push(edge.target_id);
      }
    }
  }

  // Find timestamp info from milestone flags
  let startedAt: string | undefined;
  let updatedAt: string | undefined;
  for (const mf of evidence.milestoneFlags) {
    if (startFlags.some(cf => mf.flag.toLowerCase().includes(cf.toLowerCase()))) {
      if (!startedAt) startedAt = mf.date;
      updatedAt = mf.date;
    }
  }

  return {
    chainId: chain.chain_id,
    name: chain.zh_name || chain.name_key || chain.chain_id,
    category: chain.category || 'story',
    status,
    currentStage,
    observedNodes,
    selectedChoices,
    possibleNextNodes,
    startedAt,
    updatedAt,
  };
}

function findRelatedChainFlags(chainId: string, allFlags: Set<string>): string[] {
  const ignored = new Set([
    'chain', 'event', 'events', 'story', 'project', 'homeworld',
    'situation', 'site', 'archaeology', 'special',
  ]);
  const tokens = chainId
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4 && !ignored.has(token));
  if (tokens.length === 0) return [];

  return [...allFlags].filter(flag => {
    const normalized = flag.toLowerCase();
    return tokens.some(token =>
      normalized === token
      || normalized.startsWith(`${token}_`)
      || normalized.includes(`_${token}_`)
      || normalized.endsWith(`_${token}`),
    );
  });
}

function isGenericCompletionFlag(flag: string): boolean {
  return /(?:^|_)(?:finished|completed|ended|defeated|homeworld_found)$/.test(flag.toLowerCase());
}
