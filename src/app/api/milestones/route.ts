import { NextRequest, NextResponse } from 'next/server';
import { getDb, getSaves } from '@/lib/db';
import { getResolvedCampaignMilestones } from '@/lib/chronicle-query';

export async function GET(req: NextRequest) {
  const campaignId = Number.parseInt(req.nextUrl.searchParams.get('campaign_id') || '', 10);
  if (Number.isNaN(campaignId)) {
    return NextResponse.json({ error: '需要 campaign_id' }, { status: 400 });
  }

  const db = getDb();
  const milestones = getResolvedCampaignMilestones(db, campaignId, getSaves(campaignId));
  const grouped = new Map<string, { id: string; name: string; category: string; events: typeof milestones }>();

  for (const milestone of milestones) {
    if (!milestone.chain_id) continue;
    const chain = db.prepare(
      'SELECT chain_id, zh_name, category FROM game_event_chains WHERE chain_id = ?',
    ).get(milestone.chain_id) as { chain_id: string; zh_name: string | null; category: string | null } | undefined;
    if (!chain) continue;
    const current = grouped.get(chain.chain_id) || {
      id: chain.chain_id,
      name: chain.zh_name || chain.chain_id,
      category: chain.category || milestone.event_type,
      events: [],
    };
    current.events.push(milestone);
    grouped.set(chain.chain_id, current);
  }

  return NextResponse.json({ milestones, chains: [...grouped.values()] });
}
