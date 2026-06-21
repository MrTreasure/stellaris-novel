// Verify extraction patterns (mirrors save-parser.ts logic)
import { existsSync } from 'fs';
import AdmZip from 'adm-zip';

const SAV = 'C:/Users/Administrator/Documents/Paradox Interactive/Stellaris/save games/_1015953906/autosave_2376.01.01.sav';
if (!existsSync(SAV)) { console.error('SAV not found'); process.exit(1); }

function findBlockEnd(data, start) { let d=1,p=start; while(p<data.length&&d>0){if(data[p]===0x7b)d++;else if(data[p]===0x7d)d--;p++;} return p; }

// Fixed finder: handles whitespace between \n and key, and key={ on separate lines
function findSectionBlock(data, key) {
  const keyBuf = Buffer.from(key);
  let pos = 0;
  while (pos < data.length) {
    const idx = data.indexOf(keyBuf, pos);
    if (idx < 0) return null;
    // Check key is at line start (skip spaces/tabs before it)
    let before = idx - 1;
    while (before >= 0 && (data[before] === 0x20 || data[before] === 0x09)) before--;
    if (before < 0 || data[before] === 0x0a) {
      // Found at line start — find opening brace
      let bracePos = idx + keyBuf.length;
      while (bracePos < data.length && (data[bracePos] === 0x20 || data[bracePos] === 0x09 || data[bracePos] === 0x0a || data[bracePos] === 0x3d)) bracePos++;
      if (bracePos < data.length && data[bracePos] === 0x7b) {
        const end = findBlockEnd(data, bracePos + 1);
        if (end > bracePos) return data.subarray(bracePos + 1, end - 1);
      }
      // key on one line, { on next
      let nlPos = idx + keyBuf.length;
      while (nlPos < data.length && data[nlPos] !== 0x0a && data[nlPos] !== 0x7b) nlPos++;
      if (nlPos < data.length && data[nlPos] === 0x0a) {
        nlPos++;
        while (nlPos < data.length && (data[nlPos] === 0x20 || data[nlPos] === 0x09)) nlPos++;
        if (nlPos < data.length && data[nlPos] === 0x7b) {
          const end = findBlockEnd(data, nlPos + 1);
          if (end > nlPos) return data.subarray(nlPos + 1, end - 1);
        }
      }
    }
    pos = idx + keyBuf.length;
  }
  return null;
}

function decodePdxName(buf) { try{return Buffer.from(buf.toString('latin1'),'latin1').toString('utf8')}catch{return buf.toString('utf8')} }

const zip = new AdmZip(SAV);
const gs = zip.getEntry('gamestate').getData();
console.log('Gamestate:', (gs.length/1048576).toFixed(1), 'MB\n');
let pass = 0, fail = 0;
function check(name, cond) { if(cond) { pass++; console.log('  PASS:', name); } else { fail++; console.log('  FAIL:', name); } }

