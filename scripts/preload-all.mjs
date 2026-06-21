// 离线数据预加载: 一次性从群星游戏目录导入所有数据到 SQLite
// 用法: node scripts/preload-all.mjs
// 游戏升级后重新运行即可增量同步

import { readFileSync } from 'fs';
import { join } from 'path';
import { getDb, closeDb, getGameVersion, setGameVersion } from './shared.mjs';

const STELLARIS = 'E:/SteamLibrary/steamapps/common/Stellaris';

async function main() {
  const db = getDb();
  const oldVer = getGameVersion(db);

  // 检测版本
  let newVer = oldVer;
  try {
    newVer = JSON.parse(readFileSync(join(STELLARIS, 'launcher-settings.json'), 'utf-8')).rawVersion;
  } catch { console.error('无法读取游戏版本'); process.exit(1); }

  if (oldVer === newVer) {
    console.log(`游戏版本未变 (${newVer}),无需同步`);
    closeDb();
    return;
  }

  console.log(`数据同步: ${oldVer || '首次'} → ${newVer}`);
  console.log('='.repeat(50));

  // 1. 本地化
  try {
    const { syncLocalisation } = await import('./preload-localisation.mjs');
    const r = syncLocalisation(db, { changed: null, isFirst: !oldVer });
    console.log(`  Localisation: +${r.inserts} ~${r.updates} (${r.categories}类)\n`);
  } catch(e) { console.error('  Localisation 失败:', e.message, '\n'); }

  // 2. 事件
  try {
    const { syncEvents } = await import('./preload-events.mjs');
    const r = syncEvents(db, { changed: null, isFirst: !oldVer });
    console.log(`  Events: +${r.inserts} ~${r.updates}\n`);
  } catch(e) { console.error('  Events 失败:', e.message, '\n'); }

  // 3. 科技
  try {
    const { syncTechs } = await import('./preload-techs.mjs');
    const r = syncTechs(db, { changed: null, isFirst: !oldVer });
    console.log(`  Techs: +${r.inserts} ~${r.updates}\n`);
  } catch(e) { console.error('  Techs 失败:', e.message, '\n'); }

  // 4. 异常
  try {
    const { syncAnomalies } = await import('./preload-anomalies.mjs');
    const r = syncAnomalies(db, { changed: null, isFirst: !oldVer });
    console.log(`  Anomalies: +${r.inserts}\n`);
  } catch(e) { console.error('  Anomalies 失败:', e.message, '\n'); }

  // 5. 传统
  try {
    const { syncTraditions } = await import('./preload-traditions.mjs');
    const r = syncTraditions(db, { changed: null, isFirst: !oldVer });
    console.log(`  Traditions: +${r.inserts}\n`);
  } catch(e) { console.error('  Traditions 失败:', e.message, '\n'); }

  // 6. 事件关系图 (事件/异常/考古/项目/on_action/事件链)
  try {
    const { syncRelations } = await import('./preload-relations.mjs');
    const r = syncRelations(db, { changed: null, isFirst: !oldVer });
    console.log(`  Relations: ${r.nodes} nodes, ${r.edges} edges, ${r.flags} flags, ${r.chains} chains\n`);
  } catch(e) { console.error('  Relations 失败:', e.message, '\n'); }

  setGameVersion(db, newVer);
  console.log('='.repeat(50));
  console.log(`同步完成,版本: ${newVer}`);
  closeDb();
}

main().catch(console.error);
