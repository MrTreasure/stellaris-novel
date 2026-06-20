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
          });

          // 插入里程碑 (去重: 同一战役内同类型+同年份只保留一条)
          const db = getDb();
          const seenKeys = new Set<string>();
          const milestones: any[] = [];
          for (const evt of parsed.timeline_events) {
            const dedupKey = `${evt.category}_${evt.approx_date}`;
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
            milestones.push({
              save_id: saveId, campaign_id: campaignId, event_date: w.date,
              event_type: 'war', title: w.type === 'war_active' ? '⚔️ 参与战争' : '💔 战败',
              description: '', importance: w.type === 'war_lost' ? 'critical' : 'major',
              game_key: null, raw_flag: 'war', raw_value: w.date,
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
