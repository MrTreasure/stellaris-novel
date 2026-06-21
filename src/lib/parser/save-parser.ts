// 群星存档解析器 — 纯 TypeScript/Buffer 实现
// 解析 .sav 文件 (ZIP) 中的 PDS 格式游戏状态

import AdmZip from 'adm-zip';
import type { ParsedSave } from '@/types';
import { isNoiseFlag } from '@/lib/noise-filter';

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

  // Phase 1: Military & Population
  extractPlanets(data, result);
  extractPopulation(data, result);
  extractFleets(data, result);

  // Phase 2: Leaders & Diplomacy
  extractLeaders(data, result);
  extractWarsDetailed(data, result);
  extractDiplomacy(data, result);

  // Phase 3: Story Events & Archaeology
  extractFiredEvents(data, result);
  extractArchaeology(data, result);
  extractSituations(data, result);
  extractEventTargets(data, result);
  extractPlayerEvents(data, result);

  // Phase 4: Worldbuilding
  extractInfrastructure(data, result);
  extractEspionage(data, result);
  extractResolutions(data, result);
  extractGroundCombat(data, result);
  extractMapObjects(data, result);

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
  if (rawFlags.length < 50) {
    // Scan the entire file for flag-like patterns, not just the country section
    const scanLimit = Math.min(data.length, 60_000_000); // cap at 60MB for performance
    let scanPos = 5000; // skip header
    const seen = new Set<string>();

    // Process in chunks to avoid huge string allocations
    const CHUNK = 5_000_000;
    while (scanPos < scanLimit) {
      const chunkEnd = Math.min(scanPos + CHUNK, scanLimit);
      const text = data.toString('ascii', scanPos, chunkEnd);
      for (const m of text.matchAll(/\b(\w{4,60})\s*=\s*(\d{8,9})\b/g)) {
        const name = m[1], tick = parseInt(m[2]);
        if (tick > 60000000 && tick < 70000000 && !seen.has(name)) {
          seen.add(name);
          rawFlags.push({ name, tick });
          if (rawFlags.length >= 2000) break; // safety limit
        }
      }
      if (rawFlags.length >= 2000) break;
      scanPos = chunkEnd;
    }
    // Also scan the primary country section more thoroughly
    if (rawFlags.length < 100 && csPos && cePos) {
      const countryText = data.toString('ascii', csPos, Math.min(cePos || data.length, data.length));
      for (const m of countryText.matchAll(/\b(\w{4,60})\s*=\s*(\d{8,9})\b/g)) {
        const name = m[1], tick = parseInt(m[2]);
        if (tick > 60000000 && tick < 70000000 && !seen.has(name)) {
          seen.add(name);
          rawFlags.push({ name, tick });
          if (rawFlags.length >= 2000) break;
        }
      }
    }
  }

  const SKIP = new Set(['flag_date','flag_days','country','id','tick','type','none',
    'sector','planet','army','fleet','ship','pop','species_index',
    'random','graphical_culture','capital_scope','synced_random_seed']);
  rawFlags = rawFlags.filter(f => !SKIP.has(f.name) && f.name.length >= 3 && !/^\d+$/.test(f.name)
    // Filter out system/planet initialization markers (not player milestones)
    && !f.name.startsWith('planet_')
    && !f.name.startsWith('fallen_empire_')
    && !f.name.startsWith('fallen_hive_')
    && !f.name.startsWith('fe_the_')
    && !f.name.startsWith('forgotten_patrol_')
    && !f.name.startsWith('machine_world_')
    && !f.name.startsWith('guardians_')
    && !f.name.endsWith('_enclave_planet')
    && !f.name.startsWith('raid_')
    && !f.name.startsWith('prescripted_')
    && !f.name.match(/^(tasty|toxic|ancient_history|war_citadel)/)
  );

  // Use shared noise filter
  rawFlags = rawFlags.filter(f => !isNoiseFlag(f.name));
  // Filter flags with abnormal tick values (>66M = game engine internals, not event dates)
  rawFlags = rawFlags.filter(f => f.tick <= 66000000);

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
    ['precursor_','exploration'],['first_precursor','exploration'],
    ['ruined_','exploration'],['caravan','diplomacy'],
    ['galactic_community','diplomacy'],['galcom','diplomacy'],
    ['federation_','diplomacy'],['in_diplomacy','diplomacy'],
    ['establish_','diplomacy'],['met_fallen_','diplomacy'],
    ['leviathan_','exploration'],['enigmatic_','exploration'],
    ['dreadnought','military'],['stellarite','military'],
    ['shroud_','event'],['khan_','crisis'],['horde_','crisis'],
    ['bemat_','exploration'],['worm_','exploration'],
    ['destroyer_','exploration'],
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

