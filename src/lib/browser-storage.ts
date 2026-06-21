// Browser storage layer — IndexedDB via idb-keyval (async, 数百MB+ capacity)
import { get, set, del } from 'idb-keyval';

export const AI_CONFIG_KEY = 'stellaris-novel:ai-config';

export interface LocalAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LocalChapter {
  id: string;
  chapter_number: number;
  title: string;
  content: string;
  summary: string;
}

export interface ContinuityBible {
  characters: string[];
  factions: string[];
  unresolvedThreads: string[];
  activeEventChains: string[];
  completedEventChains: string[];
  eventChainChoices: string[];
  eventChainConsequences: string[];
  unresolvedEventChainClues: string[];
  establishedFacts: string[];
  timelineState: string;
}

export type NovelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'tool'; content: string; tool_call_id: string; tool_name: string };

export interface LocalNovel {
  campaignId: number;
  title: string;
  background: string;
  backgroundEnabled: boolean;
  outline: string;
  messages: NovelMessage[];
  chapters: LocalChapter[];
  continuity: ContinuityBible;
  updatedAt: string;
}

export const emptyContinuity: ContinuityBible = {
  characters: [],
  factions: [],
  unresolvedThreads: [],
  activeEventChains: [],
  completedEventChains: [],
  eventChainChoices: [],
  eventChainConsequences: [],
  unresolvedEventChainClues: [],
  establishedFacts: [],
  timelineState: '',
};

export const defaultAIConfig: LocalAIConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
};

export function novelStorageKey(campaignId: number) {
  return `stellaris-novel:novel:${campaignId}`;
}

// AI config stays in localStorage (small, needs to be synchronous for settings page)
export function loadAIConfig(): LocalAIConfig {
  try {
    const value = localStorage.getItem(AI_CONFIG_KEY);
    return value ? { ...defaultAIConfig, ...JSON.parse(value) } : defaultAIConfig;
  } catch {
    return defaultAIConfig;
  }
}

export function saveAIConfig(config: LocalAIConfig) {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

// Novel data in IndexedDB
export async function loadLocalNovel(campaignId: number): Promise<LocalNovel | null> {
  try {
    const parsed = await get<LocalNovel>(novelStorageKey(campaignId));
    if (!parsed) return null;
    return {
      ...parsed,
      continuity: parsed.continuity || emptyContinuity,
      messages: parsed.messages || [],
      chapters: (parsed.chapters || []).map(c => ({ ...c, summary: c.summary || '' })),
    };
  } catch {
    return null;
  }
}

export async function saveLocalNovel(novel: LocalNovel) {
  await set(novelStorageKey(novel.campaignId), novel);
}

export async function removeLocalNovel(campaignId: number) {
  await del(novelStorageKey(campaignId));
}
