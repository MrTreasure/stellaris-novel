import type { DatabaseSync } from 'node:sqlite';
import type { Milestone, ParsedSave } from '@/types';
import { localizeGameKey, resolveChronicleEvent } from './chronicle-resolver';

type NewMilestone = Omit<Milestone, 'id'>;

interface ExistingMilestoneKey {
  event_date: string;
  raw_flag: string | null;
  raw_value: string | null;
  game_key: string | null;
}

function cleanGeneratedName(value: string): string {
  if (!value) return '未知';
  return value
    .replace(/^(?:HUM|MAM|REP|AVI|ART|FUN|MOL|LITHOID)\d*\s+/i, '')
    .replace(/\b(?:NAME|PREFIX|FORMAT|TRANS|FLEET|SHIPCLASS|CHR)\b/gi, ' ')
    .replace(/%SEQ%/g, '序列')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '未知';
}

function milestoneKey(value: Pick<NewMilestone, 'event_date' | 'raw_flag' | 'raw_value' | 'game_key'>): string {
  return [
    value.raw_flag || '',
    value.game_key || '',
    value.raw_value || '',
    value.event_date || '',
  ].join('\u001f');
}

function importanceForCategory(category: string, confidence = 100): string {
  if (category === 'crisis' || category === 'war') return 'critical';
  if (confidence < 40) return 'minor';
  return 'major';
}

function baseMilestone(
  saveId: number,
  campaignId: number,
  values: Partial<NewMilestone>,
): NewMilestone {
  return {
    save_id: saveId,
    campaign_id: campaignId,
    event_date: '',
    event_type: 'event',
    title: '',
    description: '',
    importance: 'major',
    game_key: null,
    raw_flag: null,
    raw_value: null,
    source_node_id: null,
    chain_id: null,
    chain_stage: null,
    data_source: 'save',
    resolution_confidence: 100,
    relevance: 'include',
    relevance_reason: '存档中的玩家直接数据',
    ...values,
  };
}

function localize(db: DatabaseSync, key: string, variants: string[] = []): string {
  return localizeGameKey(db, key, variants)?.name || cleanGeneratedName(key);
}

function formatWarTitle(db: DatabaseSync, war: ParsedSave['war_history'][number]): string {
  const opponent = cleanGeneratedName(war.opponent || '未知帝国');
  const goal = war.war_goal ? localize(db, war.war_goal) : '';
  if (war.type === 'war_lost') return `在对抗${opponent}的战争中战败${goal ? `（${goal}）` : ''}`;
  if (war.role === 'attacker') return `向${opponent}宣战${goal ? `（目标：${goal}）` : ''}`;
  return `遭到${opponent}宣战${goal ? `（目标：${goal}）` : ''}`;
}

