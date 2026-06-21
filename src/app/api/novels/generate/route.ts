import { NextRequest } from 'next/server';
import { getCampaign, getSaves, getMilestones, getAllEventChains, getEventChainNodes } from '@/lib/db';
import { completeChat, streamChat } from '@/lib/ai-client';
import type { ContinuityBible } from '@/lib/browser-storage';
import { loadLore } from '@/lib/lore';
import { detectEventChains, type SaveEvidence } from '@/lib/event-chain-detector';

export const dynamic = 'force-dynamic';

function buildPrompt(campaignId: number): { system: string; intro: string } {
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
  const eventChains = buildEventChains(milestones);

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
7. 严格延续连续性档案中的人物状态、势力关系、既定事实与未解决伏笔
8. 新章节应自然承接最近一章的结尾，避免重复介绍已经登场的人物和设定
9. 除非本章明确推动或解决，不得遗忘、篡改或无故终止既有伏笔
10. 不得提前泄露尚未在存档中发生的结局
11. 不得把可能分支写成已发生事实
12. 后续章节必须延续此前事件链选择
13. 事件链结束后更新人物、势力和世界状态
14. 同一事件链跨章节时应保持核心角色、地点、谜团和语气一致

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

${events}

## 已识别事件链

${eventChains || '暂无可识别的多阶段事件链。'}`;

  return { system, intro };
}

function safeJsonParse(s: string | null): string[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign_id, chapter_index, mode, chapter_number, instructions, background, chapters = [], continuity, config } = body;

    if (!campaign_id) return new Response('需要 campaign_id', { status: 400 });
    if (!config?.apiKey) return new Response('请先在系统设置中配置 API Key', { status: 400 });
    if (!getCampaign(campaign_id)) return new Response('战役不存在', { status: 400 });

    const currentChapterIndex = mode === 'rewrite' ? chapter_number : (chapter_index || 1);
    const { system, intro } = buildPrompt(campaign_id);
    const finalIntro = background ? `## 额外背景设定\n${background}\n\n${intro}` : intro;
    const existingChapters = chapters.filter((c: { chapter_number: number }) => c.chapter_number < currentChapterIndex);
    const latestPrevious = existingChapters.at(-1);
    const summaries = existingChapters
      .map((chapter: { chapter_number: number; summary?: string }) => `- 第${chapter.chapter_number}章：${chapter.summary || '暂无概要'}`)
      .join('\n');
    const context = existingChapters.length > 0 ? `## 长篇连续性档案
${formatContinuity(continuity)}

## 历史章节概要
${summaries}

## 最近一章完整正文
${latestPrevious?.content || ''}` : '';

    let userPrompt = `${finalIntro}\n\n${context}`;

    if (mode === 'rewrite' && chapter_number) {
      const ch = chapters.find((c: { chapter_number: number }) => c.chapter_number === chapter_number);
      if (!ch) return new Response('章节不存在', { status: 400 });
      userPrompt = `${finalIntro}\n\n${context}\n\n## 需要重写的章节\n### 第${ch.chapter_number}章 ${ch.title}\n${ch.content}\n\n## 修改要求\n${instructions || '请重新撰写这章，使其更加精彩'}`;
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
          for await (const chunk of streamChat(messages, config)) {
            fullContent += chunk;
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'chunk', content: chunk }) + '\n'));
          }

          const memory = await extractChapterMemory(fullContent, continuity, config);
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            chapter_number: currentChapterIndex,
            mode: mode || 'new',
            summary: memory.summary,
            continuity: memory.continuity,
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

function formatContinuity(continuity?: ContinuityBible): string {
  if (!continuity) return '暂无连续性档案。';
  return [
    `当前时间与局势：${continuity.timelineState || '未记录'}`,
    `人物：${continuity.characters?.join('；') || '未记录'}`,
    `势力：${continuity.factions?.join('；') || '未记录'}`,
    `既定事实：${continuity.establishedFacts?.join('；') || '未记录'}`,
    `未解决伏笔：${continuity.unresolvedThreads?.join('；') || '未记录'}`,
    `进行中的事件链：${continuity.activeEventChains?.join('；') || '未记录'}`,
    `已完成的事件链：${continuity.completedEventChains?.join('；') || '未记录'}`,
    `事件链玩家选择：${continuity.eventChainChoices?.join('；') || '未记录'}`,
    `事件链后果：${continuity.eventChainConsequences?.join('；') || '未记录'}`,
    `未解决的事件链线索：${continuity.unresolvedEventChainClues?.join('；') || '未记录'}`,
  ].join('\n');
}

