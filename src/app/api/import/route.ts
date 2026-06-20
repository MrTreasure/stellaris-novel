import { NextRequest, NextResponse } from 'next/server';
import { importGameData } from '@/lib/parser/game-importer';
import fs from 'fs';

const COMMON_PATHS = [
  'G:/SteamLibrary/steamapps/common/Stellaris',
  'E:/steam/steamapps/common/Stellaris',
  'C:/Program Files (x86)/Steam/steamapps/common/Stellaris',
  'D:/SteamLibrary/steamapps/common/Stellaris',
  'D:/Steam/steamapps/common/Stellaris',
  'C:/Program Files/Steam/steamapps/common/Stellaris',
];

function findStellarisDir(): string | null {
  for (const p of COMMON_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    let stellarisDir: string | null = null;

    // 尝试从请求体获取
    try {
      const body = await req.json();
      stellarisDir = body.stellaris_dir;
    } catch {}

    // 回退: 自动检测
    if (!stellarisDir) {
      stellarisDir = findStellarisDir();
    }

    if (!stellarisDir) {
      return NextResponse.json({ error: '未在本地找到群星安装目录' }, { status: 404 });
    }

    const result = importGameData(stellarisDir);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
