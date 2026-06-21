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
    rawFlags: [],
  };

  const { csPos, cePos, playerCountryId } = findPlayerCountry(data);
  const searchStart = csPos ?? 0;
  const searchEnd = cePos ?? data.length;

  extractStats(data, searchStart, searchEnd, result);
  extractEmpireInfo(data, result);
  extractFlags(data, csPos, cePos, result);
  extractColonies(data, result);
  extractCrises(data, result);
  extractTechnologies(data, result);
  extractMegastructures(data, result);
  extractWars(data, playerCountryId, result);

  return result;
}

// ===== 国家 section 定位 =====

function findPlayerCountry(data: Buffer): { csPos: number | null; cePos: number | null; playerCountryId: string } {
  const playerPos = data.indexOf(Buffer.from('player={'));
  let playerCountryId = '0';
  if (playerPos >= 0) {
    const playerSection = data.subarray(playerPos, playerPos + 200).toString('ascii');
    const m = playerSection.match(/country\s*=\s*(\d+)/);
    if (m) playerCountryId = m[1];
  }
  // Search for country section - PDS format varies by version
  let countrySec = data.indexOf(Buffer.from('\ncountry={'));
  if (countrySec < 0) countrySec = data.indexOf(Buffer.from('\ncountry=\n{'));
  if (countrySec < 0) countrySec = data.indexOf(Buffer.from('\r\ncountry={'));
  if (countrySec < 0) countrySec = data.indexOf(Buffer.from('\tcountry={'));
  if (countrySec < 0) countrySec = data.indexOf(Buffer.from('country={'));  // anywhere
  if (countrySec < 0) {
    // Corvus 4.2.x and newer: country data may be in a different structure
    // Fall back to searching the entire file for player country section
    return { ...findPlayerCountryByScan(data, playerCountryId), playerCountryId };
  }
  if (countrySec < 0) return { csPos: null, cePos: null, playerCountryId };
  const cbs = data.indexOf(Buffer.from('{'), countrySec + 8);
  if (cbs < 0) return { csPos: null, cePos: null, playerCountryId };
  const cbe = findBlockEnd(data, cbs + 1);

  const countryText = data.subarray(cbs + 1, cbe - 1).toString('latin1');
  const playerPattern = new RegExp(`(?:^|\\n)\\s*${playerCountryId}=\\s*\\{`);
  const match = playerPattern.exec(countryText);
  if (match) {
    const relativeBrace = match.index + match[0].lastIndexOf('{');
    const ss = cbs + 1 + relativeBrace;
    const se = findBlockEnd(data, ss + 1);
    return { csPos: cbs + 1 + match.index, cePos: se, playerCountryId };
  }
  return { csPos: null, cePos: null, playerCountryId };
}

