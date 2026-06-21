// 异常分类同步: common/anomalies/*.txt → game_anomalies 表
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getDb, fileHash, detectChanges, batchInsert, updateFileHashes, getGameVersion, setGameVersion, closeDb } from './shared.mjs';

const STELLARIS = 'E:/SteamLibrary/steamapps/common/Stellaris';

function parseAnomalyFiles(dirPath) {
  const anomalies = [];
  for (const f of readdirSync(dirPath).filter(f => f.endsWith('.txt'))) {
    const content = readFileSync(join(dirPath, f), 'utf-8');
    const blocks = content.split(/\n(?=\w+_category\s*=\s*\{)/);
    for (const block of blocks) {
      const idM = block.match(/^(\w+)\s*=\s*\{/);
      if (!idM) continue;
      const id = idM[1];
      const level = parseInt((block.match(/\blevel\s*=\s*(\d+)/) || [])[1] || '1');
      const outcomes = [...block.matchAll(/anomaly\.(\d+)/g)].map(m => m[0]);
      anomalies.push({ id, level, spawn_chance: '', outcomes: JSON.stringify(outcomes), raw_text: block.slice(0, 3000), file_path: `common/anomalies/${f}` });
    }
  }
  return anomalies;
}

export function syncAnomalies(db, { changed, isFirst }) {
  const dir = join(STELLARIS, 'common/anomalies');
  if (!existsSync(dir)) throw new Error('anomalies 目录不存在');

  const list = isFirst ? parseAnomalyFiles(dir) : changed.flatMap(c => parseAnomalyFiles(join(dir, require('path').basename(c.absPath))));
  console.log(`  解析到 ${list.length} 个异常分类`);

  if (isFirst) { db.exec('DELETE FROM game_anomalies'); batchInsert(db, 'game_anomalies', list); return { inserts: list.length }; }

  let ins = 0;
  for (const a of list) {
    const old = db.prepare('SELECT raw_text FROM game_anomalies WHERE id = ?').get(a.id);
    if (!old) { db.prepare('INSERT INTO game_anomalies (id,level,spawn_chance,outcomes,raw_text,file_path) VALUES (?,?,?,?,?,?)').run(a.id,a.level,a.spawn_chance,a.outcomes,a.raw_text,a.file_path); ins++; }
    else if (old.raw_text !== a.raw_text) { db.prepare('UPDATE game_anomalies SET level=?,outcomes=?,raw_text=?,file_path=? WHERE id=?').run(a.level,a.outcomes,a.raw_text,a.file_path,a.id); ins++; }
  }
  return { inserts: ins };
}

const isMain = process.argv[1]?.includes('preload-anomalies');
if (isMain) {
  const db = getDb();
  const scan = readdirSync(join(STELLARIS, 'common/anomalies')).filter(f => f.endsWith('.txt')).map(f => {
    const fp = join(STELLARIS, 'common/anomalies', f);
    return { absPath: fp, relPath: `common/anomalies/${f}`, hash: fileHash(fp) };
  });
  const { changed, isFirst } = detectChanges(db, 'anomalies', scan);
  if (changed.length === 0) { console.log('Anomalies: 未变化,跳过'); closeDb(); process.exit(0); }
  const r = syncAnomalies(db, { changed, isFirst });
  console.log(`Anomalies: +${r.inserts}`);
  updateFileHashes(db, 'anomalies', scan, {});
  setGameVersion(db, JSON.parse(readFileSync(join(STELLARIS, 'launcher-settings.json'), 'utf-8')).rawVersion);
  closeDb();
}
