import { NextRequest, NextResponse } from 'next/server';
import { importGameData } from '@/lib/parser/game-importer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let stellarisDir = body.stellaris_dir;

    if (!stellarisDir) {
      const { getSettings } = await import('@/lib/db');
      const settings = getSettings();
      stellarisDir = settings.stellaris_dir;
      if (!stellarisDir) {
        return NextResponse.json({ error: '未设置群星游戏目录' }, { status: 400 });
      }
    }

    const result = importGameData(stellarisDir);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
