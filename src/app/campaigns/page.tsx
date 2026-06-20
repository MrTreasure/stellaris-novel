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

  useEffect(() => {
    fetch('/api/campaigns')
      .then(r => r.json())
      .then((data: CampaignBrief[]) => setCampaigns(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  })

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
                <span className="text-xs text-gray-500">
                  {new Date(c.created_at).toLocaleDateString('zh-CN')}
                </span>
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
