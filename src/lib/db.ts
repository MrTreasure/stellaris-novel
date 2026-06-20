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
      uploaded_at TEXT DEFAULT (datetime('now'))
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
      raw_value TEXT
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

    -- Migration: add background column if missing (SQLite 3.35+)
    ALTER TABLE novels ADD COLUMN background TEXT DEFAULT '';

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
  `);

  // 预置默认设置
  const defaults: [string, string][] = [
    ['api_key', ''],
    ['base_url', 'https://api.deepseek.com'],
    ['model', 'deepseek-chat'],
  ];
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
      species_name, species_traits, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    save.campaign_id, save.filename, save.game_date, save.empire_name,
    save.empire_size, save.military_power, save.tech_power, save.victory_rank,
    save.authority, save.ethics, save.civics, save.origin,
    save.species_name, save.species_traits, save.raw_json
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
    INSERT INTO milestones (save_id, campaign_id, event_date, event_type, title, description, importance, game_key, raw_flag, raw_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const m of milestones) {
    try {
      stmt.run(m.save_id, m.campaign_id, m.event_date, m.event_type, m.title, m.description, m.importance, m.game_key, m.raw_flag, m.raw_value);
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

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
