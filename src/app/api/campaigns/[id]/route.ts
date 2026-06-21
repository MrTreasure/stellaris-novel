import { NextRequest, NextResponse } from 'next/server';
import { getCampaign, getSaves, getMilestones, getChapters, getNovels, getAllEventChains, getEventChainNodes } from '@/lib/db';
import { getDb } from '@/lib/db';
import { localizeMilestoneTitle } from '@/lib/flags';
import { detectEventChains, type SaveEvidence } from '@/lib/event-chain-detector';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = parseInt(id);
  if (isNaN(campaignId)) return NextResponse.json({ error: '无效的战役ID' }, { status: 400 });

  const campaign = getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: '战役不存在' }, { status: 404 });

  const saves = getSaves(campaignId);
  const db = getDb();
  const milestones = getMilestones(campaignId).map(milestone => ({
    ...milestone,
    title: localizeMilestoneTitle(milestone.raw_flag, milestone.title, db),
  }));
  const eventTypes: Record<string, number> = {};
  for (const m of milestones) {
    eventTypes[m.event_type] = (eventTypes[m.event_type] || 0) + 1;
  }

  // Build event chain evidence from milestones + enriched save data
  const latestSave = saves[saves.length - 1];
  let rawParsed: any = null;
  if (latestSave?.raw_json) {
    try { rawParsed = JSON.parse(latestSave.raw_json); } catch {}
  }

  const evidence: SaveEvidence = {
    countryFlags: new Set<string>(),
    globalFlags: new Set<string>(),
    planetFlags: new Set<string>(),
    starFlags: new Set<string>(),
    completedAnomalies: [],
    activeProjects: [],
    completedProjects: [],
    archaeologySites: [],
    firedEvents: [],
    milestoneFlags: milestones.map(m => ({ flag: m.raw_flag || '', date: m.event_date })),
  };

  for (const m of milestones) {
    const flag = m.raw_flag || '';
    if (!flag) continue;
    if (flag.startsWith('global_') || flag.includes('global_flag')) {
      evidence.globalFlags.add(flag);
    } else {
      evidence.countryFlags.add(flag);
    }
    if (flag.match(/\.\d+$/)) {
      evidence.firedEvents.push(flag);
    }
    if (flag.startsWith('anomaly_') || flag.match(/^anomaly\./)) {
      evidence.completedAnomalies.push(flag);
    }
  }

  // Enrich with real fired events from the parsed save
  if (rawParsed?.fired_events?.recent) {
    for (const eid of rawParsed.fired_events.recent) {
      if (!evidence.firedEvents.includes(eid)) evidence.firedEvents.push(eid);
    }
  }
  // Enrich with archaeology sites from parsed save
  if (rawParsed?.archaeology?.sites) {
    for (const site of rawParsed.archaeology.sites) {
      evidence.archaeologySites.push({ name: site.name, currentStage: site.stage });
    }
  }

  // Detect event chains using graph data
  let eventChains: ReturnType<typeof detectEventChains> = [];
  try {
    eventChains = detectEventChains(evidence);
  } catch { /* graph data might not be loaded yet */ }

  return NextResponse.json({
    campaign,
    saves,
    milestones,
    eventChains,
    stats: {
      total_saves: saves.length,
      total_milestones: milestones.length,
      event_types: eventTypes,
      event_chain_count: eventChains.length,
      empire_evolution: saves.map(s => ({
        date: s.game_date,
        empire_size: s.empire_size,
        military_power: s.military_power,
        tech_power: s.tech_power,
        victory_rank: s.victory_rank,
        fleet_power: s.fleet_power,
        total_pops: s.total_pops,
        num_colonies: s.num_colonies,
        active_wars: s.active_wars,
      })),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = parseInt(id);
  if (isNaN(campaignId)) return NextResponse.json({ error: '无效的战役ID' }, { status: 400 });

  const campaign = getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: '战役不存在' }, { status: 404 });

  const db = getDb();

  // 级联删除: chapters → novels → milestones → saves → campaign
  const novels = getNovels(campaignId);
  for (const n of novels) {
    const chapters = getChapters(n.id);
    for (const c of chapters) {
      db.prepare('DELETE FROM chapters WHERE id = ?').run(c.id);
    }
    db.prepare('DELETE FROM novels WHERE id = ?').run(n.id);
  }

  db.prepare('DELETE FROM milestones WHERE campaign_id = ?').run(campaignId);
  db.prepare('DELETE FROM saves WHERE campaign_id = ?').run(campaignId);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);

  return NextResponse.json({ ok: true, deleted: true });
}
