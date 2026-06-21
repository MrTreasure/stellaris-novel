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
