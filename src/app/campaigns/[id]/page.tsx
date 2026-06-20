'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Chart from '@/components/StatsChart';

// ===== Event Chain Helpers =====

function buildLocalChains(milestones: any[]) {
  const used = new Set<number>();
  const chains: { id: string; name: string; category: string; events: any[] }[] = [];

  function addChain(id: string, name: string, filter: (m: any) => boolean) {
    const events = milestones.filter(m => filter(m) && !used.has(m.id));
    if (events.length > 0) {
      events.forEach(e => used.add(e.id));
      chains.push({ id, name, category: '', events });
    }
  }

  addChain('dyson', '⭐ 戴森球工程', (m: any) => m.title?.includes('戴森球') || m.raw_flag?.includes('dyson'));
  addChain('thinktank', '🧠 科学枢纽', (m: any) => m.title?.includes('科学枢纽') || m.raw_flag?.includes('think_tank'));
  addChain('colossus', '☄️ 巨像计划', (m: any) => m.title?.includes('巨像') || m.raw_flag?.includes('colossus'));
  addChain('mega', '🏗️ 巨型结构', (m: any) => m.event_type === 'megastructure');
  addChain('wars', '⚔️ 战争史', (m: any) => m.event_type === 'war');
  addChain('crisis', '🦠 危机事件', (m: any) => m.event_type === 'crisis');
  addChain('colony', '🌍 殖民扩张', (m: any) => m.event_type === 'colonization');
  addChain('explore', '🔭 探索发现', (m: any) => m.event_type === 'exploration');
  addChain('tech', '🔬 科技突破', (m: any) => m.event_type === 'technology');
  addChain('contact', '👽 外交接触', (m: any) => m.event_type === 'diplomacy');

  // 剩余未分类的
  const rest = milestones.filter(m => !used.has(m.id));
  if (rest.length > 0) chains.push({ id: 'other', name: '📋 其他', category: 'misc', events: rest });

  return chains;
}

function ChainSection({ chain }: { chain: { id: string; name: string; events: any[] } }) {
  const [expanded, setExpanded] = useState(false);
  const showExpand = chain.events.length > 5;
  const displayEvents = expanded ? chain.events : chain.events.slice(0, 5);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-gray-400">{chain.name}</span>
        <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{chain.events.length}</span>
      </div>
      <div className="relative pl-4 border-l border-gray-800/60 space-y-2">
        {displayEvents.map((m, i) => (
          <div key={m.id || i} className="relative group">
            {/* timeline dot */}
            <div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
              m.importance === 'critical' ? 'bg-red-500 border-red-600' :
              m.importance === 'major' ? 'bg-yellow-500 border-yellow-600' :
              'bg-gray-700 border-gray-800'
            }`} />
            <div className="p-2.5 bg-gray-900/60 hover:bg-gray-800/60 rounded-lg transition-colors border border-gray-800/40">
              <div className="flex items-start gap-3">
                <span className="text-[11px] text-gray-600 font-mono shrink-0 mt-0.5 w-12">{m.event_date}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-300">{m.title}</span>
                  {m.loc_name && <span className="text-xs text-cyan-400/60 ml-2">{m.loc_name}</span>}
                  {m.loc_desc && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{m.loc_desc}</p>}
                </div>
              </div>
            </div>
          </div>
        ))}
        {showExpand && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-xs text-cyan-500 hover:text-cyan-400 pl-2 py-1">
            + 展开 {chain.events.length - 5} 条...
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
