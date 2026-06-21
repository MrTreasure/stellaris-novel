import type { Milestone, ParsedSave, SaveRecord } from '@/types';
import type { DatabaseSync } from 'node:sqlite';
import { buildChronicleMilestones } from './chronicle-builder';
import { resolveChronicleEvent } from './chronicle-resolver';

export function getResolvedCampaignMilestones(
  db: DatabaseSync,
  campaignId: number,
  saves: SaveRecord[],
  options: { includeContext?: boolean } = {},
): Milestone[] {
  const derived: Milestone[] = [];
  const dedupeRows: { event_date: string; raw_flag: string | null; raw_value: string | null; game_key: string | null }[] = [];

  for (const save of saves) {
    if (!save.raw_json) continue;
    try {
      const parsed = JSON.parse(save.raw_json) as ParsedSave;
      const generated = buildChronicleMilestones(db, parsed, save.id, campaignId, dedupeRows);
      for (const milestone of generated) {
        dedupeRows.push({
          event_date: milestone.event_date,
          raw_flag: milestone.raw_flag,
          raw_value: milestone.raw_value,
          game_key: milestone.game_key,
        });
        derived.push({
          ...milestone,
          id: -(derived.length + 1),
        });
      }
    } catch {}
  }

  const source = derived.length > 0
    ? derived
    : (db.prepare(
        'SELECT * FROM milestones WHERE campaign_id = ? ORDER BY event_date ASC',
      ).all(campaignId) as Milestone[]).map(milestone => {
        if (milestone.relevance || !milestone.raw_flag) return milestone;
        const resolved = resolveChronicleEvent(db, milestone.raw_flag);
        return {
          ...milestone,
          title: resolved.title !== '未识别的游戏事件' ? resolved.title : milestone.title,
          description: resolved.description || milestone.description,
          event_type: resolved.category || milestone.event_type,
          source_node_id: resolved.sourceNodeId,
          chain_id: resolved.chainId,
          chain_stage: resolved.chainStage,
          data_source: resolved.dataSource,
          resolution_confidence: resolved.confidence,
          relevance: resolved.relevance,
          relevance_reason: resolved.relevanceReason,
        };
      });

  const semanticKeys = new Set<string>();
  return source
    .filter(milestone => options.includeContext
      ? milestone.relevance !== 'exclude'
      : (milestone.relevance || 'include') === 'include')
    .filter(milestone => {
      const key = [
        milestone.event_date || '',
        milestone.title.trim(),
        milestone.description.trim(),
      ].join('\u001f');
      if (semanticKeys.has(key)) return false;
      semanticKeys.add(key);
      return true;
    })
    .sort((a, b) => (a.event_date || '9999').localeCompare(b.event_date || '9999'));
}
