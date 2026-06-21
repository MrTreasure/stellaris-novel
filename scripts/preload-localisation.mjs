// 本地化数据同步: localisation/simp_chinese/*.yml → game_data 表
import { readFileSync, readdirSync, existsSync } from 'fs';
import { basename, join } from 'path';
import { getDb, fileHash, detectChanges, batchInsert, batchUpdate, updateFileHashes, getGameVersion, setGameVersion, closeDb } from './shared.mjs';

const STELLARIS = 'E:/SteamLibrary/steamapps/common/Stellaris';

function parseAllYamlFiles(locDir) {
  const result = new Map();
  for (const f of readdirSync(locDir).filter(f => f.endsWith('.yml'))) {
    const content = readFileSync(join(locDir, f), 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('l_')) continue;
      const m = t.match(/^([\w.]+):\s+"(.+)"$/) || t.match(/^([\w.]+):\d+\s+"(.+)"$/);
      if (!m) continue;
      const rawKey = m[1].toLowerCase(), value = m[2];
      let pk, kd;
      if (rawKey.endsWith('.desc')) { pk = rawKey.slice(0,-5); kd = 'desc'; }
      else if (rawKey.endsWith('_desc')) { pk = rawKey.slice(0,-5); kd = 'desc'; }
      else if (rawKey.endsWith('_name')) { pk = rawKey.slice(0,-5); kd = 'name'; }
      else if (rawKey.endsWith('_title')) { pk = rawKey.slice(0,-6); kd = 'name'; }
      else { pk = rawKey; kd = 'name'; }
      const e = result.get(pk);
      if (e) { e[kd] = value; } else { result.set(pk, { name: kd==='name'?value:'', desc: kd==='desc'?value:'' }); }
    }
  }
  return result;
}

function guessCategory(key) {
  for (const [p,c] of [['anomaly.','anomaly'],['tech_','technology'],['tradition_','tradition'],['ascension_perk_','ascension'],['ethic_','ethic'],['civic_','civic'],['origin_','origin'],['building_','building'],['megastructure','megastructure'],['crisis_','crisis'],['trait_','trait'],['edict_','edict'],['resolution_','resolution'],['relic_','relic'],['agenda_','agenda'],['colossus_','colossus'],['component_','component'],['army_','army'],['policy_','policy'],['diplomacy_','diplomacy'],['leader_','leader'],['faction_','faction'],['event.','event'],['story.','event'],['fleet.','event'],['achievement_','achievement'],['galactic_community','resolution'],['name_','name'],['planet_','planet'],['species_','species'],['star_','astronomy'],['interface_','ui'],['mod_','mod'],['dlc_','dlc']])
    if (key.startsWith(p)) return c;
  return 'misc';
}

export function syncLocalisation(db, { changed, isFirst }) {
  const locDir = join(STELLARIS, 'localisation/simp_chinese');
  if (!existsSync(locDir)) throw new Error('localisation/simp_chinese 不存在');

  const newEntries = isFirst
    ? parseAllYamlFiles(locDir)
    : (() => { const m = new Map(); for (const f of changed) { const e = parseAllYamlFiles(locDir); for (const [k,v] of e) m.set(k,v); } return m; })();

  console.log(`  解析到 ${newEntries.size} 个条目`);

  // 按 category 分桶
  const buckets = new Map();
  for (const [key, val] of newEntries) {
    const cat = guessCategory(key);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat).push({ key, name: val.name || val.desc || key, desc: val.desc || '', cat });
  }
  console.log(`  分为 ${buckets.size} 个分类`);

  let totalInsert = 0, totalUpdate = 0;

  if (isFirst) {
    db.exec('DELETE FROM game_data');
    const allRows = [...buckets.values()].flat().map(r => ({ key: r.key, zh_name: r.name, description: r.desc, category: r.cat }));
    batchInsert(db, 'game_data', allRows);
    totalInsert = allRows.length;
  } else {
    for (const [cat, rows] of buckets) {
      const oldRows = db.prepare('SELECT key, zh_name, description FROM game_data WHERE category = ?').all(cat);
      const oldMap = new Map(oldRows.map(r => [r.key, r]));
      const inserts = [], updates = [];
      for (const r of rows) {
        const o = oldMap.get(r.key);
        if (!o) inserts.push({ key: r.key, zh_name: r.name, description: r.desc, category: r.cat });
        else if (o.zh_name !== r.name || o.description !== r.desc) updates.push({ key: r.key, zh_name: r.name, description: r.desc, category: r.cat });
      }
      if (inserts.length) { batchInsert(db, 'game_data', inserts); totalInsert += inserts.length; }
      if (updates.length) { batchUpdate(db, 'game_data', 'key', updates); totalUpdate += updates.length; }
    }
  }

  return { inserts: totalInsert, updates: totalUpdate, categories: buckets.size };
}

// CLI
const isMain = process.argv[1] && process.argv[1].includes('preload-localisation');
if (isMain) {
  const db = getDb();
  const oldVer = getGameVersion(db);
  console.log(`Localisation: ${oldVer || '首次'}`);

  const allFiles = readdirSync(join(STELLARIS, 'localisation/simp_chinese')).filter(f => f.endsWith('.yml'));
  const scan = allFiles.map(f => {
    const fp = join(STELLARIS, 'localisation/simp_chinese', f);
    return { absPath: fp, relPath: `localisation/simp_chinese/${f}`, hash: fileHash(fp) };
  });
  const { changed, isFirst } = detectChanges(db, 'localisation', scan);
  if (changed.length === 0) { console.log('  未变化,跳过'); closeDb(); process.exit(0); }

  const result = syncLocalisation(db, { changed, isFirst });
  console.log(`  完成: +${result.inserts} ~${result.updates}`);

  const ent = {};
  for (const s of scan) ent[s.relPath] = 0;
  updateFileHashes(db, 'localisation', scan, ent);
  const ver = JSON.parse(readFileSync(join(STELLARIS, 'launcher-settings.json'), 'utf-8')).rawVersion;
  setGameVersion(db, ver);
  console.log(`  版本: ${ver}`);
  closeDb();
}
