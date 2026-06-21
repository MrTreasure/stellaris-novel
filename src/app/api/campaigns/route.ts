import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseSaveFile } from '@/lib/parser/save-parser';
import { getCampaigns, createCampaign, getCampaign, insertSave, insertMilestones } from '@/lib/db';
import type { Milestone } from '@/types';

export async function GET() {
  const campaigns = getCampaigns();
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: '请上传存档文件' }, { status: 400 });

    // 保存到临时目录
    const tmpDir = path.join(process.cwd(), 'data', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    // 解析存档
    const parsed = parseSaveFile(tmpPath);

    // 获取或创建战役
    const campaignName = formData.get('campaign_name')?.toString() || `${parsed.empire_name}战役`;
    let campaignId: number | null = null;

    const existingCampaigns = getCampaigns();
    const existing = existingCampaigns.find(c => c.name === campaignName);
    if (existing) {
      campaignId = existing.id;
    } else {
      campaignId = createCampaign(campaignName, '', parsed.game_date, parsed.game_date);
    }

    // 插入存档记录
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
    if (parsed.timeline_events.length > 0) {
      const milestones: Omit<Milestone, 'id'>[] = parsed.timeline_events.map(evt => ({
        save_id: saveId,
        campaign_id: campaignId!,
        event_date: evt.approx_date,
        event_type: evt.category,
        title: evt.event,
        description: '',
        importance: 'major',
        game_key: null,
        raw_flag: null,
        raw_value: null,
      }));
      insertMilestones(milestones);
    }

    // 插入战争记录
    if (parsed.war_history.length > 0) {
      const warMilestones: Omit<Milestone, 'id'>[] = parsed.war_history.map(w => ({
        save_id: saveId,
        campaign_id: campaignId!,
        event_date: w.date,
        event_type: 'war',
        title: w.type === 'war_active' ? '⚔️ 参与战争' : '💔 战败',
        description: `日期: ${w.date}`,
        importance: w.type === 'war_lost' ? 'critical' as const : 'major' as const,
        game_key: null,
        raw_flag: null,
        raw_value: w.date,
      }));
      insertMilestones(warMilestones);
    }

    // 清空临时文件
    fs.unlinkSync(tmpPath);

    return NextResponse.json({
      ok: true,
      campaign_id: campaignId,
      save_id: saveId,
      parsed,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
