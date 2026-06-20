'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-chat');
  const [stellarisDir, setStellarisDir] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // 加载现有设置
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(s => {
        setApiKey(s.api_key || '');
        setBaseUrl(s.base_url || 'https://api.deepseek.com');
        setModel(s.model || 'deepseek-chat');
        setStellarisDir(s.stellaris_dir || '');
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

  const importGameData = async () => {
    setImporting(true);
    setImportResult('');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stellaris_dir: stellarisDir }),
      });
      const data = await res.json();
      if (data.error) {
        setImportResult(`❌ ${data.error}`);
      } else {
        setImportResult(`✅ 导入完成,共 ${data.total} 条数据`);
      }
    } catch (e: any) {
      setImportResult(`❌ ${e.message}`);
    } finally {
      setImporting(false);
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
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:border-cyan-500 focus:outline-none"
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
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:border-cyan-500 focus:outline-none font-mono"
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
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:border-cyan-500 focus:outline-none"
                placeholder="deepseek-chat"
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">支持所有 OpenAI 兼容模型: deepseek-chat / claude-sonnet-4-6 / gpt-4o / qwen-plus 等</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={testConnection}
              disabled={testing || !apiKey}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-700 border border-gray-700 rounded-lg text-sm transition-colors"
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

      {/* 游戏目录设置 */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">🎮 群星游戏目录</h2>
        <div>
          <label className="block text-sm text-gray-400 mb-1">安装路径</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={stellarisDir}
              onChange={e => { setStellarisDir(e.target.value); saveSetting('stellaris_dir', e.target.value); }}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:border-cyan-500 focus:outline-none"
              placeholder="C:\Program Files (x86)\Steam\steamapps\common\Stellaris"
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">用于导入游戏本地化数据(科技/事件/异常等中文名和描述)</p>

          <div className="mt-4 flex gap-3 items-center">
            <button
              onClick={importGameData}
              disabled={importing || !stellarisDir}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-700 border border-gray-700 rounded-lg text-sm transition-colors"
            >
              {importing ? '⏳ 导入中...' : '📥 导入游戏数据'}
            </button>
            {importResult && (
              <span className={`text-sm ${importResult.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
                {importResult}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
