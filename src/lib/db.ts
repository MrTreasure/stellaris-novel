// SQLite 数据库层 — 使用 Node.js 内置 node:sqlite
// 无需任何外部数据库依赖

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import type { Campaign, SaveRecord, Milestone, Novel, Chapter, GameData, AppSettings } from '@/types';

const DB_PATH = path.join(process.cwd(), 'data', 'stellaris.db');

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    // 确保 data 目录存在
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA foreign_keys=ON');
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_data (
      key TEXT PRIMARY KEY,
      zh_name TEXT,
      description TEXT,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_dir TEXT,
      save_count INTEGER DEFAULT 0,
      date_start TEXT,
      date_end TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER REFERENCES campaigns(id),
      filename TEXT NOT NULL,
      game_date TEXT,
      empire_name TEXT,
      empire_size INTEGER,
      military_power INTEGER,
      tech_power INTEGER,
      victory_rank INTEGER,
      authority TEXT,
      ethics TEXT,
      civics TEXT,
      origin TEXT,
      species_name TEXT,
      species_traits TEXT,
      raw_json TEXT,
      uploaded_at TEXT DEFAULT (datetime('now')),
      fleet_power INTEGER DEFAULT 0,
      total_pops INTEGER DEFAULT 0,
      num_colonies INTEGER DEFAULT 0,
      active_wars INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      save_id INTEGER REFERENCES saves(id),
      campaign_id INTEGER REFERENCES campaigns(id),
      event_date TEXT,
      event_type TEXT,
      title TEXT,
      description TEXT,
      importance TEXT,
      game_key TEXT,
      raw_flag TEXT,
      raw_value TEXT,
      source_node_id TEXT,
      chain_id TEXT,
      chain_stage TEXT,
      data_source TEXT,
      resolution_confidence INTEGER,
      relevance TEXT,
      relevance_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS novels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER REFERENCES campaigns(id),
      title TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      total_chapters INTEGER DEFAULT 0,
      background TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novel_id INTEGER REFERENCES novels(id),
      chapter_number INTEGER,
      title TEXT,
      content TEXT,
      era_start TEXT,
      era_end TEXT,
      source_milestones TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 游戏数据: 本地化文本 (离线预加载)
    CREATE TABLE IF NOT EXISTS game_data (
      key TEXT PRIMARY KEY,
      zh_name TEXT,
      description TEXT,
      category TEXT
    );

    -- 游戏数据: 事件脚本 (离线预加载)
    CREATE TABLE IF NOT EXISTS game_events (
      id TEXT PRIMARY KEY,
      title_key TEXT,
      desc_key TEXT,
      options_count INTEGER DEFAULT 0,
      raw_text TEXT,
      file_path TEXT
    );

    -- 游戏数据: 科技树 (离线预加载)
    CREATE TABLE IF NOT EXISTS game_techs (
      id TEXT PRIMARY KEY,
      tier INTEGER,
      area TEXT,
      category TEXT,
      cost INTEGER,
      start_tech INTEGER DEFAULT 0,
      raw_text TEXT,
      file_path TEXT
    );

    -- 游戏数据: 异常分类 (离线预加载)
    CREATE TABLE IF NOT EXISTS game_anomalies (
      id TEXT PRIMARY KEY,
      level INTEGER,
      spawn_chance TEXT,
      outcomes TEXT,
      raw_text TEXT,
      file_path TEXT
    );

    -- 游戏数据: 传统树 (离线预加载)
    CREATE TABLE IF NOT EXISTS game_traditions (
      id TEXT PRIMARY KEY,
      tree TEXT,
      node_type TEXT,
      effects TEXT,
      raw_text TEXT,
      file_path TEXT
    );

    -- 文件哈希追踪 (用于增量同步)
    CREATE TABLE IF NOT EXISTS game_data_files (
      file_path TEXT PRIMARY KEY,
      file_hash TEXT NOT NULL,
      data_type TEXT,
      entry_count INTEGER DEFAULT 0,
      updated_at TEXT
    );

    -- 事件关系图: 节点 (event/anomaly/project/situation/archaeology/on_action)
    CREATE TABLE IF NOT EXISTS game_event_nodes (
      id TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      title_key TEXT,
      desc_key TEXT,
      zh_title TEXT,
      zh_description TEXT,
      file_path TEXT,
      raw_text TEXT,
      hide_window INTEGER DEFAULT 0,
      is_advisor INTEGER DEFAULT 0,
      is_tutorial INTEGER DEFAULT 0,
      is_initialization INTEGER DEFAULT 0,
      player_only INTEGER DEFAULT 0
    );

    -- 事件关系图: 边 (option/trigger/immediate/after/on_success/on_fail/on_action)
    CREATE TABLE IF NOT EXISTS game_event_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      option_name_key TEXT,
      conditions TEXT,
      effects TEXT
    );

    -- 事件关系图: flag 标记 (set/remove/has/not_has)
    CREATE TABLE IF NOT EXISTS game_event_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL,
      flag_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      scope TEXT DEFAULT 'country'
    );

    -- 事件关系图: 事件链定义
    CREATE TABLE IF NOT EXISTS game_event_chains (
      chain_id TEXT PRIMARY KEY,
      name_key TEXT,
      zh_name TEXT,
      category TEXT,
      root_node_id TEXT,
      source TEXT
    );

    -- 事件关系图: 事件链-节点关联
    CREATE TABLE IF NOT EXISTS game_event_chain_nodes (
      chain_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      stage_order INTEGER DEFAULT 0,
      stage_type TEXT DEFAULT 'progress',
      PRIMARY KEY (chain_id, node_id)
    );

    CREATE INDEX IF NOT EXISTS idx_event_flags_name ON game_event_flags(flag_name);
    CREATE INDEX IF NOT EXISTS idx_event_flags_node ON game_event_flags(node_id);
    CREATE INDEX IF NOT EXISTS idx_chain_nodes_node ON game_event_chain_nodes(node_id);
  `);

  // 旧数据库按需补列；CREATE TABLE 已包含该列，新数据库不会重复执行。
  const novelColumns = db.prepare('PRAGMA table_info(novels)').all() as { name: string }[];
  if (!novelColumns.some(column => column.name === 'background')) {
    db.exec("ALTER TABLE novels ADD COLUMN background TEXT DEFAULT ''");
  }

  // 补全 saves 表新增的快捷列
  const saveColNames = ['fleet_power', 'total_pops', 'num_colonies', 'active_wars'];
  const saveColumns = db.prepare('PRAGMA table_info(saves)').all() as { name: string }[];
  for (const col of saveColNames) {
    if (!saveColumns.some(c => c.name === col)) {
      db.exec(`ALTER TABLE saves ADD COLUMN ${col} INTEGER DEFAULT 0`);
    }
  }

  const milestoneColumns = db.prepare('PRAGMA table_info(milestones)').all() as { name: string }[];
  const milestoneAdditions: [string, string][] = [
    ['source_node_id', 'TEXT'],
    ['chain_id', 'TEXT'],
    ['chain_stage', 'TEXT'],
    ['data_source', 'TEXT'],
    ['resolution_confidence', 'INTEGER'],
    ['relevance', 'TEXT'],
    ['relevance_reason', 'TEXT'],
  ];
  for (const [name, type] of milestoneAdditions) {
    if (!milestoneColumns.some(column => column.name === name)) {
      db.exec(`ALTER TABLE milestones ADD COLUMN ${name} ${type}`);
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_milestones_campaign_relevance ON milestones(campaign_id, relevance)');

  const eventNodeColumns = db.prepare('PRAGMA table_info(game_event_nodes)').all() as { name: string }[];
  const eventNodeAdditions = ['hide_window', 'is_advisor', 'is_tutorial', 'is_initialization', 'player_only'];
  for (const name of eventNodeAdditions) {
    if (!eventNodeColumns.some(column => column.name === name)) {
      db.exec(`ALTER TABLE game_event_nodes ADD COLUMN ${name} INTEGER DEFAULT 0`);
    }
  }

  // 预置默认设置
  const defaults: [string, string][] = [
    ['base_url', 'https://api.deepseek.com'],
    ['model', 'deepseek-chat'],
  ];
  // API Key 只允许保存在浏览器，不在服务端数据库保留历史值。
  db.prepare("DELETE FROM settings WHERE key = 'api_key'").run();
  for (const [key, value] of defaults) {
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).run(key, value);
  }
}

// ===== 设置操作 =====

export function getSettings(): AppSettings {
  const d = getDb();
  const rows = d.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = r.value;
  return result as unknown as AppSettings;
}

export function updateSetting(key: string, value: string) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ===== 游戏数据操作 =====

export function getGameDataByKey(key: string): GameData | undefined {
  return getDb().prepare('SELECT * FROM game_data WHERE key = ?').get(key) as GameData | undefined;
}

export function searchGameData(query: string): GameData[] {
  return getDb().prepare(
    'SELECT * FROM game_data WHERE zh_name LIKE ? OR key LIKE ? LIMIT 50'
  ).all(`%${query}%`, `%${query}%`) as GameData[];
}

export function getGameDataCount(): number {
  const r = getDb().prepare('SELECT COUNT(*) as c FROM game_data').get() as { c: number };
  return r.c;
}

// ===== 战役操作 =====

export function getCampaigns(): Campaign[] {
  return getDb().prepare(
    'SELECT * FROM campaigns ORDER BY created_at DESC'
  ).all() as Campaign[];
}

export function getCampaign(id: number): Campaign | undefined {
  return getDb().prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as Campaign | undefined;
}

/** Update campaign date range when new saves are added */
export function updateCampaignDates(campaignId: number, newDate: string) {
  const c = getCampaign(campaignId);
  if (!c) return;
  const start = !c.date_start || c.date_start > newDate ? newDate : c.date_start;
  const end = !c.date_end || c.date_end < newDate ? newDate : c.date_end;
  getDb().prepare('UPDATE campaigns SET date_start = ?, date_end = ? WHERE id = ?').run(start, end, campaignId);
}

export function createCampaign(name: string, sourceDir: string, dateStart: string, dateEnd: string): number {
  const r = getDb().prepare(
    'INSERT INTO campaigns (name, source_dir, date_start, date_end) VALUES (?, ?, ?, ?)'
  ).run(name, sourceDir, dateStart, dateEnd);
  return Number(r.lastInsertRowid);
}

// ===== 存档操作 =====

export function getSaves(campaignId: number): SaveRecord[] {
  return getDb().prepare(
    'SELECT * FROM saves WHERE campaign_id = ? ORDER BY game_date ASC'
  ).all(campaignId) as SaveRecord[];
}

export function getSave(id: number): SaveRecord | undefined {
  return getDb().prepare('SELECT * FROM saves WHERE id = ?').get(id) as SaveRecord | undefined;
}

export function insertSave(save: Omit<SaveRecord, 'id' | 'uploaded_at'>): number {
  const d = getDb();
  const r = d.prepare(`
    INSERT INTO saves (campaign_id, filename, game_date, empire_name, empire_size,
      military_power, tech_power, victory_rank, authority, ethics, civics, origin,
      species_name, species_traits, raw_json, fleet_power, total_pops, num_colonies, active_wars)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    save.campaign_id, save.filename, save.game_date, save.empire_name,
    save.empire_size, save.military_power, save.tech_power, save.victory_rank,
    save.authority, save.ethics, save.civics, save.origin,
    save.species_name, save.species_traits, save.raw_json,
    save.fleet_power ?? 0, save.total_pops ?? 0, save.num_colonies ?? 0, save.active_wars ?? 0
  );
  return Number(r.lastInsertRowid);
}

