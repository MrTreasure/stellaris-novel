'use client';

import { useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { AlertIcon, BookIcon, ChevronLeftIcon, DownloadIcon, RefreshIcon, SaveIcon, SparkIcon, SpinnerIcon } from '@/components/Icons';
import { ContinuityBible, emptyContinuity, loadAIConfig, loadLocalNovel, LocalChapter, saveLocalNovel } from '@/lib/browser-storage';

export default function NovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = parseInt(id);
  const [campaignName, setCampaignName] = useState('银河编年史');
  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [chapters, setChapters] = useState<LocalChapter[]>([]);
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
  const streamEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const localNovel = loadLocalNovel(campaignId);
    if (localNovel) {
      setCampaignName(localNovel.title.replace(/史诗$/, ''));
      setChapters(localNovel.chapters);
      setContinuity(localNovel.continuity);
      setBgSettings(localNovel.background);
      setBgEnabled(localNovel.backgroundEnabled);
      if (localNovel.chapters.length > 0) {
        setCurrentChapter(localNovel.chapters.at(-1)?.chapter_number || 0);
      }
    }
    fetch(`/api/campaigns/${campaignId}`)
      .then(response => response.json())
      .then(data => {
        if (data.campaign?.name) setCampaignName(data.campaign.name);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [campaignId]);

  useEffect(() => {
    if (!streamContent) return;
    streamEndRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [streamContent]);

  const persistNovel = (nextChapters: LocalChapter[], background = bgSettings, enabled = bgEnabled) => {
    saveLocalNovel({
      campaignId,
      title: `${campaignName}史诗`,
      background,
      backgroundEnabled: enabled,
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

  const saveBackground = () => {
    setBgSettings(draftBgSettings);
    setBgEnabled(draftBgEnabled);
    persistNovel(chapters, draftBgSettings, draftBgEnabled);
    setShowBg(false);
  };

  const hasNextChapter = chapters.some(chapter => chapter.chapter_number === currentChapter + 1);
  const hasCurrentChapter = currentChapter > 0 && chapters.some(chapter => chapter.chapter_number === currentChapter);

  const doGenerate = async (opts?: { mode?: 'new' | 'rewrite'; chapterNumber?: number; instructions?: string }) => {
    const config = loadAIConfig();
    if (!config.apiKey) {
      setError('请先前往系统设置配置并保存 API Key。');
      return;
    }

    setGenerating(true);
    setStreamContent('');
    setError('');
    const mode = opts?.mode || 'new';
    const targetChapter = mode === 'rewrite' ? opts?.chapterNumber : chapters.length + 1;

    try {
      const response = await fetch('/api/novels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          chapter_index: targetChapter,
          chapter_number: targetChapter,
          mode,
          instructions: opts?.instructions,
          background: bgEnabled ? bgSettings : '',
          chapters,
          continuity,
          config,
        }),
      });
      if (!response.ok) {
        setError(await response.text());
        return;
      }

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
            } else if (payload.type === 'done') {
              const chapterNumber = payload.chapter_number as number;
              const nextChapter: LocalChapter = {
                id: `chapter-${chapterNumber}-${Date.now()}`,
                chapter_number: chapterNumber,
                title: `第${chapterNumber}章${mode === 'rewrite' ? '（重写）' : ''}`,
                content: fullContent,
                summary: payload.summary || fullContent.slice(0, 300),
              };
              const nextContinuity = payload.continuity || continuity;
              const nextChapters = mode === 'rewrite'
                ? chapters.map(chapter => chapter.chapter_number === chapterNumber ? nextChapter : chapter)
                : [...chapters, nextChapter];
              setChapters(nextChapters);
              setContinuity(nextContinuity);
              setCurrentChapter(chapterNumber);
              saveLocalNovel({
                campaignId,
                title: `${campaignName}史诗`,
                background: bgSettings,
                backgroundEnabled: bgEnabled,
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const downloadNovel = () => {
    const content = [
      `# ${campaignName}史诗`,
      bgEnabled && bgSettings ? `\n## 背景设定\n\n${bgSettings}` : '',
      ...chapters.map(chapter => `\n## 第${chapter.chapter_number}章\n\n${chapter.content}`),
      `\n## 连续性档案\n\n当前局势：${continuity.timelineState}\n\n人物：\n${continuity.characters.map(item => `- ${item}`).join('\n')}\n\n势力：\n${continuity.factions.map(item => `- ${item}`).join('\n')}\n\n未解决伏笔：\n${continuity.unresolvedThreads.map(item => `- ${item}`).join('\n')}`,
      `\n进行中的事件链：\n${continuity.activeEventChains.map(item => `- ${item}`).join('\n')}`,
    ].filter(Boolean).join('\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${campaignName}史诗.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const currentChapterObj = chapters.find(chapter => chapter.chapter_number === currentChapter);
  const activeContent = streamContent || currentChapterObj?.content || '';

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)]" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      <aside className="panel h-fit p-4 lg:sticky lg:top-20">
        <Link href={`/campaigns/${campaignId}`} className="mb-5 inline-flex min-h-11 items-center gap-2 font-mono text-xs tracking-wider text-[#73cfc6] transition hover:text-[#a2fff5]">
          <ChevronLeftIcon className="h-4 w-4" />返回战役
        </Link>
        <div className="flex items-center justify-between border-b border-[#29494d] pb-3">
          <h2 className="flex items-center gap-2 font-semibold text-[#d5e4e2]"><BookIcon className="h-4 w-4 text-[#70d8ce]" />章节索引</h2>
          <span className="font-mono text-xs text-[#587779]">{chapters.length.toString().padStart(2, '0')}</span>
        </div>

        <div className="my-4 flex max-h-[38vh] gap-2 overflow-x-auto lg:block lg:max-h-[42vh] lg:space-y-1 lg:overflow-y-auto">
          {chapters.map(chapter => (
            <button key={chapter.id} onClick={() => { setCurrentChapter(chapter.chapter_number); setStreamContent(''); }}
              className={`min-h-11 shrink-0 border px-3 py-2 text-left text-sm transition-colors lg:w-full ${
                currentChapter === chapter.chapter_number
                  ? 'border-[#5cc8be] bg-[#3daea4]/15 text-[#9af2e8]'
                  : 'border-transparent text-[#7e9899] hover:border-[#31585c] hover:bg-[#0a2029] hover:text-[#c5d7d5]'
              }`}>
              <span className="font-mono text-[10px] text-[#537476]">CH.</span> {chapter.chapter_number.toString().padStart(2, '0')}
            </button>
          ))}
        </div>

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
          <button onClick={downloadNovel} disabled={chapters.length === 0} className="secondary-button w-full">
            <DownloadIcon className="h-4 w-4" />下载整部小说
          </button>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-[#5f7b7d]">章节和背景设定自动保存在当前浏览器，不会上传到服务端数据库。</p>
        {error && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#e49b91]"><AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      </aside>

      <article className="panel min-h-[600px] p-5 sm:p-8 lg:p-10">
        <div className="mb-8 border-b border-[#29494d] pb-5">
          <div className="section-label">Narrative Core / Manuscript</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-wide text-[#dbeae8]">
            {streamContent && !currentChapterObj ? `第${chapters.length + 1}章 · 生成中` :
             currentChapter > 0 ? `第${currentChapter}章` : '等待创建第一章'}
          </h1>
        </div>
        {streamContent && <div className="mb-5 flex items-center gap-2 font-mono text-xs tracking-wider text-[#68c6bd]"><SpinnerIcon className="spin h-3.5 w-3.5" />AI NARRATIVE STREAM ACTIVE</div>}
        <div className="mx-auto max-w-3xl whitespace-pre-wrap text-[16px] leading-8 text-[#bdcecc]">
          {activeContent || (
            <div className="flex h-96 items-center justify-center text-[#5e7a7c]">
              <div className="text-center"><BookIcon className="mx-auto mb-5 h-12 w-12 text-[#426c6f]" /><p>从章节控制台启动小说工程</p></div>
            </div>
          )}
          <div ref={streamEndRef} />
        </div>
      </article>

      {showBg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="background-title">
          <div className="panel flex max-h-[90vh] w-full max-w-4xl flex-col p-6 sm:p-8">
            <h2 id="background-title" className="text-xl font-semibold text-[#dbeae8]">小说背景设定</h2>
            <p className="mt-2 text-sm leading-6 text-[#829c9e]">补充文明社会、核心角色、政治派系、叙事禁区和文风要求。设定会随每次生成请求发送给 AI。</p>
            <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[#a9bfbe]">
              <input type="checkbox" checked={draftBgEnabled} onChange={event => setDraftBgEnabled(event.target.checked)} className="h-4 w-4 accent-[#64dfd2]" />
              启用额外背景设定
            </label>
            <textarea
              value={draftBgSettings}
              onChange={event => setDraftBgSettings(event.target.value)}
              disabled={!draftBgEnabled}
              placeholder="例如：帝国以贸易立国；议会内存在保守派与改革派；主角是一名长期驻守边境的舰队司令……"
              className="field mt-3 min-h-[320px] flex-1 resize-y text-base leading-7 disabled:cursor-not-allowed disabled:opacity-45"
            />
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
              <MemorySection title="人物与状态" items={continuity.characters} />
              <MemorySection title="势力与关系" items={continuity.factions} />
              <MemorySection title="未解决伏笔" items={continuity.unresolvedThreads} />
              <MemorySection title="既定事实" items={continuity.establishedFacts} />
            </div>
            <div className="mt-6 border-t border-[#29494d] pt-6">
              <h3 className="font-semibold text-[#c9dcda]">章节概要</h3>
              <div className="mt-3 space-y-3">
                {chapters.length === 0 ? <p className="text-sm text-[#688486]">生成章节后会自动建立概要。</p> : chapters.map(chapter => (
                  <div key={chapter.id} className="border border-[#29494d] bg-[#06141d]/70 p-4">
                    <p className="font-mono text-xs text-[#69c6bd]">CHAPTER {chapter.chapter_number.toString().padStart(2, '0')}</p>
                    <p className="mt-2 text-sm leading-6 text-[#a9bfbe]">{chapter.summary || '暂无概要'}</p>
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
            <textarea value={rewriteInstructions} onChange={event => setRewriteInstructions(event.target.value)} className="field h-36 resize-none text-sm" />
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
