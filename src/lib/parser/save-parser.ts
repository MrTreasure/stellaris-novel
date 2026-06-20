// 群星存档解析器 — 纯 TypeScript/Buffer 实现
// 解析 .sav 文件 (ZIP) 中的 PDS 格式游戏状态

import AdmZip from 'adm-zip';
import type { ParsedSave } from '@/types';

// ===== 工具函数 =====

function decodePdxName(buf: Buffer): string {
  // PDS 存档中 UTF-8 中文被当作 Latin-1 存储,需要双重解码
  try {
    const latin1 = buf.toString('latin1');
    return Buffer.from(latin1, 'latin1').toString('utf8');
  } catch {
    return buf.toString('utf8');
  }
}

function findKeyValue(data: Buffer, key: string, start = 0, end?: number): { value: Buffer | string | null; newPos: number } {
  if (end === undefined) end = data.length;
  const keyBuf = Buffer.from(key);
  const pos = data.indexOf(keyBuf, start);
  if (pos === -1 || pos >= end) return { value: null, newPos: start };

  let p = pos + keyBuf.length;
  // 跳过空白
  while (p < end && Buffer.from(' \t\n\r').includes(data[p])) p++;
  // 跳过 =
  if (p < end && data[p] === 61) p++; // '='
  while (p < end && Buffer.from(' \t\n\r').includes(data[p])) p++;
  if (p >= end) return { value: null, newPos: p };

  const c = data[p];
  if (c === 0x22) {
    // 引号字符串: "..."
    const endQuote = data.indexOf(0x22, p + 1);
    if (endQuote === -1 || endQuote >= end) return { value: null, newPos: p };
    const raw = data.subarray(p + 1, endQuote);
    return { value: decodePdxName(raw), newPos: endQuote + 1 };
  } else if ((c >= 0x30 && c <= 0x39) || c === 0x2d) {
    // 数字
    let ep = p;
    while (ep < end && Buffer.from('0123456789.-').includes(data[ep])) ep++;
    return { value: data.subarray(p, ep).toString('ascii'), newPos: ep };
  } else if (c === 0x7b) {
    // 括号块 {...}
    let depth = 1;
    let ep = p + 1;
    while (ep < end && depth > 0) {
      if (data[ep] === 0x7b) depth++;
      else if (data[ep] === 0x7d) depth--;
      ep++;
    }
    return { value: data.subarray(p, ep), newPos: ep };
  } else {
    // token (yes/no/标识符)
    let ep = p;
    while (ep < end && !Buffer.from(' \t\n\r}{=').includes(data[ep])) ep++;
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
    if (!Buffer.from(' \t\n\r{').includes(before)) {
      pos = idx + keyBuf.length;
      continue;
    }
    const r = findKeyValue(data, key, idx, end);
    if (r.value !== null) results.push({ value: r.value, pos: idx, newPos: r.newPos });
    pos = Math.max(idx + keyBuf.length, r.newPos > idx ? r.newPos : idx + 1);
  }
  return results;
}

function findBlockEnd(data: Buffer, start: number): number {
  let depth = 1;
  let pos = start;
  while (pos < data.length && depth > 0) {
    if (data[pos] === 0x7b) depth++;
    else if (data[pos] === 0x7d) depth--;
    pos++;
  }
  return pos;
}

// ===== 主解析函数 =====

export function parseSaveFile(filePath: string): ParsedSave {
  const zip = new AdmZip(filePath);

  // 读取元数据
  const metaEntry = zip.getEntry('meta');
  if (!metaEntry) throw new Error('存档文件缺少 meta 数据');
  const metaText = metaEntry.getData().toString('utf8');

  const metaInfo: Record<string, string> = {};
  for (const line of metaText.split('\n')) {
    const m = line.match(/(\w+)="([^"]+)"/);
    if (m) metaInfo[m[1]] = m[2];
  }

  // 读取游戏状态
  const gsEntry = zip.getEntry('gamestate');
  if (!gsEntry) throw new Error('存档文件缺少 gamestate');
  const data = gsEntry.getData();

  const gameDate = metaInfo['date'] || '?';
  let empireName = metaInfo['name'] || '?';
  // meta has proper UTF-8; if it's broken latin1, fix it
  if (/[Ã©Ã¨]/.test(empireName)) {
    try { empireName = Buffer.from(empireName, 'latin1').toString('utf8'); } catch {}
  }

  // 解析结果
  const result: ParsedSave = {
    game_date: gameDate,
    empire_name: empireName,
    empire_info: {},
    stats: {},
    diplomatic: {},
    timeline_events: [],
    crisis_encounters: [],
    key_technologies: [],
    megastructures: [],
    war_history: [],
  };

  // 定位玩家国家 section
  const { csPos, cePos } = findPlayerCountry(data);
  const searchStart = csPos ?? 0;
  const searchEnd = cePos ?? data.length;

  // 提取实力统计
  extractStats(data, searchStart, searchEnd, result);

  // 提取帝国信息
  extractEmpireInfo(data, result);

  // 提取 flags (事件)
  extractFlags(data, csPos, cePos, result);

  // 提取危机
  extractCrises(data, result);

  // 提取科技
  extractTechnologies(data, result);

  // 提取巨型结构
  extractMegastructures(data, result);

  // 提取战争记录
  extractWars(data, searchStart, searchEnd, result);

  return result;
}

