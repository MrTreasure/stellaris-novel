import { NextRequest, NextResponse } from 'next/server';
import { updateNovelBackground, getNovelBackground } from '@/lib/db';

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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const nid = parseInt(id);
  if (isNaN(nid)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const { background } = await req.json();
  updateNovelBackground(nid, background || '');
  return NextResponse.json({ ok: true });
}
