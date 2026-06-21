// Campaign facts aggregation — separates "what happened in this campaign" from "generic game knowledge"
import { getCampaign, getSaves, getMilestones, getDb } from './db';
import { detectEventChains, type SaveEvidence } from './event-chain-detector';

export interface CampaignFacts {
  empire: {
    name: string;
    species: string;
    authority: string;
    ethics: string[];
    civics: string[];
    traits: string[];
    origin: string;
  };
  currentState: {
    gameDate: string;
    empireSize: number;
    militaryPower: number;
    techPower: number;
    fleetPower: number;
    totalPops: number;
    numColonies: number;
    activeWars: number;
  };
  evolution: { date: string; size: number; military: number; tech: number; fleet: number }[];
  keyMilestones: { date: string; title: string; type: string; chain?: string }[];
  eventChains: { name: string; category: string; status: string; stage: string }[];
  snapshot: {
    topLeaders: string[];
    notableFleets: string[];
    diplomacy: string;
    archaeology: string[];
    situations: string[];
  };
}

export function buildCampaignFacts(campaignId: number): CampaignFacts | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;

  const saves = getSaves(campaignId);
  const latestSave = saves.at(-1);
  const milestones = getMilestones(campaignId); // use DB milestones directly

  const empire = {
    name: latestSave?.empire_name || campaign.name,
    species: latestSave?.species_name || '未知',
    authority: latestSave?.authority || '未知',
    ethics: safeJson(latestSave?.ethics || null),
    civics: safeJson(latestSave?.civics || null),
    traits: safeJson(latestSave?.species_traits || null),
    origin: latestSave?.origin || '未知',
  };

  const currentState = {
    gameDate: latestSave?.game_date || campaign.date_end || '?',
    empireSize: latestSave?.empire_size || 0,
    militaryPower: latestSave?.military_power || 0,
    techPower: latestSave?.tech_power || 0,
    fleetPower: latestSave?.fleet_power || 0,
    totalPops: latestSave?.total_pops || 0,
    numColonies: latestSave?.num_colonies || 0,
    activeWars: latestSave?.active_wars || 0,
  };

  const evolution = saves.map(s => ({
    date: s.game_date,
    size: s.empire_size || 0,
    military: s.military_power || 0,
    tech: s.tech_power || 0,
    fleet: s.fleet_power || 0,
  }));

  const keyMilestones = milestones
    .filter(m => m.relevance !== 'exclude' && m.importance !== 'info')
    .slice(0, 60)
    .map(m => ({ date: m.event_date, title: m.title, type: m.event_type, chain: m.chain_id || undefined }));

  // Event chain detection
  const evidence: SaveEvidence = {
    countryFlags: new Set<string>(),
    globalFlags: new Set<string>(),
    planetFlags: new Set<string>(),
    starFlags: new Set<string>(),
    completedAnomalies: [], activeProjects: [], completedProjects: [],
    archaeologySites: [], firedEvents: [],
    milestoneFlags: milestones.map(m => ({ flag: m.raw_flag || '', date: m.event_date })),
  };
  for (const m of milestones) {
    const flag = m.raw_flag || '';
    if (!flag) continue;
    if (flag.startsWith('global_')) evidence.globalFlags.add(flag);
    else evidence.countryFlags.add(flag);
    if (/\.\d+$/.test(flag)) evidence.firedEvents.push(flag);
  }
  let chains: ReturnType<typeof detectEventChains> = [];
  try { chains = detectEventChains(evidence); } catch {}
  const eventChains = chains.map(c => ({
    name: c.name, category: c.category || 'story', status: c.status, stage: c.currentStage,
  }));

  // Snapshot data from latest raw_json
  let rawParsed: any = null;
  if (latestSave?.raw_json) { try { rawParsed = JSON.parse(latestSave.raw_json); } catch {} }

  const snapshot = {
    topLeaders: (rawParsed?.leaders?.top || []).slice(0, 8).map((l: any) =>
      `${l.name} (${l.class} L${l.level})`),
    notableFleets: (rawParsed?.fleets?.notable || []).slice(0, 5).map((f: any) =>
      `${f.name} (${f.ships}舰 ${f.power?.toLocaleString()}战力)`),
    diplomacy: rawParsed?.diplomacy
      ? `联邦=${rawParsed.diplomacy.federation_name || '无'}, 贸易=${rawParsed.diplomacy.trade_deals || 0}, 附庸=${rawParsed.diplomacy.subjects || 0}`
      : '',
    archaeology: (rawParsed?.archaeology?.sites || []).slice(0, 8).map((a: any) =>
      `${a.name} (${a.stage}/${a.total_stages})`),
    situations: (rawParsed?.situations?.list || []).slice(0, 5).map((s: any) =>
      `${s.type}${s.progress ? ` (${s.progress}%)` : ''}`),
  };

  return { empire, currentState, evolution, keyMilestones, eventChains, snapshot };
}

function safeJson(s: string | null): string[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}
