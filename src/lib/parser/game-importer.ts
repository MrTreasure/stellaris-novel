// 群星游戏数据增量同步器
// 设计: 逐条对比新旧数据,仅写入变更的行,避免全量重写
// 版本来源: launcher-settings.json → rawVersion

import fs from 'fs';
import path from 'path';
import { getDb, updateSetting, getGameDataCount } from '@/lib/db';
import type { GameData } from '@/types';

// ===== 版本检测 =====

function detectGameVersion(stellarisDir: string): string | null {
  const launcherPath = path.join(stellarisDir, 'launcher-settings.json');
  if (!fs.existsSync(launcherPath)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(launcherPath, 'utf-8'));
    return json.rawVersion || null;
  } catch {
    return null;
  }
}

// ===== 新版 YAML 解析 =====

function parseAllYamlFiles(locDir: string): Map<string, { name: string; desc: string }> {
  const result = new Map<string, { name: string; desc: string }>();

  const ymlFiles = fs.readdirSync(locDir).filter(f => f.endsWith('.yml'));
  for (const f of ymlFiles) {
    const content = fs.readFileSync(path.join(locDir, f), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('l_')) continue;

      // 新版 YAML: key: "value"
      // 旧版格式: key:0 "value"
      let m = trimmed.match(/^([\w.]+):\s+"(.+)"$/) || trimmed.match(/^([\w.]+):\d+\s+"(.+)"$/);
      if (!m) continue;

      const rawKey = m[1].toLowerCase();
      const value = m[2];

      // 合并三种描述后缀: .desc, _desc, _name → 统一 parent
      let parentKey: string | null = null;
      let kind: 'name' | 'desc' = 'name';

      if (rawKey.endsWith('.desc')) {
        parentKey = rawKey.slice(0, -5);
        kind = 'desc';
      } else if (rawKey.endsWith('_desc')) {
        parentKey = rawKey.slice(0, -5);
        kind = 'desc';
      } else if (rawKey.endsWith('_name')) {
        parentKey = rawKey.slice(0, -5);
        kind = 'name';
      }

      if (parentKey) {
        const existing = result.get(parentKey);
        if (existing) {
          existing[kind] = value;
        } else {
          result.set(parentKey, { name: kind === 'name' ? value : '', desc: kind === 'desc' ? value : '' });
        }
      } else {
        // 无后缀的顶级条目
        const existing = result.get(rawKey);
        if (existing) {
          existing.name = value;
        } else {
          result.set(rawKey, { name: value, desc: '' });
        }
      }
    }
  }

  return result;
}

// ===== 分类推断 =====

function guessCategory(key: string): string {
  // 按前缀匹配,更精确的分类
  const rules: [string, string][] = [
    ['anomaly.', 'anomaly'],
    ['tech_', 'technology'],
    ['tradition_', 'tradition'],
    ['ascension_perk_', 'ascension'],
    ['ethic_', 'ethic'],
    ['civic_', 'civic'],
    ['origin_', 'origin'],
    ['building_', 'building'],
    ['megastructure', 'megastructure'],
    ['crisis_', 'crisis'],
    ['trait_', 'trait'],
    ['edict_', 'edict'],
    ['resolution_', 'resolution'],
    ['relic_', 'relic'],
    ['agenda_', 'agenda'],
    ['colossus_', 'colossus'],
    ['component_', 'component'],
    ['army_', 'army'],
    ['policy_', 'policy'],
    ['species_', 'species'],
    ['planet_', 'planet'],
    ['star_', 'astronomy'],
    ['diplomacy_', 'diplomacy'],
    ['leader_', 'leader'],
    ['faction_', 'faction'],
    ['event.', 'event'],
    ['story.', 'event'],
    ['fleet.', 'event'],
    ['achievement_', 'achievement'],
    ['galactic_community', 'resolution'],
    ['galcom_', 'resolution'],
    ['message_', 'message'],
    ['notification_', 'notification'],
    ['interface_', 'ui'],
    ['menu_', 'ui'],
    ['tooltip_', 'ui'],
    ['advisor_', 'audio'],
    ['music_', 'audio'],
    ['name_', 'name'],
    ['preset_', 'preset'],
    ['dlc_', 'dlc'],
  ];

  for (const [prefix, cat] of rules) {
    if (key.startsWith(prefix)) return cat;
  }

  // 二级推断: 包含关键词
  if (key.includes('_tech_')) return 'technology';
  if (key.includes('_anomaly_')) return 'anomaly';
  if (key.includes('_event_')) return 'event';
  if (key.includes('_mod_')) return 'mod';

  return 'misc';
}

