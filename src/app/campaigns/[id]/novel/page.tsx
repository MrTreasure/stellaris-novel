'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

export default function NovelPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novel_id?: string }>;
}) {
  const { id } = use(params);
  const { novel_id: existingNovelId } = use(searchParams);
  const campaignId = parseInt(id);

  const [generating, setGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [novelId, setNovelId] = useState<number | null>(existingNovelId ? parseInt(existingNovelId) : null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [error, setError] = useState('');

  // 加载已有章节
  useEffect(() => {
    if (novelId) {
      fetch(`/api/novels?campaign_id=${campaignId}`)
        .then(r => r.json())
        .then(novels => {
          const novel = novels.find((n: any) => n.id === novelId);
          if (novel) {
            fetch(`/api/novels/${novelId}/chapters`)
              .then(r => r.json())
              .then(ch => setChapters(ch))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [novelId, campaignId])

  const startGeneration = async () => {
    setGenerating(true);
    setStreamContent('');
    setError('');

    try {
      const res = await fetch('/api/novels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          novel_id: novelId,
          chapter_index: chapters.length + 1,
        }),
      });

      if (!res.ok) {
        setError(`API 错误: ${res.status}`);
        setGenerating(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let gotNovelId = novelId;

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
            if (json.type === 'chunk') {
              fullContent += json.content;
              setStreamContent(fullContent);
            } else if (json.type === 'done') {
              if (!gotNovelId) {
                gotNovelId = json.novel_id;
                setNovelId(json.novel_id);
              }
              setChapters(prev => [...prev, {
                chapter_number: json.chapter_number,
                title: `第${json.chapter_number}章`,
                content: fullContent,
              }]);
              setCurrentChapter(json.chapter_number);
              setStreamContent('');
            } else if (json.type === 'error') {
              setError(json.error);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href={`/campaigns/${campaignId}`} className="text-sm text-cyan-500 hover:text-cyan-400 mb-4 inline-block">
        ← 返回战役
      </Link>

      <h1 className="text-3xl font-bold mb-6">📖 银河史诗</h1>

      {/* 章节预览 */}
      {chapters.length > 0 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          {chapters.map((ch, i) => (
            <button
              key={i}
              onClick={() => setCurrentChapter(ch.chapter_number)}
              className={`px-3 py-1 rounded text-sm border transition-colors ${
                currentChapter === ch.chapter_number
                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              第{ch.chapter_number}章
            </button>
          ))}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 min-h-[400px] mb-6">
        {streamContent ? (
          <div className="whitespace-pre-wrap text-gray-200 leading-relaxed">{streamContent}</div>
        ) : currentChapter > 0 && chapters[currentChapter - 1] ? (
          <div className="whitespace-pre-wrap text-gray-200 leading-relaxed">{chapters[currentChapter - 1].content}</div>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-600">
            <div className="text-center">
              <div className="text-4xl mb-4">📜</div>
              <p>还没有内容,点击下方按钮开始创作</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-400">
          ❌ {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={startGeneration}
          disabled={generating}
          className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-medium transition-colors"
        >
          {generating ? '⏳ 生成中...' : chapters.length === 0 ? '✨ 开始创作' : '📝 续写下一章'}
        </button>
        {generating && (
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-3 border border-gray-700 rounded-xl text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            停止
          </button>
        )}
      </div>
    </div>
  );
}
