// 群星存档解析器 — 纯 TypeScript/Buffer 实现
// 解析 .sav 文件 (ZIP) 中的 PDS 格式游戏状态

import AdmZip from 'adm-zip';
import type { ParsedSave } from '@/types';

// ===== 工具函数 =====

function decodePdxName(buf: Buffer): string {
  try {
    const latin1 = buf.toString('latin1');
    return Buffer.from(latin1, 'latin1').toString('utf8');
  } catch {
    return buf.toString('utf8');
  }
}

function extractQuotedString(data: Buffer, pos: number): [string | null, number] {
  if (data[pos] !== 0x22) return [null, pos];
  const end = data.indexOf(0x22, pos + 1);
  if (end === -1) return [null, pos];
  const raw = data.subarray(pos + 1, end);
  try { const s = raw.toString('latin1'); return [Buffer.from(s, 'latin1').toString('utf8'), end + 1]; }
  catch { return [raw.toString('utf8'), end + 1]; }
}

function findKeyValue(data: Buffer, key: string, start = 0, end?: number): { value: Buffer | string | null; newPos: number } {
  if (end === undefined) end = data.length;
  const keyBuf = Buffer.from(key);
  const pos = data.indexOf(keyBuf, start);
  if (pos === -1 || pos >= end) return { value: null, newPos: start };
  let p = pos + keyBuf.length;
  while (p < end && Buffer.from(' \t\n\r').includes(data[p])) p++;
  if (p < end && data[p] === 61) p++;
  while (p < end && Buffer.from(' \t\n\r').includes(data[p])) p++;
  if (p >= end) return { value: null, newPos: p };
  const c = data[p];
  if (c === 0x22) { const [v, np] = extractQuotedString(data, p); return { value: v, newPos: np }; }
  else if ((c >= 0x30 && c <= 0x39) || c === 0x2d) {
    let ep = p; while (ep < end && Buffer.from('0123456789.-').includes(data[ep])) ep++;
    return { value: data.subarray(p, ep).toString('ascii'), newPos: ep };
  } else if (c === 0x7b) {
    let depth = 1; let ep = p + 1;
    while (ep < end && depth > 0) { if (data[ep]===0x7b)depth++; else if(data[ep]===0x7d)depth--; ep++; }
    return { value: data.subarray(p, ep), newPos: ep };
  } else {
    let ep = p; while (ep < end && !Buffer.from(' \t\n\r}{=').includes(data[ep])) ep++;
    return { value: data.subarray(p, ep).toString('ascii'), newPos: ep };
  }
}

function findAllValues(data: Buffer, key: string, start = 0, end?: number): { value: Buffer | string | null; pos: number; newPos: number }[] {
  if (end === undefined) end = data.length;
  const results: { value: Buffer | string | null; pos: number; newPos: number }[] = [];
  let pos = start;
  const keyBuf = Buffer.from(key);
  while (pos < end) {
    const idx = data.indexOf(keyBuf, pos);
    if (idx === -1 || idx >= end) break;
    const before = idx > 0 ? data[idx - 1] : 0x20;
    if (!Buffer.from(' \t\n\r{').includes(before)) { pos = idx + keyBuf.length; continue; }
    const r = findKeyValue(data, key, idx, end);
    if (r.value !== null) results.push({ value: r.value, pos: idx, newPos: r.newPos });
    pos = Math.max(idx + keyBuf.length, r.newPos > idx ? r.newPos : idx + 1);
  }
  return results;
}

function findBlockEnd(data: Buffer, start: number): number {
  let depth = 1; let pos = start;
  while (pos < data.length && depth > 0) { if (data[pos]===0x7b)depth++; else if(data[pos]===0x7d)depth--; pos++; }
  return pos;
}

// ===== 主解析函数 =====

