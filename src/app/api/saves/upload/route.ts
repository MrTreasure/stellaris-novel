import { NextRequest, NextResponse } from 'next/server';
import { parseSaveBuffer } from '@/lib/parser/save-parser';
import {
  createCampaign,
  getCampaigns,
  insertSave,
  insertMilestones,
  updateCampaignDates,
  getDb,
} from '@/lib/db';
import { buildChronicleMilestones } from '@/lib/chronicle-builder';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: '请上传存档文件' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.sav')) {
      return NextResponse.json({ error: '仅支持 .sav 格式的存档文件' }, { status: 400 });
    }
    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json({ error: '存档文件过大 (最大 200MB)' }, { status: 400 });
    }

    const db = getDb();
    const parsed = parseSaveBuffer(Buffer.from(await file.arrayBuffer()));
    const campaignName = formData.get('campaign_name')?.toString() || `${parsed.empire_name}战役`;
    const existingCampaign = getCampaigns().find(campaign => campaign.name === campaignName);
    const campaignId = existingCampaign?.id
      ?? createCampaign(campaignName, '', parsed.game_date, parsed.game_date);

    const saveId = insertSave({
      campaign_id: campaignId,
      filename: file.name,
      game_date: parsed.game_date,
      empire_name: parsed.empire_name,
      empire_size: parsed.stats.empire_size || null,
      military_power: parsed.stats.military_power || null,
      tech_power: parsed.stats.tech_power || null,
      victory_rank: parsed.stats.victory_rank || null,
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

    updateCampaignDates(campaignId, parsed.game_date);
    const existingMilestones = db.prepare(
      'SELECT event_date, raw_flag, raw_value, game_key FROM milestones WHERE campaign_id = ?',
    ).all(campaignId) as {
      event_date: string;
      raw_flag: string | null;
      raw_value: string | null;
      game_key: string | null;
    }[];
    const milestones = buildChronicleMilestones(
      db,
      parsed,
      saveId,
      campaignId,
      existingMilestones,
    );
    if (milestones.length > 0) insertMilestones(milestones);

    return NextResponse.json({
      ok: true,
      campaign_id: campaignId,
      save_id: saveId,
      milestones_added: milestones.filter(milestone => milestone.relevance === 'include').length,
      context_events_added: milestones.filter(milestone => milestone.relevance === 'context').length,
      parsed,
    });
  } catch {
    return NextResponse.json({ error: '存档解析失败，请检查文件完整性' }, { status: 500 });
  }
}