async function extractChapterMemory(content: string, previous: ContinuityBible | undefined, config: { apiKey: string; baseUrl: string; model: string }) {
  const fallback = {
    summary: content.slice(0, 300),
    continuity: previous || {
      characters: [], factions: [], unresolvedThreads: [],
      activeEventChains: [], completedEventChains: [],
      eventChainChoices: [], eventChainConsequences: [],
      unresolvedEventChainClues: [], establishedFacts: [], timelineState: '',
    },
  };
  try {
    const response = await completeChat([
      {
        role: 'system',
        content: '你是长篇小说连续性编辑。只输出 JSON，不要添加 Markdown。保留仍然有效的旧信息，删除已解决的伏笔。',
      },
      {
        role: 'user',
        content: `旧连续性档案：\n${JSON.stringify(previous || {})}\n\n新章节：\n${content}\n\n输出结构：{"summary":"200-350字章节概要","continuity":{"characters":["人物及当前状态"],"factions":["势力及关系"],"unresolvedThreads":["尚未解决的伏笔"],"activeEventChains":["仍在推进、尚未完结的群星事件链及当前阶段"],"completedEventChains":["已完结的事件链及其结局"],"eventChainChoices":["玩家在事件链中的关键选择"],"eventChainConsequences":["事件链选择导致的后果"],"unresolvedEventChainClues":["已知但尚未揭示的事件链线索,不可提前泄露结局"],"establishedFacts":["不可违背的既定事实"],"timelineState":"章节结束时的时间和总体局势"}}`,
      },
    ], config);
    const parsed = JSON.parse(response);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      continuity: {
        characters: parsed.continuity?.characters || [],
        factions: parsed.continuity?.factions || [],
        unresolvedThreads: parsed.continuity?.unresolvedThreads || [],
        activeEventChains: parsed.continuity?.activeEventChains || [],
        completedEventChains: parsed.continuity?.completedEventChains || [],
        eventChainChoices: parsed.continuity?.eventChainChoices || [],
        eventChainConsequences: parsed.continuity?.eventChainConsequences || [],
        unresolvedEventChainClues: parsed.continuity?.unresolvedEventChainClues || [],
        establishedFacts: parsed.continuity?.establishedFacts || [],
        timelineState: parsed.continuity?.timelineState || '',
      },
    };
  } catch {
    return fallback;
  }
}

function buildEventChains(milestones: { event_date: string; title: string; raw_flag: string | null }[]): string {
  // Build evidence from milestones for graph-based chain detection
  const evidence: SaveEvidence = {
    countryFlags: new Set<string>(),
    globalFlags: new Set<string>(),
    planetFlags: new Set<string>(),
    starFlags: new Set<string>(),
    completedAnomalies: [],
    activeProjects: [],
    completedProjects: [],
    archaeologySites: [],
    firedEvents: [],
    milestoneFlags: milestones.map(m => ({ flag: m.raw_flag || '', date: m.event_date })),
  };

  for (const m of milestones) {
    const flag = m.raw_flag || '';
    if (!flag) continue;
    if (flag.startsWith('global_')) evidence.globalFlags.add(flag);
    else evidence.countryFlags.add(flag);
    if (flag.match(/\.\d+$/)) evidence.firedEvents.push(flag);
    if (flag.startsWith('anomaly_') || flag.match(/^anomaly\./)) evidence.completedAnomalies.push(flag);
  }

  let chains: ReturnType<typeof detectEventChains> = [];
  try {
    chains = detectEventChains(evidence);
  } catch {
    chains = [];
  }

  if (chains.length === 0) return '暂无可识别的多阶段事件链。';

  const parts: string[] = [];
  for (const chain of chains) {
    const statusLabel = chain.status === 'completed' ? '已完成' : chain.status === 'active' ? '进行中' : chain.status === 'failed' ? '已失败' : '状态未知';
    const categoryLabel = chain.category || '剧情';
    parts.push(`### ${chain.name} (${statusLabel}, ${categoryLabel})`);
    parts.push(`当前阶段: ${chain.currentStage}`);
    if (chain.selectedChoices.length > 0) {
      parts.push(`玩家选择: ${chain.selectedChoices.join(', ')}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}
