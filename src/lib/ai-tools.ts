// AI tool definitions — query SQLite game database
import { getDb } from './db';

async function searchGameKnowledge(query: string) {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT key, zh_name, description, category FROM game_data
         WHERE zh_name LIKE ? OR key LIKE ? OR description LIKE ?
         LIMIT 5`,
      )
      .all(`%${query}%`, `%${query}%`, `%${query}%`) as { key: string; zh_name: string; description: string; category: string }[];
    if (rows.length === 0) return `未找到与 "${query}" 相关的游戏背景知识。`;
    return rows
      .map(
        (r) =>
          `【${r.zh_name}】(分类: ${r.category}, 键: ${r.key})${r.description ? `\n  ${r.description}` : ''}`,
      )
      .join('\n\n');
  } catch (e: any) {
    return `数据库查询错误: ${e.message}`;
  }
}

async function lookupEventChain(chainName: string) {
  try {
    const db = getDb();
    const chain = db
      .prepare(
        `SELECT chain_id, zh_name, category, source FROM game_event_chains
         WHERE chain_id LIKE ? OR zh_name LIKE ? LIMIT 1`,
      )
      .get(`%${chainName}%`, `%${chainName}%`) as { chain_id: string; zh_name: string; category: string; source: string } | undefined;
    if (!chain) return `未找到与 "${chainName}" 相关的事件链。`;

    const nodes = db
      .prepare(
        `SELECT n.node_id, n.stage_order, n.stage_type, e.zh_title
         FROM game_event_chain_nodes n
         LEFT JOIN game_event_nodes e ON e.id = n.node_id
         WHERE n.chain_id = ? ORDER BY n.stage_order LIMIT 10`,
      )
      .all(chain.chain_id) as { node_id: string; stage_order: number; stage_type: string; zh_title: string | null }[];

    const nodeList = nodes.map((n) => `  [${n.stage_type}] ${n.zh_title || n.node_id}`).join('\n');
    return `事件链: ${chain.zh_name} (${chain.chain_id})\n分类: ${chain.category}\n来源: ${chain.source}\n节点:\n${nodeList || '  无节点数据'}`;
  } catch (e: any) {
    return `数据库查询错误: ${e.message}`;
  }
}

async function lookupTechnology(techName: string) {
  try {
    const db = getDb();
    const tech = db
      .prepare(`SELECT id, tier, area, category, cost FROM game_techs WHERE id LIKE ? LIMIT 1`)
      .get(`%${techName}%`) as { id: string; tier: number; area: string; category: string; cost: number } | undefined;
    const loc = db
      .prepare(`SELECT zh_name, description FROM game_data WHERE key LIKE ? LIMIT 1`)
      .get(`%${techName}%`) as { zh_name: string; description: string } | undefined;

    if (tech) {
      return `科技: ${loc?.zh_name || tech.id}\n等级: ${tech.tier}, 领域: ${tech.area}, 分类: ${tech.category}, 基础成本: ${tech.cost}${loc?.description ? `\n描述: ${loc.description}` : ''}`;
    }
    if (loc) return `${loc.zh_name}${loc.description ? `\n${loc.description}` : ''}`;
    return `未找到与 "${techName}" 相关的科技信息。`;
  } catch (e: any) {
    return `数据库查询错误: ${e.message}`;
  }
}

export const novelTools = {
  search_game_knowledge: {
    description:
      '在 Stellaris 游戏数据库中搜索指定关键词的背景知识。用于查找不熟悉的物种名、星球类型、科技、事件、势力、领袖特质等名词的中文解释。返回最多 5 条匹配结果。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' as const, description: '要搜索的关键词，支持中文或英文' },
      },
      required: ['query'],
    },
    execute: searchGameKnowledge,
  },

  lookup_event_chain: {
    description:
      '查询 Stellaris 事件链的详细信息，包括链名、分类、阶段节点。用于了解特定事件链的进度和故事背景。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chain_name: { type: 'string' as const, description: '事件链的名称或 ID，如 "yuht_chain"、"先驱者——尤特"' },
      },
      required: ['chain_name'],
    },
    execute: lookupEventChain,
  },

  lookup_technology: {
    description: '查询 Stellaris 科技信息，包括科技等级、研究领域和分类。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tech_name: { type: 'string' as const, description: '科技名称或 ID，如 "tech_titans"、"泰坦"' },
      },
      required: ['tech_name'],
    },
    execute: lookupTechnology,
  },
} as any;
