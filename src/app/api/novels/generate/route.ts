import { NextRequest } from 'next/server';
import { getCampaign, getSaves, getDb } from '@/lib/db';
import { completeChat, streamChat } from '@/lib/ai-client';
import type { ContinuityBible } from '@/lib/browser-storage';
import { loadLore } from '@/lib/lore';
import { detectEventChains, type SaveEvidence } from '@/lib/event-chain-detector';
import { novelTools } from '@/lib/ai-tools';
import { getResolvedCampaignMilestones } from '@/lib/chronicle-query';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = parseInt(searchParams.get('campaign_id') || '0');
  if (!campaignId) return new Response('需要 campaign_id', { status: 400 });

  const { system, intro } = buildPrompt(campaignId);
  return new Response(JSON.stringify({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: intro + '\n\n请根据以上数据写第1章。' },
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

    // Use provided messages (full context mode) or build from campaign data
    let finalMessages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    if (messages && Array.isArray(messages) && messages.length > 0) {
      finalMessages = messages;
    } else {
      const { system, intro } = buildPrompt(campaign_id);
      finalMessages = [
        { role: 'system' as const, content: system },
        { role: 'user' as const, content: intro + `\n\n请根据以上数据写第${chapter_number || 1}章。` },
      ];
    }

    const encoder = new TextEncoder();
    let fullContent = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const generator = streamChat(finalMessages, config, { tools: novelTools });

          for await (const event of generator) {
            if (event.type === 'text') {
              fullContent += event.content;
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'chunk', content: event.content }) + '\n'));
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
          console.error('Generate error:', e?.message || e, e?.stack?.slice(0, 300));
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: 'AI 生成失败，请检查 API 配置和网络连接。错误: ' + (e?.message || '') }) + '\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (e: any) {
    console.error('Generate route error:', e.message);
    return new Response('服务器内部错误', { status: 500 });
  }
}

// ===== Prompt building (used for initial messages or backward compat) =====

function buildPrompt(campaignId: number): { system: string; intro: string } {
  const campaign = getCampaign(campaignId);
  const saves = getSaves(campaignId);
  const milestones = getResolvedCampaignMilestones(getDb(), campaignId, saves);
  const latestSave = saves.at(-1);

  const empireInfo = latestSave ? {
    name: latestSave.empire_name, species: latestSave.species_name,
    size: latestSave.empire_size, military: latestSave.military_power,
    tech: latestSave.tech_power, rank: latestSave.victory_rank,
    authority: latestSave.authority,
    ethics: safeParse(latestSave.ethics), civics: safeParse(latestSave.civics),
    traits: safeParse(latestSave.species_traits),
  } : {};

  const evolution = saves.map(s => ({
    date: s.game_date, size: s.empire_size, military: s.military_power,
    tech: s.tech_power, fleet: s.fleet_power, pops: s.total_pops, colonies: s.num_colonies,
  }));

  let rawParsed: any = null;
  if (latestSave?.raw_json) { try { rawParsed = JSON.parse(latestSave.raw_json); } catch {} }

  const events = milestones.map(m => `[${m.event_date}] ${m.title}`).join('\n');
  const eventChains = buildEventChains(milestones);
  const loreText = loadLore('stellaris-lore.md');

  const system = `你是资深科幻小说作家，专精太空歌剧与银河史诗题材。文风参照刘慈欣《三体》的宏大叙事和阿西莫夫《基地》的历史纵深。

你正在为《群星》(Stellaris) 游戏中的一个星际文明撰写编年史小说。所有事件基于真实游戏数据，你需要将其编织成引人入胜的银河史诗。

你可以使用工具查询游戏数据库来了解不熟悉的专有名词（如物种名、科技、事件链、势力等）。

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

【群星世界观参考】
${loreText}`;

  const intro = `## 帝国档案

名称: ${empireInfo.name || '未知'}
物种: ${empireInfo.species || '人类'}
政体: ${empireInfo.authority || '未知'}
伦理: ${(empireInfo.ethics || []).join('、') || '未知'}
理念: ${(empireInfo.civics || []).join('、') || '未知'}
物种特质: ${empireInfo.traits ? empireInfo.traits.join('、') : '未知'}
最终规模: ${empireInfo.size || '?'}
最终军力: ${empireInfo.military?.toLocaleString() || '?'}
最终科技: ${empireInfo.tech?.toLocaleString() || '?'}
舰队战力: ${latestSave?.fleet_power?.toLocaleString() || '?'}
总人口: ${latestSave?.total_pops?.toLocaleString() || '?'}
殖民地数: ${latestSave?.num_colonies || '?'}
活跃战争: ${latestSave?.active_wars || '?'}
胜利排名: 第${empireInfo.rank || '?'}名

## 实力演变

${evolution.map(e => `- ${e.date}: 规模${e.size}, 军力${e.military?.toLocaleString()}, 科技${e.tech?.toLocaleString()}, 舰队${e.fleet?.toLocaleString() || '?'}, 人口${e.pops?.toLocaleString() || '?'}`).join('\n')}

## 著名领袖
${rawParsed?.leaders?.top ? rawParsed.leaders.top.map((l: any) => `- ${l.name} (${l.class}, ${l.level}级, 特质: ${(l.traits || []).join(', ')})`).join('\n') : '暂无数据'}

## 著名舰队
${rawParsed?.fleets?.notable ? rawParsed.fleets.notable.slice(0, 10).map((f: any) => `- ${f.name}: ${f.ships}舰, 战力${f.power?.toLocaleString()}`).join('\n') : '暂无数据'}

## 外交局势
${rawParsed?.diplomacy ? `联邦: ${rawParsed.diplomacy.federation_name || '无'}, 贸易协定: ${rawParsed.diplomacy.trade_deals || 0}, 附庸国: ${rawParsed.diplomacy.subjects || 0}${rawParsed.diplomacy.gc_member ? ', 星海共同体成员' : ''}` : '暂无数据'}

## 活跃战争
${rawParsed?.wars_detailed?.list ? rawParsed.wars_detailed.list.map((w: any) => `- ${w.name}: ${w.attacker} vs ${w.defender}${w.goal ? ` (目标: ${w.goal})` : ''}${w.exhaustion ? ` [厌战: ${w.exhaustion}]` : ''}`).join('\n') : '暂无'}

## 考古遗址与局势
${rawParsed?.archaeology?.sites ? rawParsed.archaeology.sites.map((a: any) => `- [考古] ${a.name}: 阶段${a.stage}/${a.total_stages}`).join('\n') : ''}${rawParsed?.situations?.list ? rawParsed.situations.list.map((s: any) => `- [局势] ${s.type}${s.progress !== undefined ? ` (${s.progress}%)` : ''}${s.target ? ` → ${s.target}` : ''}`).join('\n') : ''}

## 派系
${rawParsed?.population?.factions ? rawParsed.population.factions.map((f: any) => `- ${f.name}: ${f.size}%支持`).join('\n') : '暂无数据'}

## 重大事件时间轴

${events}

## 已识别事件链

${eventChains || '暂无'}`;

  return { system, intro };
}

