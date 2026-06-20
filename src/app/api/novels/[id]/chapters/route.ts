import { NextRequest, NextResponse } from 'next/server';
import { getChapters } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const novelId = parseInt(id);
  if (isNaN(novelId)) return NextResponse.json({ error: '无效的小说ID' }, { status: 400 });

  const chapters = getChapters(novelId);
  return NextResponse.json(chapters);
}
