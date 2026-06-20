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

  // Load existing chapters
  useEffect(() => {
    if (novelId) {
      fetch(`/api/novels/${novelId}/chapters`)
        .then(r => r.json())
        .then(ch => { setChapters(ch); if (ch.length > 0) setCurrentChapter(ch[ch.length - 1].chapter_number); })
        .catch(() => {})
        .finally(() => setLoaded(true));
    }
  }, [novelId]);

  const startGeneration = async () => {
    setGenerating(true); setStreamContent(''); setError('');
    try {
      const res = await fetch('/api/novels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, novel_id: novelId, chapter_index: (chapters.length || currentChapter || 0) + 1 }),
      });
      if (!res.ok) { setError(`API ${res.status}`); setGenerating(false); return; }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '', fullContent = '', gotNovelId = novelId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.type === 'chunk') { fullContent += json.content; setStreamContent(fullContent); }
            else if (json.type === 'done') {
              if (!gotNovelId) { gotNovelId = json.novel_id; setNovelId(json.novel_id); }
              setChapters(prev => [...prev, { chapter_number: json.chapter_number, title: `第${json.chapter_number}章`, content: fullContent }]);
              setCurrentChapter(json.chapter_number);
              setStreamContent('');
            } else if (json.type === 'error') setError(json.error);
          } catch {}
        }
      }
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const activeContent = streamContent || (currentChapter > 0 ? chapters.find(c => c.chapter_number === currentChapter)?.content : '') || '';
  const activeChapterTitle = currentChapter > 0 ? `第${currentChapter}章` : '点击生成开始创作';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
      {/* Sidebar */}
      <div className="w-56 shrink-0">
        <Link href={`/campaigns/${campaignId}`} className="text-xs text-cyan-400 hover:text-cyan-300 mb-4 block font-mono tracking-wider">← 返回战役</Link>
        <h2 className="text-lg font-bold text-gray-200 mb-4">📖 章节</h2>

        {chapters.length === 0 && !generating && loaded && (
          <p className="text-xs text-gray-600 mb-4">暂无章节</p>
        )}

        <div className="space-y-1 mb-4 max-h-[60vh] overflow-y-auto">
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
          {generating && streamContent && (
            <div className="px-3 py-2 rounded-lg text-sm border border-cyan-600/50 bg-cyan-500/10 text-cyan-400 animate-pulse">
              第{(chapters.length || 0) + 1}章 · 生成中...
            </div>
          )}
        </div>

        <button onClick={startGeneration} disabled={generating}
          className="w-full px-4 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-xl text-sm font-medium transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)]">
          {generating ? '⏳ 生成中...' : chapters.length === 0 ? '✨ 开始创作' : '📝 续写下一章'}
        </button>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* Content */}
      <div className="flex-1 bg-gray-900/80 border border-gray-800/60 rounded-2xl p-8 min-h-[500px]">
        <h1 className="text-xl font-bold text-gray-300 mb-6">{activeChapterTitle}</h1>
        <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">
          {activeContent || (
            <div className="flex items-center justify-center h-96 text-gray-600">
              <div className="text-center">
                <div className="text-5xl mb-4">📜</div>
                <p>点击左侧「开始创作」生成第一章</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
