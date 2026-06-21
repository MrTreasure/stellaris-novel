// Test tool calls locally against SQLite
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'stellaris.db');
const db = new DatabaseSync(DB_PATH);

function ok(results, source, confidence = 0.9) {
  return { matched: true, confidence, source, results };
}
function notFound(message) {
  return { matched: false, confidence: 0, source: 'none', error_code: 'NOT_FOUND', message };
}
function sanitize(s) {
  return s.trim().replace(/[\x00-\x1f]/g, '').slice(0, 200);
}

// ---- search_game_knowledge ----
function searchGameKnowledge(query) {
  const q = sanitize(query);
  if (!q) return { error: 'query empty' };
  const rows = db.prepare(
    'SELECT key, zh_name, description, category FROM game_data WHERE zh_name LIKE ? OR key LIKE ? LIMIT 5',
  ).all(`%${q}%`, `%${q}%`);
  if (rows.length === 0) return notFound(`未找到与 "${query}" 相关的背景知识`);
  return ok(rows.map(r => ({ key: r.key, name: r.zh_name, description: r.description || '', category: r.category })), 'game_data');
}

// ---- lookup_event_chain ----
function lookupEventChain(chain_name) {
  const q = sanitize(chain_name).toLowerCase();
  if (!q) return { error: 'chain_name empty' };
  const chain = db.prepare('SELECT chain_id, zh_name, category, source FROM game_event_chains WHERE chain_id LIKE ? OR zh_name LIKE ? LIMIT 1').get(`%${q}%`, `%${q}%`);
  if (!chain) return notFound(`未找到与 "${chain_name}" 相关的事件链`);
  const nodes = db.prepare(
    'SELECT cn.stage_order, cn.stage_type, n.zh_title FROM game_event_chain_nodes cn LEFT JOIN game_event_nodes n ON n.id = cn.node_id WHERE cn.chain_id = ? ORDER BY cn.stage_order LIMIT 12',
  ).all(chain.chain_id);
  return ok([{ chain_id: chain.chain_id, name: chain.zh_name, category: chain.category, source: chain.source, stages: nodes.map(n => ({ order: n.stage_order, type: n.stage_type, title: n.zh_title || '' })) }], 'game_event_chains');
}

// ---- lookup_event_or_flag ----
function lookupEventOrFlag(query, campaign_id) {
  const q = sanitize(query).toLowerCase();
  if (!q) return { error: 'query empty' };
  // 1. game_event_flags by flag_name
  const flags = db.prepare(
    `SELECT f.flag_name, f.operation, f.scope, n.id AS node_id, n.node_type, n.zh_title, n.zh_description,
            cn.chain_id, c.zh_name AS chain_name, cn.stage_order, cn.stage_type
     FROM game_event_flags f
     JOIN game_event_nodes n ON n.id = f.node_id
     LEFT JOIN game_event_chain_nodes cn ON cn.node_id = n.id
     LEFT JOIN game_event_chains c ON c.chain_id = cn.chain_id
     WHERE f.flag_name = ? LIMIT 8`,
  ).all(q);
  if (flags.length > 0) return ok(flags.map(f => ({ flag: f.flag_name, operation: f.operation, node_id: f.node_id, node_type: f.node_type, title: f.zh_title || '', chain_id: f.chain_id, chain_name: f.chain_name })), 'game_event_flags');
  // 2. game_event_nodes by zh_title
  const nodes = db.prepare(
    `SELECT n.id, n.node_type, n.zh_title, n.zh_description, cn.chain_id, c.zh_name AS chain_name, cn.stage_order, cn.stage_type
     FROM game_event_nodes n LEFT JOIN game_event_chain_nodes cn ON cn.node_id = n.id LEFT JOIN game_event_chains c ON c.chain_id = cn.chain_id
     WHERE n.zh_title LIKE ? LIMIT 5`,
  ).all(`%${q}%`);
  if (nodes.length > 0) return ok(nodes.map(n => ({ node_id: n.id, node_type: n.node_type, title: n.zh_title || '', chain_id: n.chain_id, chain_name: n.chain_name })), 'game_event_nodes');
  // 3. game_data
  const loc = db.prepare('SELECT key, zh_name, description, category FROM game_data WHERE zh_name LIKE ? LIMIT 3').all(`%${q}%`);
  if (loc.length > 0) return ok(loc.map(l => ({ key: l.key, name: l.zh_name, description: l.description || '', category: l.category })), 'game_data');
  // 4. Campaign milestones
  if (campaign_id) {
    const ms = db.prepare('SELECT event_date, title, description, raw_flag, chain_id FROM milestones WHERE campaign_id = ? AND (raw_flag LIKE ? OR title LIKE ?) LIMIT 5').all(campaign_id, `%${q}%`, `%${q}%`);
    if (ms.length > 0) return ok(ms.map(m => ({ date: m.event_date, title: m.title, flag: m.raw_flag, chain_id: m.chain_id })), 'campaign_milestones');
  }
  return notFound(`未找到与 "${query}" 相关的事件或标记`);
}