// ===== Phase 1: Military & Population =====

function extractPlanets(data: Buffer, result: ParsedSave) {
  try {
    // Corvus v4.x: planet= block (singular), each entry has planet_class and optional controller
    const planetBlock = findSectionBlock(data, 'planet=');
    if (!planetBlock) return;

    const text = planetBlock.toString('latin1');
    const habitableTypes = new Set([
      'pc_continental', 'pc_ocean', 'pc_arid', 'pc_arctic', 'pc_tundra',
      'pc_alpine', 'pc_desert', 'pc_tropical', 'pc_savannah', 'pc_gaia',
      'pc_city', 'pc_hive', 'pc_habitat', 'pc_machine', 'pc_ring',
      'pc_relativistic', 'pc_infested', 'pc_nuked', 'pc_broken',
      'pc_shattered', 'pc_shattered_2', 'pc_egg_world',
    ]);
    const colonies: { name: string; type: string; pops: number }[] = [];

    const planetPattern = /\n\s*(\d+)=\s*\{/g;
    let pm;
    while ((pm = planetPattern.exec(text)) !== null) {
      if (colonies.length >= 200) break;
      const pStart = pm.index + pm[0].lastIndexOf('{');
      const pEnd = findBlockEnd(planetBlock, pStart + 1);
      const pText = planetBlock.subarray(pStart + 1, Math.min(pEnd, pStart + 1 + 2000)).toString('latin1');

      // Colonized = has a controller assigned AND is habitable (or has pops)
      const ctrlM = pText.match(/controller\s*=\s*(\d+)/);
      const hasController = ctrlM && ctrlM[1] !== '4294967295';
      const classM = pText.match(/planet_class\s*=\s*"(pc_\w+)"/);
      const pClass = classM ? classM[1] : '';
      const isHabitable = habitableTypes.has(pClass);
      const hasPops = /\bpop\s*=\s*\d+/.test(pText);

      if (!hasController && !hasPops) continue;
      if (!isHabitable && !hasPops) continue;

      // Extract name (can be a localization key block)
      let name = `行星#${pm[1]}`;
      const nameBlock = pText.match(/name\s*=\s*\{([^}]+)\}/);
      if (nameBlock) {
        const keyM = nameBlock[1].match(/key="([^"]+)"/);
        if (keyM) name = keyM[1];
      } else {
        const nameM = pText.match(/name="([^"]+)"/);
        if (nameM) name = decodePdxName(Buffer.from(nameM[1], 'latin1'));
      }
      const popCount = (pText.match(/\bpop\s*=\s*\d+/g) || []).length;
      colonies.push({ name, type: pClass.replace('pc_', ''), pops: popCount });
    }
    result.planets = { colonized: colonies.length, colonies };
  } catch { /* best effort */ }
}