export function parseSaveFile(filePath: string): ParsedSave {
  const zip = new AdmZip(filePath);
  const metaEntry = zip.getEntry('meta');
  if (!metaEntry) throw new Error('存档文件缺少 meta 数据');
  const metaText = metaEntry.getData().toString('utf8');
  const metaInfo: Record<string, string> = {};
  for (const line of metaText.split('\n')) { const m = line.match(/(\w+)="([^"]+)"/); if (m) metaInfo[m[1]] = m[2]; }

  const gsEntry = zip.getEntry('gamestate');
  if (!gsEntry) throw new Error('存档文件缺少 gamestate');
  const data = gsEntry.getData();

  const gameDate = metaInfo['date'] || '?';
  let empireName = metaInfo['name'] || '?';
  if (/[Ã©Ã¨]/.test(empireName)) { try { empireName = Buffer.from(empireName, 'latin1').toString('utf8'); } catch {} }

  const result: ParsedSave = {
    game_date: gameDate, empire_name: empireName,
    empire_info: {}, stats: {}, diplomatic: {},
    timeline_events: [], crisis_encounters: [],
    key_technologies: [], megastructures: [], war_history: [],
  };

  const { csPos, cePos } = findPlayerCountry(data);
  const searchStart = csPos ?? 0;
  const searchEnd = cePos ?? data.length;

  extractStats(data, searchStart, searchEnd, result);
  extractEmpireInfo(data, result);
  extractFlags(data, csPos, cePos, result);
  extractCrises(data, result);
  extractTechnologies(data, result);
  extractMegastructures(data, result);
  extractWars(data, searchStart, searchEnd, result);

  return result;
}

// ===== 国家 section 定位 =====

function findPlayerCountry(data: Buffer): { csPos: number | null; cePos: number | null } {
  const playerPos = data.indexOf(Buffer.from('player={'));
  let playerCountryId = '0';
  if (playerPos >= 0) {
    const playerSection = data.subarray(playerPos, playerPos + 200).toString('ascii');
    const m = playerSection.match(/country\s*=\s*(\d+)/);
    if (m) playerCountryId = m[1];
  }
  let countrySec = data.indexOf(Buffer.from('\ncountry={'));
  if (countrySec < 0) countrySec = data.indexOf(Buffer.from('country={'));
  if (countrySec < 0) return { csPos: null, cePos: null };
  const cbs = data.indexOf(Buffer.from('{'), countrySec + 8);
  if (cbs < 0) return { csPos: null, cePos: null };
  const cbe = findBlockEnd(data, cbs + 1);

  const cidBytes = Buffer.from(playerCountryId + '={');
  let pos = countrySec;
  while (pos < cbe) {
    const idx = data.indexOf(cidBytes, pos);
    if (idx === -1 || idx >= cbe) break;
    if (idx > 0 && !Buffer.from(' \t\n\r').includes(data[idx - 1])) { pos = idx + cidBytes.length; continue; }
    const bp = idx + cidBytes.length - 2;
    const ss = data.indexOf(Buffer.from('{'), bp);
    if (ss < 0) break;
    const se = findBlockEnd(data, ss + 1);
    const check = data.subarray(idx, se).toString('ascii');
    if (check.includes('graphical_culture') || (check.includes('flags={') && check.includes('tech_status'))) {
      return { csPos: idx, cePos: se };
    }
    pos = se;
  }
  return { csPos: null, cePos: null };
}

function extractStats(data: Buffer, searchStart: number, searchEnd: number, result: ParsedSave) {
  const keys = ['empire_size','military_power','tech_power','economic_power','victory_rank','num_owned_planets','naval_cap'];
  for (const key of keys) {
    const r = findKeyValue(data, key, searchStart, searchEnd);
    if (r.value !== null && typeof r.value === 'string') { const n = parseFloat(r.value); if (!isNaN(n)) result.stats[key] = Math.round(n); }
  }
  if (Object.keys(result.stats).length === 0) {
    for (const key of keys) {
      const r = findKeyValue(data, key, 0, Math.floor(data.length / 3));
      if (r.value !== null && typeof r.value === 'string') { const n = parseFloat(r.value); if (!isNaN(n)) result.stats[key] = Math.round(n); }
    }
  }
}

