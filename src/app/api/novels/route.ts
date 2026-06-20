import { NextRequest, NextResponse } from 'next/server';
import { getNovels, getChapters, createNovel, getNovel, getCampaign } from '@/lib/db';

export async function GET(req: NextRequest) {
  const campaignId = parseInt(req.nextUrl.searchParams.get('campaign_id') || '');
  if (isNaN(campaignId)) return NextResponse.json({ error: '需要 campaign_id' }, { status: 400 });

  const novels = getNovels(campaignId);
  return NextResponse.json(novels);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { campaign_id, title } = body;
  if (!campaign_id || !title) return NextResponse.json({ error: '需要 campaign_id 和 title' }, { status: 400 });

  const id = createNovel(campaign_id, title);
  const novel = getNovel(id);
  return NextResponse.json(novel);
}