// ===== 里程碑操作 =====

export function getMilestones(campaignId: number): Milestone[] {
  return getDb().prepare(
    'SELECT * FROM milestones WHERE campaign_id = ? ORDER BY event_date ASC'
  ).all(campaignId) as Milestone[];
}

export function insertMilestones(milestones: Omit<Milestone, 'id'>[]) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO milestones (
      save_id, campaign_id, event_date, event_type, title, description, importance,
      game_key, raw_flag, raw_value, source_node_id, chain_id, chain_stage,
      data_source, resolution_confidence, relevance, relevance_reason
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const m of milestones) {
    try {
      stmt.run(
        m.save_id, m.campaign_id, m.event_date, m.event_type, m.title, m.description,
        m.importance, m.game_key, m.raw_flag, m.raw_value,
        m.source_node_id ?? null, m.chain_id ?? null, m.chain_stage ?? null,
        m.data_source ?? null, m.resolution_confidence ?? null,
        m.relevance ?? 'include', m.relevance_reason ?? null,
      );
    } catch {
      // 跳过异常
    }
  }
}

// ===== 小说操作 =====

export function getNovels(campaignId: number): Novel[] {
  return getDb().prepare(
    'SELECT * FROM novels WHERE campaign_id = ? ORDER BY created_at DESC'
  ).all(campaignId) as Novel[];
}

