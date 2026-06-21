// 一次性预加载: 从群星游戏目录解析本地化数据 → 写入 SQLite
// 运行: node scripts/preload-game-data.js
// 此后数据库自带所有中文名/描述,无需再导入

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const STELLARIS = 'E:/SteamLibrary/steamapps/common/Stellaris';
const DB_PATH = path.join(__dirname, '..', 'data', 'stellaris.db');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode=WAL');

// 确保 game_data 表存在
db.exec(`
  CREATE TABLE IF NOT EXISTS game_data (
    key TEXT PRIMARY KEY,
    zh_name TEXT,
    description TEXT,
    category TEXT
  )
`);

// 解析本地化文件
function parseLocalisation(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const entries = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过空行、注释、文件头
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('l_') || trimmed === '---') continue;

    // 新版 YAML 格式:  key: "value"
    // 旧版格式: key:0 "value"
    let m;
    if ((m = trimmed.match(/^([\w.]+):\s+"(.+)"$/)) ||     // YAML: key: "value"
        (m = trimmed.match(/^([\w.]+):\d+\s+"(.+)"$/))) {  // 旧版: key:0 "value"
      const key = m[1].toLowerCase();
      const value = m[2];

      if (key.endsWith('.desc')) {
        const parentKey = key.slice(0, -5);
        if (!entries[parentKey]) entries[parentKey] = {};
        entries[parentKey].desc = value;
      } else {
        if (!entries[key]) entries[key] = {};
        entries[key].name = value;
      }
    }
  }

  return entries;
}

function guessCategory(key) {
  if (key.startsWith('anomaly.')) return 'anomaly';
  if (key.startsWith('tech_')) return 'technology';
  if (key.startsWith('tradition_')) return 'tradition';
  if (key.startsWith('ascension_perk_')) return 'ascension_perk';
  if (key.startsWith('ethic_')) return 'ethic';
  if (key.startsWith('civic_')) return 'civic';
  if (key.startsWith('origin_')) return 'origin';
  if (key.startsWith('building_')) return 'building';
  if (key.startsWith('megastructure')) return 'megastructure';
  if (key.startsWith('crisis_')) return 'crisis';
  if (key.startsWith('story.') || key.startsWith('fleet.') || key.startsWith('event.')) return 'event';
  if (key.startsWith('trait_')) return 'trait';
  if (key.startsWith('edict_')) return 'edict';
  if (key.startsWith('resolution_')) return 'resolution';
  if (key.startsWith('relic_')) return 'relic';
  if (key.startsWith('agenda_')) return 'agenda';
  if (key.startsWith('colossus_')) return 'colossus';
  if (key.startsWith('component_')) return 'component';
  return 'other';
}

console.log('扫描本地化文件...');

// 新版群星按语言分目录,每个目录下有多个 YAML 文件
const langDirs = ['simp_chinese', 'english'];
let locDir = null;
for (const d of langDirs) {
  const p = path.join(STELLARIS, 'localisation', d);
  if (fs.existsSync(p)) { locDir = p; console.log('使用目录:', d); break; }
}

if (!locDir) {
  console.error('错误: 未找到本地化目录');
  process.exit(1);
}

const ymlFiles = fs.readdirSync(locDir).filter(f => f.endsWith('.yml'));
console.log(`找到 ${ymlFiles.length} 个 YAML 文件`);

let allEntries = {};
for (const f of ymlFiles) {
  const fileEntries = parseLocalisation(path.join(locDir, f));
  Object.assign(allEntries, fileEntries);
}
console.log(`解析到 ${Object.keys(allEntries).length} 条唯一条目`);

// 分批写入 SQLite
const stmt = db.prepare('INSERT OR REPLACE INTO game_data (key, zh_name, description, category) VALUES (?, ?, ?, ?)');

let count = 0;
for (const [key, val] of Object.entries(allEntries)) {
  if (!val.name && !val.desc) continue;
  const category = guessCategory(key);
  stmt.run(key, val.name || '', val.desc || '', category);
  count++;
  count++;
  if (count % 10000 === 0) process.stdout.write(`  ${count}...\r`);
}

// 统计
const catCounts = db.prepare('SELECT category, COUNT(*) as c FROM game_data GROUP BY category ORDER BY c DESC').all();
console.log(`\n写入完成! 共 ${count} 条数据`);
console.log('\n分类统计:');
for (const row of catCounts) {
  console.log(`  ${row.category}: ${row.c}`);
}

db.close();
console.log('\n✅ 游戏数据已预载入 SQLite');