function extractPopulation(data: Buffer, result: ParsedSave) {
  try {
    const popBlock = findSectionBlock(data, 'pop=');
    if (!popBlock) return;
    // Count pops by counting "pop=" keys (each pop entry)
    const popMatches = popBlock.toString('latin1').match(/\bpop\s*=/g);
    const total = popMatches ? popMatches.length : 0;

    // Extract faction data
    const factBlock = findSectionBlock(data, 'pop_factions=');
    const factions: { name: string; size: number }[] = [];
    if (factBlock) {
      const factText = factBlock.toString('latin1');
      const factPattern = /\n\s*(\d+)=\s*\{/g;
      let fm;
      while ((fm = factPattern.exec(factText)) !== null) {
        if (factions.length >= 20) break;
        const fStart = fm.index + fm[0].lastIndexOf('{');
        const fEnd = findBlockEnd(factBlock, fStart + 1);
        const fText = factBlock.subarray(fStart + 1, Math.min(fEnd, fStart + 1 + 1000)).toString('latin1');
        const nameM = fText.match(/name="([^"]+)"/);
        const name = nameM ? nameM[1] : `派系#${fm[1]}`;
        const supportM = fText.match(/support\s*=\s*([\d.]+)/);
        const size = supportM ? Math.round(parseFloat(supportM[1]) * 100) : 0;
        factions.push({ name, size });
      }
    }
    result.population = { total, factions };
  } catch { /* best effort */ }
}

function extractFleets(data: Buffer, result: ParsedSave) {
  try {
    const fleetBlock = findSectionBlock(data, 'fleet=');
    if (!fleetBlock) return;

    const fleetText = fleetBlock.toString('latin1');
    const fleetEntries = fleetText.match(/\n\s*(\d+)=\s*\{/g);
    const totalFleets = fleetEntries ? fleetEntries.length : 0;

    // Count ships from ships= section
    const shipBlock = findSectionBlock(data, 'ships=');
    let totalShips = 0;
    if (shipBlock) {
      const shipMatches = shipBlock.toString('latin1').match(/\n\s*(\d+)=\s*\{/g);
      totalShips = shipMatches ? shipMatches.length : 0;
    }

    // Extract notable fleets
    const notable: { name: string; ships: number; power: number }[] = [];
    const fleetPattern = /\n\s*(\d+)=\s*\{/g;
    let fm;
    while ((fm = fleetPattern.exec(fleetText)) !== null) {
      if (notable.length >= 10) break;
      const fStart = fm.index + fm[0].lastIndexOf('{');
      const fEnd = findBlockEnd(fleetBlock, fStart + 1);
      const fText = fleetBlock.subarray(fStart + 1, Math.min(fEnd, fStart + 1 + 2000)).toString('latin1');

      // Name may be a localization key block: name={key="..." variables={...}}
      let name;
      const nameBlock = fText.match(/name\s*=\s*\{([^}]+)\}/);
      if (nameBlock) {
        const keyM = nameBlock[1].match(/key="([^"]+)"/);
        if (keyM) name = keyM[1];
      } else {
        const strM = fText.match(/name\s*=\s*"([^"]+)"/);
        name = strM ? decodePdxName(Buffer.from(strM[1], 'latin1')) : undefined;
      }
      if (!name) continue;

      // Ships are listed as: ships = { 0 1 2 ... }
      let shipCount = 0;
      const shipsBlock = fText.match(/ships\s*=\s*\{([^}]*)\}/);
      if (shipsBlock) {
        shipCount = (shipsBlock[1].match(/\d+/g) || []).length;
      }

      // Power may be in fleet_stats.combat_stats
      let power = 0;
      const fpM = fText.match(/fleet_power\s*=\s*([\d.]+)/);
      if (fpM) power = Math.round(parseFloat(fpM[1]));

      // Only include non-starbase fleets with ships or power
      const isStarbase = /station\s*=\s*yes/.test(fText);
      if (!isStarbase && (shipCount > 0 || power > 0)) {
        notable.push({ name, ships: shipCount, power });
      }
    }
    notable.sort((a, b) => b.power - a.power);

    const totalPower = notable.reduce((s, f) => s + f.power, 0);
    result.fleets = { total_fleets: totalFleets, total_ships: totalShips, total_power: totalPower, notable };
  } catch { /* best effort */ }
}

// ===== Phase 2: Leaders & Diplomacy =====