// ===== 增量同步主函数 =====

export interface ImportResult {
  ok: boolean;
  version: string;
  previousVersion: string | null;
  total: number;        // 扫描到的总 key 数
  new: number;          // 新增
  updated: number;      // 内容变更
  unchanged: number;    // 未变
  stale: number;        // DB 中残存的旧版本数据
}

export function importGameData(stellarisDir: string): ImportResult {
  const version = detectGameVersion(stellarisDir);
  if (!version) throw new Error('无法检测游戏版本 (launcher-settings.json 不存在)');

  const db = getDb();
  const oldVersionRow = db.prepare("SELECT value FROM settings WHERE key = 'game_version'").get() as { value: string } | undefined;
  const oldVersion = oldVersionRow?.value || null;

  // 相同版本 → 跳过
  if (oldVersion === version) {
    const total = getGameDataCount();
    return { ok: true, version, previousVersion: oldVersion, total, new: 0, updated: 0, unchanged: total, stale: 0 };
  }

  // 扫描
  const locLangDir = path.join(stellarisDir, 'localisation', 'simp_chinese');
  const enDir = path.join(stellarisDir, 'localisation', 'english');
  const locDir = fs.existsSync(locLangDir) ? locLangDir : enDir;
  if (!fs.existsSync(locDir)) throw new Error(`本地化目录不存在: ${locDir}`);

  const newData = parseAllYamlFiles(locDir);
  const isFirstImport = !oldVersion;

  console.log(`${isFirstImport ? '首次导入' : '增量同步'}: ${oldVersion || '无'} → ${version}`);
  console.log(`  扫描到 ${newData.size} 个条目`);

  if (isFirstImport) {
    // ===== 首次导入: 清空表 → 批量写入 (快路径) =====
    db.exec('DELETE FROM game_data');

    const insertStmt = db.prepare('INSERT INTO game_data (key, zh_name, description, category) VALUES (?, ?, ?, ?)');
    let count = 0;

    // 按分类分桶,减少分类推断的重复计算
    const buckets = new Map<string, [string, string, string][]>();
    for (const [key, val] of newData) {
      const cat = guessCategory(key);
      const name = val.name || val.desc || key;
      const desc = val.desc || '';
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push([key, name, desc]);
    }

    // 按分类批量写入 (每个分类一个事务)
    for (const [cat, entries] of buckets) {
      for (const [key, name, desc] of entries) {
        insertStmt.run(key, name, desc, cat);
        count++;
      }
      if (count % 20000 === 0) process.stdout.write(`\r  ${(count/1000).toFixed(0)}k/${(newData.size/1000).toFixed(0)}k`);
    }

    updateSetting('game_version', version);
    console.log(`\r  完成: ${count} 条 (${buckets.size} 个分类)`);
    return { ok: true, version, previousVersion: null, total: newData.size, new: count, updated: 0, unchanged: 0, stale: 0 };
  }

  // ===== 版本升级: 逐条对比 (仅在升级时走这条慢路径) =====
  const selectStmt = db.prepare('SELECT zh_name, description FROM game_data WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO game_data (key, zh_name, description, category) VALUES (?, ?, ?, ?)');
  const updateStmt = db.prepare('UPDATE game_data SET zh_name = ?, description = ?, category = ? WHERE key = ?');

  let added = 0, changed = 0, same = 0;

  for (const [key, val] of newData) {
    const existing = selectStmt.get(key) as { zh_name: string; description: string } | undefined;
    const category = guessCategory(key);
    const name = val.name || val.desc || key;
    const desc = val.desc || '';

    if (!existing) {
      insertStmt.run(key, name, desc, category);
      added++;
    } else if (existing.zh_name !== name || existing.description !== desc) {
      updateStmt.run(name, desc, category, key);
      changed++;
    } else {
      same++;
    }
  }

  const oldTotal = getGameDataCount();
  const stale = Math.max(0, oldTotal - (added + changed + same));

  updateSetting('game_version', version);
  console.log(`  完成: +${added} 新增, ~${changed} 更新, =${same} 不变, ×${stale} 残留`);
  return { ok: true, version, previousVersion: oldVersion, total: newData.size, new: added, updated: changed, unchanged: same, stale };
}