// ---- lookup_campaign_fact ----
function lookupCampaignFact(campaign_id, query, scope) {
  const q = sanitize(query).toLowerCase();
  if (!q) return { error: 'query empty' };
  const scopeFilter = scope && scope !== 'all' ? 'AND event_type = ?' : '';
  const params = scope && scope !== 'all' ? [campaign_id, `%${q}%`, `%${q}%`, scope] : [campaign_id, `%${q}%`, `%${q}%`];
  const milestones = db.prepare(
    `SELECT event_date, event_type, title, description, chain_id, relevance, resolution_confidence
     FROM milestones WHERE campaign_id = ? AND (title LIKE ? OR raw_flag LIKE ?) ${scopeFilter}
     AND relevance != 'exclude' ORDER BY event_date DESC LIMIT 8`,
  ).all(...params);
  if (milestones.length > 0) return ok(milestones.map(m => ({ date: m.event_date, type: m.event_type, title: m.title, desc: (m.description || '').slice(0, 200), chain_id: m.chain_id, relevance: m.relevance, confidence: m.resolution_confidence })), 'campaign_milestones');
  // raw_json fallback
  const saves = db.prepare('SELECT raw_json FROM saves WHERE campaign_id = ? ORDER BY id DESC LIMIT 1').all(campaign_id);
  if (saves[0]?.raw_json) {
    try {
      const parsed = JSON.parse(saves[0].raw_json);
      for (const section of ['leaders','fleets','wars_detailed','diplomacy','archaeology','situations']) {
        if (parsed[section]) {
          const text = JSON.stringify(parsed[section]).toLowerCase();
          if (text.includes(q)) return ok([{ source: `raw_json.${section}`, summary: text.slice(0, 300) }], 'raw_json');
        }
      }
    } catch {}
  }
  return notFound(`当前战役中未找到与 "${query}" 相关的事实记录`);
}

// ---- lookup_campaign_event_chain ----
function lookupCampaignEventChain(campaign_id, chain_query) {
  const q = sanitize(chain_query).toLowerCase();
  if (!q) return { error: 'chain_query empty' };
  const chain = db.prepare('SELECT chain_id, zh_name, category FROM game_event_chains WHERE chain_id LIKE ? OR zh_name LIKE ? LIMIT 1').get(`%${q}%`, `%${q}%`);
  if (!chain) return notFound(`未找到与 "${chain_query}" 匹配的事件链`);
  const nodes = db.prepare('SELECT cn.stage_order, cn.stage_type, n.zh_title FROM game_event_chain_nodes cn JOIN game_event_nodes n ON n.id = cn.node_id WHERE cn.chain_id = ? ORDER BY cn.stage_order').all(chain.chain_id);
  const relevantMilestones = db.prepare('SELECT event_date, title, chain_stage, relevance, resolution_confidence FROM milestones WHERE campaign_id = ? AND chain_id = ? ORDER BY event_date DESC LIMIT 12').all(campaign_id, chain.chain_id);
  const completedFlags = nodes.filter(n => n.stage_type === 'ending');
  const hasCompleted = relevantMilestones.some(m => completedFlags.some(f => m.title?.includes(f.zh_title)));
  const startedAt = relevantMilestones.at(-1)?.event_date;
  const updatedAt = relevantMilestones[0]?.event_date;
  return ok([{ chain_id: chain.chain_id, chain_name: chain.zh_name, category: chain.category, status: hasCompleted ? 'completed' : relevantMilestones.length > 0 ? 'active' : 'unknown', total_stages: nodes.length, started_at: startedAt, updated_at: updatedAt, relevant_milestones: relevantMilestones.slice(0, 8).map(m => ({ date: m.event_date, title: m.title, stage: m.chain_stage })) }], 'game_event_chains+campaign_milestones');
}

