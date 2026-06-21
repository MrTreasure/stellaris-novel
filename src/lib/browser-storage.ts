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

export interface LocalNovel {
  campaignId: number;
  title: string;
  background: string;
  backgroundEnabled: boolean;
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
  model: 'deepseek-chat',
};

export function novelStorageKey(campaignId: number) {
  return `stellaris-novel:novel:${campaignId}`;
}

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

export function loadLocalNovel(campaignId: number): LocalNovel | null {
  try {
    const value = localStorage.getItem(novelStorageKey(campaignId));
    if (!value) return null;
    const parsed = JSON.parse(value) as LocalNovel;
    return {
      ...parsed,
      continuity: parsed.continuity || emptyContinuity,
      chapters: (parsed.chapters || []).map(chapter => ({ ...chapter, summary: chapter.summary || '' })),
    };
  } catch {
    return null;
  }
}

export function saveLocalNovel(novel: LocalNovel) {
  localStorage.setItem(novelStorageKey(novel.campaignId), JSON.stringify(novel));
}

export function removeLocalNovel(campaignId: number) {
  localStorage.removeItem(novelStorageKey(campaignId));
}
