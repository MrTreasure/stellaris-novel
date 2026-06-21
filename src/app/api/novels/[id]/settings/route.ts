import { NextRequest, NextResponse } from 'next/server';
import { getNovelBackground } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const nid = parseInt(id);
  if (isNaN(nid)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  return NextResponse.json({ background: getNovelBackground(nid) });
}

export async function POST(
  _req: NextRequest,
  _context: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({ error: '小说背景仅保存在浏览器本地' }, { status: 410 });
}
