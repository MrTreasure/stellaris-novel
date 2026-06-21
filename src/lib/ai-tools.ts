// AI tool definitions — structured JSON output, read-only SQLite queries
import { tool } from 'ai';
import { z } from 'zod';
import { getDb } from './db';

function ok(results: unknown[], source: string, confidence = 0.9): string {
  return JSON.stringify({ matched: true, confidence, source, results });
}

function notFound(message: string): string {
  return JSON.stringify({ matched: false, confidence: 0, source: 'none', error_code: 'NOT_FOUND', message });
}

function err(code: string, message: string): string {
  return JSON.stringify({ matched: false, confidence: 0, source: 'error', error_code: code, message });
}

function limit<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

function sanitize(s: string): string {
  return s.trim().replace(/[\x00-\x1f]/g, '').slice(0, 200);
}

/** Split a multi-keyword query into individual tokens */
function tokenize(q: string): string[] {
  return sanitize(q)
    .split(/[\s,，、。；;]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && t.length < 80);
}

/** Build a WHERE clause that matches any token in a column */
function multiLike(column: string, query: string): { clause: string; params: string[] } {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { clause: `${column} LIKE ?`, params: [`%${sanitize(query)}%`] };
  const clauses = tokens.map(() => `${column} LIKE ?`);
  return { clause: `(${clauses.join(' OR ')})`, params: tokens.map(t => `%${t}%`) };
}

// ====== Novel Tools ======

