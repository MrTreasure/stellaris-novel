// Event chain detector: maps save file evidence to the event relationship graph
// to determine which event chains are active, completed, or failed.

import {
  getEventEdges, getNodeFlags, getAllEventChains, getEventChainNodes, getEventNode,
  type EventNode, type EventEdge, type EventChain,
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

  // Check for known chain completion flags first
  const startFlags = extractChainStartFlags(chain.chain_id);
  const hasAnyFlag = startFlags.some(f => allFlags.has(f));
  const completedFlags = extractChainCompletionFlags(chain.chain_id);
  const hasCompletionFlag = completedFlags.some(f => allFlags.has(f));

  if (hasCompletionFlag) {
    status = 'completed';
    currentStage = '已完成';
  } else if (observedNodes.length === 0 && sortedNodes.length === 0) {
    if (!hasAnyFlag) return null;
    status = 'active';
    const matchedFlags = startFlags.filter(f => allFlags.has(f));
    currentStage = matchedFlags.length > 0 ? `进行中 (${matchedFlags.length} 个标记)` : '进行中';
  } else if (observedNodes.length === 0 && sortedNodes.length > 0) {
    if (!hasAnyFlag) return null;
    status = 'active';
    currentStage = '起始阶段';
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

/** Extract completion flags for known chain types */
function extractChainCompletionFlags(chainId: string): string[] {
  const lower = chainId.toLowerCase();
  const patterns: Record<string, string[]> = {
    'yuht_chain': ['yuht_homeworld_found', 'yuht_finished'],
    'vultaum_chain': ['vultaum_homeworld_found', 'vultaum_finished'],
    'cybrex_chain': ['cybrex_homeworld_found', 'cybrex_finished'],
    'first_league_chain': ['first_league_found', 'first_league_finished'],
    'irassian_chain': ['irassian_homeworld_found', 'irassian_finished'],
    'baol_chain': ['baol_finished', 'the_last_baol'],
    'zroni_chain': ['zroni_finished'],
    'great_khan': ['great_khan_dead', 'khan_dead'],
    'prethoryn': ['prethoryn_defeated', 'scourge_defeated'],
    'unbidden': ['unbidden_defeated'],
    'contingency': ['contingency_defeated'],
    'war_in_heaven': ['war_in_heaven_ended'],
    'subterranean': ['subterranean_finished'],
    'migrating_forests': ['migrating_forests_finished'],
    'abandoned_terraforming': ['abandoned_terraforming_finished'],
    'rubricator': ['rubricator_finished'],
    'horizon_signal': ['horizon_signal_finished', 'worm_in_waiting_finished'],
    'synth_queen': ['synth_queen_finished', 'synth_queen_defeated'],
  };
  if (patterns[lower]) return patterns[lower];
  // Generic completion patterns
  const base = lower.replace(/_chain$/, '');
  return [`${base}_finished`, `${base}_completed`, `${base}_found`, `${base}_ended`, `${base}_defeated`];
}

/** Extract likely flag names associated with a chain */
function extractChainStartFlags(chainId: string): string[] {
  const lower = chainId.toLowerCase();
  // Common patterns:
  // - yuht_chain → flag includes "yuht"
  // - vultaum_chain → flag includes "vultaum"
  // - great_khan → flag includes "great_khan"
  const patterns: Record<string, string[]> = {
    'yuht_chain': ['yuht'],
    'vultaum_chain': ['vultaum'],
    'irassian_chain': ['irassian'],
    'cybrex_chain': ['cybrex'],
    'first_league_chain': ['first_league'],
    'baol_chain': ['baol'],
    'zroni_chain': ['zroni'],
    'great_khan': ['great_khan', 'khan', 'horde'],
    'galactic_community': ['galactic_community', 'galcom', 'galactic_custodian'],
    'galactic_market': ['galactic_market'],
    'prethoryn': ['prethoryn', 'scourge'],
    'unbidden': ['unbidden', 'extradimensional'],
    'contingency': ['contingency', 'ai_rebellion'],
    'war_in_heaven': ['war_in_heaven', 'awakened_empire'],
    'synth_queen': ['synth_queen'],
    'cosmic_storms': ['storm', 'cosmic_storm'],
    'subterranean': ['subterranean'],
    'migrating_forests': ['migrating_forest'],
    'abandoned_terraforming': ['abandoned_terraforming'],
    'rubricator': ['rubricator'],
    'horizon_signal': ['horizon_signal', 'worm_in_waiting'],
    'enigmatic_fortress': ['enigmatic_fortress'],
    'dreadnought': ['dreadnought'],
    'dimensional_horror': ['dimensional_horror', 'wormhole'],
  };

  // Try exact match
  if (patterns[lower]) return patterns[lower];

  // Try to extract meaningful parts from the chain ID
  const parts = lower.replace(/_chain$/, '').split('_');
  // Return all parts longer than 3 chars
  return parts.filter(p => p.length >= 3 && !['the', 'and', 'for', 'with'].includes(p));
}
