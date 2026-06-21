// 群星小说生成器 - 类型定义

// ===== 游戏静态数据 =====
export interface GameData {
  key: string;           // 如 anomaly.35, tech_titans
  zh_name: string;       // 中文名
  description: string;   // 完整描述
  category: string;      // anomaly/tech/tradition/ethics/event/crisis/megastructure
}

// ===== 存档相关 =====
export interface Campaign {
  id: number;
  name: string;
  source_dir: string;
  save_count: number;
  date_start: string;
  date_end: string;
  created_at: string;
}

export interface SaveRecord {
  id: number;
  campaign_id: number;
  filename: string;
  game_date: string;
  empire_name: string | null;
  empire_size: number | null;
  military_power: number | null;
  tech_power: number | null;
  victory_rank: number | null;
  authority: string | null;
  ethics: string | null;
  civics: string | null;
  origin: string | null;
  species_name: string | null;
  species_traits: string | null;
  raw_json: string | null;
  uploaded_at: string;
  fleet_power: number | null;
  total_pops: number | null;
  num_colonies: number | null;
  active_wars: number | null;
}

export interface Milestone {
  id: number;
  save_id: number;
  campaign_id: number;
  event_date: string;
  event_type: string;
  title: string;
  description: string;
  importance: string;    // critical/major/minor/info
  game_key: string | null;
  raw_flag: string | null;
  raw_value: string | null;
  source_node_id?: string | null;
  chain_id?: string | null;
  chain_stage?: string | null;
  data_source?: string | null;
  resolution_confidence?: number | null;
  relevance?: 'include' | 'context' | 'exclude' | null;
  relevance_reason?: string | null;
}

// ===== 小说相关 =====
export interface Novel {
  id: number;
  campaign_id: number;
  title: string;
  status: string;        // draft/generating/completed
  total_chapters: number;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: number;
  novel_id: number;
  chapter_number: number;
  title: string;
  content: string;
  era_start: string;
  era_end: string;
  source_milestones: string; // JSON array of milestone IDs
  created_at: string;
}

// ===== 应用设置 =====
export interface AppSettings {
  api_key: string;
  base_url: string;
  model: string;
  stellaris_dir: string;
}

// ===== 存档解析结果 =====
export interface ParsedSave {
  game_date: string;
  empire_name: string;
  empire_info: {
    species_name?: string;
    species_class?: string;
    species_portrait?: string;
    traits?: string[];
    authority?: string;
    ethics?: string[];
    civics?: string[];
    origin?: string;
  };
  stats: Record<string, number>;
  diplomatic: {
    in_federation?: boolean;
    in_galactic_community?: boolean;
    subject_count?: number;
  };
  timeline_events: {
    event: string;
    category: string;
    approx_date: string;
    key?: string;
    scope?: string;
  }[];
  crisis_encounters: { id: string; description: string }[];
  key_technologies: { id: string; description: string }[];
  megastructures: { name: string; status: string }[];
  war_history: {
    date: string;
    type: string;
    role?: 'attacker' | 'defender';
    attacker?: string;
    defender?: string;
    opponent?: string;
    war_goal?: string;
  }[];
  colonies?: { name: string; year: number }[];
  // Event chain detection fields
  rawFlags: { name: string; tick: number; scope: string; player_owned?: boolean }[];
  // Enhanced extraction — Phase 1
  population?: { total: number; factions: { name: string; size: number }[] };
  planets?: { colonized: number; colonies: { name: string; type: string; pops: number }[] };
  fleets?: { total_fleets: number; total_ships: number; total_power: number; notable: { name: string; ships: number; power: number }[] };
  // Enhanced extraction — Phase 2
  leaders?: { total: number; by_class: Record<string, number>; top: { name: string; class: string; level: number; traits: string[] }[] };
  wars_detailed?: { active: number; list: { name: string; attacker: string; defender: string; goal?: string; exhaustion?: string }[] };
  diplomacy?: { federation_name?: string; federation_size?: number; gc_member?: boolean; trade_deals: number; truces: number; rivals: number; subjects: number };
  // Enhanced extraction — Phase 3
  fired_events?: { total: number; recent: string[] };
  archaeology?: { active: number; sites: { name: string; stage: number; total_stages: number }[] };
  situations?: { count: number; list: { type: string; target?: string; progress?: number }[] };
  event_targets?: { count: number };
  player_choices?: { count: number };
  // Enhanced extraction — Phase 4
  infrastructure?: { sectors: number; buildings: Record<string, number>; total_districts: number };
  espionage?: { active_ops: number };
  resolutions?: { passed: number };
  ground_combat?: { active_invasions: number };
  map_objects?: { systems_owned: number; gateways: number; wormholes: number };
}

// ===== 事件链检测 =====

export interface DetectedEventChain {
  chainId: string;
  name: string;
  category: string;
  status: "active" | "completed" | "failed" | "unknown";
  currentStage: string;
  observedNodes: string[];
  selectedChoices: string[];
  possibleNextNodes: string[];
  startedAt?: string;
  updatedAt?: string;
}

// ===== AI 生成请求/响应 =====
export interface GenerateRequest {
  campaign_id: number;
  novel_id: number;
  chapter_index?: number;
  era_focus?: string;
}

export interface GenerateChunk {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  chapter_id?: number;
  error?: string;
}
