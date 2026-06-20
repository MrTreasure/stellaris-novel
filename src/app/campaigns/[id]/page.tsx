'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface CampaignDetail {
  campaign: any;
  saves: any[];
  milestones: any[];
  novels: any[];
  stats: {
    total_saves: number;
    total_milestones: number;
    event_types: Record<string, number>;
    empire_evolution: { date: string; empire_size: number; military_power: number; tech_power: number; victory_rank: number }[];
  };
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then((d: CampaignDetail) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [id])

  if (!loaded) return <div className="max-w-4xl mx-auto px-4 py-8 text-gray-500">加载中...</div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-400">❌ {error}</div>;
  if (!data) return <div className="max-w-4xl mx-auto px-4 py-8 text-gray-500">战役不存在</div>;

  const { campaign, saves, milestones, novels, stats } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 战役标题 */}
      <div className="mb-8">
        <Link href="/campaigns" className="text-sm text-cyan-500 hover:text-cyan-400 mb-2 inline-block">
          ← 返回战役列表
        </Link>
        <h1 className="text-3xl font-bold">{campaign.name}</h1>
        <div className="mt-2 flex gap-4 text-sm text-gray-500">
          <span>🗂️ {stats.total_saves} 个存档</span>
          <span>🏷️ {stats.total_milestones} 个里程碑</span>
          <span>📅 {campaign.date_start} ~ {campaign.date_end}</span>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {stats.empire_evolution.length > 0 && (() => {
          const last = stats.empire_evolution[stats.empire_evolution.length - 1];
          const first = stats.empire_evolution[0];
          return (
            <>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">帝国规模</div>
                <div className="text-2xl font-bold text-cyan-400">{last.empire_size?.toLocaleString() || '?'}</div>
                {first.empire_size && <div className="text-xs text-gray-600">初始: {first.empire_size}</div>}
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">军事力量</div>
                <div className="text-2xl font-bold text-green-400">{last.military_power?.toLocaleString() || '?'}</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">科技力量</div>
                <div className="text-2xl font-bold text-purple-400">{last.tech_power?.toLocaleString() || '?'}</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">事件类型</div>
                <div className="text-lg font-bold text-yellow-400">{Object.keys(stats.event_types).length}</div>
              </div>
            </>
          );
        })()}
      </div>

      {/* 实力曲线图 (简单柱状) */}
      {stats.empire_evolution.length > 1 && (
        <div className="mb-8 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">实力演变</h2>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-2 min-w-[400px]" style={{ height: 200 }}>
              {stats.empire_evolution.map((e, i) => {
                const maxVal = Math.max(...stats.empire_evolution.map(x => x.military_power || 0));
                const h = maxVal > 0 ? ((e.military_power || 0) / maxVal) * 180 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center" title={`${e.date}: ${e.military_power?.toLocaleString()}`}>
                    <div className="text-[10px] text-gray-600 mb-1">{e.empire_size}</div>
                    <div
                      className="w-full rounded-t-sm bg-gradient-to-t from-cyan-700 to-cyan-500 hover:to-cyan-400 transition-colors"
                      style={{ height: Math.max(h, 4) }}
                    />
                    <div className="text-[10px] text-gray-600 mt-1 truncate w-full text-center">{e.date?.slice(-4)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 大事记 */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4">📜 里程碑事件</h2>
        {milestones.length === 0 ? (
          <p className="text-gray-600">暂无事件</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {milestones.map((m, i) => (
              <div key={i} className="flex gap-3 p-2 rounded-lg hover:bg-gray-800/50 text-sm">
                <span className="text-gray-500 shrink-0 w-20">{m.event_date}</span>
                <span className={`shrink-0 ${m.importance === 'critical' ? 'text-red-400' : m.importance === 'major' ? 'text-yellow-400' : 'text-gray-400'}`}>
                  ●
                </span>
                <span className="text-gray-300">{m.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 存档列表 */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4">💾 存档列表</h2>
        <div className="grid gap-2">
          {saves.map(s => (
            <div key={s.id} className="flex justify-between items-center p-3 bg-gray-900 border border-gray-800 rounded-lg text-sm">
              <span className="text-gray-400">{s.game_date}</span>
              <span className="text-gray-300">{s.filename}</span>
              <span className="text-gray-500">规模 {s.empire_size || '?'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 小说 */}
      <div>
        <h2 className="text-lg font-bold mb-4">📖 小说</h2>
        {novels.length === 0 ? (
          <Link
            href={`/campaigns/${campaign.id}/novel`}
            className="inline-block px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-medium transition-colors"
          >
            创作新小说 ✨
          </Link>
        ) : (
          <div className="grid gap-3">
            {novels.map(n => (
              <Link
                key={n.id}
                href={`/campaigns/${campaign.id}/novel?novel_id=${n.id}`}
                className="block p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-cyan-800/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{n.title}</span>
                  <span className="text-xs text-gray-600">
                    {n.total_chapters} 章 · {n.status === 'completed' ? '✅ 已完成' : n.status === 'generating' ? '⏳ 生成中' : '📝 草稿'}
                  </span>
                </div>
              </Link>
            ))}
            <Link
              href={`/campaigns/${campaign.id}/novel`}
              className="block text-center p-3 border border-dashed border-gray-700 rounded-xl text-sm text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-all"
            >
              + 创建新小说
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
