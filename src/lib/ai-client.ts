// AI client — Vercel AI SDK for non-streaming + raw fetch for SSE streaming
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, type ToolSet } from 'ai';

export interface AIClientConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

function resolveConfig(config?: AIClientConfig): Required<AIClientConfig> {
  return {
    apiKey: config?.apiKey || process.env.DEEPSEEK_API_KEY || '',
    baseUrl: config?.baseUrl || 'https://api.deepseek.com',
    model: config?.model || 'deepseek-v4-pro',
  };
}

/** Stream a chat completion via raw SSE (AI SDK streaming had compat issues with DeepSeek) */
export async function* streamChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  config?: AIClientConfig,
  _options?: { tools?: ToolSet },
): AsyncGenerator<{ type: 'text'; content: string }> {
  const cfg = resolveConfig(config);
  console.log('[streamChat] sending', messages.length, 'messages, model:', cfg.model);
  const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, messages, stream: true, temperature: 0.8, max_tokens: 4096 }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API 错误 (${response.status}): ${errText.slice(0, 500)}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawChunks = 0;

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
      rawChunks++;
      try {
        const json = JSON.parse(trimmed.slice(6));
        const content = json.choices?.[0]?.delta?.content;
        if (content) yield { type: 'text', content };
        else if (json.choices?.[0]?.finish_reason) {
          console.log('[streamChat] finish_reason:', json.choices[0].finish_reason);
        }
      } catch { /* skip */ }
    }
  }
  console.log('[streamChat] total SSE chunks:', rawChunks);
}

/** Non-streaming chat completion (AI SDK) */
export async function completeChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  config?: AIClientConfig,
): Promise<string> {
  const cfg = resolveConfig(config);
  const provider = createOpenAICompatible({ name: 'deepseek', baseURL: cfg.baseUrl.replace(/\/$/, ''), apiKey: cfg.apiKey });
  const result = await generateText({
    model: provider.chatModel(cfg.model),
    messages,
    temperature: 0.2,
    maxOutputTokens: 1400,
  });
  return result.text;
}

/** Test API connection (AI SDK) */
export async function testConnection(config?: AIClientConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = resolveConfig(config);
    const provider = createOpenAICompatible({ name: 'deepseek', baseURL: cfg.baseUrl.replace(/\/$/, ''), apiKey: cfg.apiKey });
    const result = await generateText({
      model: provider.chatModel(cfg.model),
      messages: [{ role: 'user', content: '回答"连接成功"四个字即可' }],
      maxOutputTokens: 10,
    });
    return { ok: true, message: result.text || '连接成功' };
  } catch (e: any) {
    return { ok: false, message: e.message || '连接失败' };
  }
}
