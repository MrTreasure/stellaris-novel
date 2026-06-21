// AI client — Vercel AI SDK v6 with OpenAI-compatible provider (DeepSeek)
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, generateText, type ToolSet } from 'ai';

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
    model: config?.model || 'deepseek-chat',
  };
}

function buildModel(config?: AIClientConfig) {
  const cfg = resolveConfig(config);
  const provider = createOpenAICompatible({
    name: 'deepseek',
    baseURL: cfg.baseUrl.replace(/\/$/, ''),
    apiKey: cfg.apiKey,
  });
  return { model: provider.chatModel(cfg.model), config: cfg };
}

export interface StreamEvent {
  type: 'text';
  content: string;
}

export interface StreamResult {
  usage: TokenUsage;
}

/** Stream a chat completion with optional tools. AI SDK handles the tool call loop automatically. */
export async function* streamChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  config?: AIClientConfig,
  options?: { tools?: ToolSet },
): AsyncGenerator<StreamEvent, StreamResult> {
  const { model } = buildModel(config);

  let usage: TokenUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

  const result = streamText({
    model,
    messages: messages as any,
    tools: options?.tools,
    temperature: 0.8,
    maxOutputTokens: 4096,
    onFinish: (event) => {
      usage = {
        inputTokens: event.usage?.inputTokens ?? 0,
        cachedInputTokens: event.usage?.cachedInputTokens ?? 0,
        outputTokens: event.usage?.outputTokens ?? 0,
      };
    },
  });

  for await (const chunk of result.textStream) {
    yield { type: 'text', content: chunk };
  }

  return { usage };
}

/** Non-streaming chat completion for structured output (continuity extraction). */
export async function completeChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  config?: AIClientConfig,
): Promise<string> {
  const { model } = buildModel(config);
  const result = await generateText({
    model,
    messages: messages as any,
    temperature: 0.2,
    maxOutputTokens: 1400,
  });
  return result.text;
}

/** Test API connection */
export async function testConnection(config?: AIClientConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const { model } = buildModel(config);
    const result = await generateText({
      model,
      messages: [{ role: 'user', content: '回答"连接成功"四个字即可' }],
      maxOutputTokens: 10,
    });
    return { ok: true, message: result.text || '连接成功' };
  } catch (e: any) {
    return { ok: false, message: e.message || '连接失败' };
  }
}
