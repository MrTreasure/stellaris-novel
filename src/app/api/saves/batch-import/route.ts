import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { flagToTitle } from '@/lib/flags';
import { getDb } from '@/lib/db';

const SAVE_DIR = 'C:/Users/Administrator/Documents/Paradox Interactive/Stellaris/save games';

export async function POST() {
  try {
    if (!fs.existsSync(SAVE_DIR)) {
      return NextResponse.json({ error: '存档目录不存在: ' + SAVE_DIR }, { status: 404 });
    }

    const { parseSaveFile } = await import('@/lib/parser/save-parser');
    const { getCampaigns, createCampaign, insertSave, insertMilestones } = await import('@/lib/db');

    const campaignDirs = fs.readdirSync(SAVE_DIR).filter(d => {
      const p = path.join(SAVE_DIR, d);
      return fs.statSync(p).isDirectory() && fs.readdirSync(p).some(f => f.endsWith('.sav'));
    });

    let totalImported = 0;

    for (const campaignDir of campaignDirs) {
      const fullPath = path.join(SAVE_DIR, campaignDir);
      const saveFiles = fs.readdirSync(fullPath).filter(f => f.endsWith('.sav')).sort();

      if (saveFiles.length === 0) continue;

      // 找战役名: 用第一个存档的帝国名
      const firstSave = path.join(fullPath, saveFiles[0]);
      let empireName = campaignDir;
      try {
        const parsed = parseSaveFile(firstSave);
        empireName = parsed.empire_name || campaignDir;
      } catch {}

      const existing = getCampaigns().find(c => c.name === empireName);
      let campaignId: number;
      if (existing) {
        campaignId = existing.id;
      } else {
        campaignId = createCampaign(empireName, campaignDir, saveFiles[0], saveFiles[saveFiles.length - 1]);
      }
      const knownWars = new Set(
        (getDb().prepare("SELECT event_date, raw_value FROM milestones WHERE campaign_id = ? AND event_type = 'war'").all(campaignId) as { event_date: string; raw_value: string }[])
          .map(row => `${row.event_date}:${row.raw_value}`),
      );

      for (const sf of saveFiles) {
        const savePath = path.join(fullPath, sf);
        try {
          const parsed = parseSaveFile(savePath);

          const saveId = insertSave({
            campaign_id: campaignId,
            filename: sf,
            game_date: parsed.game_date,
            empire_name: parsed.empire_name,
            empire_size: parsed.stats['empire_size'] || null,
            military_power: parsed.stats['military_power'] || null,
            tech_power: parsed.stats['tech_power'] || null,
            victory_rank: parsed.stats['victory_rank'] || null,
            authority: parsed.empire_info.authority || null,
            ethics: JSON.stringify(parsed.empire_info.ethics || []),
            civics: JSON.stringify(parsed.empire_info.civics || []),
            origin: parsed.empire_info.origin || null,
            species_name: parsed.empire_info.species_name || null,
            species_traits: JSON.stringify(parsed.empire_info.traits || []),
            raw_json: JSON.stringify(parsed),
            fleet_power: parsed.fleets?.total_power || null,
            total_pops: parsed.population?.total || null,
            num_colonies: parsed.planets?.colonized || null,
            active_wars: parsed.wars_detailed?.active || null,
          });

          // 插入里程碑 (去重: 同一战役内同类型+同年份只保留一条)
          const db = getDb();
          const seenKeys = new Set<string>();
          const milestones: any[] = [];
          for (const evt of parsed.timeline_events) {
            const dedupKey = `${evt.event}_${evt.approx_date}`;
            if (seenKeys.has(dedupKey)) continue;
            seenKeys.add(dedupKey);
            const title = flagToTitle(evt.event, db);
            milestones.push({
              save_id: saveId, campaign_id: campaignId, event_date: evt.approx_date,
              event_type: evt.category, title, description: '',
              importance: 'major', game_key: (evt as any).key || null, raw_flag: evt.event, raw_value: null,
            });
          }
          for (const w of parsed.war_history) {
            if (w.date.startsWith('0.') || w.date.startsWith('1.01') || w.date === '2200.01.01') continue;
            const rawWar = JSON.stringify(w);
            const warKey = `${w.date}:${rawWar}`;
            if (knownWars.has(warKey)) continue;
            knownWars.add(warKey);
            milestones.push({
              save_id: saveId, campaign_id: campaignId, event_date: w.date,
              event_type: 'war', title: formatWarTitle(w),
              description: '', importance: w.type === 'war_lost' ? 'critical' : 'major',
              game_key: null, raw_flag: 'war', raw_value: rawWar,
            });
          }
          // Colony milestones
          if (parsed.colonies) {
            for (const c of parsed.colonies) {
              milestones.push({
                save_id: saveId, campaign_id: campaignId,
                event_date: c.year.toString(), event_type: 'colonization',
                title: `🌍 殖民 ${c.name}`, description: '',
                importance: 'major', game_key: 'colony_founded', raw_flag: 'colony', raw_value: c.name,
              });
            }
          }
          // Enriched milestones
          if (parsed.fleets?.notable) {
            for (const f of parsed.fleets.notable.slice(0, 5)) {
              milestones.push({ save_id: saveId, campaign_id: campaignId, event_date: parsed.game_date, event_type: 'military', title: `🚢 舰队: ${f.name} (${f.ships}舰)`, description: '', importance: 'major', game_key: 'fleet', raw_flag: 'fleet', raw_value: f.name });
            }
          }
          if (parsed.leaders?.top) {
            for (const l of parsed.leaders.top) {
              const cl: Record<string, string> = { scientist: '科学家', admiral: '提督', general: '将军', governor: '总督', ruler: '统治者', official: '官员', commander: '指挥官' };
              milestones.push({ save_id: saveId, campaign_id: campaignId, event_date: parsed.game_date, event_type: 'leader', title: `⭐ ${cl[l.class] || l.class}: ${l.name} (${l.level}级)`, description: l.traits.join(', '), importance: l.level >= 8 ? 'critical' : 'major', game_key: 'leader', raw_flag: `leader_${l.class}`, raw_value: l.name });
            }
          }
          if (parsed.archaeology?.sites) {
            for (const a of parsed.archaeology.sites) {
              milestones.push({ save_id: saveId, campaign_id: campaignId, event_date: parsed.game_date, event_type: 'exploration', title: `🏺 考古: ${a.name} (阶段${a.stage}/${a.total_stages})`, description: '', importance: 'major', game_key: 'archaeology', raw_flag: 'archaeology', raw_value: a.name });
            }
          }
          if (parsed.situations?.list) {
            for (const s of parsed.situations.list) {
              milestones.push({ save_id: saveId, campaign_id: campaignId, event_date: parsed.game_date, event_type: 'event', title: `📋 局势: ${s.type}${s.progress ? ` (${s.progress}%)` : ''}`, description: s.target || '', importance: 'major', game_key: 'situation', raw_flag: s.type, raw_value: s.target || null });
            }
          }
          if (parsed.diplomacy?.federation_name) {
            milestones.push({ save_id: saveId, campaign_id: campaignId, event_date: parsed.game_date, event_type: 'diplomacy', title: `🤝 联邦: ${parsed.diplomacy.federation_name}`, description: '', importance: 'critical', game_key: 'federation', raw_flag: 'federation', raw_value: parsed.diplomacy.federation_name });
          }
          if (parsed.diplomacy?.gc_member) {
            milestones.push({ save_id: saveId, campaign_id: campaignId, event_date: parsed.game_date, event_type: 'diplomacy', title: '🌐 星海共同体成员', description: '', importance: 'major', game_key: 'galactic_community', raw_flag: 'galactic_community', raw_value: null });
          }

          if (milestones.length > 0) insertMilestones(milestones);
          totalImported++;
        } catch (e: any) {
          console.error(`  跳过 ${sf}: ${e.message}`);
        }
      }
    }

    return NextResponse.json({ ok: true, imported: totalImported });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function formatWarTitle(war: { type: string; role?: string; opponent?: string; war_goal?: string }) {
  const action = war.type === 'war_lost' ? '战败于' : war.role === 'attacker' ? '向' : '遭到';
  const ending = war.type === 'war_lost' ? '' : '宣战';
  const opponent = war.opponent || '未知帝国';
  const goal = war.war_goal ? `，战争目标：${war.war_goal}` : '';
  return `${action}${opponent}${ending}${goal}`;
}