function extractLeaders(data: Buffer, result: ParsedSave) {
  try {
    // Corvus v4.x: leaders are embedded within country records across the file.
    // Scan the gamestate for leader_class= patterns and extract nearby name/level.
    const byClass: Record<string, number> = {};
    const top: { name: string; class: string; level: number; traits: string[] }[] = [];

    // Search across the file for leader_class=
    const text = data.toString('latin1');
    const leaderPattern = /leader_class\s*=\s*"(scientist|admiral|general|governor|ruler|official|commander)"/g;
    let lm;
    while ((lm = leaderPattern.exec(text)) !== null) {
      const lClass = lm[1];
      byClass[lClass] = (byClass[lClass] || 0) + 1;

      // Extract surrounding data (800 chars after class match)
      const ctxStart = lm.index;
      const context = text.slice(ctxStart, ctxStart + 800);
      const levelM = context.match(/level\s*=\s*(\d+)/);
      const level = levelM ? parseInt(levelM[1]) : 1;

      if (level >= 5 && top.length < 20) {
        let name = '未知';
        // Name block: name={full_names={key="NAME_FORMAT" ...}}
        const fullNamesM = context.match(/full_names\s*=\s*\{[^}]*key="([^"]+)"/);
        if (fullNamesM) {
          name = fullNamesM[1];
        } else {
          const nameBlock = context.match(/name\s*=\s*\{([^}]+)\}/);
          if (nameBlock) {
            const keyM = nameBlock[1].match(/key="([^"]+)"/);
            if (keyM) name = keyM[1];
          } else {
            const strM = context.match(/name\s*=\s*"([^"]+)"/);
            if (strM) name = decodePdxName(Buffer.from(strM[1], 'latin1'));
          }
        }
        const traits: string[] = [];
        const traitM = context.matchAll(/trait="(\w+)"/g);
        for (const t of traitM) traits.push(t[1]);
        // Also check for traits= list: traits="xxx" traits="yyy"
        const traitsListM = context.matchAll(/traits\s*=\s*"(\w+)"/g);
        for (const t of traitsListM) traits.push(t[1]);
        if (!top.some(l => l.name === name)) top.push({ name, class: lClass, level, traits });
      }
    }

    top.sort((a, b) => b.level - a.level);
    result.leaders = {
      total: Object.values(byClass).reduce((s, v) => s + v, 0),
      by_class: byClass,
      top: top.slice(0, 15),
    };
  } catch { /* best effort */ }
}

function extractWarsDetailed(data: Buffer, result: ParsedSave) {
  try {
    const warBlock = findSectionBlock(data, 'war=');
    if (!warBlock) return;

    const wText = warBlock.toString('latin1');
    const list: { name: string; attacker: string; defender: string; goal?: string; exhaustion?: string }[] = [];
    const warPattern = /\n\s*(\d+)=\s*\{/g;
    let wm;
    while ((wm = warPattern.exec(wText)) !== null) {
      if (list.length >= 20) break;
      const wStart = wm.index + wm[0].lastIndexOf('{');
      const wEnd = findBlockEnd(warBlock, wStart + 1);
      const wt = warBlock.subarray(wStart + 1, Math.min(wEnd, wStart + 1 + 3000)).toString('latin1');

      // Name may be a localization key block
      let name;
      const nameBlock = wt.match(/name\s*=\s*\{([^}]+)\}/);
      if (nameBlock) {
        const keyM = nameBlock[1].match(/key="([^"]+)"/);
        if (keyM) name = keyM[1];
      } else {
        const strM = wt.match(/name\s*=\s*"([^"]+)"/);
        name = strM ? decodePdxName(Buffer.from(strM[1], 'latin1')) : '未知战争';
      }

      const attackers: string[] = [];
      const defenders: string[] = [];
      const attSec = wt.match(/attackers\s*=\s*\{([^}]+)\}/);
      if (attSec) for (const m of attSec[1].matchAll(/\d+/g)) attackers.push(m[0]);
      const defSec = wt.match(/defenders\s*=\s*\{([^}]+)\}/);
      if (defSec) for (const m of defSec[1].matchAll(/\d+/g)) defenders.push(m[0]);

      const goalM = wt.match(/war_goal\s*=\s*"(\w+)"/);
      const goal = goalM ? goalM[1] : undefined;
      const exhM = wt.match(/exhaustion\s*=\s*([\d.]+)/);
      const exhaustion = exhM ? `${Math.round(parseFloat(exhM[1]) * 100)}%` : undefined;

      list.push({ name: name!, attacker: attackers.join(','), defender: defenders.join(','), goal, exhaustion });
    }
    result.wars_detailed = { active: list.length, list };
  } catch { /* best effort */ }
}

