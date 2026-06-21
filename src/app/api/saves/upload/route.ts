import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseSaveFile } from '@/lib/parser/save-parser';
import { createCampaign, getCampaigns, insertSave, insertMilestones } from '@/lib/db';
import { flagToTitle } from '@/lib/flags';
import type { Milestone } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: '请上传存档文件' }, { status: 400 });

    // 保存临时文件
    const tmpDir = path.join(process.cwd(), 'data', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

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

    // 插入里程碑
    const seenKeys = new Set<string>();
    const allMilestones: Omit<Milestone, 'id'>[] = [];
    for (const evt of parsed.timeline_events) {
      const dedupKey = `${evt.event}_${evt.approx_date}`;
      if (seenKeys.has(dedupKey)) continue;
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
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!,
          event_date: c.year.toString(), event_type: 'colonization',
          title: `🌍 殖民 ${c.name}`, description: '',
          importance: 'major', game_key: 'colony_founded', raw_flag: 'colony', raw_value: c.name,
        });
      }
    }
    // Enriched milestones — fleet & population
    if (parsed.fleets?.notable) {
      for (const f of parsed.fleets.notable.slice(0, 5)) {
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: parsed.game_date,
          event_type: 'military', title: `🚢 舰队: ${f.name} (${f.ships}舰, 战力${f.power.toLocaleString()})`,
          description: '', importance: 'major', game_key: 'fleet', raw_flag: 'fleet', raw_value: f.name,
        });
      }
    }
    // Enriched milestones — leaders
    if (parsed.leaders?.top) {
      for (const l of parsed.leaders.top) {
        const classLabel: Record<string, string> = { scientist: '科学家', admiral: '提督', general: '将军', governor: '总督', ruler: '统治者', official: '官员', commander: '指挥官' };
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: parsed.game_date,
          event_type: 'leader', title: `⭐ ${classLabel[l.class] || l.class}: ${l.name} (${l.level}级)`,
          description: l.traits.join(', '), importance: l.level >= 8 ? 'critical' : 'major',
          game_key: 'leader', raw_flag: `leader_${l.class}`, raw_value: l.name,
        });
      }
    }
    // Enriched milestones — archaeology
    if (parsed.archaeology?.sites) {
      for (const a of parsed.archaeology.sites) {
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: parsed.game_date,
          event_type: 'exploration', title: `🏺 考古: ${a.name} (阶段${a.stage}/${a.total_stages})`,
          description: '', importance: 'major', game_key: 'archaeology', raw_flag: 'archaeology', raw_value: a.name,
        });
      }
    }
    // Enriched milestones — situations
    if (parsed.situations?.list) {
      for (const s of parsed.situations.list) {
        allMilestones.push({
          save_id: saveId, campaign_id: campaignId!, event_date: parsed.game_date,
          event_type: 'event', title: `📋 局势: ${s.type}${s.progress ? ` (${s.progress}%)` : ''}`,
          description: s.target || '', importance: 'major', game_key: 'situation', raw_flag: s.type, raw_value: s.target || null,
        });
      }
    }
    // Enriched milestones — diplomacy
    if (parsed.diplomacy?.federation_name) {
      allMilestones.push({
        save_id: saveId, campaign_id: campaignId!, event_date: parsed.game_date,
        event_type: 'diplomacy', title: `🤝 联邦: ${parsed.diplomacy.federation_name} (${parsed.diplomacy.federation_size || '?'}成员)`,
        description: '', importance: 'critical', game_key: 'federation', raw_flag: 'federation', raw_value: parsed.diplomacy.federation_name,
      });
    }
    if (parsed.diplomacy?.gc_member) {
      allMilestones.push({
        save_id: saveId, campaign_id: campaignId!, event_date: parsed.game_date,
        event_type: 'diplomacy', title: '🌐 星海共同体成员', description: `贸易协定: ${parsed.diplomacy.trade_deals}, 附庸: ${parsed.diplomacy.subjects}`,
        importance: 'major', game_key: 'galactic_community', raw_flag: 'galactic_community', raw_value: null,
      });
    }
    if (allMilestones.length > 0) insertMilestones(allMilestones);

    // 清理
    fs.unlinkSync(tmpPath);

    return NextResponse.json({ ok: true, campaign_id: campaignId, save_id: saveId, parsed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function formatWarTitle(war: { type: string; role?: string; opponent?: string; war_goal?: string }) {
  const action = war.type === 'war_lost' ? '战败于' : war.role === 'attacker' ? '向' : '遭到';
  const ending = war.type === 'war_lost' ? '' : war.role === 'attacker' ? '宣战' : '宣战';
  const opponent = war.opponent || '未知帝国';
  const goal = war.war_goal ? `，战争目标：${war.war_goal}` : '';
  return `${action}${opponent}${ending}${goal}`;
}
