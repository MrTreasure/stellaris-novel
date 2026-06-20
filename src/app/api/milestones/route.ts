import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const campaignId = parseInt(req.nextUrl.searchParams.get('campaign_id') || '');
  if (isNaN(campaignId)) return NextResponse.json({ error: '需要 campaign_id' }, { status: 400 });

  const db = getDb();

  // Get milestones + lookup localisation for descriptions
  const milestones = db.prepare(`
    SELECT m.*,
      COALESCE(g1.zh_name, '') as loc_name,
      COALESCE(g1.description, g2.zh_name, g2.description, '') as loc_desc
    FROM milestones m
    LEFT JOIN game_data g1 ON g1.key = m.game_key
    LEFT JOIN game_data g2 ON g2.key = (m.raw_flag || '.desc')
    WHERE m.campaign_id = ?
    ORDER BY m.event_date ASC
  `).all(campaignId) as any[];

  // Build event chains
  const chains = buildEventChains(milestones);

  return NextResponse.json({ milestones, chains });
}

function buildEventChains(milestones: any[]) {
  const chains: { id: string; name: string; category: string; events: any[] }[] = [];

  // 1. Colonization chain
  const colonyEvents = milestones.filter((m: any) =>
    m.event_type === 'colonization' || m.title?.includes('殖民地')
  );
  if (colonyEvents.length > 0) {
    chains.push({ id: 'colonization', name: '🌍 殖民扩张', category: 'colonization', events: colonyEvents });
  }

  // 2. Dyson Sphere chain
  const dysonEvents = milestones.filter((m: any) =>
    m.title?.includes('戴森球') || m.raw_flag?.includes('dyson_sphere')
  );
  if (dysonEvents.length > 0) {
    chains.push({ id: 'dyson', name: '⭐ 戴森球工程', category: 'megastructure', events: dysonEvents });
  }

  // 3. Science Nexus chain
  const thinkTank = milestones.filter((m: any) =>
    m.title?.includes('科学枢纽') || m.raw_flag?.includes('think_tank')
  );
  if (thinkTank.length > 0) {
    chains.push({ id: 'thinktank', name: '🧠 科学枢纽', category: 'megastructure', events: thinkTank });
  }

  // 4. War chain
  const warEvents = milestones.filter((m: any) =>
    m.event_type === 'war'
  );
  if (warEvents.length > 0) {
    chains.push({ id: 'wars', name: '⚔️ 战争史', category: 'war', events: warEvents });
  }

  // 5. Crisis chain
  const crisisEvents = milestones.filter((m: any) =>
    m.event_type === 'crisis' || m.raw_flag === 'great_khan' || m.raw_flag === 'gray_goo'
  );
  if (crisisEvents.length > 0) {
    chains.push({ id: 'crisis', name: '🦠 危机事件', category: 'crisis', events: crisisEvents });
  }

  // 6. Exploration chain (anomalies, archaeology, etc.)
  const exploreEvents = milestones.filter((m: any) =>
    m.event_type === 'exploration' || m.event_type === 'colonization'
  );
  if (exploreEvents.length > 0) {
    chains.push({ id: 'exploration', name: '🔭 探索发现', category: 'exploration', events: exploreEvents });
  }

  // 7. Technology breakthroughs
  const techEvents = milestones.filter((m: any) =>
    m.event_type === 'technology'
  );
  if (techEvents.length > 0) {
    chains.push({ id: 'technology', name: '🔬 科技突破', category: 'technology', events: techEvents });
  }

  // 8. Miscellaneous
  const knownIds = new Set(chains.flatMap(c => c.events.map((e: any) => e.id)));
  const miscEvents = milestones.filter((m: any) => !knownIds.has(m.id));
  if (miscEvents.length > 0) {
    chains.push({ id: 'misc', name: '📋 其他', category: 'misc', events: miscEvents });
  }

  return chains;
}
