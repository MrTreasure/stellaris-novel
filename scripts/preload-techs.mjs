// 科技数据同步: common/technology/*.txt → game_techs 表
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getDb, fileHash, detectChanges, batchInsert, updateFileHashes, getGameVersion, setGameVersion, closeDb } from './shared.mjs';

const STELLARIS = 'E:/SteamLibrary/steamapps/common/Stellaris';

function parseTechFiles(dirPath) {
  const techs = [];
  for (const f of readdirSync(dirPath).filter(f => f.endsWith('.txt'))) {
    const content = readFileSync(join(dirPath, f), 'utf-8');
    const fp = join(dirPath, f);
    const blocks = content.split(/\n(?=tech_\w+\s*=\s*\{)/);
    for (const block of blocks) {
      const idM = block.match(/^(tech_\w+)\s*=\s*\{/);
      if (!idM) continue;
      const id = idM[1];
      const tier = parseInt((block.match(/\btier\s*=\s*(\d+)/) || [])[1] || '0');
      const area = (block.match(/\barea\s*=\s*(\w+)/) || [])[1] || '';
      const cat = (block.match(/\bcategory\s*=\s*\{\s*(\w+)/) || [])[1] || '';
      const cost = parseInt((block.match(/\bcost\s*=\s*(@?\w+)/) || [])[1] || '0');
      const start = block.includes('start_tech = yes') ? 1 : 0;

      techs.push({ id, tier, area, category: cat, cost, start_tech: start, raw_text: block.slice(0, 3000), file_path: `common/technology/${f}` });
    }
  }
  return techs;
}

export function syncTechs(db, { changed, isFirst }) {
  const techDir = join(STELLARIS, 'common/technology');
  if (!existsSync(techDir)) throw new Error('technology 目录不存在');

  const techs = isFirst ? parseTechFiles(techDir) : changed.flatMap(c => parseTechFiles(join(techDir, require('path').basename(c.absPath))));

  console.log(`  解析到 ${techs.length} 个科技`);

  if (isFirst) {
    db.exec('DELETE FROM game_techs');
    batchInsert(db, 'game_techs', techs);
    return { inserts: techs.length };
  }

  let ins = 0, upd = 0;
  for (const t of techs) {
    const old = db.prepare('SELECT raw_text FROM game_techs WHERE id = ?').get(t.id);
    if (!old) { db.prepare('INSERT INTO game_techs (id,tier,area,category,cost,start_tech,raw_text,file_path) VALUES (?,?,?,?,?,?,?,?)').run(t.id,t.tier,t.area,t.category,t.cost,t.start_tech,t.raw_text,t.file_path); ins++; }
    else if (old.raw_text !== t.raw_text) { db.prepare('UPDATE game_techs SET tier=?,area=?,category=?,cost=?,start_tech=?,raw_text=?,file_path=? WHERE id=?').run(t.tier,t.area,t.category,t.cost,t.start_tech,t.raw_text,t.file_path,t.id); upd++; }
  }
  return { inserts: ins, updates: upd };
}

const isMain = process.argv[1]?.includes('preload-techs');
if (isMain) {
  const db = getDb();
  const scan = readdirSync(join(STELLARIS, 'common/technology')).filter(f => f.endsWith('.txt')).map(f => {
    const fp = join(STELLARIS, 'common/technology', f);
    return { absPath: fp, relPath: `common/technology/${f}`, hash: fileHash(fp) };
  });
  const { changed, isFirst } = detectChanges(db, 'techs', scan);
  if (changed.length === 0) { console.log('Techs: 未变化,跳过'); closeDb(); process.exit(0); }
  const r = syncTechs(db, { changed, isFirst });
  console.log(`Techs: +${r.inserts} ~${r.updates}`);
  updateFileHashes(db, 'techs', scan, {});
  setGameVersion(db, JSON.parse(readFileSync(join(STELLARIS, 'launcher-settings.json'), 'utf-8')).rawVersion);
  closeDb();
}