// ===== Run the actual tool calls from the user's log =====
const tests = [
  // 1
  { name: 'search_game_knowledge("人类联邦 预设帝国")', fn: () => searchGameKnowledge('人类联邦 预设帝国') },
  // 2
  { name: 'search_game_knowledge("化身天灾")', fn: () => searchGameKnowledge('化身天灾') },
  // 3
  { name: 'search_game_knowledge("繁星之典")', fn: () => searchGameKnowledge('繁星之典') },
  // 4
  { name: 'lookup_event_chain("become_the_crisis_chain")', fn: () => lookupEventChain('become_the_crisis_chain') },
  // 5
  { name: 'lookup_event_chain("nomad_star_journal_chain")', fn: () => lookupEventChain('nomad_star_journal_chain') },
  // 6
  { name: 'lookup_campaign_fact(1, "人类联邦")', fn: () => lookupCampaignFact(1, '人类联邦', 'all') },
  // 7
  { name: 'lookup_campaign_fact(0, "2201")', fn: () => lookupCampaignFact(0, '2201', 'all') },
  // 8
  { name: 'lookup_campaign_fact(0, "MOL3_CHR_Gobb")', fn: () => lookupCampaignFact(0, 'MOL3_CHR_Gobb', 'all') },
  // 9
  { name: 'lookup_event_chain("precursor_first_league")', fn: () => lookupEventChain('precursor_first_league') },
  // 10
  { name: 'search_game_knowledge("第一联盟 先驱者")', fn: () => searchGameKnowledge('第一联盟 先驱者') },
  // 11
  { name: 'search_game_knowledge("尤特 先驱者 Yuht")', fn: () => searchGameKnowledge('尤特 先驱者 Yuht') },
  // 12
  { name: 'search_game_knowledge("泽珞族 Zroni")', fn: () => searchGameKnowledge('泽珞族 Zroni') },
  // 13
  { name: 'lookup_event_or_flag("第一联盟")', fn: () => lookupEventOrFlag('第一联盟') },
  // 14
  { name: 'lookup_event_or_flag("尤特")', fn: () => lookupEventOrFlag('尤特') },
  // 15
  { name: 'lookup_event_or_flag("泽珞")', fn: () => lookupEventOrFlag('泽珞') },
  // 16
  { name: 'lookup_event_chain("zroni_digsite_2")', fn: () => lookupEventChain('zroni_digsite_2') },
  // 17
  { name: 'lookup_event_chain("l_cluster_chain")', fn: () => lookupEventChain('l_cluster_chain') },
  // 18
  { name: 'lookup_event_or_flag("浪迹星涯：叛变科学官")', fn: () => lookupEventOrFlag('浪迹星涯：叛变科学官') },
  // 19
  { name: 'lookup_campaign_fact(2, "开采站")', fn: () => lookupCampaignFact(2, '开采站', 'all') },
  // 20
  { name: 'lookup_campaign_fact(3, "开采站")', fn: () => lookupCampaignFact(3, '开采站', 'all') },
  // 21
  { name: 'lookup_campaign_event_chain(2, "繁星之典")', fn: () => lookupCampaignEventChain(2, '繁星之典') },
  // 22
  { name: 'lookup_campaign_event_chain(2, "化身天灾")', fn: () => lookupCampaignEventChain(2, '化身天灾') },
  // 23
  { name: 'lookup_campaign_event_chain(2, "先驱者")', fn: () => lookupCampaignEventChain(2, '先驱者') },
  // 24
  { name: 'lookup_campaign_fact(2, "殖民地")', fn: () => lookupCampaignFact(2, '殖民地', 'all') },
];

console.log('=== Tool Call Test Results ===\n');

for (const { name, fn } of tests) {
  const result = fn();
  const matched = result?.matched;
  const count = result?.results?.length ?? 0;
  const icon = matched ? '✓' : '✗';
  console.log(`${icon} ${name}`);
  console.log(`   matched=${matched}, count=${count}, source=${result?.source || 'N/A'}`);
  if (!matched) {
    console.log(`   message=${result?.message || result?.error || 'N/A'}`);
  } else if (count > 0) {
    const first = result.results[0];
    console.log(`   first: ${JSON.stringify(first).slice(0, 150)}`);
  }
  console.log();
}

// Also check which campaigns exist
console.log('=== Available Campaigns ===');
const campaigns = db.prepare('SELECT id, name FROM campaigns').all();
campaigns.forEach(c => console.log(`  id=${c.id} name=${c.name}`));

// Check game_data coverage on key terms
console.log('\n=== game_data samples for key terms ===');
for (const term of ['人类', '联邦', '化身', '天灾', '繁星', '先驱者', '第一联盟', '尤特', '泽珞']) {
  const c = db.prepare('SELECT COUNT(*) as c FROM game_data WHERE zh_name LIKE ?').get(`%${term}%`);
  console.log(`  "${term}" → ${c.c} rows`);
}

db.close();
