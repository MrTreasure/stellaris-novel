import { NextRequest, NextResponse } from 'next/server';
import { getCampaign, getSaves, getMilestones, getChapters, getNovels } from '@/lib/db';
import { getDb } from '@/lib/db';

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
  const milestones = getMilestones(campaignId);
  const novels = getNovels(campaignId);

  const eventTypes: Record<string, number> = {};
  for (const m of milestones) {
    eventTypes[m.event_type] = (eventTypes[m.event_type] || 0) + 1;
  }

  return NextResponse.json({
    campaign,
    saves,
    milestones,
    novels,
    stats: {
      total_saves: saves.length,
      total_milestones: milestones.length,
      event_types: eventTypes,
      empire_evolution: saves.map(s => ({
        date: s.game_date,
        empire_size: s.empire_size,
        military_power: s.military_power,
        tech_power: s.tech_power,
        victory_rank: s.victory_rank,
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
