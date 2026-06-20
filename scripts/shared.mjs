// 共享工具: SHA256哈希 / 批量写入 / 文件扫描
// 被各 preload-*.mjs 脚本引用

import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = join(import.meta.dirname, '..', 'data', 'stellaris.db');
let _db = null;

export function getDb() {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode=WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS game_data_files (
        file_path TEXT PRIMARY KEY,
        file_hash TEXT NOT NULL,
        data_type TEXT,
        entry_count INTEGER DEFAULT 0,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS game_data (
        key TEXT PRIMARY KEY, zh_name TEXT, description TEXT, category TEXT
      );
      CREATE TABLE IF NOT EXISTS game_events (
        id TEXT PRIMARY KEY, title_key TEXT, desc_key TEXT, options_count INTEGER DEFAULT 0,
        raw_text TEXT, file_path TEXT
      );
      CREATE TABLE IF NOT EXISTS game_techs (
        id TEXT PRIMARY KEY, tier INTEGER, area TEXT, category TEXT, cost INTEGER,
        start_tech INTEGER DEFAULT 0, raw_text TEXT, file_path TEXT
      );
      CREATE TABLE IF NOT EXISTS game_anomalies (
        id TEXT PRIMARY KEY, level INTEGER, spawn_chance TEXT, outcomes TEXT,
        raw_text TEXT, file_path TEXT
      );
      CREATE TABLE IF NOT EXISTS game_traditions (
        id TEXT PRIMARY KEY, tree TEXT, node_type TEXT, effects TEXT,
        raw_text TEXT, file_path TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL
      );
    `);
  }
  return _db;
}

export function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

/** 计算文件 SHA256 hex digest */
export function fileHash(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/** 扫描目录,返回所有文件的 {path, hash} */
export function scanDirectory(dirPath, baseDir) {
  const results = [];
  if (!statSync(dirPath).isDirectory()) return results;

  for (const entry of readdirSync(dirPath)) {
    const full = join(dirPath, entry);
    if (statSync(full).isDirectory()) {
      results.push(...scanDirectory(full, baseDir));
    } else {
      results.push({
        absPath: full,
        relPath: relative(baseDir, full).replace(/\\/g, '/'),
        hash: fileHash(full),
      });
    }
  }
  return results;
}

/** 对比哈希 → 返回需要处理的文件列表 + 是否首次 */
export function detectChanges(db, dataType, fileInfos) {
  let changed = [];
  let unchanged = 0;
  let isFirst = true;

  for (const fi of fileInfos) {
    const old = db.prepare('SELECT file_hash FROM game_data_files WHERE file_path = ?').get(fi.relPath);
    if (!old) {
      changed.push(fi);
    } else if (old.file_hash !== fi.hash) {
      changed.push(fi);
    } else {
      unchanged++;
    }
    if (old) isFirst = false;
  }

  console.log(`  ${dataType}: ${changed.length} changed, ${unchanged} unchanged${isFirst ? ' (首次)' : ''}`);
  return { changed, unchanged, isFirst };
}

/** 批量 INSERT: 每1000条一批 */
export function batchInsert(db, table, rows) {
  if (rows.length === 0) return;
  const BATCH = 1000;
  // 构建列名
  const keys = Object.keys(rows[0]);
  const cols = keys.join(', ');
  const placeholders = `(${keys.map(() => '?').join(', ')})`;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch.flatMap(r => keys.map(k => r[k]));
    const sql = `INSERT INTO ${table} (${cols}) VALUES ${batch.map(() => placeholders).join(', ')}`;
    db.prepare(sql).run(...values);
  }
}

/** 批量 UPDATE 一条语句,按 key 字段匹配 */
export function batchUpdate(db, table, keyField, rows) {
  if (rows.length === 0) return;
  const BATCH = 500;
  const keys = Object.keys(rows[0]).filter(k => k !== keyField);
  const setClause = keys.map(k => `${k} = ?`).join(', ');

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const row of batch) {
      const values = keys.map(k => row[k]);
      values.push(row[keyField]);
      db.prepare(`UPDATE ${table} SET ${setClause} WHERE ${keyField} = ?`).run(...values);
    }
  }
}

/** 更新文件哈希记录 */
export function updateFileHashes(db, dataType, fileInfos, entryCounts) {
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO game_data_files (file_path, file_hash, data_type, entry_count, updated_at) VALUES (?, ?, ?, ?, datetime('now'))"
  );
  for (const fi of fileInfos) {
    stmt.run(fi.relPath, fi.hash, dataType, entryCounts[fi.relPath] || 0);
  }
}

/** 获取版本号 */
export function getGameVersion(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'game_version'").get();
  return row?.value || null;
}

/** 写入版本号 */
export function setGameVersion(db, version) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('game_version', ?)").run(version);
}
