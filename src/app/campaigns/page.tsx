'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CampaignBrief {
  id: number; name: string; save_count: number;
  date_start: string; date_end: string; created_at: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignBrief[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const router = useRouter();

  const load = () => fetch('/api/campaigns').then(r => r.json()).then(setCampaigns).finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);

  const handleDelete = async (e: React.MouseEvent, id: number, name: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(`确定删除 "${name}"？此操作不可撤销。`)) return;
    setDeleting(id);
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    load(); setDeleting(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400" />
        <span className="text-xs text-cyan-400/80 font-mono tracking-wider uppercase">KNOWN GALACTIC ARCHIVES</span>
      </div>
      <h1 className="text-3xl font-bold text-gray-200 mb-6">所有战役</h1>

      {!loaded ? <p className="text-gray-600">加载中...</p> :
       campaigns.length === 0 ? (
        <div className="p-12 text-center text-gray-600 border border-dashed border-gray-800 rounded-2xl">
          没有战役记录
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map(c => (
            <div key={c.id} className="group relative">
              <Link href={`/campaigns/${c.id}`} className="block p-5 bg-gray-900/80 border border-gray-800/60 hover:border-cyan-700/40 rounded-xl transition-all">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-200 group-hover:text-cyan-300 transition-colors">{c.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600">{new Date(c.created_at).toLocaleDateString('zh-CN')}</span>
                    <button onClick={(e) => handleDelete(e, c.id, c.name)} disabled={deleting === c.id}
                      className="text-xs text-gray-700 hover:text-red-400 disabled:opacity-30 transition-colors">
                      {deleting === c.id ? '...' : '🗑️'}
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex gap-4 text-sm text-gray-500">
                  <span>🗂️ {c.save_count} 个存档</span>
                  <span>📅 {c.date_start} ~ {c.date_end}</span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
