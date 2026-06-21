import { NextRequest } from 'next/server';
import { getCampaign } from '@/lib/db';
import { streamChatWithTools, completeChat, type ChatMessage } from '@/lib/ai-client';
import type { ContinuityBible } from '@/lib/browser-storage';
import { loadLore } from '@/lib/lore';
import { novelTools } from '@/lib/ai-tools';
import { buildCampaignFacts } from '@/lib/novel-facts';

export const dynamic = 'force-dynamic';

function buildSystemPrompt(loreText: string): string {
  return `你是资深科幻小说作家，专精太空歌剧与银河史诗题材。

你正在为《群星》(Stellaris) 游戏中的一个星际文明撰写编年史小说。所有事件基于真实游戏数据。

【事实优先级】
1. 当前战役已解析事实为最高优先级。通过工具查询确认的事实可视为已发生。
2. SQLite 中的游戏事件/科技/本地化定义用于解释名词与事件背景。
3. 世界观参考仅作为通用背景，不得覆盖战役事实。
4. 如果工具查询结果为"未找到"，使用保守模糊表述，不得编造不存在的事件或细节。

【工具使用纪律 — 关键】
1. 每章最多进行3-4次工具查询，查询后必须立即开始写正文，不得连续查询。
2. 先写正文框架，只在遇到真正不确定的专有名词时才查询，不要在写作前批量预查询。
3. 如果对名词含义有合理推断，直接写作即可，无需验证。
4. lookup_campaign_fact 的 campaign_id 只能使用上下文明确指定的值，不得猜测。
5. 已确认的信息复用，不重复查询同一术语。
6. 一份查询中包含多个相关关键词（如"先驱者 尤特 第一联盟"），一次查清。

**关键纪律：工具调用过程对读者完全不可见。禁止在输出中提及任何工具查询行为（包括但不限于"查询"、"搜索"、"数据库"、"返回结果"等措辞）。在调用工具之前、期间和之后，只输出小说正文内容。工具结果返回后，直接将相关信息自然融入叙事，不要解释信息来源。**

【写作要求】
1. 严格基于事件时间轴，不虚构未发生的事件
2. 每章2500-3500字，结构完整（开端-发展-高潮-收尾）
3. 使用规范中文，避免翻译腔
4. 延续连续性档案中的人物状态、势力关系与未解决伏笔
5. 不得提前泄露尚未在存档中发生的结局
6. 如果工具结果显示信息不足，用模糊表述，不得补完不存在的细节
7. 如果工具结果与已有对话冲突，以当前战役事实和最近工具结果为准

【群星世界观参考】
${loreText}`;
}

