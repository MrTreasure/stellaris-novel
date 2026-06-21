import { NextRequest, NextResponse } from 'next/server';
import { completeChat } from '@/lib/ai-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { system, user, config } = body;
    if (!config?.apiKey) return NextResponse.json({ error: '请先配置 API Key' }, { status: 400 });

    const response = await completeChat([
      { role: 'system', content: `${system}\n\n你现在的任务是分析帝国编年史和事件链数据，为小说生成章节大纲。输出纯文本，每个章节一行，格式为"第N章：标题 —— 核心情节概要"。` },
      { role: 'user', content: `## 帝国数据\n${user}\n\n请根据以上帝国编年史和事件链数据，规划一部太空歌剧小说的章节大纲。\n- 按时间线将重大事件分配到各章节\n- 每章一个核心主题（如"首次接触"、"先驱者发现"、"战争爆发"等）\n- 在关键转折点设置章节高潮\n- 预计10章左右` },
    ], config);

    return NextResponse.json({ outline: response });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
