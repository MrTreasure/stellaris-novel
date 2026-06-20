'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-chat');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      setApiKey(s.api_key || ''); setBaseUrl(s.base_url || 'https://api.deepseek.com'); setModel(s.model || 'deepseek-chat');
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const saveSetting = async (key: string, value: string) => {
    setSaving(key);
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
    setSaving('');
  };

  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch('/api/test-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: { api_key: apiKey, base_url: baseUrl, model } }) });
      setTestResult(await r.json());
    } catch (e: any) { setTestResult({ ok: false, message: e.message }); }
    finally { setTesting(false); }
  };

  if (!loaded) return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-600">加载中...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400" />
        <span className="text-xs text-cyan-400/80 font-mono tracking-wider uppercase">SYSTEM CONFIGURATION</span>
      </div>
      <h1 className="text-3xl font-bold text-gray-200 mb-8">系统设置</h1>

      {/* AI Config */}
      <div className="bg-gray-900/80 backdrop-blur-xl border border-cyan-800/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(8,145,178,0.1)] mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs text-cyan-400/80 font-mono tracking-wider uppercase">AI NEURAL INTERFACE</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">API Endpoint</label>
            <input type="text" value={baseUrl} onChange={e => { setBaseUrl(e.target.value); saveSetting('base_url', e.target.value); }}
              className="w-full px-3 py-2.5 bg-gray-900 text-gray-200 border border-gray-700/60 focus:border-cyan-600 rounded-lg text-sm outline-none transition-colors font-mono"
              placeholder="https://api.deepseek.com" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">API Key</label>
            <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); saveSetting('api_key', e.target.value); }}
              className="w-full px-3 py-2.5 bg-gray-900 text-gray-200 border border-gray-700/60 focus:border-cyan-600 rounded-lg text-sm outline-none transition-colors font-mono"
              placeholder="sk-..." />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Model</label>
            <input type="text" value={model} onChange={e => { setModel(e.target.value); saveSetting('model', e.target.value); }}
              className="w-full px-3 py-2.5 bg-gray-900 text-gray-200 border border-gray-700/60 focus:border-cyan-600 rounded-lg text-sm outline-none transition-colors"
              placeholder="deepseek-chat" />
            <p className="text-[11px] text-gray-600 mt-1.5">支持 OpenAI 兼容 API: deepseek / claude / gpt / qwen 等</p>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button onClick={testConnection} disabled={testing || !apiKey}
              className="px-5 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg text-sm font-medium transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)]">
              {testing ? '⏳ 测试中...' : '🔄 测试连接'}
            </button>
            {testResult && (
              <span className={`text-sm font-medium ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {testResult.ok ? '✅ 连接成功' : `❌ ${testResult.message}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Data Info */}
      <div className="bg-gray-900/80 backdrop-blur-xl border border-cyan-800/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(8,145,178,0.1)]">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-xs text-cyan-400/80 font-mono tracking-wider uppercase">DATA CORE STATUS</span>
        </div>
        <p className="text-sm text-gray-400">游戏数据通过离线脚本预加载，启动前运行:</p>
        <code className="block mt-2 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-green-400/80 font-mono">
          node scripts/preload-all.mjs
        </code>
        <p className="text-xs text-gray-600 mt-2">数据源: G:\SteamLibrary\steamapps\common\Stellaris</p>
      </div>
    </div>
  );
}
