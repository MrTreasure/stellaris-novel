import { NextRequest, NextResponse } from 'next/server';
import { testConnection } from '@/lib/ai-client';
import { getSettings } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config = body.config || getSettings();
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
