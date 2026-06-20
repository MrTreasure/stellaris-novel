// Shared flag name → Chinese title mapping (with optional DB enrichment)

export function flagToTitle(flag: string, db?: any): string {
  const map: Record<string, string> = {
    first_colony: '🏗️ 建立第一个殖民地',
    colony_founded: '🌍 新殖民地',
    encountered_first_wormhole: '🌀 首次遭遇虫洞',
    encountered_first_gateway: '🚪 发现远古星门',
    encountered_first_lgate: '🌌 发现L星门',
    encountered_first_primitive: '🦴 发现原始文明',
    has_won_war: '⚔️ 赢得关键战争',
    has_conquer_other_homeworld: '💀 征服异族母星',
    built_dyson_sphere: '⭐ 戴森球建造',
    started_first_dyson_sphere: '⭐ 戴森球启动',
    finished_dyson_sphere: '🌟 戴森球竣工',
    finished_think_tank: '🧠 科学枢纽竣工',
    built_sentry_array: '🔭 哨兵阵列建成',
    built_mega_shipyard: '🚢 巨型船坞建成',
    built_mega_art_installation_site: '🎨 巨型艺术设施',
    built_think_tank: '🧠 智库建成',
    built_interstellar_assembly_site: '🏛️ 星际集会场所',
    built_spy_orb: '🛰️ 间谍卫星',
    archaeologist_achievement: '🏺 考古学成就达成',
    exotic_gases_found: '💨 发现奇异气体',
    rare_crystals_found: '💎 发现稀有水晶',
    volatile_motes_found: '⚡ 发现挥发性微尘',
    dark_matter_found: '🌑 发现暗物质',
    zro_found: '✨ 发现Zro',
    no_machine_uprising: '🤖 机械叛乱被压制',
    first_contact_event: '👽 首次外星接触',
    colossus_project: '☄️ 巨像计划启动',
    fired_neutron: '⚡ 使用中子横扫',
    fired_pacifier: '🕊️ 使用安乐天使',
    has_market_access: '💰 加入银河市场',
    market_nomination_eligible: '🏪 获得市场提名',
    green_thumb_achievement: '🌿 绿色拇指成就',
    unlimited_power_achievement: '⚡ 无限力量成就',
    edict_masters_writings_war: '📜 战争学说令',
    edict_renewable_energy: '🔋 可再生能源令',
    found_presapients: '🧬 发现前智慧物种',
    living_planet_started: '🌱 活体海洋调查开始',
    completed_living_sea: '🌊 活体海洋完成',
    triggered_the_oracle_digsite: '🔮 神谕考古遗址触发',
    baol_intro: '🌿 巴奥遗族第一章',
    last_baol_system: '🌿 巴奥遗族完成',
    has_used_baol_lifseeding: '🌱 巴奥生命播种',
    gate_built: '🌟 星门网络建成',
    gateway_built: '🚪 星门建成',
    had_comet: '☄️ 彗星事件',
    had_uprising: '⚡ 发生起义',
    machine_uprising_originator: '🤖 机器起义',
    story1: '📖 先驱者故事线',
    story2: '📖 先驱者故事线',
    story3: '📖 先驱者故事线',
    story4: '📖 先驱者故事线',
    story5: '📖 先驱者故事线',
    story6: '📖 先驱者故事线',
    story7: '📖 先驱者故事线',
    story8: '📖 先驱者故事线',
  };

  if (map[flag]) return map[flag];

  // Corvus v4.x / Butler format - specific named flags
  if (flag === 'cara home tradestation') return '🏠 首都贸易站建成';
  if (flag.match(/^fc event \d+$/)) return '👽 首次接触事件';
  if (flag === 'hostile first contact attempted') return '⚠️ 敌对首次接触';
  if (flag === 'seen aliens') return '👽 发现外星文明';
  if (flag.match(/^fumongus colony/)) return '🍄 真菌殖民地';
  if (flag === 'first_alien_life') return '🦠 首次发现外星生命';
  if (flag === 'first_intelligent_life') return '🧠 首次发现智慧生命';
  if (flag === 'met_fallen_empire') return '🏛️ 遭遇堕落帝国';
  if (flag === 'pirate_encountered') return '🏴‍☠️ 遭遇海盗';
  if (flag === 'birth_of_piracy') return '🏴‍☠️ 海盗诞生';
  if (flag === 'had_comet') return '☄️ 彗星经过';
  if (flag === 'had_uprising') return '⚡ 发生起义';
  if (flag === 'planet_building_built') return '🏗️ 行星建筑完成';
  if (flag === 'mining_station_built') return '⛏️ 采矿站建成';
  if (flag === 'has_market_access') return '💰 加入银河市场';
  if (flag === 'has_activated_edict') return '📜 启用法令';
  if (flag === 'has_negotiated_trade_deal') return '🤝 达成贸易协定';
  if (flag === 'has_research_pact') return '🔬 签订科研协议';
  if (flag === 'has_encountered_other_empire') return '👽 遭遇其他帝国';
  if (flag === 'has_won_space_battle') return '⚔️ 赢得太空战斗';
  if (flag === 'first_faction') return '🏛️ 首个派系成立';
  if (flag === 'first_trade_deal') return '💰 首次贸易协定';
  if (flag === 'first_colony_finished') return '🏗️ 殖民完成';
  if (flag === 'first_colony_established') return '🏗️ 殖民地建立';
  if (flag === 'first_system_survey_finished') return '🔭 首次星系调查完成';
  if (flag === 'first_special_project_finished') return '⚙️ 首个特殊项目完成';
  if (flag === 'first_deficit') return '⚠️ 首次资源短缺';
  if (flag === 'first_ascension_perk') return '⬆️ 首次飞升';
  if (flag === 'first_contact_event') return '👽 首次接触';
  if (flag === 'new_weapon_1') return '🔫 新武器研发';
  if (flag === 'start_resources_granted') return '🚀 初始资源分配';
  if (flag === 'official_governor_assigned') return '🏛️ 总督任命';
  if (flag === 'official_level_up') return '🏛️ 官员晋升';
  if (flag === 'commander_level_up') return '🎖️ 指挥官晋升';
  if (flag === 'scientist_level_up') return '🔬 科学家晋升';
  if (flag === 'energy_storage_1000') return '⚡ 能源储备破千';
  if (flag === 'food_storage_1000') return '🌾 粮食储备破千';
  if (flag === 'mineral_storage_1000') return '💎 矿物储备破千';
  if (flag === 'factions_political_frontier') return '🏛️ 政治边疆';
  if (flag === 'StoryFirst') return '📖 第一章';
  if (flag === 'StoryFirstRewardGiven') return '📖 第一章完成';
  if (flag === 'Story5') return '📖 第五章';
  if (flag === 'Story7') return '📖 第七章';
  if (flag === 'ambition_launched') return '🚀 启动宏图';
  if (flag === 'built_artificial_ship') return '🚀 建造首艘飞船';
  if (flag === 'triggered_eye_of_the_storm') return '🌀 风暴之眼';
  if (flag === 'triggered_aftermath_opportunists') return '📜 后续投机者';
  if (flag === 'triggered_syndaw_505') return '🤖 合成黎明 505';
  if (flag === 'triggered_syndaw_510') return '🤖 合成黎明 510';
  if (flag === 'triggered_syndaw_515') return '🤖 合成黎明 515';

  // Auto-generate based on prefix
  if (flag.startsWith('colony_')) return '🌍 殖民地事件';
  if (flag.startsWith('surveyed_')) return `🔍 完成星域调查 (${flag.replace('surveyed_', '')})`;
  if (flag.startsWith('encountered_')) return '👾 遭遇外星生命';
  if (flag.startsWith('established_comms_')) return '📡 建立通讯';
  if (flag.startsWith('anomaly_')) return '🔬 异常调查完成';
  if (flag.startsWith('marauder_')) return '🏴‍☠️ 掠夺者事件';
  if (flag.startsWith('triggered_')) return '📜 故事事件触发';
  if (flag.startsWith('built_')) return '🏗️ 建造完成';
  if (flag.startsWith('started_')) return '🔨 工程启动';
  if (flag.startsWith('finished_')) return '✅ 工程竣工';
  if (flag.startsWith('has_')) return '⚡ 帝国事件';
  if (flag.startsWith('completed_')) return '✅ 任务完成';
  if (flag.startsWith('discovered_')) return '🔭 新发现';
  if (flag.startsWith('found_')) return '💎 发现资源';
  if (flag.startsWith('specimens_')) return '🏺 标本收集';
  if (flag.startsWith('cache_')) return '📦 谜团事件';
  if (flag.startsWith('curator_')) return '🏛️ 策展人事件';
  if (flag.startsWith('pirate_')) return '🏴‍☠️ 海盗事件';
  if (flag.startsWith('crystal_')) return '💎 晶态实体';
  if (flag.startsWith('amoeba_')) return '🦠 太空变形虫';
  if (flag.startsWith('tiyanki_')) return '🐋 缇扬奇';
  if (flag.startsWith('drone_')) return '🤖 远古无人机';
  if (flag.startsWith('met_fallen_empire_')) return '🏛️ 遭遇堕落帝国';
  if (flag.startsWith('establish_')) return '📜 外交条约';
  if (flag.startsWith('become_subject_of_')) return '🔗 成为附庸';
  if (flag.startsWith('first_contact_completed')) return '👽 首次接触完成';
  if (flag.startsWith('had_first_contact')) return '👽 首次外交接触';
  if (flag.startsWith('first_special_project')) return '⚙️ 完成特殊项目';
  if (flag.startsWith('first_trade_deal')) return '💰 首次贸易';
  if (flag.startsWith('first_')) return '🎯 帝国里程碑';
  if (flag.startsWith('mining_')) return '⛏️ 矿业发展';
  if (flag.startsWith('energy_')) return '⚡ 能源储备';
  if (flag.startsWith('food_')) return '🌾 粮食储备';
  if (flag.startsWith('mineral_')) return '💎 矿物储备';
  if (flag.startsWith('scientist_')) return '🔬 科学家晋升';
  if (flag.startsWith('commander_')) return '🎖️ 指挥官晋升';
  if (flag.startsWith('official_')) return '🏛️ 官员任命';
  if (flag.startsWith('planet_building_')) return '🏗️ 行星建设';
  if (flag.startsWith('factions_')) return '🏛️ 派系事件';
  if (flag.startsWith('new_weapon_')) return '🔫 新武器研发';
  if (flag.startsWith('start_')) return '🚀 帝国启动';
  if (flag.startsWith('first_system_')) return '🔭 星系探索';
  if (flag.startsWith('first_war_')) return '⚔️ 首次开战';

  // Corvus v4.x short-form flags
  if (flag.match(/^fc event \d+$/)) return `👽 首次接触事件 (${flag})`;
  if (flag.match(/^cara home tradestation$/)) return '🏠 首都贸易站建设';
  if (flag === 'cara' || flag.startsWith('cara ')) return '🏗️ 首都建设';

  // DB enrichment for specific categories
  if (db) {
    // Anomaly: anomaly.XXX → look up Chinese name
    const anomMatch = flag.match(/^anomaly\.(\d+)/);
    if (anomMatch) {
      try {
        const row = db.prepare('SELECT zh_name FROM game_data WHERE key = ?').get(`anomaly.${anomMatch[1]}`);
        if (row?.zh_name) return `🔬 调查: ${row.zh_name}`;
      } catch {}
    }
    // First contact: first_contact_completedXX → look up
    const fcMatch = flag.match(/first_contact_completed(\d+)/);
    if (fcMatch) {
      return `👽 与 #${fcMatch[1]} 文明首次接触`;
    }
    // Embassy: establish_embassy_with_XX
    const embMatch = flag.match(/establish_embassy_with_(\d+)/);
    if (embMatch) {
      return `🏛️ 向 #${embMatch[1]} 文明派遣大使`;
    }
    // Subject
    const subjMatch = flag.match(/become_subject_of_(\d+)/);
    if (subjMatch) {
      return `🔗 成为 #${subjMatch[1]} 文明的附庸`;
    }
    // Met fallen empire
    const feMatch = flag.match(/met_fallen_empire_(\d+)/);
    if (feMatch) {
      return `🏛️ 遭遇 #${feMatch[1]} 号堕落帝国`;
    }
  }

  return flag.replace(/_/g, ' ');
}
