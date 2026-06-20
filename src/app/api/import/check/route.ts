import { NextResponse } from 'next/server';
import fs from 'fs';

const COMMON_PATHS = [
  'G:/SteamLibrary/steamapps/common/Stellaris',
  'E:/steam/steamapps/common/Stellaris',
  'C:/Program Files (x86)/Steam/steamapps/common/Stellaris',
  'D:/SteamLibrary/steamapps/common/Stellaris',
  'D:/Steam/steamapps/common/Stellaris',
  'C:/Program Files/Steam/steamapps/common/Stellaris',
];

export async function GET() {
  for (const p of COMMON_PATHS) {
    if (fs.existsSync(p)) {
      return NextResponse.json({ found: true, path: p });
    }
  }
  return NextResponse.json({ found: false, path: null });
}
