'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';

interface CampaignBrief {
  id: number;
  name: string;
  save_count: number;
  date_start: string;
  date_end: string;
  created_at: string;
}

export default function HomePage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignBrief[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 加载战役列表
  useEffect(() => {
    fetch('/api/campaigns')
      .then(r => r.json())
      .then((data: CampaignBrief[]) => setCampaigns(data))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !file.name.endsWith('.sav')) {
      setError('请上传 .sav 格式的群星存档文件');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/saves/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        const cr = await fetch('/api/campaigns');
        setCampaigns(await cr.json());
      }
    } catch (e: any) {
      setError(e.message || '上传失败');
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/octet-stream': ['.sav'] },
    maxFiles: 1,
  })

  return (
    <div>
      {/* 英雄区 */}
      <div className="relative overflow-hidden border-b border-gray-800/50">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/bg-space.png"
            alt=""
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-950/60 via-gray-950/40 to-gray-950" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 py-16 md:py-24">
          <div className="flex items-center gap-4 mb-6">
            <img src="/images/logo.png" alt="Stellaris" className="h-10 md:h-14 w-auto" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-300 to-blue-500 bg-clip-text text-transparent">
            银河编年史
          </h1>
          <p className="text-lg text-gray-400 max-w-xl">
            上传群星存档,自动提取帝国的兴衰史,用 AI 生成属于你的银河史诗小说
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 pb-16">
      {/* 上传区 */}
      <div className="mb-10">
        <p className="text-gray-400 mb-6">
          上传 .sav 文件,自动提取帝国数据、时间轴和里程碑事件
        </p>

        {/* 存档目录提示 */}
        <div className="mb-4 p-3 bg-gray-900/60 border border-gray-800 rounded-lg text-sm flex items-center gap-2">
          <span className="text-gray-600">📂</span>
          <span className="text-gray-500">群星存档位置:</span>
          <code className="text-gray-400 text-xs bg-gray-800 px-2 py-0.5 rounded">
            C:\Users\Administrator\Documents\Paradox Interactive\Stellaris\save games
          </code>
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
            ${isDragActive ? 'border-cyan-400 bg-cyan-400/10' : 'border-gray-700 hover:border-gray-500 bg-gray-900/50'}`}
        >
          <input {...getInputProps()} />
          <div className="text-5xl mb-4">{isDragActive ? '📂' : '📁'}</div>
          {uploading ? (
            <div className="text-cyan-400">解析中...</div>
          ) : isDragActive ? (
            <p className="text-cyan-400">松开以上传存档</p>
          ) : (
            <div>
              <p className="text-lg mb-1">拖拽 .sav 文件到此处</p>
              <p className="text-sm text-gray-500">或点击选择文件</p>
            </div>
          )}
        </div>

        {/* 批量导入 */}
        <div className="mt-4 mb-6">
          <button
            onClick={async () => {
              setUploading(true);
              try {
                const res = await fetch('/api/saves/batch-import', { method: 'POST' });
                const data = await res.json();
                if (data.error) setError(data.error);
                else setError('✅ 批量导入完成: ' + data.imported + ' 个存档');
                const cr = await fetch('/api/campaigns');
                setCampaigns(await cr.json());
              } catch (e: any) { setError(e.message); }
              finally { setUploading(false); }
            }}
            disabled={uploading}
            className="w-full px-4 py-2.5 border border-dashed border-gray-700 hover:border-cyan-700 text-gray-400 hover:text-cyan-400 disabled:text-gray-700 rounded-lg text-sm transition-colors"
          >
            {uploading ? '⏳ 处理中...' : '📂 从存档目录批量导入'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
            ❌ {error}
          </div>
        )}

        {result && (
          <div className="mt-6 p-6 bg-gray-900 border border-gray-800 rounded-xl">
            <h2 className="text-xl font-bold mb-3">✅ 解析成功</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">帝国</span>
                <p className="font-semibold">{result.parsed.empire_name}</p>
              </div>
              <div>
                <span className="text-gray-500">游戏日期</span>
                <p className="font-semibold">{result.parsed.game_date}</p>
              </div>
              {result.parsed.stats?.empire_size && (
                <div>
                  <span className="text-gray-500">帝国规模</span>
                  <p className="font-semibold">{result.parsed.stats.empire_size}</p>
                </div>
              )}
              {result.parsed.stats?.military_power && (
                <div>
                  <span className="text-gray-500">军事力量</span>
                  <p className="font-semibold">{result.parsed.stats.military_power.toLocaleString()}</p>
                </div>
              )}
              {result.parsed.stats?.victory_rank && (
                <div>
                  <span className="text-gray-500">胜利排名</span>
                  <p className="font-semibold">#{result.parsed.stats.victory_rank}</p>
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-3">
              <Link
                href={`/campaigns/${result.campaign_id}`}
                className="inline-block px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-medium transition-colors"
              >
                查看战役详情 →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 战役列表 */}
      <div>
        <h2 className="text-2xl font-bold mb-4">已有战役</h2>
        {!loaded ? (
          <p className="text-gray-500">加载中...</p>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center text-gray-600 border border-dashed border-gray-800 rounded-xl">
            还没有战役,上传存档后自动创建
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
                  <span className="text-xs text-gray-600">
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
      </div>
    </div>
  );
}
