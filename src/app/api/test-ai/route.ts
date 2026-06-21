import { NextRequest, NextResponse } from 'next/server';
import { testConnection } from '@/lib/ai-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config = body.config;
    if (!config?.api_key) {
      return NextResponse.json({ ok: false, message: '请先填写 API Key' }, { status: 400 });
    }
    const result = await testConnection({
      apiKey: config.api_key || '',
      baseUrl: config.base_url,
      model: config.model,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 });
  }
}
