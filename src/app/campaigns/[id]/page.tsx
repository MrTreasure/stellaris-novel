'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Chart from '@/components/StatsChart';
import { AlertIcon, ArchiveIcon, BookIcon, CalendarIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, SpinnerIcon, SparkIcon } from '@/components/Icons';
import { loadLocalNovel, LocalNovel } from '@/lib/browser-storage';

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [localNovel, setLocalNovel] = useState<LocalNovel | null>(null);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`).then(r => r.json()).then(setData).catch(e => setError(e.message)).finally(() => setLoaded(true));
    setLocalNovel(loadLocalNovel(parseInt(id)));
  }, [id]);

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

      <div className="my-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[{l:'帝国规模',v:latest?.empire_size?.toLocaleString(),s:first?.empire_size,c:'text-[#7be5d9]'},
          {l:'军事力量',v:latest?.military_power?.toLocaleString(),c:'text-[#7fd6a0]'},
          {l:'科技力量',v:latest?.tech_power?.toLocaleString(),c:'text-[#aab8ef]'},
          {l:'事件类型',v:Object.keys(stats.event_types).length,c:'text-[#dec374]'}].map((x,i) => (
          <div key={i} className="panel p-4 sm:p-5">
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-[#6f8b8d]">{x.l}</div>
            <div className={`font-mono text-2xl font-semibold sm:text-3xl ${x.c}`}>{x.v || '?'}</div>
            {x.s && <div className="mt-1 text-xs text-[#607b7d]">初始值 {x.s}</div>}
          </div>
        ))}
      </div>

      {stats.empire_evolution.length > 1 && <Chart data={stats.empire_evolution} />}

      <section className="panel mt-8 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="section-label">Imperial Chronicle</div>
            <h2 className="mt-2 text-xl font-semibold text-[#d7e6e4]">帝国编年史</h2>
          </div>
          <span className="font-mono text-xs tracking-wider text-[#668486]">{milestones.length} EVENTS</span>
        </div>
        <div className="relative mt-6 max-h-[70vh] space-y-0.5 overflow-y-auto border-l border-[#38666a] pl-5">
          {milestones.filter((m: any) => !m.event_date?.startsWith('0.') && !m.event_date?.startsWith('1.01')).map((m: any, i: number) => (
            <div key={m.id || i} className="relative pb-1">
              <div className={`absolute -left-[25px] top-2 h-2 w-2 rotate-45 border border-[#06141e] ${
                m.importance === 'critical' ? 'bg-[#db7168]' :
                m.importance === 'major' ? 'bg-[#64d9cf]' : 'bg-[#42686a]'
              }`} />
              <div className="flex items-start gap-3 py-1">
                <span className="mt-0.5 w-20 shrink-0 font-mono text-[13px] text-[#789496]">{m.event_date}</span>
                <div className="min-w-0 flex-1">
                  <span className={`inline-flex border px-2 py-0.5 text-[10px] font-semibold tracking-wider ${eventTagClass(m.event_type)}`}>
                    {eventTagLabel(m.event_type)}
                  </span>
                  <p className={`mt-1 text-base leading-7 sm:text-[17px] ${
                  m.event_type === 'war' ? 'text-[#d9c07d]' :
                  m.event_type === 'crisis' ? 'text-[#e59a92]' :
                  m.event_type === 'megastructure' ? 'text-[#b4bced]' :
                  m.event_type === 'exploration' ? 'text-[#88d9d2]' :
                  'text-[#b2c3c2]'
                  }`}>{m.title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
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

function eventTagLabel(type: string) {
  const labels: Record<string, string> = {
    war: '战争',
    crisis: '危机',
    megastructure: '巨构',
    exploration: '探索',
    diplomacy: '外交',
    colonization: '殖民',
    technology: '科技',
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
    leader: 'border-[#8c704c] bg-[#49341b]/60 text-[#dab878]',
  };
  return classes[type] || 'border-[#496669] bg-[#173035]/60 text-[#9cb6b7]';
}