function extractEmpireInfo(data: Buffer, result: ParsedSave) {
  const speciesSec = data.indexOf(Buffer.from('species={'));
  if (speciesSec >= 0) {
    const chunk = data.subarray(speciesSec, Math.min(speciesSec + 3000, data.length));
    const classR = findKeyValue(chunk, 'class');
    if (classR.value && typeof classR.value === 'string') result.empire_info.species_class = classR.value;
    const portraitR = findKeyValue(chunk, 'portrait');
    if (portraitR.value && typeof portraitR.value === 'string') result.empire_info.species_portrait = portraitR.value;
    const nameMatches = [...chunk.toString('ascii').matchAll(/name="([^"]+)"/g)];
    for (const nm of nameMatches) {
      const val = nm[1];
      if (!/HUMAN\d?|REP\d?|MAM\d?|FUN\d?|MOL\d?|AVI\d?/.test(val) && val.length > 1) {
        result.empire_info.species_name = decodePdxName(Buffer.from(val, 'latin1')); break;
      }
    }
    const traitSec = chunk.indexOf(Buffer.from('traits={'));
    if (traitSec >= 0) {
      const traitEnd = chunk.indexOf(Buffer.from('}'), traitSec);
      const traits: string[] = [];
      for (const m of chunk.subarray(traitSec, traitEnd).toString('ascii').matchAll(/trait="([^"]+)"/g)) traits.push(m[1]);
      if (traits.length > 0) result.empire_info.traits = traits;
    }
  }
  for (const key of ['authority','origin']) { const r = findKeyValue(data, key, 0, 50000); if (r.value && typeof r.value === 'string') result.empire_info[key as 'authority'|'origin'] = r.value; }
  const ethics = new Set<string>();
  for (const r of findAllValues(data, 'ethic', 0, 50000)) { if (typeof r.value === 'string' && r.value.startsWith('ethic_')) ethics.add(r.value); }
  if (ethics.size > 0) result.empire_info.ethics = [...ethics];
  const civics = new Set<string>();
  for (const r of findAllValues(data, 'civic', 0, 50000)) { if (typeof r.value === 'string' && r.value !== 'none') civics.add(r.value); }
  if (civics.size > 0) result.empire_info.civics = [...civics];
  if (data.subarray(0, 500000).includes(Buffer.from('federation'))) result.diplomatic.in_federation = true;
  if (data.includes(Buffer.from('galactic_community'))) result.diplomatic.in_galactic_community = true;
}

// ===== ALL flags extraction (dynamic, not hardcoded) =====

function extractFlags(data: Buffer, csPos: number | null, cePos: number | null, result: ParsedSave) {
  const searchStart = csPos ?? 0;
  const searchEnd = cePos ?? data.length;

  const flagsPos = data.indexOf(Buffer.from('flags={'), searchStart);
  if (flagsPos < 0 || flagsPos >= searchEnd) return;
  const flagsEnd = findBlockEnd(data, flagsPos + 6);
  if (flagsEnd > Math.min(searchEnd * 1.5, data.length)) return;
  const text = data.subarray(flagsPos, flagsEnd).toString('ascii');

  const SKIP = new Set(['flag_date','flag_days','country','id','tick','type','none',
    'sector','planet','army','fleet','ship','pop','species_index',
    'random','graphical_culture','capital_scope','synced_random_seed']);

  const rawFlags: { name: string; tick: number }[] = [];
  for (const m of text.matchAll(/\n(\w+)\s*=\s*(\d{7,9})/g)) {
    const name = m[1], tick = parseInt(m[2]);
    if (SKIP.has(name) || name.length < 3 || /^\d+$/.test(name)) continue;
    if (tick > 60000000 && tick < 70000000) rawFlags.push({ name, tick });
  }

  const catRules: [string, string][] = [
    ['built_','megastructure'],['started_first_','megastructure'],['finished_','megastructure'],
    ['has_won_war','war'],['has_conquer_','war'],
    ['first_colony','colonization'],['colony_','colonization'],
    ['encountered_first_','exploration'],['discovered_','exploration'],
    ['anomaly_','exploration'],['archaeolog','exploration'],
    ['surveyed_','exploration'],['completed_','exploration'],
    ['triggered_','event'],['story','event'],
    ['crisis_','crisis'],['machine_','crisis'],
    ['achievement_','achievement'],
    ['first_contact','diplomacy'],['has_communications','diplomacy'],['established_comms','diplomacy'],
    ['has_market','economy'],
    ['gateway_','megastructure'],['lgate','exploration'],
    ['colossus_','military'],['fired_','military'],
    ['edict_','policy'],['specimens_','collection'],
    ['has_modified','science'],['pop_mod','science'],
    ['found_presapients','exploration'],['living_planet','exploration'],
    ['exotic_gases','resource'],['rare_crystals','resource'],
    ['volatile_motes','resource'],['dark_matter','resource'],['zro_','resource'],
  ];
  function cat(name: string): string { for (const [p,c] of catRules) if (name.startsWith(p)) return c; return 'other'; }

  const tickBase = 62800000;
  for (const rf of rawFlags) {
    const year = Math.round(2200 + (rf.tick - tickBase) / 8350);
    result.timeline_events.push({ event: rf.name, category: cat(rf.name), approx_date: year.toString(), key: rf.name });
  }
}