// 1. Planets (planet= section, habitable + has controller or pops)
const pb = findSectionBlock(gs, 'planet=');
const pFound = !!pb;
check('planet= section found', pFound);
if (pb) {
  const text = pb.toString('latin1');
  const hab = new Set(['pc_continental','pc_ocean','pc_arid','pc_arctic','pc_tundra','pc_alpine','pc_desert','pc_tropical','pc_savannah','pc_gaia','pc_city','pc_hive','pc_habitat','pc_machine','pc_ring','pc_infested','pc_nuked','pc_broken','pc_shattered','pc_shattered_2']);
  let cols = 0;
  const pp = /\n\s*(\d+)=\s*\{/g; let pm;
  while((pm=pp.exec(text))!==null&&cols<200){
    const ps=pm.index+pm[0].lastIndexOf('{'), pe=findBlockEnd(pb,ps+1);
    const pt=pb.subarray(ps+1,Math.min(pe,ps+1+2000)).toString('latin1');
    const ctrl=pt.match(/controller\s*=\s*(\d+)/);
    const cls=pt.match(/planet_class\s*=\s*"(pc_\w+)"/);
    const hasCtrl=ctrl&&ctrl[1]!=='4294967295';
    const hasPops=/\bpop\s*=\s*\d+/.test(pt);
    if((hasCtrl||hasPops)&&(!cls||hab.has(cls[1])||hasPops)) cols++;
  }
  console.log(`    colonized: ${cols}`);
}

// 2. Fleets
const fb = findSectionBlock(gs, 'fleet=');
check('fleet= section found', !!fb);
if (fb) {
  const fText = fb.toString('latin1');
  let combat = 0, starbases = 0;
  const fp = /\n\s*(\d+)=\s*\{/g; let fm;
  while((fm=fp.exec(fText))!==null&&combat<100){
    const fs=fm.index+fm[0].lastIndexOf('{'), fe=findBlockEnd(fb,fs+1);
    const ft=fb.subarray(fs+1,Math.min(fe,fs+1+2000)).toString('latin1');
    if(/station\s*=\s*yes/.test(ft)) starbases++;
    else { const sb=ft.match(/ships\s*=\s*\{([^}]*)\}/); if(sb&&sb[1].match(/\d+/g)) combat++; }
  }
  console.log(`    combat: ${combat}, starbases: ${starbases}`);
}

// 3. Leaders (leaders= section)
const lb = findSectionBlock(gs, 'leaders=');
check('leaders= section found', !!lb);
if (lb) {
  const lText = lb.toString('latin1');
  const bc = {};
  const entries = lText.match(/\n\s*(\d+)=\s*\{/g);
  const p2 = /\n\s*(\d+)=\s*\{/g; let em2;
  while((em2=p2.exec(lText))!==null){
    const es=em2.index+em2[0].lastIndexOf('{'), ee=findBlockEnd(lb,es+1);
    const et=lb.subarray(es+1,Math.min(ee,es+1+2000)).toString('latin1');
    const cm=et.match(/leader_class\s*=\s*"(scientist|admiral|general|governor|ruler|official|commander)"/);
    if(cm) bc[cm[1]]=(bc[cm[1]]||0)+1;
  }
  console.log(`    by class: ${JSON.stringify(bc)}, total=${Object.values(bc).reduce((a,b)=>a+b,0)}, entries=${entries?entries.length:0}`);
}

// 4. Fired events
const feb = findSectionBlock(gs, 'fired_event_ids=');
check('fired_event_ids= section found', !!feb);
if (feb) {
  const events = [...feb.toString('latin1').matchAll(/"([\w.]+)"/g)].map(m=>m[1]).filter(e=>e.includes('.'));
  console.log(`    total: ${events.length}`);
}

// 5. Archaeology
const ab = findSectionBlock(gs, 'archaeological_sites=');
check('archaeological_sites= section found', !!ab);
if (ab) {
  let inner=ab; const si=ab.indexOf(Buffer.from('\nsites='));
  if(si>=0){const o=ab.indexOf(0x7b,si);if(o>=0)inner=ab.subarray(o+1,findBlockEnd(ab,o+1)-1);}
  const sites=(inner.toString('latin1').match(/\n\s*\d+=\s*\{/g)||[]).length;
  console.log(`    sites: ${sites}`);
}

// 6. Diplomacy sections
check('federation= found', !!findSectionBlock(gs, 'federation='));
check('trade_deal= found', !!findSectionBlock(gs, 'trade_deal='));
check('truce= found', !!findSectionBlock(gs, 'truce='));
check('agreements= found', !!findSectionBlock(gs, 'agreements='));

// 7. Wars
const wb = findSectionBlock(gs, 'war=');
check('war= section found', !!wb);
if (wb) console.log(`    active wars: ${(wb.toString('latin1').match(/\n\s*\d+=\s*\{/g)||[]).length}`);

// 8. Situations
const sb = findSectionBlock(gs, 'situations=');
check('situations= section found', !!sb);
if (sb) console.log(`    entries: ${(sb.toString('latin1').match(/\n\s*\d+=\s*\{/g)||[]).length}`);

// 9. Other sections
for (const key of ['sectors=', 'buildings=', 'districts=', 'espionage_operations=', 'resolution=', 'ground_combat=', 'pop_factions=']) {
  const block = findSectionBlock(gs, key);
  if (block) console.log(`  ${key}: ${(block.toString('latin1').match(/\n\s*\d+=\s*\{/g)||[]).length} entries`);
}

console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
