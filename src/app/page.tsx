'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';

interface CampaignBrief {
  id: number; name: string; save_count: number;
  date_start: string; date_end: string; created_at: string;
}

export default function HomePage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignBrief[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 随机英雄背景
  const heroBg = useMemo(() => {
    const n = Math.floor(Math.random() * 20) + 1;
    return `/images/hero_${n}.png`;
  }, []);

  const [deleting, setDeleting] = useState<number | null>(null);

  const loadCampaigns = () => {
    fetch('/api/campaigns').then(r => r.json()).then(setCampaigns).catch(() => {}).finally(() => setLoaded(true));
  };
  useEffect(() => { loadCampaigns(); }, []);

  const handleDelete = async (e: React.MouseEvent, id: number, name: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(`确定删除 "${name}"？`)) return;
    setDeleting(id);
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    loadCampaigns();
    setDeleting(null);
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file?.name.endsWith('.sav')) { setError('请上传 .sav 格式的群星存档文件'); return; }
    setUploading(true); setError(''); setResult(null);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/saves/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.error) setError(d.error); else { setResult(d); loadCampaigns(); }
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/octet-stream': ['.sav'] }, maxFiles: 1 });

  return (
    <div className="min-h-screen">
      {/* ====== HERO ====== */}
      <div className="relative overflow-hidden" style={{ minHeight: 340 }}>
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950/70 via-gray-950/50 to-gray-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(8,145,178,0.15)_100%)]" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-20">
          <div className="flex items-center gap-4 mb-6">
            <img src="/images/logo.png" alt="Stellaris" className="h-12 md:h-16 w-auto drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]" />
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-4 tracking-tight bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(34,211,238,0.3)]">
            银河编年史
          </h1>
          <p className="text-base md:text-lg text-cyan-200/80 max-w-lg font-light tracking-wide">
            上传群星存档，提取帝国的兴衰史，用 AI 生成属于你的银河史诗
          </p>
        </div>
      </div>

      {/* ====== UPLOAD + CAMPAIGNS ====== */}
      <div className="max-w-4xl mx-auto px-4 -mt-8 relative z-10 pb-16 space-y-8">

        {/* Upload Card */}
        <div className="bg-gray-900/80 backdrop-blur-xl border border-cyan-800/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(8,145,178,0.1)]">
          <div className="flex items-center gap-2 mb-1 text-xs text-cyan-400/80 font-mono tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            COMMAND CONSOLE · UPLOAD SAVE FILE
          </div>

          <div {...getRootProps()} className={`mt-3 border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-300 ${isDragActive ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,0.2)]' : 'border-gray-700/60 hover:border-cyan-700/50 bg-gray-900/40'}`}>
            <input {...getInputProps()} />
            <div className="text-4xl mb-3">{isDragActive ? '📂' : '🛸'}</div>
            {uploading ? <p className="text-cyan-400 animate-pulse">解析中...</p> :
             isDragActive ? <p className="text-cyan-400">释放以上传</p> :
             <div><p className="text-base text-gray-300 mb-1">拖拽 .sav 文件到此处</p><p className="text-xs text-gray-600">或点击选择文件</p></div>}
          </div>

          <div className="flex items-center gap-4 mt-4">
            <button onClick={async () => { setUploading(true); try { const r = await fetch('/api/saves/batch-import', { method: 'POST' }); const d = await r.json(); setError(d.error || `✅ 批量导入完成: ${d.imported} 个存档`); const cr = await fetch('/api/campaigns'); setCampaigns(await cr.json()); } catch (e: any) { setError(e.message); } finally { setUploading(false); } }} disabled={uploading} className="flex-1 px-4 py-2.5 border border-cyan-800/40 hover:border-cyan-500/60 text-cyan-400/80 hover:text-cyan-300 disabled:opacity-30 rounded-lg text-sm transition-all">
              {uploading ? '⏳ 处理中...' : '📂 从存档目录批量导入'}
            </button>
          </div>

          <p className="mt-3 text-[11px] text-gray-600 font-mono tracking-wide">
            存档位置: C:\Users\Administrator\Documents\Paradox Interactive\Stellaris\save games
          </p>

          {error && <div className="mt-4 p-3 bg-red-950/50 border border-red-800/50 rounded-lg text-sm text-red-400">{error}</div>}

          {result && (
            <div className="mt-4 p-5 bg-gradient-to-br from-gray-900 to-gray-900/80 border border-cyan-800/30 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs text-green-400/80 font-mono tracking-wider uppercase">PARSE SUCCESSFUL</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                {[{l:'帝国',v:result.parsed.empire_name,c:'text-cyan-300'},
                  {l:'日期',v:result.parsed.game_date,c:'text-gray-300'},
                  {l:'规模',v:result.parsed.stats?.empire_size,c:'text-cyan-300'},
                  {l:'军力',v:result.parsed.stats?.military_power?.toLocaleString(),c:'text-green-300'},
                  {l:'科技',v:result.parsed.stats?.tech_power?.toLocaleString(),c:'text-purple-300'},
                  {l:'排名',v:`#${result.parsed.stats?.victory_rank}`,c:'text-yellow-300'},
                ].filter(x => x.v).map((x,i) => (
                  <div key={i}><span className="text-xs text-gray-600 uppercase tracking-wider">{x.l}</span><p className={`font-bold ${x.c}`}>{x.v}</p></div>
                ))}
              </div>
              <Link href={`/campaigns/${result.campaign_id}`} className="inline-block mt-4 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)]">
                查看战役详情 →
              </Link>
            </div>
          )}
        </div>

        {/* Campaign List */}
        <div className="bg-gray-900/80 backdrop-blur-xl border border-cyan-800/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(8,145,178,0.1)]">
          <div className="flex items-center gap-2 mb-1 text-xs text-cyan-400/80 font-mono tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            KNOWN GALACTIC ARCHIVES
          </div>
          <h2 className="text-xl font-bold text-gray-200 mt-1 mb-4">已有战役</h2>
          {!loaded ? <p className="text-gray-600 text-sm">加载中...</p> :
           campaigns.length === 0 ? <p className="text-gray-600 text-sm py-4 text-center">暂无战役记录，上传存档后自动创建</p> :
           <div className="grid gap-3">
            {campaigns.map(c => (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="flex items-center justify-between p-4 bg-gray-900/60 border border-gray-800/60 hover:border-cyan-700/40 rounded-xl transition-all group">
                <div>
                  <h3 className="font-semibold text-gray-200 group-hover:text-cyan-300 transition-colors">{c.name}</h3>
                  <div className="flex gap-4 mt-1 text-xs text-gray-500">
                    <span>🗂️ {c.save_count} 个存档</span>
                    <span>📅 {c.date_start} ~ {c.date_end}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={(e) => handleDelete(e, c.id, c.name)} disabled={deleting === c.id}
                    className="text-xs text-gray-700 hover:text-red-400 disabled:opacity-30 transition-colors px-1">
                    {deleting === c.id ? '...' : '🗑️'}
                  </button>
                  <span className="text-2xl opacity-30 group-hover:opacity-100 transition-opacity">→</span>
                </div>
              </Link>
            ))}
          </div>}
        </div>

      </div>
    </div>
  );
}
