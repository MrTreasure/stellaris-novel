import { NextRequest } from 'next/server';
import { streamChatPlain } from '@/lib/ai-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { system, user, config } = body;
    if (!config?.apiKey) return new Response('请先配置 API Key', { status: 400 });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of streamChatPlain([
            { role: 'system', content: `${system}\n\n你现在的任务是分析帝国编年史和事件链数据，规划一部完整的太空歌剧小说章节大纲。你必须覆盖从游戏开始到结束的全部重大事件，不能只规划第一章。` },
            { role: 'user', content: `## 帝国数据\n${user}\n\n请根据以上帝国编年史和事件链数据，规划一部完整的太空歌剧小说大纲。要求：\n\n1. 覆盖编年史中所有重大事件和转折点\n2. 每章一个核心主题和冲突\n3. 章节之间要有因果承接关系\n4. 在关键转折点（首次接触、先驱者发现、战争爆发、危机降临、银河共同体成立等）设置章节高潮\n5. 最后一章作为史诗收尾\n6. 根据事件密度确定章节数（通常8-15章）\n\n输出格式：每章一行，格式为"第N章：标题 —— 200字情节概要（覆盖本章涉及的关键事件和人物弧光）"` },
          ], config, { maxOutputTokens: 8000 })) {
            if (event.type === 'text-delta' && event.content) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'chunk', content: event.content }) + '\n'));
            } else if (event.type === 'error') {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: event.message }) + '\n'));
              controller.close();
              return;
            } else if (event.type === 'finish') {
              // fall through to done
            }
          }
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
          controller.close();
        } catch (e: any) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: e.message || '大纲生成失败' }) + '\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
