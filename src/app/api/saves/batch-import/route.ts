import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseSaveFile } from '@/lib/parser/save-parser';
import {
  createCampaign,
  getCampaigns,
  getDb,
  insertMilestones,
  insertSave,
  updateCampaignDates,
} from '@/lib/db';
import { buildChronicleMilestones } from '@/lib/chronicle-builder';

const SAVE_DIR = 'C:/Users/Administrator/Documents/Paradox Interactive/Stellaris/save games';

export async function POST() {
  try {
    if (!fs.existsSync(SAVE_DIR)) {
      return NextResponse.json({ error: `存档目录不存在: ${SAVE_DIR}` }, { status: 404 });
    }

    const db = getDb();
    const campaignDirs = fs.readdirSync(SAVE_DIR).filter(directory => {
      const fullPath = path.join(SAVE_DIR, directory);
      return fs.statSync(fullPath).isDirectory()
        && fs.readdirSync(fullPath).some(file => file.endsWith('.sav'));
    });
    let totalImported = 0;
    let totalMilestones = 0;

    for (const campaignDir of campaignDirs) {
      const fullPath = path.join(SAVE_DIR, campaignDir);
      const saveFiles = fs.readdirSync(fullPath).filter(file => file.endsWith('.sav')).sort();
      if (saveFiles.length === 0) continue;

      let empireName = campaignDir;
      try {
        empireName = parseSaveFile(path.join(fullPath, saveFiles[0])).empire_name || campaignDir;
      } catch {}

      const existingCampaign = getCampaigns().find(campaign => campaign.name === empireName);
      const campaignId = existingCampaign?.id
        ?? createCampaign(empireName, campaignDir, saveFiles[0], saveFiles[saveFiles.length - 1]);

      for (const filename of saveFiles) {
        try {
          const parsed = parseSaveFile(path.join(fullPath, filename));
          const saveId = insertSave({
            campaign_id: campaignId,
            filename,
            game_date: parsed.game_date,
            empire_name: parsed.empire_name,
            empire_size: parsed.stats.empire_size || null,
            military_power: parsed.stats.military_power || null,
            tech_power: parsed.stats.tech_power || null,
            victory_rank: parsed.stats.victory_rank || null,
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
          updateCampaignDates(campaignId, parsed.game_date);

          const existingMilestones = db.prepare(
            'SELECT event_date, raw_flag, raw_value, game_key FROM milestones WHERE campaign_id = ?',
          ).all(campaignId) as {
            event_date: string;
            raw_flag: string | null;
            raw_value: string | null;
            game_key: string | null;
          }[];
          const milestones = buildChronicleMilestones(
            db,
            parsed,
            saveId,
            campaignId,
            existingMilestones,
          );
          if (milestones.length > 0) insertMilestones(milestones);
          totalMilestones += milestones.filter(milestone => milestone.relevance === 'include').length;
          totalImported++;
        } catch (error) {
          console.error(`跳过 ${filename}:`, error);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      imported: totalImported,
      milestones_added: totalMilestones,
    });
  } catch {
    return NextResponse.json({ error: '批量导入失败' }, { status: 500 });
  }
}
