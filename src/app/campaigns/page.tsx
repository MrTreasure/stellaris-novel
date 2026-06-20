'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface CampaignBrief {
  id: number;
  name: string;
  save_count: number;
  date_start: string;
  date_end: string;
  created_at: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignBrief[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadCampaigns = () => {
    fetch('/api/campaigns')
      .then(r => r.json())
      .then((data: CampaignBrief[]) => setCampaigns(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  };

  useEffect(() => { loadCampaigns(); }, []);

  const handleDelete = async (e: React.MouseEvent, id: number, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`确定要删除战役 "${name}" 吗？\n此操作不可撤销。`)) return;
    setDeleting(id);
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    loadCampaigns();
    setDeleting(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">所有战役</h1>

      {!loaded ? (
        <p className="text-gray-500">加载中...</p>
      ) : campaigns.length === 0 ? (
        <div className="p-12 text-center text-gray-600 border border-dashed border-gray-800 rounded-xl">
          没有战役记录
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map(c => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="block p-5 bg-gray-900 border border-gray-800 rounded-xl hover:border-cyan-800/50 transition-all group"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold group-hover:text-cyan-400 transition-colors">
                  {c.name}
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {new Date(c.created_at).toLocaleDateString('zh-CN')}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, c.id, c.name)}
                    disabled={deleting === c.id}
                    className="text-xs text-gray-600 hover:text-red-400 disabled:text-gray-800 transition-colors"
                  >
                    {deleting === c.id ? '删除中...' : '🗑️'}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-sm text-gray-500">
                <span>🗂️ {c.save_count} 个存档</span>
                <span>📅 {c.date_start} ~ {c.date_end}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