export function buildChronicleMilestones(
  db: DatabaseSync,
  parsed: ParsedSave,
  saveId: number,
  campaignId: number,
  existing: ExistingMilestoneKey[] = [],
): NewMilestone[] {
  const existingKeys = new Set(existing.map(milestoneKey));
  const seen = new Set<string>();
  const seenResolvedEvents = new Set<string>();
  const result: NewMilestone[] = [];
  const firedEvents = parsed.fired_events?.recent || [];
  const rawFlagMap = new Map((parsed.rawFlags || []).map(flag => [flag.name, flag]));

  function add(milestone: NewMilestone) {
    const key = milestoneKey(milestone);
    if (seen.has(key) || existingKeys.has(key)) return;
    seen.add(key);
    result.push(milestone);
  }

  for (const event of parsed.timeline_events) {
    const rawFlag = rawFlagMap.get(event.event);
    const legacyPlayerOwned = rawFlag?.player_owned === undefined && rawFlag?.scope === 'country';
    const resolved = resolveChronicleEvent(db, event.event, {
      firedEvents,
      fallbackCategory: event.category,
      playerOwned: event.scope === 'player_country' || rawFlag?.player_owned === true || legacyPlayerOwned,
    });
    if (resolved.relevance === 'exclude') continue;
    const resolvedKey = [
      event.approx_date,
      resolved.title,
      resolved.description,
    ].join('\u001f');
    if (seenResolvedEvents.has(resolvedKey)) continue;
    seenResolvedEvents.add(resolvedKey);
    add(baseMilestone(saveId, campaignId, {
      event_date: event.approx_date,
      event_type: resolved.category,
      title: resolved.title,
      description: resolved.description,
      importance: importanceForCategory(resolved.category, resolved.confidence),
      game_key: event.key || event.event,
      raw_flag: event.event,
      source_node_id: resolved.sourceNodeId,
      chain_id: resolved.chainId,
      chain_stage: resolved.chainStage,
      data_source: resolved.dataSource,
      resolution_confidence: resolved.confidence,
      relevance: resolved.relevance,
      relevance_reason: resolved.relevanceReason,
    }));
  }

  for (const war of parsed.war_history) {
    if (!war.date || war.date.startsWith('0.') || war.date.startsWith('1.01') || war.date === '2200.01.01') continue;
    add(baseMilestone(saveId, campaignId, {
      event_date: war.date,
      event_type: 'war',
      title: formatWarTitle(db, war),
      importance: war.type === 'war_lost' ? 'critical' : 'major',
      raw_flag: 'war',
      raw_value: JSON.stringify(war),
      data_source: 'save_war_history',
      relevance_reason: '存档记录了玩家参与的战争',
    }));
  }

  for (const colony of parsed.colonies || []) {
    add(baseMilestone(saveId, campaignId, {
      event_date: colony.year > 0 ? String(colony.year) : parsed.game_date,
      event_type: 'colonization',
      title: `建立殖民地：${cleanGeneratedName(colony.name)}`,
      game_key: 'colony_founded',
      raw_flag: 'colony',
      raw_value: colony.name,
      data_source: 'save_colony_history',
      relevance_reason: '存档记录了玩家殖民地的建立日期',
    }));
  }

  const techIds = new Set((parsed.key_technologies || []).map(technology => technology.id));
  for (const flag of parsed.rawFlags || []) {
    if (flag.name.startsWith('tech_')) techIds.add(flag.name);
  }
  for (const techId of techIds) {
    const tech = db.prepare('SELECT tier, area FROM game_techs WHERE id = ?').get(techId) as { tier: number; area: string } | undefined;
    if (!tech) continue;
    const loc = localizeGameKey(db, techId);
    const flag = parsed.rawFlags?.find(item => item.name === techId);
    const year = flag ? Math.round(2200 + (flag.tick - 62800000) / 8350).toString() : parsed.game_date;
    add(baseMilestone(saveId, campaignId, {
      event_date: year,
      event_type: 'technology',
      title: `研究完成：${loc?.name || techId}`,
      description: loc?.description || `${tech.area}领域，等级 ${tech.tier}`,
      importance: tech.tier >= 4 ? 'critical' : 'major',
      game_key: techId,
      raw_flag: techId,
      data_source: 'game_techs',
      relevance_reason: '科技 ID 同时存在于玩家存档和游戏科技表',
    }));
  }

  for (const site of parsed.archaeology?.sites || []) {
    const loc = localizeGameKey(db, site.name, [
      site.name.replace(/_site$/, ''),
      `${site.name}_title`,
    ]);
    add(baseMilestone(saveId, campaignId, {
      event_type: 'exploration',
      title: `考古遗址：${loc?.name || cleanGeneratedName(site.name)}`,
      description: `当前阶段 ${site.stage}/${site.total_stages}${loc?.description ? `。${loc.description}` : ''}`,
      game_key: site.name,
      raw_flag: site.name,
      raw_value: JSON.stringify(site),
      data_source: loc ? 'game_data' : 'save_archaeology',
      resolution_confidence: loc ? 95 : 55,
      relevance_reason: '存档记录了玩家正在发掘的考古遗址',
    }));
  }

  for (const situation of parsed.situations?.list || []) {
    const loc = localizeGameKey(db, situation.type);
    add(baseMilestone(saveId, campaignId, {
      event_type: 'event',
      title: `局势：${loc?.name || cleanGeneratedName(situation.type)}`,
      description: [
        situation.progress !== undefined ? `进度 ${situation.progress}%` : '',
        situation.target ? `目标：${cleanGeneratedName(situation.target)}` : '',
        loc?.description || '',
      ].filter(Boolean).join('；'),
      game_key: situation.type,
      raw_flag: situation.type,
      raw_value: JSON.stringify(situation),
      data_source: loc ? 'game_data' : 'save_situation',
      resolution_confidence: loc ? 95 : 55,
      relevance_reason: '存档记录了玩家当前局势',
    }));
  }

  for (const fleet of parsed.fleets?.notable?.slice(0, 5) || []) {
    add(baseMilestone(saveId, campaignId, {
      event_type: 'military',
      title: `主要舰队：${cleanGeneratedName(fleet.name)}`,
      description: `${fleet.ships} 艘舰船${fleet.power > 0 ? `，战力 ${fleet.power.toLocaleString()}` : ''}`,
      game_key: 'fleet',
      raw_flag: 'fleet',
      raw_value: fleet.name,
      importance: 'info',
      data_source: 'save_snapshot',
      relevance_reason: '玩家舰队快照',
    }));
  }

  const classLabels: Record<string, string> = {
    scientist: '科学官',
    admiral: '舰队司令',
    general: '陆军将领',
    governor: '总督',
    ruler: '统治者',
    official: '行政官',
    commander: '指挥官',
  };
  for (const leader of parsed.leaders?.top || []) {
    const traits = leader.traits.map(trait => localize(db, trait));
    add(baseMilestone(saveId, campaignId, {
      event_type: 'leader',
      title: `${classLabels[leader.class] || '领袖'}：${cleanGeneratedName(leader.name)}`,
      description: `${leader.level} 级${traits.length ? `；特质：${traits.join('、')}` : ''}`,
      game_key: `leader_${leader.class}`,
      raw_flag: `leader_${leader.class}`,
      raw_value: leader.name,
      importance: 'info',
      data_source: 'save_snapshot',
      relevance_reason: '玩家领袖快照',
    }));
  }

  if (parsed.diplomacy?.federation_name) {
    add(baseMilestone(saveId, campaignId, {
      event_type: 'diplomacy',
      title: `所属联邦：${cleanGeneratedName(parsed.diplomacy.federation_name)}`,
      description: parsed.diplomacy.federation_size ? `${parsed.diplomacy.federation_size} 个成员` : '',
      game_key: 'federation',
      raw_flag: 'federation',
      raw_value: parsed.diplomacy.federation_name,
      importance: 'info',
      data_source: 'save_snapshot',
      relevance_reason: '玩家外交状态快照',
    }));
  }
  if (parsed.diplomacy?.gc_member) {
    add(baseMilestone(saveId, campaignId, {
      event_type: 'diplomacy',
      title: '星海共同体成员',
      description: `贸易协定 ${parsed.diplomacy.trade_deals}；附庸 ${parsed.diplomacy.subjects}`,
      game_key: 'galactic_community',
      raw_flag: 'galactic_community',
      importance: 'info',
      data_source: 'save_snapshot',
      relevance_reason: '玩家外交状态快照',
    }));
  }

  return result;
}
