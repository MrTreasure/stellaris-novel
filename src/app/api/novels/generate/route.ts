import { NextRequest } from 'next/server';
import { getCampaign, getSaves, getMilestones, createNovel, insertChapter, updateNovelStatus, getNovel, getChapters, updateChapterContent } from '@/lib/db';
import { streamChat } from '@/lib/ai-client';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

function buildPrompt(campaignId: number): { system: string; intro: string } {
  const campaign = getCampaign(campaignId);
  const saves = getSaves(campaignId);
  const milestones = getMilestones(campaignId);

  // 帝国设定
  const latestSave = saves[saves.length - 1];
  const empireInfo = latestSave ? {
    name: latestSave.empire_name,
    species: latestSave.species_name,
    size: latestSave.empire_size,
    military: latestSave.military_power,
    tech: latestSave.tech_power,
    rank: latestSave.victory_rank,
  } : {};

  // 实力演变
  const evolution = saves.map(s => ({
    date: s.game_date,
    size: s.empire_size,
    military: s.military_power,
    tech: s.tech_power,
  }));

  // 事件时间轴
  const events = milestones.map(m => `[${m.event_date}] ${m.title}`).join('\n');

  const system = `你是《群星》(Stellaris)游戏的银河史诗小说作家。

用户将从游戏存档中提取的帝国数据交给你，你需要根据这些真实事件写一部精彩的科幻小说。

写作要求：
- 以严肃科幻小说风格，参照《银河英雄传说》《基地》等史诗感
- 基于用户提供的事件时间轴，不虚构没有发生的事件
- 对每个事件进行合理文学化渲染
- 描写人物内心、战斗场面、外交博弈、科技突破
- 适当使用对话和场景描写增强可读性
- 每章2000-3000字
- 使用中文写作`;

  const intro = `## 帝国数据

- 帝国名称: ${empireInfo.name || '未知'}
- 物种: ${empireInfo.species || '人类'}
- 最终规模: ${empireInfo.size || '?'}
- 最终军力: ${empireInfo.military || '?'}
- 最终科技: ${empireInfo.tech || '?'}

## 实力演变

${evolution.map(e => `- ${e.date}: 规模=${e.size}, 军力=${e.military}, 科技=${e.tech}`).join('\n')}

## 事件时间轴

${events}`;

  return { system, intro };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign_id, novel_id, chapter_index } = body;

    if (!campaign_id) return new Response('需要 campaign_id', { status: 400 });

    // 获取或创建小说
    let currentNovelId = novel_id;
    let currentChapterIndex = chapter_index || 1;

    if (!currentNovelId) {
      const campaign = getCampaign(campaign_id);
      if (!campaign) return new Response('战役不存在', { status: 400 });
      currentNovelId = createNovel(campaign_id, `${campaign.name}史诗`);
      updateNovelStatus(currentNovelId, 'generating');
    }

    const novel = getNovel(currentNovelId);
    if (!novel) return new Response('小说不存在', { status: 400 });

    const { system, intro } = buildPrompt(campaign_id);

    // 检查是否有前文
    const chapters = getChapters(currentNovelId);
    const existingChapters = chapters.filter(c => c.chapter_number < currentChapterIndex);
    let context = '';
    if (existingChapters.length > 0) {
      context = '## 已有章节\n' + existingChapters.map(c =>
        `### 第${c.chapter_number}章 ${c.title}\n${c.content.slice(0, 500)}...`
      ).join('\n\n');
    }

    // 创建新的章节记录
    const chapterTitle = `第${currentChapterIndex}章`;
    const chapterId = insertChapter({
      novel_id: currentNovelId,
      chapter_number: currentChapterIndex,
      title: chapterTitle,
      content: '',
      era_start: '',
      era_end: '',
      source_milestones: JSON.stringify([]),
    });

    const messages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: `${intro}\n\n${context}\n\n请根据以上数据写第${currentChapterIndex}章。` },
    ];

    // 流式响应
    const encoder = new TextEncoder();
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChat(messages)) {
            fullContent += chunk;
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'chunk', content: chunk }) + '\n'));
          }

          // 保存最终内容
          updateChapterContent(chapterId, fullContent);
          updateNovelStatus(currentNovelId, 'draft', Math.max(currentChapterIndex, novel.total_chapters));

          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            chapter_id: chapterId,
            chapter_number: currentChapterIndex,
          }) + '\n'));
          controller.close();
        } catch (e: any) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: e.message }) + '\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: any) {
    return new Response(e.message, { status: 500 });
  }
}
