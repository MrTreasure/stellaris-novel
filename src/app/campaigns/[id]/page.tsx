'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Chart from '@/components/StatsChart';

interface CampaignDetail {
  campaign: any; saves: any[]; milestones: any[]; novels: any[];
  stats: { total_saves: number; total_milestones: number; event_types: Record<string,number>;
    empire_evolution: { date:string; empire_size:number; military_power:number; tech_power:number; victory_rank:number }[] };
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/campaigns/${id}`).then(r => r.json()).then(setData).catch(e => setError(e.message)).finally(() => setLoaded(true));
  }, [id]);

  if (!loaded) return <div className="max-w-4xl mx-auto px-4 py-8 text-gray-600">加载中...</div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-400">❌ {error}</div>;
  if (!data) return <div className="max-w-4xl mx-auto px-4 py-8 text-gray-600">战役不存在</div>;

  const { campaign, saves, milestones, novels, stats } = data;
  const latest = stats.empire_evolution[stats.empire_evolution.length - 1];
  const first = stats.empire_evolution[0];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/campaigns" className="text-xs text-cyan-400 hover:text-cyan-300 mb-3 inline-block tracking-wider font-mono">← GALACTIC ARCHIVES</Link>
      <h1 className="text-3xl font-bold text-gray-200 mb-1">{campaign.name}</h1>
      <p className="text-sm text-gray-500 mb-6">🗂️ {stats.total_saves} 存档 · 🏷️ {stats.total_milestones} 里程碑 · 📅 {campaign.date_start} ~ {campaign.date_end}</p>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[{l:'帝国规模',v:latest?.empire_size?.toLocaleString(),s:first?.empire_size,c:'text-cyan-300'},
          {l:'军事力量',v:latest?.military_power?.toLocaleString(),c:'text-green-300'},
          {l:'科技力量',v:latest?.tech_power?.toLocaleString(),c:'text-purple-300'},
          {l:'事件类型',v:Object.keys(stats.event_types).length,c:'text-yellow-300'}].map((x,i) => (
          <div key={i} className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">{x.l}</div>
            <div className={`text-xl font-bold ${x.c}`}>{x.v || '?'}</div>
            {x.s && <div className="text-[10px] text-gray-700 mt-0.5">初始 {x.s}</div>}
          </div>
        ))}
      </div>

      {/* Chart */}
      {stats.empire_evolution.length > 1 && <Chart data={stats.empire_evolution} />}

      {/* Milestones */}
      <div className="mt-8 bg-gray-900/80 border border-gray-800/60 rounded-xl p-6">
        <h2 className="text-lg font-bold text-gray-300 mb-4">📜 里程碑事件</h2>
        {milestones.length === 0 ? <p className="text-gray-600 text-sm">暂无事件</p> : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {milestones.map((m,i) => (
              <div key={i} className="flex gap-3 p-1.5 hover:bg-gray-800/40 rounded text-sm">
                <span className="text-gray-600 shrink-0 w-16 text-xs font-mono">{m.event_date}</span>
                <span className={`shrink-0 text-xs mt-0.5 ${m.importance==='critical'?'text-red-400':m.importance==='major'?'text-yellow-400':'text-gray-600'}`}>●</span>
                <span className="text-gray-400">{m.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Novels */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-gray-300 mb-3">📖 小说</h2>
        {novels.length === 0 ? (
          <Link href={`/campaigns/${campaign.id}/novel`} className="inline-block px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)]">创作新小说 ✨</Link>
        ) : (
          <div className="grid gap-3">
            {novels.map((n:any) => (
              <Link key={n.id} href={`/campaigns/${campaign.id}/novel?novel_id=${n.id}`}
                className="block p-4 bg-gray-900/80 border border-gray-800/60 hover:border-cyan-700/40 rounded-xl transition-all">
                <div className="flex justify-between"><span className="font-semibold text-gray-200">{n.title}</span>
                  <span className="text-xs text-gray-600">{n.total_chapters}章 · {n.status==='completed'?'✅':n.status==='generating'?'⏳':'📝'}</span></div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