// ===== Others =====

function extractCrises(data: Buffer, result: ParsedSave) {
  const m: Record<string,string> = { great_khan:'大汗崛起', gray_goo:'灰蛊风暴', awakened_empire:'堕落觉醒', war_in_heaven:'天堂之战', prethoryn:'虫群入侵', unbidden:'破界者', contingency:'肃正协议' };
  for (const [id,desc] of Object.entries(m)) { if (data.includes(Buffer.from(id))) result.crisis_encounters.push({ id, description: desc }); }
}

function extractTechnologies(data: Buffer, result: ParsedSave) {
  const m: Record<string,string> = { tech_titans:'泰坦', tech_colossus:'巨像', tech_mega_engineering:'巨型工程', tech_juggernaut:'主宰', tech_gateway_construction:'星门建造', tech_jump_drive_1:'跃迁引擎', tech_psi_jump_drive_1:'灵能跃迁', tech_synthetics:'合成人', tech_synthetic_workers:'合成工人', tech_droids:'机器人', tech_zero_point_power:'零点能源', tech_habitat_1:'轨道居住站I', tech_habitat_2:'轨道居住站II', tech_habitat_3:'轨道居住站III' };
  for (const [id,desc] of Object.entries(m)) { if (data.includes(Buffer.from(id))) result.key_technologies.push({ id, description: desc }); }
}

function extractMegastructures(data: Buffer, result: ParsedSave) {
  const m: Record<string,{name:string;status:string}> = { built_dyson_sphere:{name:'戴森球',status:'built'}, finished_dyson_sphere:{name:'戴森球',status:'completed'}, started_first_dyson_sphere:{name:'戴森球',status:'started'}, finished_think_tank:{name:'科学枢纽',status:'completed'}, built_matter_decompressor:{name:'物质解压器',status:'built'}, built_sentry_array:{name:'哨兵阵列',status:'built'}, built_mega_shipyard:{name:'巨型船坞',status:'built'} };
  for (const [flag,info] of Object.entries(m)) { if (data.includes(Buffer.from(flag))) result.megastructures.push(info); }
}

function extractWars(data: Buffer, searchStart: number, searchEnd: number, result: ParsedSave) {
  const end = Math.min(data.length, searchEnd * 2);
  const seen = new Set<string>();
  for (const r of findAllValues(data, 'last_date_at_war', 0, end)) {
    if (typeof r.value === 'string' && !['1.01.01','2200.01.01','2201.01.01'].includes(r.value)) {
      const k = `${r.value}_war`; if (!seen.has(k)) { seen.add(k); result.war_history.push({ date: r.value, type: 'war_active' }); }
    }
  }
  for (const r of findAllValues(data, 'last_date_war_lost', 0, end)) {
    if (typeof r.value === 'string' && !['1.01.01','2200.01.01'].includes(r.value)) {
      const k = `${r.value}_lost`; if (!seen.has(k)) { seen.add(k); result.war_history.push({ date: r.value, type: 'war_lost' }); }
    }
  }
  result.war_history = [...new Map(result.war_history.map(w => [w.date + w.type, w])).values()];
  result.war_history.sort((a, b) => a.date.localeCompare(b.date));
}
