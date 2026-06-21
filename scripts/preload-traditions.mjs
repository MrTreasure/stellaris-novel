// 传统树同步: common/traditions/*.txt → game_traditions 表
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getDb, fileHash, detectChanges, batchInsert, updateFileHashes, getGameVersion, setGameVersion, closeDb } from './shared.mjs';

const STELLARIS = 'E:/SteamLibrary/steamapps/common/Stellaris';

function parseTraditions(dirPath) {
  const traditions = [];
  for (const f of readdirSync(dirPath).filter(f => f.endsWith('.txt'))) {
    const content = readFileSync(join(dirPath, f), 'utf-8');
    const tree = f.replace(/^(\d+_)?/, '').replace('_traditions.txt', '').replace('.txt', '');
    const blocks = content.split(/\n(?=tr_\w+_\w+\s*=\s*\{)/);
    for (const block of blocks) {
      const idM = block.match(/^(tr_\w+)\s*=\s*\{/);
      if (!idM) continue;
      const id = idM[1];
      const nodeType = block.includes('adoption_bonus') ? 'adopt' : block.includes('finish_bonus') ? 'finish' : 'tradition';
      const effects = [...block.matchAll(/modifier\s*=\s*\{[^}]*\}/g)].length > 0 ? 'has_modifiers' : '';
      traditions.push({ id, tree, node_type: nodeType, effects, raw_text: block.slice(0, 2000), file_path: `common/traditions/${f}` });
    }
  }
  return traditions;
}

export function syncTraditions(db, { changed, isFirst }) {
  const dir = join(STELLARIS, 'common/traditions');
  if (!existsSync(dir)) throw new Error('traditions 目录不存在');

  const list = isFirst ? parseTraditions(dir) : changed.flatMap(c => parseTraditions(join(dir, require('path').basename(c.absPath))));
  console.log(`  解析到 ${list.length} 个传统节点`);

  if (isFirst) { db.exec('DELETE FROM game_traditions'); batchInsert(db, 'game_traditions', list); return { inserts: list.length }; }

  let ins = 0;
  for (const t of list) {
    const old = db.prepare('SELECT raw_text FROM game_traditions WHERE id = ?').get(t.id);
    if (!old) { db.prepare('INSERT INTO game_traditions (id,tree,node_type,effects,raw_text,file_path) VALUES (?,?,?,?,?,?)').run(t.id,t.tree,t.node_type,t.effects,t.raw_text,t.file_path); ins++; }
    else if (old.raw_text !== t.raw_text) { db.prepare('UPDATE game_traditions SET tree=?,node_type=?,effects=?,raw_text=?,file_path=? WHERE id=?').run(t.tree,t.node_type,t.effects,t.raw_text,t.file_path,t.id); ins++; }
  }
  return { inserts: ins };
}

const isMain = process.argv[1]?.includes('preload-traditions');
if (isMain) {
  const db = getDb();
  const scan = readdirSync(join(STELLARIS, 'common/traditions')).filter(f => f.endsWith('.txt')).map(f => {
    const fp = join(STELLARIS, 'common/traditions', f);
    return { absPath: fp, relPath: `common/traditions/${f}`, hash: fileHash(fp) };
  });
  const { changed, isFirst } = detectChanges(db, 'traditions', scan);
  if (changed.length === 0) { console.log('Traditions: 未变化,跳过'); closeDb(); process.exit(0); }
  const r = syncTraditions(db, { changed, isFirst });
  console.log(`Traditions: +${r.inserts}`);
  updateFileHashes(db, 'traditions', scan, {});
  setGameVersion(db, JSON.parse(readFileSync(join(STELLARIS, 'launcher-settings.json'), 'utf-8')).rawVersion);
  closeDb();
}