// ===== 国家 section 定位 =====

function findPlayerCountry(data: Buffer): { csPos: number | null; cePos: number | null } {
  // 找 player={ 中的 country=id
  const playerPos = data.indexOf(Buffer.from('player={'));
  let playerCountryId = '0';
  if (playerPos >= 0) {
    const playerSection = data.subarray(playerPos, playerPos + 200).toString('ascii');
    const m = playerSection.match(/country\s*=\s*(\d+)/);
    if (m) playerCountryId = m[1];
  }

  // 找 country={ 外层
  let countrySec = data.indexOf(Buffer.from('\ncountry={'));
  if (countrySec < 0) countrySec = data.indexOf(Buffer.from('country={'));
  if (countrySec < 0) return { csPos: null, cePos: null };

  const countryBlockStart = data.indexOf(Buffer.from('{'), countrySec + 8);
  if (countryBlockStart < 0) return { csPos: null, cePos: null };

  const countryBlockEnd = findBlockEnd(data, countryBlockStart + 1);

  // 在 country block 内搜索玩家国家 ID
  const cidBytes = Buffer.from(playerCountryId + '={');
  let pos = countryBlockStart;
  while (pos < countryBlockEnd) {
    const idx = data.indexOf(cidBytes, pos);
    if (idx === -1 || idx >= countryBlockEnd) break;
    // 确保前面是空白
    if (idx > 0 && !Buffer.from(' \t\n\r').includes(data[idx - 1])) {
      pos = idx + cidBytes.length;
      continue;
    }
    // 找到块开始
    const bracePos = idx + cidBytes.length - 2; // 跳过 "={"
    const sectStart = data.indexOf(Buffer.from('{'), bracePos);
    if (sectStart < 0) break;
    const sectEnd = findBlockEnd(data, sectStart + 1);

    // 验证是 country (含 graphical_culture 或 flags + tech_status)
    const check = data.subarray(idx, sectEnd).toString('ascii');
    if (check.includes('graphical_culture') || (check.includes('flags={') && check.includes('tech_status'))) {
      return { csPos: idx, cePos: sectEnd };
    }
    pos = sectEnd;
  }
  return { csPos: null, cePos: null };
}

// ===== 实力统计 =====

function extractStats(data: Buffer, searchStart: number, searchEnd: number, result: ParsedSave) {
  const keys = ['empire_size', 'military_power', 'tech_power', 'economic_power', 'victory_rank', 'num_owned_planets', 'naval_cap'];
  for (const key of keys) {
    const r = findKeyValue(data, key, searchStart, searchEnd);
    if (r.value !== null && typeof r.value === 'string') {
      const num = parseFloat(r.value);
      if (!isNaN(num)) result.stats[key] = Math.round(num);
    }
  }

  // 如果没找到,全文件搜索
  if (Object.keys(result.stats).length === 0) {
    for (const key of keys) {
      const r = findKeyValue(data, key, 0, Math.floor(data.length / 3));
      if (r.value !== null && typeof r.value === 'string') {
        const num = parseFloat(r.value);
        if (!isNaN(num)) result.stats[key] = Math.round(num);
      }
    }
  }
}

// ===== 帝国信息 =====