function extractDiplomacy(data: Buffer, result: ParsedSave) {
  try {
    const fedBlock = findSectionBlock(data, 'federation=');
    let fedName: string | undefined;
    let fedSize: number | undefined;
    if (fedBlock) {
      const fedText = fedBlock.subarray(0, 5000).toString('latin1');
      const nameM = fedText.match(/name="([^"]+)"/);
      fedName = nameM ? decodePdxName(Buffer.from(nameM[1], 'latin1')) : undefined;
      const memberCount = (fedText.match(/\n\s*\d+=\s*\{/g) || []).length;
      if (memberCount > 0) fedSize = memberCount;
    }

    // Trade deals
    const tradeBlock = findSectionBlock(data, 'trade_deal=');
    let tradeDeals = 0;
    if (tradeBlock) {
      tradeDeals = (tradeBlock.toString('latin1').match(/\n\s*\d+=\s*\{/g) || []).length;
    }

    // Truces
    const truceBlock = findSectionBlock(data, 'truce=');
    let truces = 0;
    if (truceBlock) {
      truces = (truceBlock.toString('latin1').match(/\n\s*\d+=\s*\{/g) || []).length;
    }

    // Agreements
    const agreeBlock = findSectionBlock(data, 'agreements=');
    let subjects = 0;
    if (agreeBlock) {
      const aText = agreeBlock.toString('latin1');
      subjects = (aText.match(/subject/g) || []).length;
    }

    // Galactic community
    let gcMember = false;
    const gcBlock = findSectionBlock(data, 'galactic_community=');
    if (gcBlock) {
      gcMember = true;
    }

    // Rivals (scan country section)
    let rivals = 0;
    const countryBlock = findSectionBlock(data, 'country=');
    if (countryBlock) {
      rivals = (countryBlock.toString('latin1').match(/\brival\b/g) || []).length;
    }

    result.diplomacy = { federation_name: fedName, federation_size: fedSize, gc_member: gcMember, trade_deals: tradeDeals, truces, rivals, subjects };
  } catch { /* best effort */ }
}

// ===== Phase 3: Story Events & Archaeology =====

function extractFiredEvents(data: Buffer, result: ParsedSave) {
  try {
    const block = findSectionBlock(data, 'fired_event_ids=');
    if (!block) return;
    const text = block.toString('latin1');
    const events: string[] = [];
    // Format: "event.id" (quoted strings, one per line)
    const pattern = /"([\w.]+)"/g;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      if (events.length >= 500) break;
      if (m[1].includes('.')) events.push(m[1]);
    }
    result.fired_events = { total: events.length, recent: events.slice(-200) };
  } catch { /* best effort */ }
}

function extractArchaeology(data: Buffer, result: ParsedSave) {
  try {
    // Corvus v4.x: archaeological_sites = { sites = { 0={...} } }
    const outerBlock = findSectionBlock(data, 'archaeological_sites=');
    if (!outerBlock) return;

    // Find the inner sites={ block
    const sitesIdx = outerBlock.indexOf(Buffer.from('\nsites='));
    let innerBlock = outerBlock;
    if (sitesIdx >= 0) {
      const open = outerBlock.indexOf(0x7b, sitesIdx);
      if (open >= 0) {
        const end = findBlockEnd(outerBlock, open + 1);
        innerBlock = outerBlock.subarray(open + 1, end - 1);
      }
    }

    const text = innerBlock.toString('latin1');
    const sites: { name: string; stage: number; total_stages: number }[] = [];
    const sitePattern = /\n\s*(\d+)=\s*\{/g;
    let sm;
    while ((sm = sitePattern.exec(text)) !== null) {
      if (sites.length >= 20) break;
      const sStart = sm.index + sm[0].lastIndexOf('{');
      const sEnd = findBlockEnd(innerBlock, sStart + 1);
      const st = innerBlock.subarray(sStart + 1, Math.min(sEnd, sStart + 1 + 2000)).toString('latin1');

      const typeM = st.match(/type\s*=\s*"(\w+)"/);
      const siteName = typeM ? typeM[1] : `遗址#${sm[1]}`;

      // Determine current stage from index or completed entries
      const idxM = st.match(/index\s*=\s*(\d+)/);
      const index = idxM ? parseInt(idxM[1]) : 0;

      // completed={ {country=... date=...} ... } count
      const completedMatches = st.match(/\bcountry\s*=\s*\d+/g);
      const completedCount = completedMatches ? completedMatches.length : 0;

      // Total stages from difficulty (approximate) or type lookup
      const diffM = st.match(/difficulty\s*=\s*(\d+)/);
      const difficulty = diffM ? parseInt(diffM[1]) : 0;

      // If there's no index but there are completed entries, use that as stage
      const stage = index > 0 ? index : completedCount;
      const totalStages = difficulty > 0 ? difficulty : (completedCount + 2);

      if (stage >= 0) sites.push({ name: siteName, stage, total_stages: Math.max(totalStages, stage + 1) });
    }
    result.archaeology = { active: sites.length, sites };
  } catch { /* best effort */ }
}

function extractSituations(data: Buffer, result: ParsedSave) {
  try {
    const block = findSectionBlock(data, 'situations=');
    if (!block) return;
    const text = block.toString('latin1');
    const list: { type: string; target?: string; progress?: number }[] = [];
    const sitPattern = /\n\s*(\d+)=\s*\{/g;
    let sm;
    while ((sm = sitPattern.exec(text)) !== null) {
      if (list.length >= 30) break;
      const sStart = sm.index + sm[0].lastIndexOf('{');
      const sEnd = findBlockEnd(block, sStart + 1);
      const st = block.subarray(sStart + 1, Math.min(sEnd, sStart + 1 + 1500)).toString('latin1');

      const typeM = st.match(/situation_type\s*=\s*"(\w+)"/);
      const type = typeM ? typeM[1] : 'unknown';
      const progressM = st.match(/progress\s*=\s*([\d.]+)/);
      const progress = progressM ? Math.round(parseFloat(progressM[1]) * 100) : undefined;
      const targetM = st.match(/target_name\s*=\s*"([^"]+)"/);
      const target = targetM ? targetM[1] : undefined;

      list.push({ type, target, progress });
    }
    result.situations = { count: list.length, list };
  } catch { /* best effort */ }
}

function extractEventTargets(data: Buffer, result: ParsedSave) {
  try {
    const block = findSectionBlock(data, 'saved_event_target=');
    if (!block) return;
    const count = (block.toString('latin1').match(/\n\s*\w+=\s*\{/g) || []).length;
    result.event_targets = { count };
  } catch { /* best effort */ }
}

function extractPlayerEvents(data: Buffer, result: ParsedSave) {
  try {
    const block = findSectionBlock(data, 'player_event=');
    if (!block) return;
    const count = (block.toString('latin1').match(/\n\s*\w+\s*=\s*\{/g) || []).length;
    result.player_choices = { count };
  } catch { /* best effort */ }
}

// ===== Phase 4: Worldbuilding =====

function extractInfrastructure(data: Buffer, result: ParsedSave) {
  try {
    // Sectors
    const secBlock = findSectionBlock(data, 'sectors=');
    let sectors = 0;
    if (secBlock) {
      sectors = (secBlock.toString('latin1').match(/\n\s*\d+=\s*\{/g) || []).length;
    }

    // Buildings
    const buildBlock = findSectionBlock(data, 'buildings=');
    const buildings: Record<string, number> = {};
    if (buildBlock) {
      const bText = buildBlock.subarray(0, 200000).toString('latin1');
      const bm = bText.matchAll(/building\s*=\s*"(\w+)"/g);
      for (const b of bm) {
        buildings[b[1]] = (buildings[b[1]] || 0) + 1;
      }
    }

    // Districts
    const distBlock = findSectionBlock(data, 'districts=');
    let totalDistricts = 0;
    if (distBlock) {
      totalDistricts = (distBlock.toString('latin1').match(/\n\s*\d+=\s*\{/g) || []).length;
    }

    result.infrastructure = { sectors, buildings, total_districts: totalDistricts };
  } catch { /* best effort */ }
}

function extractEspionage(data: Buffer, result: ParsedSave) {
  try {
    const block = findSectionBlock(data, 'espionage_operations=');
    if (!block) { result.espionage = { active_ops: 0 }; return; }
    const count = (block.toString('latin1').match(/\n\s*\d+=\s*\{/g) || []).length;
    result.espionage = { active_ops: count };
  } catch { result.espionage = { active_ops: 0 }; }
}

function extractResolutions(data: Buffer, result: ParsedSave) {
  try {
    const block = findSectionBlock(data, 'resolution=');
    if (!block) { result.resolutions = { passed: 0 }; return; }
    const count = (block.toString('latin1').match(/\n\s*\d+=\s*\{/g) || []).length;
    result.resolutions = { passed: count };
  } catch { result.resolutions = { passed: 0 }; }
}

function extractGroundCombat(data: Buffer, result: ParsedSave) {
  try {
    const block = findSectionBlock(data, 'ground_combat=');
    if (!block) { result.ground_combat = { active_invasions: 0 }; return; }
    const count = (block.toString('latin1').match(/\n\s*\d+=\s*\{/g) || []).length;
    result.ground_combat = { active_invasions: count };
  } catch { result.ground_combat = { active_invasions: 0 }; }
}

function extractMapObjects(data: Buffer, result: ParsedSave) {
  try {
    const goBlock = findSectionBlock(data, 'galactic_object=');
    let systemsOwned = 0;
    if (goBlock) {
      const goText = goBlock.subarray(0, 1000000).toString('latin1');
      systemsOwned = (goText.match(/starbase\s*=/g) || []).length;
    }

    const bypassBlock = findSectionBlock(data, 'bypasses=');
    let gateways = 0, wormholes = 0;
    if (bypassBlock) {
      const bText = bypassBlock.subarray(0, 200000).toString('latin1');
      gateways = (bText.match(/gateway/g) || []).length;
      wormholes = (bText.match(/wormhole/g) || []).length;
    }

    result.map_objects = { systems_owned: systemsOwned, gateways, wormholes };
  } catch { /* best effort */ }
}

// ===== Block finder helper =====

/** Find a top-level section block by key, returning the inner content between braces.
 *  Handles optional whitespace between newline and key (tabs, spaces). */
function findSectionBlock(data: Buffer, key: string): Buffer | null {
  const keyBuf = Buffer.from(key);
  // Search for the key at the start of a line (after \n, possibly with whitespace)
  let pos = 0;
  while (pos < data.length) {
    const idx = data.indexOf(keyBuf, pos);
    if (idx < 0) return null;

    // Check if key is at start of line: previous non-whitespace char should be \n or it's the beginning
    let before = idx - 1;
    while (before >= 0 && (data[before] === 0x20 || data[before] === 0x09)) before--; // skip spaces/tabs
    if (before < 0 || data[before] === 0x0a) {
      // Found at line start — now find the opening brace
      let bracePos = idx + keyBuf.length;
      while (bracePos < data.length && (data[bracePos] === 0x20 || data[bracePos] === 0x09 || data[bracePos] === 0x0a || data[bracePos] === 0x3d)) bracePos++;
      if (bracePos < data.length && data[bracePos] === 0x7b) {
        const end = findBlockEnd(data, bracePos + 1);
        if (end > bracePos) return data.subarray(bracePos + 1, end - 1);
      }
      // Also try: key on one line, { on next line
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