export function getNovel(id: number): Novel | undefined {
  return getDb().prepare('SELECT * FROM novels WHERE id = ?').get(id) as Novel | undefined;
}

export function createNovel(campaignId: number, title: string): number {
  const r = getDb().prepare(
    'INSERT INTO novels (campaign_id, title) VALUES (?, ?)'
  ).run(campaignId, title);
  return Number(r.lastInsertRowid);
}

export function getChapters(novelId: number): Chapter[] {
  return getDb().prepare(
    'SELECT * FROM chapters WHERE novel_id = ? ORDER BY chapter_number ASC'
  ).all(novelId) as Chapter[];
}

export function insertChapter(chapter: Omit<Chapter, 'id' | 'created_at'>): number {
  const r = getDb().prepare(`
    INSERT INTO chapters (novel_id, chapter_number, title, content, era_start, era_end, source_milestones)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(chapter.novel_id, chapter.chapter_number, chapter.title, chapter.content, chapter.era_start, chapter.era_end, chapter.source_milestones);
  return Number(r.lastInsertRowid);
}

export function updateNovelStatus(id: number, status: string, totalChapters?: number) {
  if (totalChapters !== undefined) {
    getDb().prepare('UPDATE novels SET status = ?, total_chapters = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(status, totalChapters, id);
  } else {
    getDb().prepare('UPDATE novels SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(status, id);
  }
}

export function updateNovelBackground(id: number, background: string) {
  getDb().prepare('UPDATE novels SET background = ?, updated_at = datetime(\'now\') WHERE id = ?').run(background, id);
}

export function getNovelBackground(id: number): string {
  const row = getDb().prepare('SELECT background FROM novels WHERE id = ?').get(id) as { background: string } | undefined;
  return row?.background || '';
}

export function updateChapterContent(id: number, content: string) {
  getDb().prepare('UPDATE chapters SET content = ? WHERE id = ?').run(content, id);
}

// ===== 事件关系图操作 =====

export interface EventNode {
  id: string;
  node_type: string;
  title_key: string | null;
  desc_key: string | null;
  zh_title: string | null;
  zh_description: string | null;
  file_path: string | null;
  raw_text: string | null;
}

export interface EventEdge {
  id: number;
  source_id: string;
  target_id: string;
  edge_type: string;
  option_name_key: string | null;
  conditions: string | null;
  effects: string | null;
}

export interface EventChain {
  chain_id: string;
  name_key: string | null;
  zh_name: string | null;
  category: string | null;
  root_node_id: string | null;
  source: string | null;
}

export interface EventChainNode {
  chain_id: string;
  node_id: string;
  stage_order: number;
  stage_type: string;
}

export function getEventNode(id: string): EventNode | undefined {
  return getDb().prepare('SELECT * FROM game_event_nodes WHERE id = ?').get(id) as EventNode | undefined;
}

export function getEventEdges(sourceId: string): EventEdge[] {
  return getDb().prepare('SELECT * FROM game_event_edges WHERE source_id = ?').all(sourceId) as EventEdge[];
}

export function getEventChain(chainId: string): EventChain | undefined {
  return getDb().prepare('SELECT * FROM game_event_chains WHERE chain_id = ?').get(chainId) as EventChain | undefined;
}

export function getEventChainNodes(chainId: string): EventChainNode[] {
  return getDb().prepare('SELECT * FROM game_event_chain_nodes WHERE chain_id = ? ORDER BY stage_order').all(chainId) as EventChainNode[];
}

export function getAllEventChains(): EventChain[] {
  return getDb().prepare('SELECT * FROM game_event_chains ORDER BY category, chain_id').all() as EventChain[];
}

export function getNodeFlags(nodeId: string): { flag_name: string; operation: string; scope: string }[] {
  return getDb().prepare('SELECT flag_name, operation, scope FROM game_event_flags WHERE node_id = ?').all(nodeId) as { flag_name: string; operation: string; scope: string }[];
}

export function searchEventNodes(query: string): EventNode[] {
  return getDb().prepare(
    "SELECT * FROM game_event_nodes WHERE zh_title LIKE ? OR id LIKE ? OR title_key LIKE ? LIMIT 30"
  ).all(`%${query}%`, `%${query}%`, `%${query}%`) as EventNode[];
}

export function getEdgeCount(): number {
  const r = getDb().prepare('SELECT COUNT(*) as c FROM game_event_edges').get() as { c: number };
  return r.c;
}

export function getNodeCount(): number {
  const r = getDb().prepare('SELECT COUNT(*) as c FROM game_event_nodes').get() as { c: number };
  return r.c;
}

export function getChainCount(): number {
  const r = getDb().prepare('SELECT COUNT(*) as c FROM game_event_chains').get() as { c: number };
  return r.c;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
