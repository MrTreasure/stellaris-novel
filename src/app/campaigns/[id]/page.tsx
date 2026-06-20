'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Chart from '@/components/StatsChart';

// ===== Dynamic Event Chain Builder =====

const CATEGORY_ICONS: Record<string, string> = {
  megastructure: '🏗️', colonization: '🌍', exploration: '🔭',
  war: '⚔️', crisis: '🦠', diplomacy: '👽', technology: '🔬',
  resource: '💎', event: '📜', military: '🚀', achievement: '🏆',
  policy: '📋', science: '🧪', collection: '🏺', economy: '💰',
};
const CATEGORY_LABELS: Record<string, string> = {
  megastructure: '巨型结构', colonization: '殖民扩张', exploration: '探索发现',
  war: '战争史', crisis: '危机事件', diplomacy: '外交接触', technology: '科技',
  resource: '战略资源', event: '故事事件', military: '军事', achievement: '成就',
  policy: '政策法令', science: '科学研究', collection: '收藏', economy: '经济',
  other: '其他',
};

function buildLocalChains(milestones: any[]) {
  // Group by category
  const groups = new Map<string, any[]>();
  for (const m of milestones) {
    const cat = m.event_type || 'other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(m);
  }

  // Sort groups by event count (most events first)
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([cat, events]) => ({
      id: cat,
      name: `${CATEGORY_ICONS[cat] || '📌'} ${CATEGORY_LABELS[cat] || cat}`,
      category: cat,
      events,
    }));
}

function ChainSection({ chain }: { chain: { id: string; name: string; events: any[] } }) {
  const [expanded, setExpanded] = useState(false);
  const showExpand = chain.events.length > 8;
  const displayEvents = expanded ? chain.events : chain.events.slice(0, 8);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-400">{chain.name}</span>
        <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{chain.events.length}</span>
      </div>
      <div className="relative pl-4 border-l border-gray-800/50 space-y-1.5">
        {displayEvents.map((m, i) => (
          <div key={m.id || i} className="relative group">
            <div className={`absolute -left-[19px] top-1.5 w-2 h-2 rounded-full border-2 border-gray-900 ${
              m.importance === 'critical' ? 'bg-red-500 border-red-600' :
              m.importance === 'major' ? 'bg-yellow-500 border-yellow-600' :
              'bg-gray-700 border-gray-800'
            }`} />
            <div className="p-2 bg-gray-900/50 hover:bg-gray-800/50 rounded-lg transition-colors border border-gray-800/30">
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-gray-600 font-mono shrink-0 mt-0.5 w-12">{m.event_date}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-300">{m.title || m.raw_flag}</span>
                  {m.loc_name && m.loc_name !== m.title && (
                    <span className="text-[10px] text-cyan-400/50 ml-1.5">{m.loc_name}</span>
                  )}
                  {m.loc_desc && (
                    <p className="text-[10px] text-gray-600 mt-0.5 line-clamp-1">{m.loc_desc}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {showExpand && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-[11px] text-cyan-500 hover:text-cyan-400 pl-2 py-0.5">
            + 展开剩余 {chain.events.length - 8} 条...
          </button>
        )}
        {showExpand && expanded && (
          <button onClick={() => setExpanded(false)} className="text-[11px] text-gray-500 hover:text-gray-400 pl-2 py-0.5">
            收起
          </button>
        )}
      </div>
    </div>
  );
}

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

      {/* Milestones with Chains */}
      <div className="mt-8 bg-gray-900/80 border border-gray-800/60 rounded-xl p-6">
        <h2 className="text-lg font-bold text-gray-300 mb-4">📜 事件链与里程碑</h2>
        {milestones.length === 0 ? <p className="text-gray-600 text-sm">暂无事件</p> : (
          <div className="space-y-6">
            {(() => {
              // Group milestones into event chains (same logic as API)
              const chains = buildLocalChains(milestones);
              return chains.map(chain => (
                <ChainSection key={chain.id} chain={chain} />
              ));
            })()}
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