function extractEmpireInfo(data: Buffer, result: ParsedSave) {
  // 物种信息
  const speciesSec = data.indexOf(Buffer.from('species={'));
  if (speciesSec >= 0) {
    const chunkEnd = Math.min(speciesSec + 3000, data.length);
    const chunk = data.subarray(speciesSec, chunkEnd);

    const classR = findKeyValue(chunk, 'class');
    if (classR.value && typeof classR.value === 'string') result.empire_info.species_class = classR.value;

    const portraitR = findKeyValue(chunk, 'portrait');
    if (portraitR.value && typeof portraitR.value === 'string') result.empire_info.species_portrait = portraitR.value;

    // 找物种名(跳过 name_list)
    const nameMatches = [...chunk.toString('ascii').matchAll(/name="([^"]+)"/g)];
    for (const nm of nameMatches) {
      const val = nm[1];
      if (!/HUMAN\d?|REP\d?|MAM\d?|FUN\d?|MOL\d?|AVI\d?/.test(val) && val.length > 1) {
        result.empire_info.species_name = decodePdxName(Buffer.from(val, 'latin1'));
        break;
      }
    }

    // 特质
    const traitSec = chunk.indexOf(Buffer.from('traits={'));
    if (traitSec >= 0) {
      const traitEnd = chunk.indexOf(Buffer.from('}'), traitSec);
      const traits: string[] = [];
      for (const m of chunk.subarray(traitSec, traitEnd).toString('ascii').matchAll(/trait="([^"]+)"/g)) {
        traits.push(m[1]);
      }
      if (traits.length > 0) result.empire_info.traits = traits;
    }
  }

  // 政体/伦理/理念/起源
  for (const key of ['authority', 'origin']) {
    const r = findKeyValue(data, key, 0, 50000);
    if (r.value && typeof r.value === 'string') result.empire_info[key as 'authority' | 'origin'] = r.value;
  }

  const ethics = new Set<string>();
  for (const r of findAllValues(data, 'ethic', 0, 50000)) {
    if (typeof r.value === 'string' && r.value.startsWith('ethic_')) ethics.add(r.value);
  }
  if (ethics.size > 0) result.empire_info.ethics = [...ethics];

  const civics = new Set<string>();
  for (const r of findAllValues(data, 'civic', 0, 50000)) {
    if (typeof r.value === 'string' && r.value !== 'none') civics.add(r.value);
  }
  if (civics.size > 0) result.empire_info.civics = [...civics];

  // 外交
  if (data.subarray(0, 500000).includes(Buffer.from('federation'))) {
    result.diplomatic.in_federation = true;
  }
  if (data.includes(Buffer.from('galactic_community'))) {
    result.diplomatic.in_galactic_community = true;
  }
}

// ===== Flags 事件提取 =====

function extractFlags(data: Buffer, csPos: number | null, cePos: number | null, result: ParsedSave) {
  const flagEvents: Record<string, { title: string; category: string }> = {
    first_colony: { title: '🏗️ 建立第一个外星殖民地', category: 'colonization' },
    encountered_first_wormhole: { title: '🌀 首次遭遇虫洞', category: 'exploration' },
    has_won_war: { title: '⚔️ 赢得关键战争', category: 'war' },
    has_conquer_other_homeworld: { title: '💀 征服异族母星', category: 'war' },
    built_dyson_sphere: { title: '⭐ 戴森球开始建造', category: 'megastructure' },
    started_first_dyson_sphere: { title: '⭐ 戴森球工程启动', category: 'megastructure' },
    finished_dyson_sphere: { title: '🌟 戴森球竣工!', category: 'megastructure' },
    finished_think_tank: { title: '🧠 科学枢纽竣工!', category: 'megastructure' },
    archaeologist_achievement: { title: '🏺 考古学成就达成', category: 'exploration' },
    exotic_gases_found: { title: '💨 发现奇异气体资源', category: 'exploration' },
    no_machine_uprising: { title: '🤖 机械叛乱被成功压制', category: 'crisis' },
    first_contact_event: { title: '👽 首次外星接触', category: 'diplomacy' },
    encountered_first_lgate: { title: '🌌 发现L星门', category: 'exploration' },
    colossus_project: { title: '☄️ 启动巨像计划', category: 'military' },
  };

  const searchTargets = csPos !== null && cePos !== null
    ? [{ label: 'country', start: csPos, end: cePos }]
    : [{ label: 'full', start: 0, end: data.length }];

  for (const target of searchTargets) {
    // 在 section 中找 flags={...}
    const flagsPos = data.indexOf(Buffer.from('flags={'), target.start);
    if (flagsPos < 0 || flagsPos >= target.end) continue;
    const flagsEnd = findBlockEnd(data, flagsPos + 6);
    if (flagsEnd > target.end) continue;
    const flagsSection = data.subarray(flagsPos, flagsEnd);

    for (const [flagKey, info] of Object.entries(flagEvents)) {
      const r = findKeyValue(flagsSection, flagKey);
      if (r.value !== null && typeof r.value === 'string' && r.value !== '0') {
        const tick = parseInt(r.value);
        if (!isNaN(tick) && tick > 60000000) {
          // PDS flag timestamp format: ~3M ticks span ~360 game years
          // Map: tick → year using linear interpolation
          const tickBase = 62800000;
          const year = Math.round(2200 + (tick - tickBase) / 8350);
          result.timeline_events.push({
            event: info.title,
            category: info.category,
            approx_date: year.toString(),
          });
        }
      }
    }
    break; // 只处理第一个找到的 flags section
  }
}

