import { NextRequest, NextResponse } from 'next/server';
import { getSettings, updateSetting } from '@/lib/db';

export async function GET() {
  const settings = getSettings();
  // 不返回完整 api_key,只返回前4位用于显示
  return NextResponse.json({
    ...settings,
    api_key_preview: settings.api_key ? settings.api_key.slice(0, 4) + '...' : '',
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json({ error: '需要 key 和 value' }, { status: 400 });
  }

  // 允许更新的 key 白名单
  const allowedKeys = ['api_key', 'base_url', 'model', 'stellaris_dir'];
  if (!allowedKeys.includes(key)) {
    return NextResponse.json({ error: '不允许修改此设置' }, { status: 400 });
  }

  updateSetting(key, value);
  return NextResponse.json({ ok: true });
}
