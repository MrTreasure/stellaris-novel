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
    fetch('/api/settings')
      .then(r => r.json())
      .then(s => {
        setApiKey(s.api_key || '');
        setBaseUrl(s.base_url || 'https://api.deepseek.com');
        setModel(s.model || 'deepseek-chat');
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [])

  const saveSetting = async (key: string, value: string) => {
    setSaving(key);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    setSaving('');
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { api_key: apiKey, base_url: baseUrl, model },
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return <div className="max-w-4xl mx-auto px-4 py-8 text-gray-500">加载中...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">设置</h1>

      {/* AI 服务设置 */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">🤖 AI 服务配置</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Endpoint (Base URL)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={baseUrl}
                onChange={e => { setBaseUrl(e.target.value); saveSetting('base_url', e.target.value); }}
                className="flex-1 px-3 py-2 bg-gray-900 text-gray-100 border border-gray-700 rounded-lg text-sm focus:border-cyan-500 focus:outline-none"
                placeholder="https://api.deepseek.com"
              />
              <span className="text-xs text-gray-600 self-center whitespace-nowrap">{saving === 'base_url' ? '⏳' : ''}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); saveSetting('api_key', e.target.value); }}
                className="flex-1 px-3 py-2 bg-gray-900 text-gray-100 border border-gray-700 rounded-lg text-sm focus:border-cyan-500 focus:outline-none font-mono"
                placeholder="sk-..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">模型名</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={model}
                onChange={e => { setModel(e.target.value); saveSetting('model', e.target.value); }}
                className="flex-1 px-3 py-2 bg-gray-900 text-gray-100 border border-gray-700 rounded-lg text-sm focus:border-cyan-500 focus:outline-none"
                placeholder="deepseek-chat"
  />
            </div>
            <p className="text-xs text-gray-600 mt-1">支持所有 OpenAI 兼容模型: deepseek-chat / claude-sonnet-4-6 / gpt-4o / qwen-plus 等</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={testConnection}
              disabled={testing || !apiKey}
              className="px-5 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {testing ? '⏳ 测试中...' : '🔄 测试连接'}
            </button>
            {testResult && (
              <span className={`self-center text-sm ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {testResult.ok ? '✅ 连接成功' : `❌ ${testResult.message}`}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 游戏数据状态 */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">🎮 游戏数据</h2>
        <div className="space-y-2">
          <p className="text-sm text-gray-400">
            游戏数据通过命令行离线预加载。运行 <code className="text-xs bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">node scripts/preload-all.mjs</code> 同步最新数据。
          </p>
          <p className="text-sm text-gray-400">
            游戏升级后重新运行即可增量同步，仅更新变化的文件。
          </p>
          <p className="text-xs text-gray-600 mt-1">
            数据源: G:\SteamLibrary\steamapps\common\Stellaris
          </p>
        </div>
      </section>
    </div>
  );
}