// ===== Helpers =====

function safeParse(s: string | null): string[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
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
      { role: 'system', content: '你是长篇小说连续性编辑。只输出 JSON，不要添加 Markdown。保留仍然有效的旧信息，删除已解决的伏笔。' },
      { role: 'user', content: `旧连续性档案：\n${JSON.stringify(previous || {})}\n\n新章节：\n${content}\n\n输出结构：{"summary":"200-350字章节概要","continuity":{"characters":["人物及当前状态"],"factions":["势力及关系"],"unresolvedThreads":["尚未解决的伏笔"],"activeEventChains":["仍在推进、尚未完结的群星事件链及当前阶段"],"completedEventChains":["已完结的事件链及其结局"],"eventChainChoices":["玩家在事件链中的关键选择"],"eventChainConsequences":["事件链选择导致的后果"],"unresolvedEventChainClues":["已知但尚未揭示的事件链线索,不可提前泄露结局"],"establishedFacts":["不可违背的既定事实"],"timelineState":"章节结束时的时间和总体局势"}}` },
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
  } catch { return fallback; }
}

function buildEventChains(milestones: { event_date: string; title: string; raw_flag: string | null }[]): string {
  const evidence: SaveEvidence = {
    countryFlags: new Set<string>(),
    globalFlags: new Set<string>(),
    planetFlags: new Set<string>(),
    starFlags: new Set<string>(),
    completedAnomalies: [], activeProjects: [], completedProjects: [],
    archaeologySites: [], firedEvents: [],
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
  try { chains = detectEventChains(evidence); } catch { chains = []; }
  if (chains.length === 0) return '暂无可识别的多阶段事件链。';
  return chains.map(chain => {
    const sl = chain.status === 'completed' ? '已完成' : chain.status === 'active' ? '进行中' : chain.status === 'failed' ? '已失败' : '状态未知';
    return `### ${chain.name} (${sl}, ${chain.category || '剧情'})\n当前阶段: ${chain.currentStage}${chain.selectedChoices.length > 0 ? `\n玩家选择: ${chain.selectedChoices.join(', ')}` : ''}`;
  }).join('\n\n');
}
