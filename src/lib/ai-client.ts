// AI 客户端 — OpenAI 兼容 API
// 支持任意 baseUrl / model / apiKey, 从前端设置读取

import { getSettings } from '@/lib/db';

export interface AIClientConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function getConfig(): Required<AIClientConfig> {
  const settings = getSettings();
  return {
    apiKey: settings.api_key || process.env.DEEPSEEK_API_KEY || '',
    baseUrl: settings.base_url || 'https://api.deepseek.com',
    model: settings.model || 'deepseek-chat',
  };
}

function resolveConfig(config?: AIClientConfig): Required<AIClientConfig> {
  if (config) {
    return {
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || 'https://api.deepseek.com',
      model: config.model || 'deepseek-chat',
    };
  }
  return getConfig();
}

export async function* streamChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  config?: AIClientConfig
): AsyncGenerator<string> {
  const cfg = resolveConfig(config);
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API 错误 (${response.status}): ${errText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (!trimmed.startsWith('data: ')) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const content = json.choices?.[0]?.delta?.content || '';
        if (content) yield content;
      } catch {
        // 跳过解析失败的行
      }
    }
  }
}

export async function testConnection(config?: AIClientConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = resolveConfig(config);
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'user', content: '回答"连接成功"四个字即可' }
        ],
        stream: false,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      return { ok: false, message: `API 返回 ${response.status}` };
    }
    return { ok: true, message: '连接成功' };
  } catch (e: any) {
    return { ok: false, message: e.message || '连接失败' };
  }
}
