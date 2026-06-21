import { NextRequest, NextResponse } from 'next/server';
import { getNovels } from '@/lib/db';

export async function GET(req: NextRequest) {
  const campaignId = parseInt(req.nextUrl.searchParams.get('campaign_id') || '');
  if (isNaN(campaignId)) return NextResponse.json({ error: '需要 campaign_id' }, { status: 400 });

  const novels = getNovels(campaignId);
  return NextResponse.json(novels);
}

export async function POST() {
  return NextResponse.json({ error: '小说仅保存在浏览器本地' }, { status: 410 });
}
