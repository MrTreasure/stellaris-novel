// 事件脚本同步: events/*.txt → game_events 表
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getDb, fileHash, detectChanges, batchInsert, updateFileHashes, getGameVersion, setGameVersion, closeDb } from './shared.mjs';

const STELLARIS = 'G:/SteamLibrary/steamapps/common/Stellaris';

function parseEventFiles(dirPath) {
  const events = [];
  for (const f of readdirSync(dirPath).filter(f => f.endsWith('.txt'))) {
    const content = readFileSync(join(dirPath, f), 'utf-8');
    const fp = join(dirPath, f);

    // 解析 PDS 格式: ship_event = { id = xxx title = "..." desc = "..." option = { ... } }
    // 简单策略: 按 □_event = { 分割
    const blocks = content.split(/\n(?=\w+_event\s*=\s*\{)/);
    for (const block of blocks) {
      const idM = block.match(/\bid\s*=\s*([\w.]+)/);
      if (!idM) continue;

      const id = idM[1];
      const titleM = block.match(/\btitle\s*=\s*"([^"]+)"/);
      const descM = block.match(/\bdesc\s*=\s*"([^"]+)"/);
      const options = [...block.matchAll(/option\s*=\s*\{/g)].length;

      events.push({
        id,
        title_key: titleM?.[1] || '',
        desc_key: descM?.[1] || '',
        options_count: options,
        raw_text: block.slice(0, 8000),
        file_path: `events/${f}`,
      });
    }
  }
  return events;
}

export function syncEvents(db, { changed, isFirst }) {
  const evtDir = join(STELLARIS, 'events');
  if (!existsSync(evtDir)) throw new Error('events 目录不存在');

  const events = isFirst
    ? parseEventFiles(evtDir)
    : changed.flatMap(c => parseEventFiles(join(evtDir, basename(c.absPath))));

  console.log(`  解析到 ${events.length} 个事件`);

  if (isFirst) {
    db.exec('DELETE FROM game_events');
    batchInsert(db, 'game_events', events);
    return { inserts: events.length, updates: 0 };
  }

  let inserts = 0, updates = 0;
  for (const evt of events) {
    const old = db.prepare('SELECT raw_text FROM game_events WHERE id = ?').get(evt.id);
    if (!old) {
      db.prepare('INSERT INTO game_events (id, title_key, desc_key, options_count, raw_text, file_path) VALUES (?,?,?,?,?,?)')
        .run(evt.id, evt.title_key, evt.desc_key, evt.options_count, evt.raw_text, evt.file_path);
      inserts++;
    } else if (old.raw_text !== evt.raw_text) {
      db.prepare('UPDATE game_events SET title_key=?, desc_key=?, options_count=?, raw_text=?, file_path=? WHERE id=?')
        .run(evt.title_key, evt.desc_key, evt.options_count, evt.raw_text, evt.file_path, evt.id);
      updates++;
    }
  }
  return { inserts, updates };
}

// CLI
const isMain = process.argv[1]?.includes('preload-events');
if (isMain) {
  const db = getDb();
  const oldVer = getGameVersion(db);
  console.log(`Events: ${oldVer || '首次'}`);

  const scan = readdirSync(join(STELLARIS, 'events')).filter(f => f.endsWith('.txt')).map(f => {
    const fp = join(STELLARIS, 'events', f);
    return { absPath: fp, relPath: `events/${f}`, hash: fileHash(fp) };
  });
  const { changed, isFirst } = detectChanges(db, 'events', scan);
  if (changed.length === 0) { console.log('  未变化,跳过'); closeDb(); process.exit(0); }

  const result = syncEvents(db, { changed, isFirst });
  console.log(`  完成: +${result.inserts} ~${result.updates}`);

  const ent = {};
  for (const s of scan) ent[s.relPath] = s.file_hash ? 0 : 0;
  updateFileHashes(db, 'events', scan, ent);
  setGameVersion(db, JSON.parse(readFileSync(join(STELLARIS, 'launcher-settings.json'), 'utf-8')).rawVersion);
  closeDb();
}
