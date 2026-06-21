import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    storage: 'browser',
    message: 'AI 配置仅保存在当前浏览器中',
  });
}

export async function POST() {
  return NextResponse.json({ error: 'AI 配置仅允许保存在浏览器本地' }, { status: 410 });
}
