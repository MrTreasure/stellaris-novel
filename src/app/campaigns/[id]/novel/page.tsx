'use client';

import { useState, useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function NovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const existingNovelId = searchParams.get('novel_id');
  const campaignId = parseInt(id);

  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [novelId, setNovelId] = useState<number | null>(existingNovelId ? parseInt(existingNovelId) : null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Rewrite modal
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewriteInstructions, setRewriteInstructions] = useState('');
  // Background settings
  const [bgSettings, setBgSettings] = useState('');
  const [showBg, setShowBg] = useState(false);
  const [bgEnabled, setBgEnabled] = useState(false);

  useEffect(() => {
    if (novelId) {
      fetch(`/api/novels/${novelId}/chapters`)
        .then(r => r.json())
        .then(ch => { setChapters(ch); if (ch.length > 0 && currentChapter === 0) setCurrentChapter(ch[ch.length - 1].chapter_number); })
        .catch(() => {})
        .finally(() => setLoaded(true));
      fetch(`/api/novels/${novelId}/settings`)
        .then(r => r.json())
        .then(s => { if (s.background) { setBgSettings(s.background); setBgEnabled(true); } })
        .catch(() => {});
    }
  }, [novelId]);

  const saveBg = async (text: string, enabled: boolean) => {
    setBgSettings(text); setBgEnabled(enabled);
    if (novelId) {
      await fetch(`/api/novels/${novelId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background: enabled ? text : '' }),
      });
    }
  };

  const hasNextChapter = chapters.some(c => c.chapter_number === currentChapter + 1);
  const hasCurrentChapter = currentChapter > 0 && chapters.some(c => c.chapter_number === currentChapter);

  const doGenerate = async (opts?: { mode?: string; chapterId?: number; instructions?: string }) => {
    setGenerating(true); setStreamContent(''); setError('');
    const mode = opts?.mode || 'new';
    try {
      const res = await fetch('/api/novels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          novel_id: novelId,
          chapter_index: mode === 'rewrite' ? undefined : (chapters.length || currentChapter || 0) + 1,
          mode: mode,
          chapter_id: opts?.chapterId,
          instructions: opts?.instructions,
        }),
      });
      if (!res.ok) { setError(`API ${res.status}`); setGenerating(false); return; }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '', fullContent = '', gotNovelId = novelId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.type === 'chunk') { fullContent += json.content; setStreamContent(fullContent); }
            else if (json.type === 'done') {
              if (!gotNovelId) { gotNovelId = json.novel_id; setNovelId(json.novel_id); }
              if (json.mode === 'rewrite') {
                setChapters(prev => prev.map(c => c.id === (opts?.chapterId) ? { ...c, content: fullContent, title: `第${json.chapter_number}章(重写)` } : c));
              } else {
                setChapters(prev => [...prev, { id: json.chapter_id, chapter_number: json.chapter_number, title: `第${json.chapter_number}章`, content: fullContent }]);
              }
              setCurrentChapter(json.chapter_number);
              setStreamContent('');
            } else if (json.type === 'error') setError(json.error);
          } catch {}
        }
      }
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const currentChapterObj = chapters.find(c => c.chapter_number === currentChapter);
  const activeContent = streamContent || currentChapterObj?.content || '';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
      {/* Sidebar */}
      <div className="w-56 shrink-0">
        <Link href={`/campaigns/${campaignId}`} className="text-xs text-cyan-400 hover:text-cyan-300 mb-4 block font-mono tracking-wider">← 返回战役</Link>
        <h2 className="text-lg font-bold text-gray-200 mb-4">📖 章节</h2>

        <div className="space-y-1 mb-4 max-h-[55vh] overflow-y-auto">
          {chapters.map((ch, i) => (
            <button key={i} onClick={() => { setCurrentChapter(ch.chapter_number); setStreamContent(''); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
                currentChapter === ch.chapter_number
                  ? 'border-cyan-600 bg-cyan-500/20 text-cyan-300'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}>
              第{ch.chapter_number}章
            </button>
          ))}
          {generating && streamContent && !currentChapterObj && (
            <div className="px-3 py-2 rounded-lg text-sm border border-cyan-600/50 bg-cyan-500/10 text-cyan-400 animate-pulse">
              第{(chapters.length || 0) + 1}章 · 生成中...
            </div>
          )}
        </div>

        <div className="space-y-2">
          {chapters.length === 0 && !generating && loaded && (
            <button onClick={() => doGenerate()} disabled={generating}
              className="w-full px-4 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-xl text-sm font-medium transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)]">
              ✨ 开始创作
            </button>
          )}
          {hasCurrentChapter && !hasNextChapter && (
            <button onClick={() => doGenerate()} disabled={generating}
              className="w-full px-4 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-xl text-sm font-medium transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)]">
              📝 续写下一章
            </button>
          )}
          {hasCurrentChapter && (
            <button onClick={() => setShowRewrite(true)} disabled={generating}
              className="w-full px-4 py-2.5 border border-cyan-800/40 hover:border-cyan-600 text-cyan-400/80 hover:text-cyan-300 rounded-xl text-sm transition-all">
              🔄 重写本章
            </button>
          )}
        </div>

        {/* Background Settings Toggle */}
        <div className="mt-4 pt-4 border-t border-gray-800/60">
          <button onClick={() => setShowBg(!showBg)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full">
            <span>{showBg ? '▼' : '▶'}</span> 背景设定
            {bgEnabled && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
          </button>
          {showBg && (
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={bgEnabled} onChange={e => saveBg(bgSettings, e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-cyan-600 focus:ring-cyan-600" />
                启用额外背景设定
              </label>
              {bgEnabled && (
                <textarea value={bgSettings} onChange={e => saveBg(e.target.value, true)}
                  placeholder="输入额外的世界背景设定，AI 生成时会在每章中遵循这些设定。&#10;例如: 这个文明以贸易立国，外交手腕灵活;&#10;帝国内部存在保守派与改革派的政治斗争..."
                  className="w-full h-24 px-2.5 py-2 bg-gray-950 border border-gray-700/60 focus:border-cyan-600 rounded-lg text-xs text-gray-300 outline-none resize-none" />
              )}
            </div>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* Content */}
      <div className="flex-1 bg-gray-900/80 border border-gray-800/60 rounded-2xl p-8 min-h-[500px]">
        <h1 className="text-xl font-bold text-gray-300 mb-6">
          {streamContent && !currentChapterObj ? `第${(chapters.length || 0) + 1}章 · 生成中...` :
           currentChapter > 0 ? `第${currentChapter}章` : '点击左侧按钮开始创作'}
        </h1>
        {streamContent && <div className="text-xs text-cyan-400/60 mb-4 animate-pulse">AI 正在写作中...</div>}
        <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">
          {activeContent || (
            <div className="flex items-center justify-center h-96 text-gray-600">
              <div className="text-center"><div className="text-5xl mb-4">📜</div><p>点击左侧「✨ 开始创作」生成第一章</p></div>
            </div>
          )}
        </div>
      </div>

      {/* Rewrite Modal */}
      {showRewrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-cyan-800/40 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-[0_0_60px_rgba(8,145,178,0.15)]">
            <h3 className="text-lg font-bold text-gray-200 mb-2">🔄 重写第{currentChapter}章</h3>
            <p className="text-sm text-gray-500 mb-4">告诉 AI 你希望如何修改这一章</p>
            <textarea value={rewriteInstructions} onChange={e => setRewriteInstructions(e.target.value)}
              placeholder="例如: 增加更多关于戴森球建造过程的描写; 让太空战斗场景更加激烈; 从敌方指挥官视角重新叙述..."
              className="w-full h-32 px-3 py-2 bg-gray-950 border border-gray-700/60 focus:border-cyan-600 rounded-lg text-sm text-gray-200 outline-none resize-none" />
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={() => { setShowRewrite(false); setRewriteInstructions(''); }}
                className="px-4 py-2 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors">取消</button>
              <button onClick={() => {
                const ch = chapters.find(c => c.chapter_number === currentChapter);
                doGenerate({ mode: 'rewrite', chapterId: ch?.id, instructions: rewriteInstructions });
                setShowRewrite(false); setRewriteInstructions('');
              }} disabled={generating}
                className="px-5 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-800 text-white rounded-lg text-sm font-medium transition-all">
                {generating ? '⏳' : '确认重写'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
