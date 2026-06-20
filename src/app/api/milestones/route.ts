import { NextRequest, NextResponse } from 'next/server';
import { getMilestones } from '@/lib/db';

export async function GET(req: NextRequest) {
  const campaignId = parseInt(req.nextUrl.searchParams.get('campaign_id') || '');
  if (isNaN(campaignId)) return NextResponse.json({ error: '需要 campaign_id' }, { status: 400 });

  const milestones = getMilestones(campaignId);
  return NextResponse.json(milestones);
}