// ===== 危机 =====

function extractCrises(data: Buffer, result: ParsedSave) {
  const crisisMap: Record<string, string> = {
    great_khan: '大汗崛起 - 银河掠夺者部族被统一',
    gray_goo: '灰蛊风暴 - L星团纳米机器人大军涌出',
    awakened_empire: '堕落帝国觉醒 - 古老帝国重新扩张',
    war_in_heaven: '天堂之战 - 两个觉醒帝国全面战争',
    prethoryn: '普雷索林虫群 - 银河外生物入侵',
    unbidden: '破界者入侵 - 异次元入侵者降临',
    contingency: '肃正协议 - 古代AI觉醒',
    worm_in_waiting: '等待之虫 - 黑洞中的神秘存在',
  };

  for (const [id, desc] of Object.entries(crisisMap)) {
    if (data.includes(Buffer.from(id))) {
      result.crisis_encounters.push({ id, description: desc });
    }
  }
}

// ===== 科技 =====

function extractTechnologies(data: Buffer, result: ParsedSave) {
  const techMap: Record<string, string> = {
    tech_titans: '泰坦科技',
    tech_colossus: '巨像科技',
    tech_mega_engineering: '巨型工程',
    tech_juggernaut: '主宰科技',
    tech_gateway_construction: '星门建造',
    tech_jump_drive_1: '跃迁引擎',
    tech_psi_jump_drive_1: '灵能跃迁引擎',
    tech_synthetics: '合成人科技',
    tech_synthetic_workers: '合成工人',
    tech_droids: '机器人科技',
    tech_zero_point_power: '零点能源',
    tech_habitat_1: '轨道居住站I',
    tech_habitat_2: '轨道居住站II',
    tech_habitat_3: '轨道居住站III',
  };

  for (const [id, desc] of Object.entries(techMap)) {
    if (data.includes(Buffer.from(id))) {
      result.key_technologies.push({ id, description: desc });
    }
  }
}

// ===== 巨型结构 =====

function extractMegastructures(data: Buffer, result: ParsedSave) {
  const megaMap: Record<string, { name: string; status: string }> = {
    built_dyson_sphere: { name: '戴森球', status: 'built' },
    finished_dyson_sphere: { name: '戴森球', status: 'completed' },
    started_first_dyson_sphere: { name: '戴森球', status: 'started' },
    finished_think_tank: { name: '科学枢纽', status: 'completed' },
    built_matter_decompressor: { name: '物质解压器', status: 'built' },
    built_sentry_array: { name: '哨兵阵列', status: 'built' },
    built_mega_shipyard: { name: '巨型船坞', status: 'built' },
  };

  for (const [flag, info] of Object.entries(megaMap)) {
    if (data.includes(Buffer.from(flag))) {
      result.megastructures.push(info);
    }
  }
}

// ===== 战争记录 =====

function extractWars(data: Buffer, searchStart: number, searchEnd: number, result: ParsedSave) {
  // 搜索整个文件 (每个国家各有一条 war 记录,玩家帝国section内只有一条是不够的)
  const end = Math.min(data.length, searchEnd * 2);
  const seen = new Set<string>();

  for (const r of findAllValues(data, 'last_date_at_war', 0, end)) {
    if (typeof r.value === 'string' && r.value !== '1.01.01' && r.value !== '2200.01.01' && r.value !== '2201.01.01') {
      const key = `${r.value}_active`;
      if (!seen.has(key)) {
        seen.add(key);
        result.war_history.push({ date: r.value, type: 'war_active' });
      }
    }
  }
  for (const r of findAllValues(data, 'last_date_war_lost', 0, end)) {
    if (typeof r.value === 'string' && r.value !== '1.01.01' && r.value !== '2200.01.01') {
      const key = `${r.value}_lost`;
      if (!seen.has(key)) {
        seen.add(key);
        result.war_history.push({ date: r.value, type: 'war_lost' });
      }
    }
  }
  // 去重 + 排序
  result.war_history = [...new Map(result.war_history.map(w => [w.date + w.type, w])).values()];
  result.war_history.sort((a, b) => a.date.localeCompare(b.date));
}
