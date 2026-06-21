'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import Chart from '@/components/StatsChart';
import { AlertIcon, ArchiveIcon, BookIcon, CalendarIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, SpinnerIcon, SparkIcon, UploadIcon } from '@/components/Icons';
import { loadLocalNovel, LocalNovel } from '@/lib/browser-storage';

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [localNovel, setLocalNovel] = useState<LocalNovel | null>(null);
  const [uploading, setUploading] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reloadData = () => {
    fetch(`/api/campaigns/${id}`).then(r => r.json()).then(d => { setData(d); setLoaded(true); }).catch(e => setError(e.message));
  };

  useEffect(() => {
    setLoaded(false);
    reloadData();
    loadLocalNovel(parseInt(id)).then(setLocalNovel);
  }, [id]);

  const handleUpdateSave = async (file: File) => {
    setUploading(true); setUpdateMsg(''); setError('');
    const fd = new FormData(); fd.append('file', file); fd.append('campaign_name', data?.campaign?.name || '');
    try {
      const r = await fetch('/api/saves/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.error) setError(d.error);
      else { setUpdateMsg(`已更新存档: ${d.parsed?.game_date}`); reloadData(); }
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  };

  if (!loaded) return <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-12 text-[#607c7e]"><SpinnerIcon className="spin h-4 w-4" />正在载入战役档案...</div>;
  if (error) return <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-12 text-[#e49b91]"><AlertIcon className="h-5 w-5" />{error}</div>;
  if (!data) return <div className="mx-auto max-w-6xl px-4 py-12 text-[#607c7e]">战役不存在</div>;

  const { campaign, milestones, stats } = data;
  const latest = stats.empire_evolution[stats.empire_evolution.length - 1];
  const first = stats.empire_evolution[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/campaigns" className="mb-5 inline-flex min-h-11 items-center gap-2 font-mono text-xs tracking-wider text-[#73cfc6] transition hover:text-[#a2fff5]"><ChevronLeftIcon className="h-4 w-4" />GALACTIC ARCHIVES</Link>
      <div className="section-label">Campaign Intelligence / Timeline</div>
      <h1 className="mt-3 text-3xl font-semibold tracking-wide text-[#e0efed] sm:text-4xl">{campaign.name}</h1>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px] text-[#819b9d]">
        <span className="flex items-center gap-2"><ArchiveIcon className="h-4 w-4 text-[#5eb8af]" />{stats.total_saves} 存档</span>
        <span className="flex items-center gap-2"><SparkIcon className="h-4 w-4 text-[#5eb8af]" />{stats.total_milestones} 里程碑</span>
        <span className="flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-[#5eb8af]" />{campaign.date_start} — {campaign.date_end}</span>
      </div>

      {/* Upload update save */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".sav" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpdateSave(f); e.target.value = ''; }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="secondary-button">
          {uploading ? <><SpinnerIcon className="spin h-4 w-4" />解析中</> : <><UploadIcon className="h-4 w-4" />更新存档</>}
        </button>
        {updateMsg && <span className="flex items-center gap-1.5 text-[13px] text-[#7fd6a0]"><CheckIcon className="h-4 w-4" />{updateMsg}</span>}
        <span className="text-[11px] text-[#5d797b]">上传同一战役的新存档，自动合并里程碑并保留已有小说</span>
      </div>

      <div className="my-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[{l:'帝国规模',v:latest?.empire_size?.toLocaleString(),s:first?.empire_size,c:'text-[#7be5d9]'},
          {l:'军事力量',v:latest?.military_power?.toLocaleString(),c:'text-[#7fd6a0]'},
          {l:'舰队战力',v:latest?.fleet_power?.toLocaleString(),c:'text-[#d9c07d]'},
          {l:'科技力量',v:latest?.tech_power?.toLocaleString(),c:'text-[#aab8ef]'},
          {l:'总人口',v:latest?.total_pops?.toLocaleString(),c:'text-[#b4bced]'},
          {l:'殖民地',v:latest?.num_colonies?.toLocaleString(),s:first?.num_colonies,c:'text-[#dec374]'},
          {l:'活跃战争',v:latest?.active_wars || '0',c:'text-[#e59a92]'},
          {l:'事件类型',v:Object.keys(stats.event_types).length,c:'text-[#88d9d2]'}].map((x,i) => (
          <div key={i} className="panel p-4 sm:p-5">
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-[#6f8b8d]">{x.l}</div>
            <div className={`font-mono text-2xl font-semibold sm:text-3xl ${x.c}`}>{x.v || '?'}</div>
            {x.s && <div className="mt-1 text-xs text-[#607b7d]">初始值 {x.s}</div>}
          </div>
        ))}
      </div>

      {stats.empire_evolution.length > 1 && <Chart data={stats.empire_evolution} />}

      {data.eventChains && data.eventChains.length > 0 && (
        <section className="mt-8">
          <div className="mb-4 flex items-center gap-3">
            <CheckIcon className="h-5 w-5 text-[#6dd7cc]" />
            <h2 className="text-xl font-semibold text-[#d7e6e4]">多阶段事件链</h2>
            <span className="font-mono text-xs tracking-wider text-[#668486]">{data.eventChains.length} CHAINS</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.eventChains.map((chain: any) => {
              const statusColors: Record<string, string> = {
                active: 'border-l-[#64d9cf]',
                completed: 'border-l-[#7fd6a0]',
                failed: 'border-l-[#db7168]',
                unknown: 'border-l-[#607c7e]',
              };
              const statusLabels: Record<string, string> = {
                active: '进行中',
                completed: '已完成',
                failed: '已失败',
                unknown: '未知',
              };
              return (
                <div key={chain.chainId} className={`panel border-l-2 p-4 ${statusColors[chain.status] || statusColors.unknown}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-[#cbdad8]">{chain.name}</span>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider ${
                      chain.status === 'active' ? 'bg-[#3daea4]/20 text-[#64d9cf]' :
                      chain.status === 'completed' ? 'bg-[#3dae4a]/20 text-[#7fd6a0]' :
                      'bg-[#3d4a4a]/20 text-[#607c7e]'
                    }`}>{statusLabels[chain.status] || chain.status}</span>
                  </div>
                  <div className="mt-2 text-xs text-[#668486]">
                    <span className="text-[#789496]">当前阶段:</span> {chain.currentStage}
                  </div>
                  <div className="mt-1 text-[11px] text-[#607c7e]">
                    {chain.category && <span className="mr-2 rounded border border-[#2a5659] px-1.5 py-0.5 font-mono text-[10px] text-[#607c7e]">{chain.category}</span>}
                    {chain.observedNodes.length > 0 && <span>{chain.observedNodes.length} 个已观察节点</span>}
                  </div>
                  {chain.startedAt && (
                    <div className="mt-2 text-[11px] text-[#5a7678]">
                      <CalendarIcon className="mr-1 inline h-3 w-3" />
                      {chain.startedAt}{chain.updatedAt && chain.updatedAt !== chain.startedAt ? ` — ${chain.updatedAt}` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel mt-8 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="section-label">Imperial Chronicle</div>
            <h2 className="mt-2 text-xl font-semibold text-[#d7e6e4]">帝国编年史</h2>
          </div>
          <span className="font-mono text-xs tracking-wider text-[#668486]">{milestones.length} EVENTS</span>
        </div>
        <ChronicleByYear milestones={milestones} eventTagLabel={eventTagLabel} eventTagClass={eventTagClass} />
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <BookIcon className="h-5 w-5 text-[#6dd7cc]" />
          <h2 className="text-xl font-semibold text-[#d7e6e4]">小说工程</h2>
        </div>
        {!localNovel || localNovel.chapters.length === 0 ? (
          <Link href={`/campaigns/${campaign.id}/novel`} className="primary-button"><SparkIcon className="h-4 w-4" />启动小说工程</Link>
        ) : (
          <Link href={`/campaigns/${campaign.id}/novel`} className="panel block p-4 transition hover:border-[#57aaa3]">
            <div className="flex items-center justify-between gap-4"><span className="font-semibold text-[#cbdad8]">{localNovel.title}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-[#668183]">
                <CheckIcon className="h-3.5 w-3.5 text-[#7fd6a0]" />
                {localNovel.chapters.length} 章 · 浏览器本地
                <ChevronRightIcon className="h-4 w-4" />
              </span>
            </div>
          </Link>
        )}
      </section>
    </div>
  );
}

function ChronicleByYear({ milestones, eventTagLabel, eventTagClass }: { milestones: any[]; eventTagLabel: (t: string) => string; eventTagClass: (t: string) => string }) {
  // Group milestones by year (extract year number from date string)
  const groups = new Map<string, any[]>();
  const noDate: any[] = [];
  for (const m of milestones) {
    if (!m.event_date || m.event_date.startsWith('0.') || m.event_date.startsWith('1.01')) continue;
    const year = m.event_date.match(/^\d+/)?.[0] || m.event_date;
    if (year.length <= 2) { noDate.push(m); continue; }
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)!.push(m);
  }
  const sortedYears = [...groups.keys()].sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <div className="relative mt-6 max-h-[70vh] space-y-6 overflow-y-auto border-l border-[#38666a] pl-5">
      {sortedYears.map(year => {
        const events = groups.get(year)!;
        events.sort((a, b) => {
          const ia = a.importance === 'critical' ? 0 : a.importance === 'major' ? 1 : 2;
          const ib = b.importance === 'critical' ? 0 : b.importance === 'major' ? 1 : 2;
          return ia - ib;
        });
        return (
          <div key={year} className="relative">
            <div className="absolute -left-[29px] top-0 h-4 w-4 rotate-45 border-2 border-[#38666a] bg-[#06141e]" />
            <h3 className="mb-3 font-mono text-lg font-semibold tracking-wider text-[#7be5d9]">{year}</h3>
            <div className="space-y-1.5">
              {events.map(m => {
                const color = m.event_type === 'war' ? 'text-[#d9c07d]' :
                  m.event_type === 'crisis' ? 'text-[#e59a92]' :
                  m.event_type === 'megastructure' ? 'text-[#b4bced]' :
                  m.event_type === 'exploration' ? 'text-[#88d9d2]' :
                  'text-[#b2c3c2]';
                return (
                  <div key={m.id} className="flex items-start gap-3 rounded border border-[#1a3a3d]/60 bg-[#06141d]/50 px-3 py-1.5">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${eventTagClass(m.event_type)}`}>
                      {eventTagLabel(m.event_type)}
                    </span>
                    <p className={`text-sm leading-6 ${color}`}>{m.title}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {noDate.length > 0 && (
        <div className="relative">
          <div className="absolute -left-[29px] top-0 h-4 w-4 rotate-45 border-2 border-[#4a6a6d] bg-[#06141e]" />
          <h3 className="mb-3 font-mono text-lg font-semibold tracking-wider text-[#608285]">当前状态</h3>
          <div className="space-y-1.5">
            {noDate.map(m => (
              <div key={m.id} className="flex items-start gap-3 rounded border border-[#1a3a3d]/60 bg-[#06141d]/50 px-3 py-1.5">
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${eventTagClass(m.event_type)}`}>
                  {eventTagLabel(m.event_type)}
                </span>
                <p className="text-sm leading-6 text-[#b2c3c2]">{m.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function eventTagLabel(type: string) {
  const labels: Record<string, string> = {
    war: '战争',
    crisis: '危机',
    megastructure: '巨构',
    exploration: '探索',
    diplomacy: '外交',
    colonization: '殖民',
    technology: '科技',
    tech: '科技',
    leader: '领袖',
  };
  return labels[type] || '事件';
}

function eventTagClass(type: string) {
  const classes: Record<string, string> = {
    war: 'border-[#9b8150] bg-[#4b3d1d]/60 text-[#e0c477]',
    crisis: 'border-[#9b554e] bg-[#481d1b]/60 text-[#e99a91]',
    megastructure: 'border-[#696fa1] bg-[#282c55]/60 text-[#b9c0ef]',
    exploration: 'border-[#3f8581] bg-[#153d40]/60 text-[#8ae0d8]',
    diplomacy: 'border-[#56789b] bg-[#1c344d]/60 text-[#9bc4ea]',
    colonization: 'border-[#59835e] bg-[#1f4227]/60 text-[#9bd4a0]',
    technology: 'border-[#6d6193] bg-[#31264c]/60 text-[#c0ace9]',
    tech: 'border-[#6d6193] bg-[#31264c]/60 text-[#c0ace9]',
    leader: 'border-[#8c704c] bg-[#49341b]/60 text-[#dab878]',
  };
  return classes[type] || 'border-[#496669] bg-[#173035]/60 text-[#9cb6b7]';
}
