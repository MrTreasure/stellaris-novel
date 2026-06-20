import { NextRequest } from 'next/server';
import { getCampaign, getSaves, getMilestones, createNovel, insertChapter, updateNovelStatus, getNovel, getChapters, updateChapterContent, getNovelBackground } from '@/lib/db';
import { streamChat } from '@/lib/ai-client';
import { getSettings } from '@/lib/db';
import { loadLore } from '@/lib/lore';

export const dynamic = 'force-dynamic';

function buildPrompt(campaignId: number, novelId?: number): { system: string; intro: string } {
  const campaign = getCampaign(campaignId);
  const saves = getSaves(campaignId);
  const milestones = getMilestones(campaignId);

  const latestSave = saves[saves.length - 1];
  const empireInfo = latestSave ? {
    name: latestSave.empire_name,
    species: latestSave.species_name,
    size: latestSave.empire_size,
    military: latestSave.military_power,
    tech: latestSave.tech_power,
    rank: latestSave.victory_rank,
    authority: latestSave.authority,
    ethics: safeJsonParse(latestSave.ethics),
    civics: safeJsonParse(latestSave.civics),
    traits: safeJsonParse(latestSave.species_traits),
  } : {};

  const evolution = saves.map(s => ({
    date: s.game_date,
    size: s.empire_size,
    military: s.military_power,
    tech: s.tech_power,
  }));

  const keyMilestones = milestones.filter(m => m.importance === 'critical' || m.importance === 'major');
  const events = keyMilestones.length > 50
    ? keyMilestones.map(m => `[${m.event_date}] ${m.title}`).join('\n')
    : milestones.map(m => `[${m.event_date}] ${m.title}`).join('\n');

  const ethicsStr = empireInfo.ethics ? empireInfo.ethics.join('、') : '未知';
  const civicsStr = empireInfo.civics ? empireInfo.civics.join('、') : '未知';

  const loreText = loadLore('stellaris-lore.md');

  const system = `你是资深科幻小说作家，专精太空歌剧与银河史诗题材。文风参照刘慈欣《三体》的宏大叙事和阿西莫夫《基地》的历史纵深。

你正在为《群星》(Stellaris) 游戏中的一个星际文明撰写编年史小说。所有事件基于真实游戏数据，你需要将其编织成引人入胜的银河史诗。

【写作要求】
1. 严格基于事件时间轴，不虚构未发生的事件，但可以对事件进行合理文学化渲染
2. 描写人物内心、星际战斗场面、外交博弈、科技突破的震撼
3. 善用对话和场景描写增强代入感
4. 每章2500-3500字，结构完整（开端-发展-高潮-收尾）
5. 使用规范中文，避免翻译腔
6. 时间跨度过大时用"数十年转瞬即逝"等自然过渡

【群星世界观参考】
${loreText}`;

  const intro = `## 帝国档案

名称: ${empireInfo.name || '未知'}
物种: ${empireInfo.species || '人类'}
政体: ${empireInfo.authority || '未知'}
伦理: ${ethicsStr}
理念: ${civicsStr}
物种特质: ${empireInfo.traits ? empireInfo.traits.join('、') : '未知'}
最终规模: ${empireInfo.size || '?'}
最终军力: ${empireInfo.military?.toLocaleString() || '?'}
最终科技: ${empireInfo.tech?.toLocaleString() || '?'}
胜利排名: 第${empireInfo.rank || '?'}名

## 实力演变

${evolution.map(e => `- ${e.date}: 规模${e.size}, 军力${e.military?.toLocaleString()}, 科技${e.tech?.toLocaleString()}`).join('\n')}

## 重大事件时间轴

${events}`;

  return { system, intro };
}

function safeJsonParse(s: string | null): string[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign_id, novel_id, chapter_index, mode, chapter_id, instructions } = body;

    if (!campaign_id) return new Response('需要 campaign_id', { status: 400 });

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

    const { system, intro } = buildPrompt(campaign_id, currentNovelId);

    let finalIntro = intro;
    if (currentNovelId) {
      const bg = getNovelBackground(currentNovelId);
      if (bg) finalIntro = `## 额外背景设定\n${bg}\n\n${intro}`;
    }

    const chapters = getChapters(currentNovelId);
    const existingChapters = chapters.filter(c => c.chapter_number < currentChapterIndex);
    let context = '';
    if (existingChapters.length > 0) {
      context = '## 已有章节\n' + existingChapters.map(c =>
        `### 第${c.chapter_number}章 ${c.title}\n${c.content.slice(0, 500)}...`
      ).join('\n\n');
    }

    let userPrompt = `${finalIntro}\n\n${context}`;
    let chapterTitle = '';
    let chId: number | null = null;

    if (mode === 'rewrite' && chapter_id) {
      const ch = chapters.find(c => c.id === chapter_id);
      if (!ch) return new Response('章节不存在', { status: 400 });
      chId = chapter_id;
      currentChapterIndex = ch.chapter_number;
      chapterTitle = `第${ch.chapter_number}章(重写版)`;
      userPrompt = `${finalIntro}\n\n## 需要重写的章节\n### 第${ch.chapter_number}章 ${ch.title}\n${ch.content}\n\n## 修改要求\n${instructions || '请重新撰写这章，使其更加精彩'}`;
    } else {
      chapterTitle = `第${currentChapterIndex}章`;
    }

    if (!chId) {
      chId = insertChapter({
        novel_id: currentNovelId,
        chapter_number: currentChapterIndex,
        title: chapterTitle,
        content: '',
        era_start: '',
        era_end: '',
        source_milestones: JSON.stringify([]),
      });
    }

    const task = mode === 'rewrite'
      ? `请重写这一章。${instructions ? `修改要求: ${instructions}` : ''}`
      : `请根据以上数据写第${currentChapterIndex}章。`;
    const messages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: `${userPrompt}\n\n${task}` },
    ];

    const encoder = new TextEncoder();
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChat(messages)) {
            fullContent += chunk;
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'chunk', content: chunk }) + '\n'));
          }

          updateChapterContent(chId, fullContent);
          updateNovelStatus(currentNovelId, 'draft', Math.max(currentChapterIndex, novel.total_chapters));

          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            chapter_id: chId,
            chapter_number: currentChapterIndex,
            mode: mode || 'new',
          }) + '\n'));
          controller.close();
        } catch (e: any) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: e.message }) + '\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (e: any) {
    return new Response(e.message, { status: 500 });
  }
}
