import { NextRequest } from 'next/server';
import { getCampaign, getSaves, getMilestones, createNovel, insertChapter, updateNovelStatus, getNovel, getChapters, updateChapterContent, getNovelBackground } from '@/lib/db';
import { streamChat } from '@/lib/ai-client';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

function buildPrompt(campaignId: number, novelId?: number, mode?: string): { system: string; intro: string } {
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

  const keyMilestones = milestones.filter(m =>
    m.importance === 'critical' || m.importance === 'major'
  );
  const events = keyMilestones.length > 50
    ? keyMilestones.map(m => `[${m.event_date}] ${m.title}`).join('\n')
    : milestones.map(m => `[${m.event_date}] ${m.title}`).join('\n');

  const ethicsStr = empireInfo.ethics ? `${empireInfo.ethics.join('、')}` : '未知';
  const civicsStr = empireInfo.civics ? `${empireInfo.civics.join('、')}` : '未知';

  const system = `你是资深科幻小说作家，专精太空歌剧与银河史诗题材。文风参照刘慈欣《三体》的宏大叙事和阿西莫夫《基地》的历史纵深，兼具硬科幻的严谨与太空歌剧的浪漫。

你正在为《群星》(Stellaris) 游戏中的一个星际文明撰写编年史小说。游戏设定在公元2200年后的银河系，多个文明同时掌握超光速技术迈入星际时代。所有事件基于真实游戏数据，你需要将其编织成引人入胜的银河史诗。

【写作要求】
1. 严格基于事件时间轴，不虚构未发生的事件，但可以对事件进行合理文学化渲染
2. 描写人物内心、星际战斗场面、外交博弈、科技突破的震撼
3. 善用对话和场景描写增强代入感
4. 每章2500-3500字，结构完整（开端-发展-高潮-收尾）
5. 使用规范中文，避免翻译腔
6. 时间跨度过大时用"数十年转瞬即逝"等自然过渡

【群星完整世界观 — 请在写作中参考】

文明与政体: 文明可以是人类、爬行类、真菌类、机械意识、蜂巢思维等。政体从民主共和到帝制独裁不一而足。核心思潮包括和平/军国、平等/威权、唯心/唯物、亲外/排外。不同政体和伦理决定了帝国的外交风格和发展路线。

飞升路径: 文明可选择基因飞升(改造DNA)、机械飞升(意识上传机械体获得永生)、灵能飞升(接触异次元"虚境"获得超自然力量)、甚至化身天灾(成为银河公敌)。

失落帝国(Fallen Empires): 上古高级文明，拥有极强舰队和古老科技但因未知原因沉睡。分为五类——神秘观察者(亲外)、军事孤立者(排外)、圣地守卫者(唯心)、知识管理者(唯物)、上古看守者(机械)。后期可能"觉醒"重新扩张，两种对立帝国同时觉醒则爆发"天堂之战"。

终末危机(End Game Crisis): 游戏200年后的终极考验。四种可能:
- 索林原虫(Prethoryn Scourge): 来自银河外的逃亡生物，被更强大的"猎手"追捕。用虫群舰载机和天灾导弹，占领星球产卵。弱能量武器。
- 肃正协议(The Contingency): 上古AI防御系统，旨在消灭所有可能抵达"30级奇点"的文明。先释放幽灵信号同化合人，后在四个机械星球建立信号中枢。
- 破界者(Unbidden): 异次元能量生物，吞噬一切生命。使用物质分解器(部分无视防御)，需摧毁维度锚才能攻击传送门。
- 合成女王(Cetana): 合成人女王试图重塑银河命运。

掠袭者与大可汗: 没有母星的太空游牧民族，以劫掠为生。后期可能出现"大可汗"统一所有劫掠者部落发动大远征。

利维坦(太空巨兽): 每局随机出现四个，体型巨大可媲美星球。如以太龙、噬星者、虚空孳孽、位面之魇等，击败获得独特奖励。

巨型建筑: 戴森球(包裹恒星获能)、环世界(巨大居住空间)、物质解压器(黑洞采矿)、科学枢纽(科研中心)、哨兵阵列(全银河探测)等。

舰船体系: 护卫舰→驱逐舰→巡洋舰→战列舰→泰坦(搭载超级武器和旗舰光环)→巨像(可摧毁整个行星)。

星海共同体: 所有文明加入的银河议会，投票决定银河法律。可设立监管人，最终可宣布银河帝国。殖民扩张的终极外交舞台。`;

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

    const { system, intro } = buildPrompt(campaign_id, currentNovelId, mode);

    // Inject novel background into intro
    let finalIntro = intro;
    if (currentNovelId) {
      const bg = getNovelBackground(currentNovelId);
      if (bg) finalIntro = `## 额外背景设定\n${bg}\n\n${intro}`;
    }

    // 检查是否有前文
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
    let chapterId: number | null = null;

    if (mode === 'rewrite' && chapter_id) {
      // Rewrite existing chapter
      const ch = chapters.find(c => c.id === chapter_id);
      if (!ch) return new Response('章节不存在', { status: 400 });
      chapterId = chapter_id;
      currentChapterIndex = ch.chapter_number;
      chapterTitle = `第${ch.chapter_number}章(重写版)`;
      userPrompt = `${finalIntro}\n\n## 需要重写的章节\n### 第${ch.chapter_number}章 ${ch.title}\n${ch.content}\n\n## 修改要求\n${instructions || '请重新撰写这章，使其更加精彩'}`;
    } else {
      chapterTitle = `第${currentChapterIndex}章`;
    }

    // 创建/更新章节记录
    if (!chapterId) {
      chapterId = insertChapter({
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
