import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseSaveFile } from '@/lib/parser/save-parser';
import { createCampaign, getCampaigns, insertSave, insertMilestones, updateCampaignDates, getDb } from '@/lib/db';
import { flagToTitle, loadLocMap } from '@/lib/flags';
import { loadKnownFlags } from '@/lib/noise-filter';
import type { Milestone } from '@/types';

let _locMap: Map<string, string> | null = null;
function getLocMap(db: ReturnType<typeof getDb>): Map<string, string> {
  if (!_locMap) _locMap = loadLocMap(db);
  return _locMap;
}

/** Look up a key in the pre-loaded localisation map, fall back to humanized */
function localizeValue(key: string): string {
  if (!key) return '';
  const locMap = _locMap;
  if (locMap) {
    const found = locMap.get(key.toLowerCase());
    if (found) return found;
    for (const suffix of ['_site', '_dig', '_chain', '_category', '_project']) {
      if (key.endsWith(suffix)) {
        const f2 = locMap.get(key.slice(0, -suffix.length).toLowerCase());
        if (f2) return f2;
      }
    }
  }
  return humanizeKey(key);
}

function humanizeKey(key: string): string {
  if (key === '%SEQ%') return '序列舰队';
  return key
    .replace(/_/g, ' ')
    .replace(/^site /i, '')
    .replace(/^shipclass /i, '')
    .replace(/ CHR /gi, ' ')
    .replace(/\b\w+_[A-Z]+\d+_/g, '')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) || key;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: '请上传存档文件' }, { status: 400 });

    // Validate file
    if (!file.name.endsWith('.sav')) return NextResponse.json({ error: '仅支持 .sav 格式的存档文件' }, { status: 400 });
    if (file.size > 200 * 1024 * 1024) return NextResponse.json({ error: '存档文件过大 (最大 200MB)' }, { status: 400 });

    // Save to temp (sanitize filename to prevent path traversal)
    const safeName = path.basename(file.name.replace(/[^a-zA-Z0-9_.-]/g, '_'));
    const tmpDir = path.join(process.cwd(), 'data', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    // Pre-load known flags from event graph for whitelist-based noise filtering
    const db = getDb();
    loadKnownFlags(db);
    loadLocMap(db);

    try {
      // 解析
      const parsed = parseSaveFile(tmpPath);

      // 创建或找战役
      const campaignName = formData.get('campaign_name')?.toString() || `${parsed.empire_name}战役`;
      let campaignId: number | null = null;
      const existing = getCampaigns().find(c => c.name === campaignName);
      if (existing) {
        campaignId = existing.id;
      } else {
        campaignId = createCampaign(campaignName, '', parsed.game_date, parsed.game_date);
      }

      // 插入存档
      const saveId = insertSave({
        campaign_id: campaignId,
        filename: file.name,
      game_date: parsed.game_date,
      empire_name: parsed.empire_name,
      empire_size: parsed.stats['empire_size'] || null,
      military_power: parsed.stats['military_power'] || null,
      tech_power: parsed.stats['tech_power'] || null,
      victory_rank: parsed.stats['victory_rank'] || null,
      authority: parsed.empire_info.authority || null,
      ethics: JSON.stringify(parsed.empire_info.ethics || []),
      civics: JSON.stringify(parsed.empire_info.civics || []),
      origin: parsed.empire_info.origin || null,
      species_name: parsed.empire_info.species_name || null,
      species_traits: JSON.stringify(parsed.empire_info.traits || []),
      raw_json: JSON.stringify(parsed),
      fleet_power: parsed.fleets?.total_power || null,
      total_pops: parsed.population?.total || null,
      num_colonies: parsed.planets?.colonized || null,
      active_wars: parsed.wars_detailed?.active || null,
    });

    // 更新战役日期范围
    updateCampaignDates(campaignId!, parsed.game_date);

    // 查询已有里程碑做跨存档去重
    const existingKeys = new Set(
      (db.prepare('SELECT event_date, raw_flag FROM milestones WHERE campaign_id = ?').all(campaignId!) as { event_date: string; raw_flag: string | null }[])
        .map(r => `${r.raw_flag || ''}_${r.event_date}`)
    );

    // 插入里程碑
    const seenKeys = new Set<string>();
    const allMilestones: Omit<Milestone, 'id'>[] = [];
    for (const evt of parsed.timeline_events) {
      const dedupKey = `${evt.event}_${evt.approx_date}`;
      if (seenKeys.has(dedupKey) || existingKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);
      allMilestones.push({
        save_id: saveId, campaign_id: campaignId!, event_date: evt.approx_date,
        event_type: evt.category, title: flagToTitle(evt.event), description: '', importance: 'major',
        game_key: (evt as any).key || null, raw_flag: evt.event, raw_value: null,
      });
    }
    for (const w of parsed.war_history) {
      allMilestones.push({
        save_id: saveId, campaign_id: campaignId!, event_date: w.date,
        event_type: 'war', title: formatWarTitle(w),
        description: '', importance: w.type === 'war_lost' ? 'critical' : 'major',
        game_key: null, raw_flag: 'war', raw_value: JSON.stringify(w),
      });
    }
    if (parsed.colonies) {
      for (const c of parsed.colonies) {
        const dk = `colony_${c.name}`;
        if (seenKeys.has(dk) || existingKeys.has(dk)) continue;
        seenKeys.add(dk);
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!,
          event_date: c.year > 0 ? c.year.toString() : parsed.game_date,
          event_type: 'colonization',
          title: `🌍 殖民 ${localizeValue(c.name)}`, description: '',
          importance: 'major', game_key: 'colony_founded', raw_flag: 'colony', raw_value: c.name,
        });
      }
    }
    // Tech milestones from hardcoded list
    const techSeen = new Set<string>();
    if (parsed.key_technologies) {
      for (const t of parsed.key_technologies) {
        const dk = `tech_${t.id}`;
        if (seenKeys.has(dk) || existingKeys.has(dk)) continue;
        seenKeys.add(dk); techSeen.add(t.id);
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: parsed.game_date,
          event_type: 'technology', title: `🔬 获得关键科技: ${t.description}`,
          description: '', importance: 'major', game_key: t.id, raw_flag: 'technology', raw_value: t.id,
        });
      }
    }
    // Broader tech detection: scan flags against game_techs table
    try {
      const allTechFlags = parsed.rawFlags?.filter(f => f.name.startsWith('tech_')) || [];
      for (const tf of allTechFlags) {
        if (techSeen.has(tf.name)) continue;
        const techRow = db.prepare('SELECT id, tier, area FROM game_techs WHERE id = ?').get(tf.name) as { id: string; tier: number; area: string } | undefined;
        if (!techRow) continue;
        const locRow = db.prepare('SELECT zh_name FROM game_data WHERE key = ?').get(tf.name) as { zh_name?: string } | undefined;
        const dk = `tech_${tf.name}`;
        if (seenKeys.has(dk) || existingKeys.has(dk)) continue;
        seenKeys.add(dk); techSeen.add(tf.name);
        const techYear = Math.round(2200 + (tf.tick - 62800000) / 8350).toString();
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: techYear,
          event_type: 'technology', title: `🔬 研究完成: ${locRow?.zh_name || tf.name} (T${techRow.tier} ${techRow.area})`,
          description: '', importance: techRow.tier >= 4 ? 'critical' : 'major',
          game_key: tf.name, raw_flag: tf.name, raw_value: null,
        });
      }
    } catch { /* game_techs might not be loaded */ }
    // Enriched milestones — fleet & population (snapshot data, no individual date)
    if (parsed.fleets?.notable) {
      for (const f of parsed.fleets.notable.slice(0, 5)) {
        const dk = `fleet_${f.name}`;
        if (seenKeys.has(dk) || existingKeys.has(dk)) continue;
        seenKeys.add(dk);
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: '',
          event_type: 'military', title: `🚢 舰队: ${localizeValue(f.name)} (${f.ships}舰, 战力${f.power.toLocaleString()})`,
          description: '', importance: 'info', game_key: 'fleet', raw_flag: 'fleet', raw_value: f.name,
        });
      }
    }
    // Enriched milestones — leaders (snapshot)
    if (parsed.leaders?.top) {
      for (const l of parsed.leaders.top) {
        const dk = `leader_${l.name}`;
        if (seenKeys.has(dk) || existingKeys.has(dk)) continue;
        seenKeys.add(dk);
        const classLabel: Record<string, string> = { scientist: '科学家', admiral: '提督', general: '将军', governor: '总督', ruler: '统治者', official: '官员', commander: '指挥官' };
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: '',
          event_type: 'leader', title: `⭐ ${classLabel[l.class] || l.class}: ${localizeValue(l.name)} (${l.level}级)`,
          description: l.traits.join(', '), importance: 'info', game_key: 'leader', raw_flag: `leader_${l.class}`, raw_value: l.name,
        });
      }
    }
    // Enriched milestones — archaeology
    if (parsed.archaeology?.sites) {
      for (const a of parsed.archaeology.sites) {
        const dk = `archaeology_${a.name}`;
        if (seenKeys.has(dk) || existingKeys.has(dk)) continue;
        seenKeys.add(dk);
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: '',
          event_type: 'exploration', title: `🏺 考古: ${localizeValue(a.name)} (阶段${a.stage}/${a.total_stages})`,
          description: '', importance: 'info', game_key: 'archaeology', raw_flag: 'archaeology', raw_value: a.name,
        });
      }
    }
    // Enriched milestones — situations (snapshot)
    if (parsed.situations?.list) {
      for (const s of parsed.situations.list) {
        const dk = `situation_${s.type}`;
        if (seenKeys.has(dk) || existingKeys.has(dk)) continue;
        seenKeys.add(dk);
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: '',
          event_type: 'event', title: `📋 局势: ${localizeValue(s.type)}${s.progress ? ` (${s.progress}%)` : ''}`,
          description: s.target || '', importance: 'info', game_key: 'situation', raw_flag: s.type, raw_value: s.target || null,
        });
      }
    }
    // Enriched milestones — diplomacy (snapshot)
    if (parsed.diplomacy?.federation_name) {
      const dk = `federation_${parsed.diplomacy.federation_name}`;
      if (!seenKeys.has(dk) && !existingKeys.has(dk)) {
        seenKeys.add(dk);
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: '',
          event_type: 'diplomacy', title: `🤝 联邦: ${parsed.diplomacy.federation_name} (${parsed.diplomacy.federation_size || '?'}成员)`,
          description: '', importance: 'critical', game_key: 'federation', raw_flag: 'federation', raw_value: parsed.diplomacy.federation_name,
        });
      }
    }
    if (parsed.diplomacy?.gc_member) {
      const dk = 'galactic_community_member';
      if (!seenKeys.has(dk) && !existingKeys.has(dk)) {
        seenKeys.add(dk);
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: '',
          event_type: 'diplomacy', title: '🌐 星海共同体成员', description: `贸易协定: ${parsed.diplomacy.trade_deals}, 附庸: ${parsed.diplomacy.subjects}`,
          importance: 'major', game_key: 'galactic_community', raw_flag: 'galactic_community', raw_value: null,
        });
      }
    }
    if (allMilestones.length > 0) insertMilestones(allMilestones);

    return NextResponse.json({ ok: true, campaign_id: campaignId, save_id: saveId, parsed });
    } catch (e: any) {
      return NextResponse.json({ error: '存档解析失败，请检查文件完整性' }, { status: 500 });
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  } catch (e: any) {
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

function formatWarTitle(war: { type: string; role?: string; opponent?: string; war_goal?: string }) {
  const action = war.type === 'war_lost' ? '战败于' : war.role === 'attacker' ? '向' : '遭到';
  const ending = war.type === 'war_lost' ? '' : war.role === 'attacker' ? '宣战' : '宣战';
  const opponent = war.opponent || '未知帝国';
  const goal = war.war_goal ? `，战争目标：${war.war_goal}` : '';
  return `${action}${opponent}${ending}${goal}`;
}
