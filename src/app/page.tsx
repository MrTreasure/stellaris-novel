'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';
import Image from 'next/image';
import { ArchiveIcon, CalendarIcon, CheckIcon, ChevronRightIcon, DeleteIcon, FolderIcon, SpinnerIcon, UploadIcon } from '@/components/Icons';
import ConfirmDialog from '@/components/ConfirmDialog';
import { removeLocalNovel } from '@/lib/browser-storage';

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

  const [deleting, setDeleting] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const loadCampaigns = () => {
    fetch('/api/campaigns').then(r => r.json()).then(setCampaigns).catch(() => {}).finally(() => setLoaded(true));
  };
  useEffect(() => { loadCampaigns(); }, []);

  const handleDelete = async (e: React.MouseEvent, id: number, name: string) => {
    e.preventDefault(); e.stopPropagation();
    setPendingDelete({ id, name });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(pendingDelete.id);
    await fetch(`/api/campaigns/${pendingDelete.id}`, { method: 'DELETE' });
    removeLocalNovel(pendingDelete.id);
    loadCampaigns();
    setDeleting(null);
    setPendingDelete(null);
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
    <div className="min-h-screen pb-16">
      <section className="relative min-h-[430px] overflow-hidden border-b border-[#376d73]/25">
        <Image src="/images/hero_20.png" alt="" fill preload sizes="100vw" className="object-cover object-center opacity-65" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#030811_8%,rgba(3,8,17,0.72)_45%,rgba(3,8,17,0.2)),linear-gradient(180deg,rgba(3,8,17,0.12),#030811_96%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#64dfd2]/60 to-transparent" />
        <div className="relative z-10 mx-auto flex min-h-[430px] max-w-7xl items-center px-5 py-16 sm:px-8">
          <div className="max-w-3xl">
            <div className="section-label mb-6">Galactic Chronicle System / 01</div>
            <h1 className="max-w-2xl text-4xl font-light leading-[1.08] tracking-[0.08em] text-[#e7f5f3] sm:text-6xl">
              将帝国兴衰
              <span className="mt-2 block font-semibold text-[#7be5d9] drop-shadow-[0_0_20px_rgba(100,223,210,0.28)]">写入银河史册</span>
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-[#9ab1b2] sm:text-base">
              解析 Stellaris 存档中的战争、科技、外交与巨构事件，让 AI 基于真实战局生成一部专属于你的太空歌剧。
            </p>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-[11px] tracking-[0.14em] text-[#698b8d]">
              <span>PARADOX SAVE PARSER</span><span>GALACTIC TIMELINE</span><span>AI NARRATIVE CORE</span>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-12 grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="panel flex flex-col gap-3 p-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-sm font-semibold text-[#bcd2d0]">本地优先的创作空间</p>
            <p className="mt-1 text-xs leading-5 text-[#718d8f]">API 配置、小说章节和背景设定仅保存在当前浏览器；服务端只处理存档解析和当次 AI 生成请求。</p>
          </div>
          <Link href="/settings" className="secondary-button shrink-0">配置本地 AI 接口 <ChevronRightIcon className="h-4 w-4" /></Link>
        </div>
        <section className="panel p-5 sm:p-7">
          <div className="section-label">Command Console / Save Intake</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-wide text-[#dcebea]">载入银河存档</h2>
          <p className="mt-2 text-sm text-[#789293]">选择单个 .sav 文件，系统将自动识别战役并更新编年史。</p>

          <div {...getRootProps()} className={`mt-6 cursor-pointer border border-dashed p-8 text-center transition-all duration-300 sm:p-12 ${isDragActive ? 'border-[#7be5d9] bg-[#4ecfc0]/10 shadow-[inset_0_0_30px_rgba(78,207,192,0.08)]' : 'border-[#31565b] bg-[#020a12]/55 hover:border-[#54a9a3]'}`}>
            <input {...getInputProps()} />
            <span className="mx-auto flex h-16 w-16 items-center justify-center border border-[#467f80] bg-[#081b25] text-[#78ddd2] [clip-path:polygon(20%_0,100%_0,100%_80%,80%_100%,0_100%,0_20%)]">
              {uploading ? <SpinnerIcon className="spin h-7 w-7" /> : isDragActive ? <FolderIcon className="h-7 w-7" /> : <UploadIcon className="h-7 w-7" />}
            </span>
            {uploading ? <p className="mt-4 text-[#7be5d9]">正在解析星系数据...</p> :
             isDragActive ? <p className="mt-4 text-[#7be5d9]">释放文件以开始解析</p> :
             <div className="mt-4"><p className="text-base text-[#c7d9d7]">拖拽 .sav 文件至此</p><p className="mt-1 text-xs tracking-wide text-[#607c7e]">或点击打开文件选择器</p></div>}
          </div>

          <div className="mt-4">
            <button onClick={async () => { setUploading(true); try { const r = await fetch('/api/saves/batch-import', { method: 'POST' }); const d = await r.json(); setError(d.error || `批量导入完成：${d.imported} 个存档`); const cr = await fetch('/api/campaigns'); setCampaigns(await cr.json()); } catch (e: any) { setError(e.message); } finally { setUploading(false); } }} disabled={uploading} className="secondary-button w-full">
              {uploading ? <SpinnerIcon className="spin h-4 w-4" /> : <FolderIcon className="h-4 w-4" />}
              {uploading ? '正在处理' : '从默认存档目录批量导入'}
            </button>
          </div>

          <p className="mt-4 break-all font-mono text-[10px] leading-5 text-[#526e70]">
            SOURCE / C:\Users\Administrator\Documents\Paradox Interactive\Stellaris\save games
          </p>

          {error && <div className="mt-4 border border-[#8e5c54]/50 bg-[#381b1a]/55 p-3 text-sm text-[#f0a9a0]" role="status">{error}</div>}

          {result && (
            <div className="mt-4 border border-[#3d827b]/45 bg-[#071a22]/82 p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckIcon className="h-4 w-4 text-[#79e0a5]" />
                <span className="font-mono text-xs tracking-wider text-[#79e0a5]">PARSE SUCCESSFUL</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                {[{l:'帝国',v:result.parsed.empire_name,c:'text-[#8be8de]'},
                  {l:'日期',v:result.parsed.game_date,c:'text-[#c9d7d6]'},
                  {l:'规模',v:result.parsed.stats?.empire_size,c:'text-[#8be8de]'},
                  {l:'军力',v:result.parsed.stats?.military_power?.toLocaleString(),c:'text-[#83dba3]'},
                  {l:'科技',v:result.parsed.stats?.tech_power?.toLocaleString(),c:'text-[#aebaf1]'},
                  {l:'排名',v:`#${result.parsed.stats?.victory_rank}`,c:'text-[#e1c778]'},
                ].filter(x => x.v).map((x,i) => (
                  <div key={i}><span className="text-[10px] uppercase tracking-wider text-[#5d7a7c]">{x.l}</span><p className={`mt-1 font-semibold ${x.c}`}>{x.v}</p></div>
                ))}
              </div>
              <Link href={`/campaigns/${result.campaign_id}`} className="primary-button mt-5">
                查看战役详情 <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>

        <section className="panel p-5 sm:p-7">
          <div className="section-label">Known Galactic Archives</div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-wide text-[#dcebea]">战役档案</h2>
              <p className="mt-2 text-sm text-[#789293]">已识别的文明时间线与小说工程。</p>
            </div>
            <span className="font-mono text-2xl text-[#537f80]">{campaigns.length.toString().padStart(2, '0')}</span>
          </div>
          {!loaded ? <p className="py-12 text-center text-sm text-[#607c7e]">正在检索档案...</p> :
           campaigns.length === 0 ? <p className="mt-6 border border-dashed border-[#29484d] py-12 text-center text-sm text-[#607c7e]">暂无战役记录</p> :
           <div className="mt-6 grid gap-3">
            {campaigns.map(c => (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="group flex min-h-24 items-center justify-between border border-[#27474c] bg-[#041019]/70 p-4 transition hover:border-[#4a9d97] hover:bg-[#09202a]/80">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-[#cadbd9] transition-colors group-hover:text-[#86e7dc]">{c.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#668083]">
                    <span className="flex items-center gap-1.5"><ArchiveIcon className="h-3.5 w-3.5" />{c.save_count} 个存档</span>
                    <span className="flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" />{c.date_start} — {c.date_end}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={(e) => handleDelete(e, c.id, c.name)} disabled={deleting === c.id}
                    className="flex h-11 w-11 items-center justify-center text-[#526d70] transition-colors hover:text-[#e28d83] disabled:opacity-30"
                    aria-label={`删除战役 ${c.name}`}>
                    {deleting === c.id ? <SpinnerIcon className="spin h-4 w-4" /> : <DeleteIcon className="h-4 w-4" />}
                  </button>
                  <ChevronRightIcon className="h-5 w-5 text-[#4e7778] transition group-hover:translate-x-1 group-hover:text-[#7be5d9]" />
                </div>
              </Link>
            ))}
          </div>}
          <Link href="/campaigns" className="secondary-button mt-5 w-full">浏览全部档案 <ChevronRightIcon className="h-4 w-4" /></Link>
        </section>
      </div>
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
