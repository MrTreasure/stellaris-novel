'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArchiveIcon, CalendarIcon, ChevronRightIcon, DeleteIcon, SpinnerIcon } from '@/components/Icons';
import ConfirmDialog from '@/components/ConfirmDialog';
import { removeLocalNovel } from '@/lib/browser-storage';

interface CampaignBrief {
  id: number; name: string; save_count: number;
  date_start: string; date_end: string; created_at: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignBrief[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const load = () => fetch('/api/campaigns').then(r => r.json()).then(setCampaigns).finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);

  const handleDelete = async (e: React.MouseEvent, id: number, name: string) => {
    e.preventDefault(); e.stopPropagation();
    setPendingDelete({ id, name });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(pendingDelete.id);
    await fetch(`/api/campaigns/${pendingDelete.id}`, { method: 'DELETE' });
    removeLocalNovel(pendingDelete.id);
    load();
    setDeleting(null);
    setPendingDelete(null);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="section-label">Known Galactic Archives / Index</div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-wide text-[#e0efed] sm:text-4xl">全部战役档案</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#789293]">检索已导入的银河历史，进入时间线或继续小说工程。</p>
        </div>
        <span className="font-mono text-sm tracking-[0.2em] text-[#5c8385]">RECORDS / {campaigns.length.toString().padStart(2, '0')}</span>
      </div>

      {!loaded ? <p className="mt-10 text-[#607c7e]">正在检索档案...</p> :
       campaigns.length === 0 ? (
        <div className="panel mt-8 p-14 text-center text-[#607c7e]">
          当前数据核心中没有战役记录
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {campaigns.map(c => (
            <div key={c.id} className="group relative">
              <Link href={`/campaigns/${c.id}`} className="panel block min-h-44 p-5 transition hover:border-[#57aaa3] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#3e7273] bg-[#071923] text-[#72d8cf]">
                      <ArchiveIcon className="h-5 w-5" />
                    </span>
                    <h3 className="truncate text-lg font-semibold text-[#cededc] transition-colors group-hover:text-[#8ce9df]">{c.name}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-xs text-[#5c7779] sm:block">{new Date(c.created_at).toLocaleDateString('zh-CN')}</span>
                    <button onClick={(e) => handleDelete(e, c.id, c.name)} disabled={deleting === c.id}
                      className="flex h-11 w-11 items-center justify-center text-[#536e70] transition-colors hover:text-[#e28d83] disabled:opacity-30"
                      aria-label={`删除战役 ${c.name}`}>
                      {deleting === c.id ? <SpinnerIcon className="spin h-4 w-4" /> : <DeleteIcon className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#244348] pt-4 text-sm text-[#718b8d]">
                  <span className="flex items-center gap-2"><ArchiveIcon className="h-4 w-4 text-[#56aaa3]" />{c.save_count} 个存档</span>
                  <span className="flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-[#56aaa3]" />{c.date_start} — {c.date_end}</span>
                  <ChevronRightIcon className="ml-auto h-5 w-5 text-[#4d7476] transition group-hover:translate-x-1 group-hover:text-[#7be5d9]" />
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除战役档案"
        description={`确定删除“${pendingDelete?.name || ''}”吗？相关战役数据和当前浏览器中的小说副本都会被删除，此操作不可撤销。`}
        busy={deleting !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