export const novelTools = {
  // ---- Generic game data lookup ----
  lookup_localization: tool({
    description: '精确查询某个游戏术语的中文名、描述和分类。用于翻译专有名词。',
    inputSchema: z.object({
      key: z.string().describe('要查询的术语 key，如 "tech_titans"、"ethic_militarist"'),
    }),
    execute: async (args: { key: string }) => {
      const k = sanitize(args.key).toLowerCase();
      if (!k) return err('INVALID_INPUT', 'key 为空');
      try {
        const db = getDb();
        const row = db.prepare('SELECT key, zh_name, description, category FROM game_data WHERE key = ?').get(k) as { key: string; zh_name: string; description: string; category: string } | undefined;
        if (row) {
          return ok([{ key: row.key, name: row.zh_name, description: row.description || '', category: row.category }], 'game_data');
        }
        for (const suffix of ['_desc', '_name', '_title']) {
          if (k.endsWith(suffix)) {
            const row2 = db.prepare('SELECT key, zh_name, description, category FROM game_data WHERE key = ?').get(k.slice(0, -suffix.length)) as any;
            if (row2) return ok([{ key: row2.key, name: row2.zh_name, description: row2.description || '', category: row2.category, matched_variant: suffix }], 'game_data');
          }
        }
        return notFound(`未找到 "${args.key}" 的本地化条目`);
      } catch (e: any) { return err('DB_ERROR', e.message); }
    },
  }),

  // ---- Event / flag lookup ----
  lookup_event_or_flag: tool({
    description: '通过 flag 名、事件ID、中文标题查询游戏事件详情。支持多关键词（空格分隔）。',
    inputSchema: z.object({
      query: z.string().describe('flag 名、事件ID 或关键词，多个词用空格分隔'),
      campaign_id: z.number().optional().describe('当前战役 ID（可选，传入后可查本局实际出现记录）'),
    }),
    execute: async (args: { query: string; campaign_id?: number }) => {
      const q = sanitize(args.query).toLowerCase();
      if (!q) return err('INVALID_INPUT', 'query 为空');
      try {
        const db = getDb();
        // 1. Exact flag match
        const flags = db.prepare(
          `SELECT f.flag_name, f.operation, f.scope, n.id AS node_id, n.node_type, n.zh_title, n.zh_description,
                  cn.chain_id, c.zh_name AS chain_name, cn.stage_order, cn.stage_type
           FROM game_event_flags f
           JOIN game_event_nodes n ON n.id = f.node_id
           LEFT JOIN game_event_chain_nodes cn ON cn.node_id = n.id
           LEFT JOIN game_event_chains c ON c.chain_id = cn.chain_id
           WHERE f.flag_name = ? LIMIT 8`,
        ).all(q) as any[];
        if (flags.length > 0) {
          return ok(flags.map(f => ({
            flag: f.flag_name, operation: f.operation, node_id: f.node_id, node_type: f.node_type,
            title: f.zh_title || '', description: (f.zh_description || '').slice(0, 200),
            chain_id: f.chain_id, chain_name: f.chain_name, stage: f.stage_order ? `${f.stage_order} · ${f.stage_type}` : null,
          })), 'game_event_flags');
        }
        // 2. Multi-keyword search in game_event_nodes by zh_title
        const tokens = tokenize(q);
        if (tokens.length > 0) {
          const clause = tokens.map(() => 'n.zh_title LIKE ?').join(' OR ');
          const nodes = db.prepare(
            `SELECT n.id, n.node_type, n.zh_title, n.zh_description,
                    cn.chain_id, c.zh_name AS chain_name, cn.stage_order, cn.stage_type
             FROM game_event_nodes n
             LEFT JOIN game_event_chain_nodes cn ON cn.node_id = n.id
             LEFT JOIN game_event_chains c ON c.chain_id = cn.chain_id
             WHERE ${clause} LIMIT 8`,
          ).all(...tokens.map(t => `%${t}%`)) as any[];
          if (nodes.length > 0) {
            return ok(nodes.map(n => ({
              node_id: n.id, node_type: n.node_type, title: n.zh_title || '',
              description: (n.zh_description || '').slice(0, 200),
              chain_id: n.chain_id, chain_name: n.chain_name, stage: n.stage_order ? `${n.stage_order} · ${n.stage_type}` : null,
            })), 'game_event_nodes');
          }
        }
        // 3. game_data multi-keyword
        const { clause: locClause, params: locParams } = multiLike('zh_name', q);
        const loc = db.prepare(`SELECT key, zh_name, description, category FROM game_data WHERE ${locClause} LIMIT 5`).all(...locParams) as any[];
        if (loc.length > 0) return ok(loc.map(l => ({ key: l.key, name: l.zh_name, description: l.description || '', category: l.category })), 'game_data');
        // 4. Campaign milestones
        if (args.campaign_id) {
          const ms = db.prepare(
            `SELECT event_date, title, description, raw_flag, chain_id FROM milestones
             WHERE campaign_id = ? AND (title LIKE ? OR raw_flag LIKE ?) LIMIT 5`,
          ).all(args.campaign_id, `%${q}%`, `%${q}%`) as any[];
          if (ms.length > 0) return ok(ms.map(m => ({ date: m.event_date, title: m.title, description: m.description || '', flag: m.raw_flag, chain_id: m.chain_id })), 'campaign_milestones');
        }
        return notFound(`未找到与 "${args.query}" 相关的事件或标记`);
      } catch (e: any) { return err('DB_ERROR', e.message); }
    },
  }),

  // ---- Trait / civic / ethic lookup ----
  lookup_trait_or_civic_or_ethic: tool({
    description: '查询物种特质、理念、伦理、传统、飞升等术语的详细中文解释。',
    inputSchema: z.object({
      query: z.string().describe('术语名或 key，如 "trait_agrarian"、"civic_merchant_guilds"'),
    }),
    execute: async (args: { query: string }) => {
      const q = sanitize(args.query).toLowerCase();
      if (!q) return err('INVALID_INPUT', 'query 为空');
      try {
        const db = getDb();
        const rows = db.prepare(
          `SELECT key, zh_name, description, category FROM game_data
           WHERE (key LIKE ? OR zh_name LIKE ?)
           AND category IN ('trait','civic','ethic','tradition','ascension','origin','leader')
           LIMIT 5`,
        ).all(`%${q}%`, `%${q}%`) as any[];
        if (rows.length > 0) return ok(rows.map(r => ({ key: r.key, name: r.zh_name, description: r.description || '', category: r.category })), 'game_data');
        return notFound(`未找到与 "${args.query}" 相关的特质/理念/伦理条目`);
      } catch (e: any) { return err('DB_ERROR', e.message); }
    },
  }),

  // ---- Campaign fact lookup ----
  lookup_campaign_fact: tool({
    description: '查询当前战役中已发生的实际事实（时间轴、领袖、舰队、战争、考古等）。仅接受上下文指定的 campaign_id。',
    inputSchema: z.object({
      campaign_id: z.number().describe('战役 ID（必须使用上下文明确指定的值，不得猜测）'),
      query: z.string().describe('搜索关键词，支持多词空格分隔'),
      scope: z.string().optional().describe('范围: timeline/leaders/fleets/wars/diplomacy/archaeology/all'),
    }),
    execute: async (args: { campaign_id: number; query: string; scope?: string }) => {
      const q = sanitize(args.query).toLowerCase();
      if (!q) return err('INVALID_INPUT', 'query 为空');
      try {
        const db = getDb();
        // Multi-keyword search on milestones
        const { clause: kwClause, params: kwParams } = multiLike('title', q);
        const scopeFilter = args.scope && args.scope !== 'all' ? 'AND event_type = ?' : '';
        const allParams = [args.campaign_id, ...kwParams];
        if (scopeFilter) allParams.push(args.scope!);

        const milestones = db.prepare(
          `SELECT event_date, event_type, title, description, chain_id, relevance, resolution_confidence
           FROM milestones WHERE campaign_id = ? AND (${kwClause} OR raw_flag LIKE ?) ${scopeFilter}
           AND relevance != 'exclude' ORDER BY event_date DESC LIMIT 8`,
        ).all(...allParams, `%${q}%`) as any[];
        if (milestones.length > 0) {
          return ok(milestones.map(m => ({
            date: m.event_date, type: m.event_type, title: m.title,
            description: (m.description || '').slice(0, 200),
            chain_id: m.chain_id, relevance: m.relevance, confidence: m.resolution_confidence,
          })), 'campaign_milestones');
        }
        // Fallback: raw_json
        const saves = db.prepare('SELECT raw_json FROM saves WHERE campaign_id = ? ORDER BY id DESC LIMIT 1').all(args.campaign_id) as any[];
        if (saves[0]?.raw_json) {
          try {
            const parsed = JSON.parse(saves[0].raw_json);
            const tokens = tokenize(q);
            for (const section of ['leaders','fleets','wars_detailed','diplomacy','archaeology','situations']) {
              if (parsed[section]) {
                const text = JSON.stringify(parsed[section]).toLowerCase();
                if (tokens.length > 0 ? tokens.some(t => text.includes(t)) : text.includes(q)) {
                  return ok([{ source: `raw_json.${section}`, summary: text.slice(0, 300) }], 'raw_json');
                }
              }
            }
          } catch {}
        }
        return notFound(`当前战役中未找到与 "${args.query}" 相关的事实记录`);
      } catch (e: any) { return err('DB_ERROR', e.message); }
    },
  }),

  // ---- Campaign event chain status ----
  lookup_campaign_event_chain: tool({
    description: '查询当前战役中某个事件链的实际进度。',
    inputSchema: z.object({
      campaign_id: z.number().describe('战役 ID（必须使用上下文指定的值）'),
      chain_query: z.string().describe('事件链名称或 ID，如 "yuht"、"先驱者"'),
    }),
    execute: async (args: { campaign_id: number; chain_query: string }) => {
      const q = sanitize(args.chain_query).toLowerCase();
      if (!q) return err('INVALID_INPUT', 'chain_query 为空');
      try {
        const db = getDb();
        // Flexible chain matching
        let chain = db.prepare(
          'SELECT chain_id, zh_name, category FROM game_event_chains WHERE chain_id = ? LIMIT 1',
        ).get(q) as any;
        if (!chain) {
          chain = db.prepare(
            'SELECT chain_id, zh_name, category FROM game_event_chains WHERE chain_id LIKE ? OR zh_name LIKE ? LIMIT 1',
          ).get(`%${q}%`, `%${q}%`) as any;
        }
        // Try without common prefixes/suffixes
        if (!chain) {
          for (const alt of [q.replace(/^precursor_/, '').replace(/_chain$/, ''), q.replace(/_/g, ' ')]) {
            if (alt === q) continue;
            chain = db.prepare(
              'SELECT chain_id, zh_name, category FROM game_event_chains WHERE chain_id LIKE ? OR zh_name LIKE ? LIMIT 1',
            ).get(`%${alt}%`, `%${alt}%`) as any;
            if (chain) break;
          }
        }
        // Try stripping trailing _digit or _word suffixes
        if (!chain) {
          const stripped = q.replace(/_\d+$/, '').replace(/_[a-z]+$/, '');
          if (stripped !== q && stripped.length > 2) {
            chain = db.prepare(
              'SELECT chain_id, zh_name, category FROM game_event_chains WHERE chain_id LIKE ? OR zh_name LIKE ? LIMIT 1',
            ).get(`%${stripped}%`, `%${stripped}%`) as any;
          }
        }
        if (!chain) return notFound(`未找到与 "${args.chain_query}" 匹配的事件链`);

        const nodes = db.prepare(
          `SELECT cn.stage_order, cn.stage_type, n.zh_title
           FROM game_event_chain_nodes cn
           JOIN game_event_nodes n ON n.id = cn.node_id
           WHERE cn.chain_id = ? ORDER BY cn.stage_order`,
        ).all(chain.chain_id) as any[];

        const relevantMilestones = db.prepare(
          `SELECT event_date, title, chain_stage, relevance, resolution_confidence
           FROM milestones WHERE campaign_id = ? AND chain_id = ?
           ORDER BY event_date DESC LIMIT 12`,
        ).all(args.campaign_id, chain.chain_id) as any[];

        const completedFlags = nodes.filter(n => n.stage_type === 'ending');
        const hasCompleted = relevantMilestones.some(m => completedFlags.some(f => m.title?.includes(f.zh_title)));
        const startedAt = relevantMilestones.at(-1)?.event_date;
        const updatedAt = relevantMilestones[0]?.event_date;

        return ok([{
          chain_id: chain.chain_id, chain_name: chain.zh_name, category: chain.category,
          status: hasCompleted ? 'completed' : relevantMilestones.length > 0 ? 'active' : 'unknown',
          total_stages: nodes.length,
          started_at: startedAt, updated_at: updatedAt,
          relevant_milestones: limit(relevantMilestones.map(m => ({ date: m.event_date, title: m.title, stage: m.chain_stage })), 8),
        }], 'game_event_chains+campaign_milestones');
      } catch (e: any) { return err('DB_ERROR', e.message); }
    },
  }),

  // ---- Generic game knowledge search (with multi-keyword support) ----
  search_game_knowledge: tool({
    description: '在游戏数据库中搜索背景知识（物种、科技、事件、势力名词的中文解释）。支持多关键词（空格分隔），各关键词独立搜索后合并结果。',
    inputSchema: z.object({
      query: z.string().describe('搜索关键词，多个词用空格分隔。如 "先驱者 第一联盟"'),
    }),
    execute: async (args: { query: string }) => {
      const tokens = tokenize(args.query);
      if (tokens.length === 0 && !args.query.trim()) return err('INVALID_INPUT', 'query 为空');
      try {
        const db = getDb();
        // If single token, search directly
        if (tokens.length <= 1) {
          const q = tokens[0] || sanitize(args.query);
          const rows = db.prepare(
            'SELECT key, zh_name, description, category FROM game_data WHERE zh_name LIKE ? OR key LIKE ? LIMIT 8',
          ).all(`%${q}%`, `%${q}%`) as any[];
          if (rows.length === 0) return notFound(`未找到与 "${args.query}" 相关的背景知识`);
          return ok(rows.map(r => ({ key: r.key, name: r.zh_name, description: r.description || '', category: r.category })), 'game_data');
        }
        // Multi-token: search each token separately, merge & dedup by key
        const seen = new Set<string>();
        const results: any[] = [];
        for (const token of tokens) {
          const rows = db.prepare(
            'SELECT key, zh_name, description, category FROM game_data WHERE zh_name LIKE ? OR key LIKE ? LIMIT 5',
          ).all(`%${token}%`, `%${token}%`) as any[];
          for (const r of rows) {
            if (!seen.has(r.key)) {
              seen.add(r.key);
              results.push({ key: r.key, name: r.zh_name, description: r.description || '', category: r.category, matched_by: token });
            }
          }
        }
        if (results.length === 0) return notFound(`未找到与 "${args.query}" 相关的背景知识`);
        return ok(limit(results, 10), `game_data (${tokens.length} tokens)`);
      } catch (e: any) { return err('DB_ERROR', e.message); }
    },
  }),

  // ---- Event chain definition lookup ----
  lookup_event_chain: tool({
    description: '查询游戏事件链的通用定义（阶段、节点）。自动处理前缀/后缀变体。',
    inputSchema: z.object({
      chain_name: z.string().describe('事件链名称或 ID，如 "yuht_chain"、"先驱者——第一联盟"'),
    }),
    execute: async (args: { chain_name: string }) => {
      const q = sanitize(args.chain_name).toLowerCase();
      if (!q) return err('INVALID_INPUT', 'chain_name 为空');
      try {
        const db = getDb();
        // Try exact, then contains, then prefix-stripped
        let chain = db.prepare(
          'SELECT chain_id, zh_name, category, source FROM game_event_chains WHERE chain_id = ? OR zh_name = ? LIMIT 1',
        ).get(q, args.chain_name.trim()) as any;

        let confidence = 0.9;

        if (!chain) {
          chain = db.prepare(
            'SELECT chain_id, zh_name, category, source FROM game_event_chains WHERE chain_id LIKE ? OR zh_name LIKE ? LIMIT 1',
          ).get(`%${q}%`, `%${q}%`) as any;
          if (chain) confidence = 0.7;
        }

        // Try removing common prefixes/suffixes
        if (!chain) {
          for (const alt of [q.replace(/^precursor_/, '').replace(/_chain$/, ''), q.replace(/_/g, ' ')]) {
            if (alt === q) continue;
            chain = db.prepare(
              'SELECT chain_id, zh_name, category, source FROM game_event_chains WHERE chain_id LIKE ? OR zh_name LIKE ? LIMIT 1',
            ).get(`%${alt}%`, `%${alt}%`) as any;
            if (chain) { confidence = 0.6; break; }
          }
        }
        // Try stripping trailing _digit or _word suffixes (e.g. "zroni_digsite_2" → "zroni_digsite")
        if (!chain) {
          const stripped = q.replace(/_\d+$/, '').replace(/_[a-z]+$/, '');
          if (stripped !== q && stripped.length > 2) {
            chain = db.prepare(
              'SELECT chain_id, zh_name, category, source FROM game_event_chains WHERE chain_id LIKE ? OR zh_name LIKE ? LIMIT 1',
            ).get(`%${stripped}%`, `%${stripped}%`) as any;
            if (chain) confidence = 0.5;
          }
        }

        if (!chain) return notFound(`未找到与 "${args.chain_name}" 相关的事件链`);

        const nodes = db.prepare(
          `SELECT cn.stage_order, cn.stage_type, n.zh_title
           FROM game_event_chain_nodes cn
           LEFT JOIN game_event_nodes n ON n.id = cn.node_id
           WHERE cn.chain_id = ? ORDER BY cn.stage_order LIMIT 12`,
        ).all(chain.chain_id) as any[];

        return ok([{
          chain_id: chain.chain_id, name: chain.zh_name, category: chain.category, source: chain.source,
          stages: nodes.map(n => ({ order: n.stage_order, type: n.stage_type, title: n.zh_title || '' })),
        }], 'game_event_chains', confidence);
      } catch (e: any) { return err('DB_ERROR', e.message); }
    },
  }),

  lookup_technology: tool({
    description: '查询科技详情（等级、领域、分类、中文名）。',
    inputSchema: z.object({
      tech_name: z.string().describe('科技名称或 ID'),
    }),
    execute: async (args: { tech_name: string }) => {
      const q = sanitize(args.tech_name);
      if (!q) return err('INVALID_INPUT', 'tech_name 为空');
      try {
        const db = getDb();
        const tech = db.prepare('SELECT id, tier, area, category, cost FROM game_techs WHERE id LIKE ? LIMIT 1').get(`%${q}%`) as any;
        const loc = db.prepare('SELECT zh_name, description FROM game_data WHERE key LIKE ? LIMIT 1').get(`%${q}%`) as any;
        if (tech) {
          return ok([{
            id: tech.id, name: loc?.zh_name || tech.id, description: loc?.description || '',
            tier: tech.tier, area: tech.area, category: tech.category, cost: tech.cost,
          }], tech ? 'game_techs+game_data' : 'game_data');
        }
        if (loc) return ok([{ id: q, name: loc.zh_name, description: loc.description || '' }], 'game_data');
        return notFound(`未找到与 "${args.tech_name}" 相关的科技`);
      } catch (e: any) { return err('DB_ERROR', e.message); }
    },
  }),
};