function buildUserContext(campaignId: number, chapterNumber: number): string {
  const facts = buildCampaignFacts(campaignId);
  if (!facts) return '战役数据不可用。';

  return [
    `【重要】你的当前 campaign_id 是 ${campaignId}。所有查询本局事实的工具调用必须传入此 ID，禁止使用其他值。`,
    '',
    '## 帝国档案',
    `名称: ${facts.empire.name}`,
    `物种: ${facts.empire.species}`,
    `政体: ${facts.empire.authority}`,
    `伦理: ${facts.empire.ethics.join('、') || '未知'}`,
    `理念: ${facts.empire.civics.join('、') || '未知'}`,
    `特质: ${facts.empire.traits.join('、') || '未知'}`,
    '',
    '## 帝国现状',
    `日期: ${facts.currentState.gameDate}`,
    `规模: ${facts.currentState.empireSize?.toLocaleString()}, 军力: ${facts.currentState.militaryPower?.toLocaleString()}`,
    `科技: ${facts.currentState.techPower?.toLocaleString()}, 舰队: ${facts.currentState.fleetPower?.toLocaleString()}`,
    `人口: ${facts.currentState.totalPops?.toLocaleString()}, 殖民地: ${facts.currentState.numColonies}`,
    '',
    '## 实力演变',
    ...facts.evolution.map(e => `- ${e.date}: 规模${e.size?.toLocaleString()}, 军力${e.military?.toLocaleString()}, 科技${e.tech?.toLocaleString()}`),
    '',
    '## 当前局势',
    `著名领袖: ${facts.snapshot.topLeaders.join('；') || '暂无'}`,
    `主要舰队: ${facts.snapshot.notableFleets.join('；') || '暂无'}`,
    `外交: ${facts.snapshot.diplomacy || '暂无'}`,
    `考古遗址: ${facts.snapshot.archaeology.join('；') || '暂无'}`,
    `活跃局势: ${facts.snapshot.situations.join('；') || '暂无'}`,
    '',
    '## 已识别事件链',
    ...facts.eventChains.map(c => `- ${c.name} (${c.category}): ${c.status} — ${c.stage}`),
    '',
    '## 关键事件时间轴',
    ...facts.keyMilestones.slice(0, 30).map(m => `- [${m.date}] ${m.title}`),
    '',
    `## 写作任务`,
    `请根据以上数据创作第${chapterNumber}章。你可以使用工具查询数据库中不熟悉的专有名词含义、事件链阶段、以及当前战役中的已发生事实。`,
  ].join('\n');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = parseInt(searchParams.get('campaign_id') || '0');
  if (!campaignId) return new Response('需要 campaign_id', { status: 400 });

  const loreText = loadLore('stellaris-lore.md');
  const system = buildSystemPrompt(loreText);
  const intro = buildUserContext(campaignId, 1);

  return new Response(JSON.stringify({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: intro },
    ],
  }), { headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, campaign_id, chapter_number, mode, config, continuity } = body;

    if (!campaign_id) return new Response('需要 campaign_id', { status: 400 });
    if (!config?.apiKey) return new Response('请先配置 API Key', { status: 400 });
    if (!getCampaign(campaign_id)) return new Response('战役不存在', { status: 400 });

    const isFirstChapter = !messages || !Array.isArray(messages) || messages.length === 0;
    let finalMessages: ChatMessage[];

    if (isFirstChapter) {
      // If frontend already has messages (with outline from GET endpoint), use them
      if (messages && Array.isArray(messages) && messages.length > 0) {
        finalMessages = messages.filter((m: any): m is ChatMessage =>
          ['system', 'user', 'assistant'].includes(m?.role) && typeof m?.content === 'string'
        );
      } else {
        const loreText = loadLore('stellaris-lore.md');
        finalMessages = [
          { role: 'system', content: buildSystemPrompt(loreText) },
          { role: 'user', content: buildUserContext(campaign_id, chapter_number || 1) },
        ];
      }
    } else {
      // Standardize existing messages
      finalMessages = messages.filter((m: any): m is ChatMessage =>
        ['system', 'user', 'assistant'].includes(m?.role) && typeof m?.content === 'string'
      );
    }

    const encoder = new TextEncoder();
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of streamChatWithTools(finalMessages, config, { tools: novelTools })) {
            if (event.type === 'text-delta' && event.content) {
              fullContent += event.content;
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'chunk', content: event.content }) + '\n'));
            } else if (event.type === 'tool-call') {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'tool-call', toolName: event.toolName, args: event.args }) + '\n'));
            } else if (event.type === 'tool-result') {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'tool-result', toolName: event.toolName, result: event.result }) + '\n'));
            } else if (event.type === 'finish') {
              console.log('[generate] done, usage:', JSON.stringify(event.usage));
            } else if (event.type === 'error') {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: event.message }) + '\n'));
              controller.close();
              return;
            }
          }

          // Extract continuity memory
          const memory = await extractChapterMemory(fullContent, continuity, config);

          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'done',
            chapter_number: chapter_number || 1,
            mode: mode || 'new',
            summary: memory.summary,
            continuity: memory.continuity,
          }) + '\n'));
          controller.close();
        } catch (e: any) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: 'AI 生成失败: ' + (e?.message || '') }) + '\n'));
          console.error('[generate] Error:', e?.message || e);
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

// ===== Continuity extraction =====

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
  if (!content.trim()) return fallback;
  try {
    const result = await completeChat([
      { role: 'system', content: '你是长篇小说连续性编辑。只输出 JSON。保留仍然有效的旧信息，删除已解决的伏笔。' },
      { role: 'user', content: `旧连续性档案：\n${JSON.stringify(previous || {})}\n\n新章节：\n${content}\n\n输出结构：{"summary":"200-350字章节概要","continuity":{"characters":["人物及当前状态"],"factions":["势力及关系"],"unresolvedThreads":["未解决伏笔"],"activeEventChains":["仍在推进的事件链及阶段"],"completedEventChains":["已完结的事件链及结局"],"eventChainChoices":["关键选择"],"eventChainConsequences":["后果"],"unresolvedEventChainClues":["线索"],"establishedFacts":["既定事实"],"timelineState":"结束时的时间和局势"}}` },
    ], config);
    const parsed = JSON.parse(result.text);
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
  } catch { return fallback; }
}
