'use client';

import { useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { AlertIcon, BookIcon, ChevronLeftIcon, DownloadIcon, RefreshIcon, SaveIcon, SparkIcon, SpinnerIcon } from '@/components/Icons';
import { ContinuityBible, emptyContinuity, loadAIConfig, loadLocalNovel, LocalChapter, saveLocalNovel, type NovelMessage } from '@/lib/browser-storage';
import type { TokenUsage } from '@/lib/ai-client';

// Rough token estimator: CJK chars ≈ 1.5 tokens, ASCII ≈ 0.3 tokens
function estimateTokens(messages: NovelMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') chars += m.content.length;
  }
  // ~60% CJK weighted
  return Math.round(chars * 0.6);
}

const TOKEN_LIMIT = 500_000;

export default function NovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = parseInt(id);
  const [campaignName, setCampaignName] = useState('银河编年史');
  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [chapters, setChapters] = useState<LocalChapter[]>([]);
  const [messages, setMessages] = useState<NovelMessage[]>([]);
  const [continuity, setContinuity] = useState<ContinuityBible>(emptyContinuity);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewriteInstructions, setRewriteInstructions] = useState('');
  const [bgSettings, setBgSettings] = useState('');
  const [draftBgSettings, setDraftBgSettings] = useState('');
  const [showBg, setShowBg] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [bgEnabled, setBgEnabled] = useState(false);
  const [draftBgEnabled, setDraftBgEnabled] = useState(false);
  const [promptPreview, setPromptPreview] = useState('');
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [outline, setOutline] = useState('');
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [toolCalls, setToolCalls] = useState<Array<{ id: string; name: string; args: unknown; status: 'running' | 'done'; result?: unknown }>>([]);
  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const localNovel = await loadLocalNovel(campaignId);
      if (localNovel) {
        setCampaignName(localNovel.title.replace(/史诗$/, ''));
        setChapters(localNovel.chapters);
        setMessages(localNovel.messages || []);
        setContinuity(localNovel.continuity);
        setBgSettings(localNovel.background);
        setBgEnabled(localNovel.backgroundEnabled);
        setOutline(localNovel.outline || '');
        // Auto-generate outline on first visit if none exists
        if (!localNovel.outline && localNovel.chapters.length === 0) {
          setTimeout(() => generateOutline(), 500);
        }
        if (localNovel.chapters.length > 0) {
          setCurrentChapter(localNovel.chapters.at(-1)?.chapter_number || 0);
        }
      }
      fetch(`/api/campaigns/${campaignId}`)
        .then(r => r.json())
        .then(d => { if (d.campaign?.name) setCampaignName(d.campaign.name); })
        .catch(() => {})
        .finally(() => setLoaded(true));
    })();
  }, [campaignId]);

  // Auto-scroll disabled during generation — user controls scroll position

  const persistNovel = async (nextChapters: LocalChapter[], nextMessages?: NovelMessage[], background = bgSettings, enabled = bgEnabled) => {
    await saveLocalNovel({
      campaignId,
      title: `${campaignName}史诗`,
      background,
      backgroundEnabled: enabled,
      outline,
      messages: nextMessages ?? messages,
      chapters: nextChapters,
      continuity,
      updatedAt: new Date().toISOString(),
    });
  };

  const openBackground = () => {
    setDraftBgSettings(bgSettings);
    setDraftBgEnabled(bgEnabled);
    setShowBg(true);
  };

  const saveBackground = async () => {
    setBgSettings(draftBgSettings);
    setBgEnabled(draftBgEnabled);
    await persistNovel(chapters, undefined, draftBgSettings, draftBgEnabled);
    setShowBg(false);
  };

  const deleteChapter = async (chapterNumber: number) => {
    if (!confirm(`确认删除第${chapterNumber}章？此操作不可撤销，相关对话历史也会清除。`)) return;
    const targetChapter = chapters.find(c => c.chapter_number === chapterNumber);
    if (!targetChapter) return;
    const nextChapters = chapters.filter(c => c.chapter_number !== chapterNumber);

    // Scan messages to find and remove the assistant response for this chapter
    // Match by content: the assistant message should contain the chapter content (or at least its start)
    const contentStart = targetChapter.content?.slice(0, 200)?.trim();
    const nextMessages = [...messages];
    if (contentStart) {
      // Find assistant message containing this chapter's content
      const asstIdx = nextMessages.findIndex(m =>
        m.role === 'assistant' && typeof m.content === 'string' && m.content.includes(contentStart)
      );
      if (asstIdx !== -1) {
        // For non-first chapters, also remove the preceding user prompt
        if (chapterNumber > 1 && asstIdx > 0 && nextMessages[asstIdx - 1].role === 'user') {
          nextMessages.splice(asstIdx - 1, 2);
        } else {
          nextMessages.splice(asstIdx, 1);
        }
      }
    }
    setMessages(nextMessages);
    setChapters(nextChapters);

    // Navigate to previous chapter if deleting current
    if (currentChapter === chapterNumber) {
      const prev = nextChapters.filter(c => c.chapter_number < chapterNumber).at(-1);
      setCurrentChapter(prev?.chapter_number || 0);
      setStreamContent('');
    }
    await saveLocalNovel({ campaignId, title: `${campaignName}史诗`, background: bgSettings, backgroundEnabled: bgEnabled, outline, messages: nextMessages, chapters: nextChapters, continuity, updatedAt: new Date().toISOString() });
  };

  const hasNextChapter = chapters.some(c => c.chapter_number === currentChapter + 1);
  const hasCurrentChapter = currentChapter > 0 && chapters.some(c => c.chapter_number === currentChapter);

  const doGenerate = async (opts?: { mode?: 'new' | 'rewrite'; chapterNumber?: number; instructions?: string }) => {
    const config = loadAIConfig();
    if (!config.apiKey) { setError('请先前往系统设置配置并保存 API Key。'); return; }

    setGenerating(true);
    setStreamContent('');
    setError('');
    setToolCalls([]);
    const mode = opts?.mode || 'new';
    const targetChapter = mode === 'rewrite' ? opts?.chapterNumber ?? currentChapter : chapters.length + 1;

    // Immediately create placeholder chapter for new chapters
    let placeholderChapter: LocalChapter | undefined;
    if (mode === 'new') {
      placeholderChapter = {
        id: `chapter-${targetChapter}-${Date.now()}`,
        chapter_number: targetChapter,
        title: `第${targetChapter}章 · 生成中`,
        content: '',
        summary: '',
      };
      const nextChapters = [...chapters, placeholderChapter];
      setChapters(nextChapters);
      setCurrentChapter(targetChapter);
    }

    // Build messages if first generation
    let currentMessages = messages;
    if (currentMessages.length === 0) {
      try {
        const r = await fetch(`/api/novels/generate?campaign_id=${campaignId}`);
        if (r.ok) {
          const d = await r.json();
          currentMessages = d.messages;
          // Inject background setting into first user message if enabled
          if (bgEnabled && bgSettings && currentMessages.length > 1) {
            const firstUser = currentMessages.find(m => m.role === 'user');
            if (firstUser) {
              firstUser.content = `## 额外背景设定\n${bgSettings}\n\n${firstUser.content}`;
            }
          }
          setMessages(currentMessages);
        }
      } catch {}
    }

    // Append new user message for continuation
    if (mode === 'new' && currentMessages.length > 0 && chapters.length > 0) {
      const brief = formatContinuityBrief(continuity);
      const latestChapter = chapters.at(-1);
      const newUserMsg: NovelMessage = {
        role: 'user',
        content: [
          outline ? `## 章节大纲\n${outline}` : '',
          bgEnabled && bgSettings ? `## 额外背景设定\n${bgSettings}` : '',
          `## 长篇连续性档案\n${brief}`,
          `## 最近一章摘要\n${latestChapter?.summary || '暂无'}`,
          '',
          `请根据以上全部对话历史续写第${targetChapter}章。请自然承接上一章结尾，延续人物状态、势力关系和既有伏笔。`,
        ].filter(Boolean).join('\n'),
      };
      currentMessages = [...currentMessages, newUserMsg];
      setMessages(currentMessages);
    }

    try {
      const response = await fetch('/api/novels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          chapter_number: targetChapter,
          mode,
          messages: currentMessages,
          continuity,
          config,
        }),
      });
      if (!response.ok) { setError(await response.text()); return; }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const payload = JSON.parse(line);
            if (payload.type === 'chunk') {
              fullContent += payload.content;
              setStreamContent(fullContent);
            } else if (payload.type === 'tool-call') {
              setToolCalls(prev => [...prev, { id: payload.toolCallId || crypto.randomUUID(), name: payload.toolName, args: payload.args, status: 'running' }]);
            } else if (payload.type === 'tool-result') {
              setToolCalls(prev => prev.map(t => t.name === payload.toolName && t.status === 'running' ? { ...t, status: 'done', result: payload.result } : t));
            } else if (payload.type === 'done') {
              const chapterNum = payload.chapter_number as number;
              const nextChapter: LocalChapter = {
                id: `chapter-${chapterNum}-${Date.now()}`,
                chapter_number: chapterNum,
                title: `第${chapterNum}章${mode === 'rewrite' ? '（重写）' : ''}`,
                content: fullContent,
                summary: payload.summary || fullContent.slice(0, 300),
              };
              const nextContinuity = payload.continuity || continuity;
              const nextChapters = mode === 'rewrite'
                ? chapters.map(c => c.chapter_number === chapterNum ? nextChapter : c)
                : chapters.map(c => c.id === placeholderChapter?.id ? nextChapter : c);

              // Append assistant message
              const nextMessages: NovelMessage[] = [
                ...currentMessages,
                { role: 'assistant', content: fullContent },
              ];

              setChapters(nextChapters);
              setMessages(nextMessages);
              setContinuity(nextContinuity);
              setCurrentChapter(chapterNum);
              if (payload.usage) setTokenUsage(payload.usage);

              await saveLocalNovel({
                campaignId,
                title: `${campaignName}史诗`,
                background: bgSettings,
                backgroundEnabled: bgEnabled,
                outline,
                messages: nextMessages,
                chapters: nextChapters,
                continuity: nextContinuity,
                updatedAt: new Date().toISOString(),
              });
              setStreamContent('');
            } else if (payload.type === 'error') {
              setError(payload.error);
            }
          } catch {}
        }
      }
    } catch (caught: any) {
      setError(caught.message || '生成失败');
      // Remove placeholder on error
      if (placeholderChapter) {
        setChapters(prev => prev.filter(c => c.id !== placeholderChapter!.id));
        setCurrentChapter(chapters.at(-1)?.chapter_number || 0);
      }
    } finally {
      setGenerating(false);
    }
  };

  const downloadNovel = () => {
    const parts = [
      `# ${campaignName}史诗`,
      bgEnabled && bgSettings ? `\n## 背景设定\n\n${bgSettings}` : '',
      ...chapters.map(c => `\n## 第${c.chapter_number}章\n\n${c.content}`),
      `\n## 连续性档案\n\n当前局势：${continuity.timelineState}\n人物：${continuity.characters.join('\n')}\n势力：${continuity.factions.join('\n')}\n进行中的事件链：${continuity.activeEventChains.join('\n')}`,
    ].filter(Boolean);
    const blob = new Blob([parts.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${campaignName}史诗.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const generateOutline = async () => {
    const config = loadAIConfig();
    if (!config.apiKey) { setError('请先配置 API Key'); return; }
    setGeneratingOutline(true); setError(''); setOutline('');
    setShowOutline(true); // Immediately open dialog for streaming
    try {
      const r = await fetch('/api/novels/generate?campaign_id=' + campaignId);
      const d = await r.json();
      const sysMsg = d.messages?.find((m: any) => m.role === 'system');
      const userMsg = d.messages?.find((m: any) => m.role === 'user');
      const response = await fetch('/api/novels/generate/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: sysMsg?.content, user: userMsg?.content, config }),
      });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const payload = JSON.parse(line);
            if (payload.type === 'chunk') {
              acc += payload.content;
              setOutline(acc);
            } else if (payload.type === 'error') {
              setError(payload.error || '大纲生成失败');
            }
          } catch {}
        }
      }
      await saveLocalNovel({ campaignId, title: `${campaignName}史诗`, background: bgSettings, backgroundEnabled: bgEnabled, outline: acc, messages, chapters, continuity, updatedAt: new Date().toISOString() });
    } catch (e: any) { setError(e.message); }
    finally { setGeneratingOutline(false); }
  };

  const loadPromptPreview = async () => {
    setLoadingPreview(true);
    try {
      const r = await fetch(`/api/novels/generate?campaign_id=${campaignId}`);
      const d = await r.json();
      const msgs: NovelMessage[] = d.messages || [];
      setPromptPreview(msgs.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n'));
      setShowPromptPreview(true);
    } catch (e: any) {
      setPromptPreview('无法加载: ' + (e.message || ''));
      setShowPromptPreview(true);
    } finally {
      setLoadingPreview(false);
    }
  };

  const currentChapterObj = chapters.find(c => c.chapter_number === currentChapter);
  const activeContent = streamContent || currentChapterObj?.content || '';
  const estimatedTokens = estimateTokens(messages);
  const needsWindow = estimatedTokens > TOKEN_LIMIT;

  return (
    <div className={`mx-auto grid max-w-[1600px] gap-5 px-4 py-6 sm:px-6 ${generating ? 'lg:grid-cols-[220px_minmax(0,1fr)_160px]' : 'lg:grid-cols-[220px_minmax(0,1fr)]'}`} style={{ minHeight: 'calc(100vh - 4rem)' }}>
      <aside className="panel h-fit p-4 lg:sticky lg:top-20">
        <Link href={`/campaigns/${campaignId}`} className="mb-5 inline-flex min-h-11 items-center gap-2 font-mono text-xs tracking-wider text-[#73cfc6] transition hover:text-[#a2fff5]">
          <ChevronLeftIcon className="h-4 w-4" />返回战役
        </Link>
        <div className="flex items-center justify-between border-b border-[#29494d] pb-3">
          <h2 className="flex items-center gap-2 font-semibold text-[#d5e4e2]"><BookIcon className="h-4 w-4 text-[#70d8ce]" />章节索引</h2>
          <span className="font-mono text-xs text-[#587779]">{chapters.length.toString().padStart(2, '0')}</span>
        </div>

        <div className="my-4 flex max-h-[38vh] gap-2 overflow-x-auto lg:block lg:max-h-[42vh] lg:space-y-1 lg:overflow-y-auto">
          {chapters.map(c => (
            <div key={c.id} className="group relative shrink-0 lg:w-full">
              <button onClick={() => { setCurrentChapter(c.chapter_number); setStreamContent(''); }}
                className={`min-h-11 w-full border px-3 py-2 text-left text-sm transition-colors ${
                  currentChapter === c.chapter_number
                    ? 'border-[#5cc8be] bg-[#3daea4]/15 text-[#9af2e8]'
                    : 'border-transparent text-[#7e9899] hover:border-[#31585c] hover:bg-[#0a2029] hover:text-[#c5d7d5]'
                }`}>
                <span className="font-mono text-[10px] text-[#537476]">CH.</span> {c.chapter_number.toString().padStart(2, '0')}
              </button>
              <button onClick={(e) => { e.stopPropagation(); deleteChapter(c.chapter_number); }}
                className="absolute right-1 top-1/2 -translate-y-1/2 hidden h-6 w-6 items-center justify-center rounded text-[10px] text-[#7d5a5a] hover:bg-[#3d1a1a] hover:text-[#e07b7b] group-hover:flex"
                title="删除本章">
                ✕
              </button>
            </div>
          ))}
        </div>

        {tokenUsage && (
          <div className="mb-3 border border-[#29494d] bg-[#06141d]/70 p-2 text-[10px] leading-4 text-[#5a7678]">
            <div className="flex justify-between"><span>输入 tokens</span><span className="font-mono text-[#7be5d9]">{tokenUsage.inputTokens.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>缓存 tokens</span><span className="font-mono text-[#7fd6a0]">{tokenUsage.cachedInputTokens.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>输出 tokens</span><span className="font-mono text-[#dec374]">{tokenUsage.outputTokens.toLocaleString()}</span></div>
            {needsWindow && <div className="mt-1 border-t border-[#29494d] pt-1 text-[#e59a92]">上下文已达 {Math.round(estimatedTokens/1000)}K tokens<br />已启用滑动窗口</div>}
          </div>
        )}

        <div className="space-y-2">
          {chapters.length === 0 && !generating && loaded && (
            <button onClick={() => doGenerate()} className="primary-button w-full"><SparkIcon className="h-4 w-4" />开始创作</button>
          )}
          {hasCurrentChapter && !hasNextChapter && (
            <button onClick={() => doGenerate()} disabled={generating} className="primary-button w-full"><SparkIcon className="h-4 w-4" />续写下一章</button>
          )}
          {hasCurrentChapter && (
            <button onClick={() => setShowRewrite(true)} disabled={generating} className="secondary-button w-full"><RefreshIcon className="h-4 w-4" />重写本章</button>
          )}
          <button onClick={openBackground} className="secondary-button w-full">
            <SaveIcon className="h-4 w-4" />背景设定{bgEnabled ? '（已启用）' : ''}
          </button>
          <button onClick={() => setShowMemory(true)} className="secondary-button w-full">
            <BookIcon className="h-4 w-4" />连续性档案
          </button>
          <button onClick={generateOutline} disabled={generatingOutline} className="secondary-button w-full">
            <SparkIcon className="h-4 w-4" />{generatingOutline ? '生成中...' : outline ? '重新生成大纲' : '生成章节大纲'}
          </button>
          {outline && (
            <button onClick={() => setShowOutline(true)} className="secondary-button w-full text-left">
              <BookIcon className="h-4 w-4" />查看大纲
            </button>
          )}
          <button onClick={loadPromptPreview} disabled={loadingPreview} className="secondary-button w-full">
            <SparkIcon className="h-4 w-4" />{loadingPreview ? '加载中...' : '模型提示词预览'}
          </button>
          <button onClick={downloadNovel} disabled={chapters.length === 0} className="secondary-button w-full">
            <DownloadIcon className="h-4 w-4" />下载整部小说
          </button>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-[#5f7b7d]">章节和背景设定自动保存到浏览器 IndexedDB。提示词预览显示初始系统/用户提示词，全量对话上下文在每次生成时自动提交。</p>
        {error && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#e49b91]"><AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      </aside>

      <article className="panel min-h-[600px] p-5 sm:p-8 lg:p-10">
        <div className="mb-8 border-b border-[#29494d] pb-5">
          <div className="section-label">Narrative Core / Manuscript</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-wide text-[#dbeae8]">
            {streamContent && !currentChapterObj ? `第${chapters.length + 1}章 · 生成中` :
             currentChapter > 0 ? `第${currentChapter}章` : '等待创建第一章'}
          </h1>
          {needsWindow && messages.length > 0 && (
            <p className="mt-1 text-xs text-[#e59a92]">
              上下文窗口 ({Math.round(estimatedTokens/1000)}K tokens) — 已自动截断早期对话，保留最近 15 章完整内容
            </p>
          )}
        </div>
        {generating && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden="true">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(100,223,210,0.12),transparent_60%)] animate-pulse" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(142,165,232,0.08),transparent_50%)] animate-pulse" style={{ animationDelay: '400ms' }} />
            <div className="sci-fi-scanline absolute inset-0" />
            <div className="absolute inset-0 opacity-20" style={{
              background: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(100,223,210,0.04) 40px, rgba(100,223,210,0.04) 41px)',
              animation: 'scanline-drift 3s linear infinite',
            }} />
          </div>
        )}
        {generating && <div className="mb-5 flex items-center gap-2 font-mono text-xs tracking-wider text-[#68c6bd]"><span className="flex h-2.5 w-2.5"><span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-[#64dfd2] opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#64dfd2]" /></span>AI NARRATIVE STREAM ACTIVE</div>}
        <div className="mx-auto max-w-5xl whitespace-pre-wrap text-[16px] leading-8 text-[#bdcecc]">
          {activeContent || (
            <div className="flex h-96 items-center justify-center text-[#5e7a7c]">
              <div className="text-center"><BookIcon className="mx-auto mb-5 h-12 w-12 text-[#426c6f]" /><p>从章节控制台启动小说工程</p></div>
            </div>
          )}
          <div ref={streamEndRef} />
        </div>
      </article>

      {generating && (
        <aside className="panel h-fit p-4 lg:sticky lg:top-20">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-3 w-3"><span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-[#64dfd2] opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-[#64dfd2]" /></span>
            <div className="font-mono text-[10px] tracking-widest text-[#68c6bd]">生成中</div>
            <div className="text-[11px] leading-5 text-[#7d9a9c]">
              {!streamContent && toolCalls.length === 0 && '准备...'}
              {toolCalls.some(t => t.status === 'running') && '查询数据中'}
              {streamContent && !toolCalls.some(t => t.status === 'running') && '撰写中'}
              {streamContent && toolCalls.some(t => t.status === 'running') && '查询 + 撰写'}
            </div>
            <div className="font-mono text-[22px] font-semibold text-[#5cc8be] tabular-nums">{streamContent.length.toLocaleString()}</div>
            <div className="text-[9px] text-[#537476]">字符</div>
            {toolCalls.length > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#687d80]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#dec374]" />
                <span>{toolCalls.length} 次工具调用</span>
              </div>
            )}
          </div>
        </aside>
      )}

      {showBg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="background-title">
          <div className="panel flex max-h-[90vh] w-full max-w-4xl flex-col p-6 sm:p-8">
            <h2 id="background-title" className="text-xl font-semibold text-[#dbeae8]">小说背景设定</h2>
            <p className="mt-2 text-sm leading-6 text-[#829c9e]">补充文明社会、核心角色、政治派系、叙事禁区和文风要求。设定会随每次生成请求发送给 AI。</p>
            <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[#a9bfbe]">
              <input type="checkbox" checked={draftBgEnabled} onChange={e => setDraftBgEnabled(e.target.checked)} className="h-4 w-4 accent-[#64dfd2]" />
              启用额外背景设定
            </label>
            <textarea value={draftBgSettings} onChange={e => setDraftBgSettings(e.target.value)} disabled={!draftBgEnabled}
              className="field mt-3 min-h-[320px] flex-1 resize-y text-base leading-7 disabled:cursor-not-allowed disabled:opacity-45" />
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowBg(false)} className="secondary-button">取消</button>
              <button onClick={saveBackground} className="primary-button"><SaveIcon className="h-4 w-4" />保存设定</button>
            </div>
          </div>
        </div>
      )}

      {showMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="memory-title">
          <div className="panel max-h-[90vh] w-full max-w-5xl overflow-y-auto p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="memory-title" className="text-xl font-semibold text-[#dbeae8]">长篇连续性档案</h2>
                <p className="mt-2 text-sm text-[#829c9e]">该档案由每章完成后的 AI 编辑步骤自动更新，并在续写时重新注入上下文。</p>
              </div>
              <button onClick={() => setShowMemory(false)} className="secondary-button shrink-0">关闭</button>
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <MemorySection title="当前局势" items={continuity.timelineState ? [continuity.timelineState] : []} />
              <MemorySection title="进行中的事件链" items={continuity.activeEventChains} />
              <MemorySection title="已完成的事件链" items={continuity.completedEventChains} />
              <MemorySection title="事件链玩家选择" items={continuity.eventChainChoices} />
              <MemorySection title="事件链后果" items={continuity.eventChainConsequences} />
              <MemorySection title="未解决事件链线索" items={continuity.unresolvedEventChainClues} />
              <MemorySection title="人物与状态" items={continuity.characters} />
              <MemorySection title="势力与关系" items={continuity.factions} />
              <MemorySection title="未解决伏笔" items={continuity.unresolvedThreads} />
              <MemorySection title="既定事实" items={continuity.establishedFacts} />
            </div>
            <div className="mt-6 border-t border-[#29494d] pt-6">
              <h3 className="font-semibold text-[#c9dcda]">章节概要</h3>
              <div className="mt-3 space-y-3">
                {chapters.length === 0 ? <p className="text-sm text-[#688486]">生成章节后会自动建立概要。</p> : chapters.map(c => (
                  <div key={c.id} className="border border-[#29494d] bg-[#06141d]/70 p-4">
                    <p className="font-mono text-xs text-[#69c6bd]">CHAPTER {c.chapter_number.toString().padStart(2, '0')}</p>
                    <p className="mt-2 text-sm leading-6 text-[#a9bfbe]">{c.summary || '暂无概要'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showRewrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="rewrite-title">
          <div className="panel w-full max-w-lg p-6">
            <h2 id="rewrite-title" className="flex items-center gap-2 text-lg font-semibold text-[#d7e6e4]"><RefreshIcon className="h-5 w-5 text-[#72d8ce]" />重写第{currentChapter}章</h2>
            <p className="mb-4 mt-2 text-sm text-[#789293]">描述希望调整的视角、节奏、情节或文风。</p>
            <textarea value={rewriteInstructions} onChange={e => setRewriteInstructions(e.target.value)} className="field h-36 resize-none text-sm" />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setShowRewrite(false)} className="secondary-button">取消</button>
              <button onClick={() => {
                doGenerate({ mode: 'rewrite', chapterNumber: currentChapter, instructions: rewriteInstructions });
                setShowRewrite(false);
                setRewriteInstructions('');
              }} disabled={generating} className="primary-button">确认重写</button>
            </div>
          </div>
        </div>
      )}

      {showOutline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="panel flex h-[95vh] w-full max-w-5xl flex-col p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-[#dbeae8]">章节大纲</h2>
                {generatingOutline && <p className="mt-1 font-mono text-xs text-[#68c6bd]"><SpinnerIcon className="spin mr-1 inline h-3 w-3" />流式生成中...</p>}
              </div>
              <button onClick={() => setShowOutline(false)} className="secondary-button shrink-0">关闭</button>
            </div>
            <textarea value={outline} onChange={e => { setOutline(e.target.value); }}
              className="field mt-4 flex-1 min-h-[650px] resize-y text-sm leading-7"
              placeholder={generatingOutline ? '正在生成大纲...' : ''} />
            <div className="mt-4 flex justify-between gap-3">
              <p className="text-[11px] text-[#5f7b7d]">大纲会在生成每章时自动注入提示词，支持直接编辑</p>
              <button onClick={async () => {
                await saveLocalNovel({ campaignId, title: `${campaignName}史诗`, background: bgSettings, backgroundEnabled: bgEnabled, outline, messages, chapters, continuity, updatedAt: new Date().toISOString() });
                setShowOutline(false);
              }} className="primary-button"><SaveIcon className="h-4 w-4" />保存</button>
            </div>
          </div>
        </div>
      )}

      {showPromptPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="preview-title">
          <div className="panel flex h-[92vh] w-full max-w-6xl flex-col p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 shrink-0">
              <div>
                <h2 id="preview-title" className="text-xl font-semibold text-[#dbeae8]">完整提示词预览</h2>
                <p className="mt-2 text-sm text-[#829c9e]">以下为发送给 AI 模型的完整提示词，可复制用于调试。含 3 个工具定义。</p>
              </div>
            </div>
            <textarea value={promptPreview} onChange={e => setPromptPreview(e.target.value)}
              className="field mt-4 flex-1 min-h-0 resize-none font-mono text-xs leading-5"
              placeholder="加载中..." />
            <div className="mt-4 flex shrink-0 justify-end gap-3">
              <button onClick={() => navigator.clipboard.writeText(promptPreview)} className="secondary-button">复制到剪贴板</button>
              <button onClick={() => setShowPromptPreview(false)} className="primary-button">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemorySection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="border border-[#29494d] bg-[#06141d]/70 p-4">
      <h3 className="text-sm font-semibold text-[#c9dcda]">{title}</h3>
      {items.length === 0 ? <p className="mt-2 text-sm text-[#5f7b7d]">暂无记录</p> : (
        <ul className="mt-2 space-y-2 text-sm leading-6 text-[#9fb6b5]">
          {items.map((item, index) => <li key={`${title}-${index}`} className="flex gap-2"><span className="text-[#58b8af]">—</span><span>{item}</span></li>)}
        </ul>
      )}
    </section>
  );
}

function formatContinuityBrief(c: ContinuityBible): string {
  return [
    `当前局势：${c.timelineState || '?'}`,
    `人物：${c.characters?.join('；') || '?'}`,
    `势力：${c.factions?.join('；') || '?'}`,
    `既定事实：${c.establishedFacts?.join('；') || '?'}`,
    `未解决伏笔：${c.unresolvedThreads?.join('；') || '?'}`,
    `进行中的事件链：${c.activeEventChains?.join('；') || '?'}`,
    `已完成的事件链：${c.completedEventChains?.join('；') || '?'}`,
  ].join('\n');
}
