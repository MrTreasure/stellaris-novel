'use client';

import { useState, useEffect } from 'react';
import { AlertIcon, CheckIcon, SaveIcon, SpinnerIcon } from '@/components/Icons';
import { loadAIConfig, saveAIConfig } from '@/lib/browser-storage';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-chat');
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const config = loadAIConfig();
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setLoaded(true);
  }, []);

  const persistConfig = () => {
    saveAIConfig({ apiKey, baseUrl, model });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await fetch('/api/test-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: { api_key: apiKey, base_url: baseUrl, model } }) });
      setTestResult(await r.json());
    } catch (e: any) { setTestResult({ ok: false, message: e.message }); }
    finally { setTesting(false); }
  };

  if (!loaded) return <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-12 text-[#607c7e]"><SpinnerIcon className="spin h-4 w-4" />正在读取系统配置...</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="section-label">System Configuration / Neural Interface</div>
      <h1 className="mt-3 text-3xl font-semibold tracking-wide text-[#e0efed] sm:text-4xl">系统设置</h1>
      <p className="mt-3 text-sm leading-6 text-[#789293]">配置用于小说生成的 OpenAI 兼容服务。</p>

      <div className="mt-6 flex items-start gap-3 border border-[#426f72] bg-[#0b222a]/75 p-4 text-sm leading-6 text-[#a9c3c2]">
        <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#d7b768]" />
        <p>API Key、接口地址和模型名称仅保存在当前浏览器的本地存储中，不会写入服务端数据库。清理浏览器数据后需要重新配置。</p>
      </div>

      <section className="panel my-8 p-5 sm:p-7">
        <div className="flex items-center gap-3 border-b border-[#294a4e] pb-4">
          <span className="status-dot" />
          <div>
            <h2 className="font-semibold text-[#d1e2e0]">AI 神经接口</h2>
            <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-[#668183]">OPENAI-COMPATIBLE ENDPOINT</p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor="base-url" className="mb-2 block text-xs uppercase tracking-[0.14em] text-[#779193]">API Endpoint</label>
            <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
              id="base-url" className="field font-mono text-sm"
              placeholder="https://api.deepseek.com" />
          </div>
          <div>
            <label htmlFor="api-key" className="mb-2 block text-xs uppercase tracking-[0.14em] text-[#779193]">API Key</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              id="api-key" className="field font-mono text-sm"
              autoComplete="off"
              placeholder="sk-..." />
          </div>
          <div>
            <label htmlFor="model" className="mb-2 block text-xs uppercase tracking-[0.14em] text-[#779193]">Model</label>
            <input type="text" value={model} onChange={e => setModel(e.target.value)}
              id="model" className="field text-sm"
              placeholder="deepseek-chat" />
            <p className="mt-2 text-[11px] text-[#5d797b]">支持 DeepSeek、Claude、GPT、Qwen 等 OpenAI 兼容 API。</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button onClick={persistConfig} className="secondary-button">
              <SaveIcon className="h-4 w-4" />保存到当前浏览器
            </button>
            <button onClick={testConnection} disabled={testing || !apiKey}
              className="primary-button">
              {testing && <SpinnerIcon className="spin h-4 w-4" />}
              {testing ? '测试中' : '测试连接'}
            </button>
            {saved && <span className="flex items-center gap-2 text-sm text-[#7fd6a0]"><CheckIcon className="h-4 w-4" />已保存到浏览器</span>}
            {testResult && (
              <span className={`flex items-center gap-2 text-sm font-medium ${testResult.ok ? 'text-[#7fd6a0]' : 'text-[#e49b91]'}`} role="status">
                {testResult.ok ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}
                {testResult.ok ? '连接成功' : testResult.message}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="panel p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rotate-45 bg-[#7fd6a0] shadow-[0_0_10px_rgba(127,214,160,0.7)]" />
          <div>
            <h2 className="font-semibold text-[#d1e2e0]">数据核心状态</h2>
            <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-[#668183]">LOCAL GAME DATABASE</p>
          </div>
        </div>
        <p className="mt-5 text-sm text-[#8ea4a5]">游戏数据通过离线脚本预加载，启动前运行：</p>
        <code className="mt-3 block border border-[#29484d] bg-[#020a11] px-4 py-3 font-mono text-xs text-[#81d2a0]">
          node scripts/preload-all.mjs
        </code>
        <p className="mt-3 break-all font-mono text-[10px] leading-5 text-[#587476]">SOURCE / G:\SteamLibrary\steamapps\common\Stellaris</p>
      </section>
    </div>
  );
}