function findPlayerCountryByScan(data: Buffer, playerId: string): { csPos: number | null; cePos: number | null } {
  // Corvus 4.x+ fallback: search for player country flags by looking for empire_size or any known flag
  // Use a wider search range - the player's data is typically in the first 30% of the file
  const scanEnd = Math.floor(data.length * 0.3);
  // Try finding flags= block directly
  const fp = data.indexOf(Buffer.from('flags={'), 0);
  if (fp >= 0 && fp < scanEnd) {
    return { csPos: null, cePos: Math.min(fp + 5000000, data.length) };
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

  // Try Butler v2.x format: central flags={...} block
  let flagsPos = data.indexOf(Buffer.from('flags={'), searchStart);
  let rawFlags: { name: string; tick: number }[] = [];

  if (flagsPos >= 0 && flagsPos < searchEnd) {
    const flagsEnd = findBlockEnd(data, flagsPos + 6);
    if (flagsEnd <= Math.min(searchEnd * 1.5, data.length)) {
      const text = data.subarray(flagsPos, flagsEnd).toString('ascii');
      for (const m of text.matchAll(/\n(\w+)\s*=\s*(\d{7,9})/g)) {
        const name = m[1], tick = parseInt(m[2]);
        if (tick > 60000000 && tick < 70000000) rawFlags.push({ name, tick });
      }
    }
  }

  // Fallback for Corvus v4.x format: flags are scattered throughout the file
  if (rawFlags.length === 0) {
    // Search file body (skip header, start from ~5000 bytes in)
    const midPt = Math.floor(data.length * 0.4);
    const tail = data.slice(midPt, searchEnd === data.length ? data.length : Math.min(searchEnd * 2, data.length));
    const text = tail.toString('ascii');
    const seen = new Set<string>();
    for (const m of text.matchAll(/\b(\w{4,40})\s*=\s*(\d{8,9})\b/g)) {
      const name = m[1], tick = parseInt(m[2]);
      if (tick > 60000000 && tick < 70000000 && !seen.has(name)) {
        seen.add(name);
        rawFlags.push({ name, tick });
      }
    }
  }

  const SKIP = new Set(['flag_date','flag_days','country','id','tick','type','none',
    'sector','planet','army','fleet','ship','pop','species_index',
    'random','graphical_culture','capital_scope','synced_random_seed']);
  rawFlags = rawFlags.filter(f => !SKIP.has(f.name) && f.name.length >= 3 && !/^\d+$/.test(f.name));

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

  // Store raw flags for event chain detection
  result.rawFlags = rawFlags.map(rf => ({
    name: rf.name,
    tick: rf.tick,
    scope: 'country', // Most flags from this extraction are country-level
  }));

  for (const rf of rawFlags) {
    const year = Math.round(2200 + (rf.tick - tickBase) / 8350);
    result.timeline_events.push({ event: rf.name, category: cat(rf.name), approx_date: year.toString(), key: rf.name });
  }
}

// ===== Colony extraction =====

function extractColonies(data: Buffer, result: ParsedSave) {
  const needle = Buffer.from('colony=');
  const limit = Math.min(10000000, data.length);
  const colonyList: { name: string; year: number }[] = [];
  let pos = 0;

  while (pos < limit) {
    const idx = data.indexOf(needle, pos);
    if (idx === -1 || idx >= limit) break;
    let end = idx + needle.length;
    while (end < limit && data[end] >= 0x30 && data[end] <= 0x39) end++;
    const tick = parseInt(data.slice(idx + needle.length, end).toString('ascii'));
    if (tick > 60000000 && tick < 70000000) {
      const before = data.slice(Math.max(0, idx - 400), idx);
      const ni = before.lastIndexOf(Buffer.from('name="'));
      if (ni >= 0) {
        const ne = before.indexOf(0x22, ni + 6);
        const nameBuf = before.slice(ni + 6, ne);
        let name = nameBuf.toString('utf8');
        if (/[^\x20-\x7E]/.test(name)) {
          try { name = Buffer.from(name, 'latin1').toString('utf8'); } catch {}
        }
        const year = Math.round(2200 + (tick - 62800000) / 8350);
        colonyList.push({ name, year });
      }
    }
    pos = end;
  }

  // Deduplicate by name
  const seen = new Set<string>();
  const unique = colonyList.filter(c => !seen.has(c.name) && seen.add(c.name));
  unique.sort((a, b) => a.year - b.year);
  result.colonies = unique;
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

function extractWars(data: Buffer, playerCountryId: string, result: ParsedSave) {
  const countryNames = extractCountryNames(data, playerCountryId, result.empire_name);
  const timelineSource = data.toString('latin1');
  const seen = new Set<string>();
  const definitionPattern = /definition="timeline_(?:first_)?war_declared_(attacker|defender)"/g;

  for (const match of timelineSource.matchAll(definitionPattern)) {
    const before = timelineSource.slice(Math.max(0, (match.index || 0) - 600), match.index);
    const dates = [...before.matchAll(/date=\s*"([^"]+)"/g)];
    const dataBlocks = [...before.matchAll(/data=\s*\{\s*([0-9\s]+)\}/g)];
    const date = dates.at(-1)?.[1];
    const ids = dataBlocks.at(-1)?.[1].trim().split(/\s+/).filter(Boolean);
    if (!date || !ids || ids.length < 2) continue;

    const attackerId = ids[0];
    const defenderId = ids[1];
    if (attackerId !== playerCountryId && defenderId !== playerCountryId) continue;
    const role = attackerId === playerCountryId ? 'attacker' : 'defender';
    const opponentId = role === 'attacker' ? defenderId : attackerId;
    const key = `${date}_${attackerId}_${defenderId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.war_history.push({
      date,
      type: 'war_active',
      role,
      attacker: countryNames.get(attackerId) || `帝国 #${attackerId}`,
      defender: countryNames.get(defenderId) || `帝国 #${defenderId}`,
      opponent: countryNames.get(opponentId) || `帝国 #${opponentId}`,
    });
  }

  result.war_history.sort((a, b) => a.date.localeCompare(b.date));
}

function extractCountryNames(data: Buffer, playerCountryId: string, playerName: string): Map<string, string> {
  const names = new Map<string, string>();
  names.set(playerCountryId, playerName);
  const marker = data.indexOf(Buffer.from('\ncountry=\n{'));
  if (marker < 0) return names;
  const open = data.indexOf(0x7b, marker);
  if (open < 0) return names;
  const end = findBlockEnd(data, open + 1);
  const block = data.subarray(open + 1, end - 1);
  const recordPattern = /\n\s*(\d+)=\s*\{/g;

  for (const match of block.toString('latin1').matchAll(recordPattern)) {
    const id = match[1];
    if (names.has(id)) continue;
    const relativeOpen = (match.index || 0) + match[0].lastIndexOf('{');
    const recordEnd = findBlockEnd(block, relativeOpen + 1);
    const header = block.subarray(relativeOpen + 1, Math.min(recordEnd, relativeOpen + 1800)).toString('latin1');
    const name = parseCountryName(header);
    if (name) names.set(id, name);
  }
  return names;
}

function parseCountryName(header: string): string | null {
  const nameStart = header.indexOf('name=');
  if (nameStart < 0) return null;
  const nameRegion = header.slice(nameStart, Math.min(header.length, nameStart + 700));
  const direct = nameRegion.match(/^name=\s*"([^"]+)"/);
  if (direct) return direct[1];

  const keys = [...nameRegion.matchAll(/key="([^"]+)"/g)].map(match => match[1]);
  if (keys.length === 0) return null;
  const meaningful = keys.filter(key => !['%ADJECTIVE%', 'adjective', '1'].includes(key));
  if (meaningful.length === 0) return null;
  return meaningful.slice(0, 2).map(humanizeCountryKey).join(' ');
}

function humanizeCountryKey(key: string): string {
  const suffixes: Record<string, string> = {
    Hive: '蜂巢',
    Accord: '协约',
    Alliance: '联盟',
    Commonwealth: '共同体',
    Confederation: '邦联',
    Empire: '帝国',
    Imperium: '帝国',
    Kingdom: '王国',
    Republic: '共和国',
    Union: '联合体',
  };
  if (suffixes[key]) return suffixes[key];
  return key
    .replace(/^SPEC_/, '')
    .replace(/^EMPIRE_DESIGN_/, '')
    .replace(/^PRESCRIPTED_/, '')
    .replace(/_/g, ' ');
}
