// AI client — Vercel AI SDK v6 with official OpenAI provider (DeepSeek compatible)
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText, stepCountIs, type ToolSet, type ModelMessage } from 'ai';

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

export type StreamEvent =
  | { type: 'text-delta'; content: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'finish'; usage: TokenUsage }
  | { type: 'error'; message: string };

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function resolveConfig(config?: AIClientConfig): Required<AIClientConfig> {
  return {
    apiKey: config?.apiKey || process.env.DEEPSEEK_API_KEY || '',
    baseUrl: config?.baseUrl || 'https://api.deepseek.com',
    model: config?.model || 'deepseek-v4-pro',
  };
}

function createProvider(config?: AIClientConfig) {
  const cfg = resolveConfig(config);
  const baseURL = cfg.baseUrl.replace(/\/$/, '');
  return createOpenAI({
    apiKey: cfg.apiKey,
    baseURL,
  });
}

function extractPrompt(messages: ChatMessage[]): { system?: string; messages: ModelMessage[] } {
  const systemParts: string[] = [];
  const promptMessages: ModelMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') { if (msg.content.trim()) systemParts.push(msg.content.trim()); continue; }
    if (msg.role === 'user') { promptMessages.push({ role: 'user', content: msg.content }); continue; }
    promptMessages.push({ role: 'assistant', content: msg.content });
  }
  return { system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined, messages: promptMessages };
}

function normalizeUsage(usage?: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number } | null): TokenUsage {
  return { inputTokens: usage?.inputTokens ?? 0, cachedInputTokens: usage?.cachedInputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 };
}

/** Streaming chat with tools via AI SDK. Uses provider.chat() to force /chat/completions endpoint (DeepSeek doesn't support /responses). */
export async function* streamChatWithTools(
  messages: ChatMessage[],
  config?: AIClientConfig,
  options?: { tools?: ToolSet; maxSteps?: number },
): AsyncGenerator<StreamEvent> {
  const cfg = resolveConfig(config);
  const provider = createProvider(config);
  const prompt = extractPrompt(messages);

  const result = streamText({
    model: provider.chat(cfg.model),
    system: prompt.system,
    messages: prompt.messages,
    tools: options?.tools,
    temperature: 0.8,
    maxOutputTokens: 32768,
    stopWhen: options?.tools ? stepCountIs(options.maxSteps ?? 12) : undefined,
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        if (part.text) yield { type: 'text-delta', content: part.text };
        break;
      case 'tool-call':
        yield { type: 'tool-call', toolCallId: part.toolCallId, toolName: part.toolName, args: part.input };
        break;
      case 'tool-result':
        yield { type: 'tool-result', toolCallId: part.toolCallId, toolName: part.toolName, result: part.output };
        break;
      case 'error':
        yield { type: 'error', message: part.error instanceof Error ? part.error.message : String(part.error || '流式错误') };
        return;
      case 'finish':
        yield { type: 'finish', usage: normalizeUsage(part.totalUsage) };
        return;
    }
  }
}

/** Streaming chat WITHOUT tools. Returns text-delta and finish events only. */
export async function* streamChatPlain(
  messages: ChatMessage[],
  config?: AIClientConfig,
  options?: { maxOutputTokens?: number },
): AsyncGenerator<StreamEvent> {
  const cfg = resolveConfig(config);
  const provider = createProvider(config);
  const prompt = extractPrompt(messages);

  const result = streamText({
    model: provider.chat(cfg.model),
    system: prompt.system,
    messages: prompt.messages,
    temperature: 0.8,
    maxOutputTokens: options?.maxOutputTokens ?? 16384,
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        if (part.text) yield { type: 'text-delta', content: part.text };
        break;
      case 'error':
        yield { type: 'error', message: part.error instanceof Error ? part.error.message : String(part.error || '流式错误') };
        return;
      case 'finish':
        yield { type: 'finish', usage: normalizeUsage(part.totalUsage) };
        return;
    }
  }
}

/** Non-streaming completion with optional tools */
export async function completeChat(
  messages: ChatMessage[],
  config?: AIClientConfig,
  options?: { tools?: ToolSet },
): Promise<{ text: string; usage?: TokenUsage }> {
  const cfg = resolveConfig(config);
  const provider = createProvider(config);
  const prompt = extractPrompt(messages);
  const result = await generateText({
    model: provider.chat(cfg.model),
    system: prompt.system,
    messages: prompt.messages,
    tools: options?.tools,
    temperature: 0.2,
    maxOutputTokens: 1400,
  });
  return { text: result.text, usage: result.usage ? normalizeUsage(result.usage) : undefined };
}

/** Test connection */
export async function testConnection(config?: AIClientConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = resolveConfig(config);
    const provider = createProvider(config);
    const result = await generateText({
      model: provider.chat(cfg.model),
      messages: [{ role: 'user', content: '回答"连接成功"四个字即可' }],
      maxOutputTokens: 10,
    });
    return { ok: true, message: result.text || '连接成功' };
  } catch (e: any) { return { ok: false, message: e.message || '连接失败' }; }
}
