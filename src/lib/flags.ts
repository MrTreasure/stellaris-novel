// Flag name → Chinese title mapping (with DB enrichment for anomalies etc.)
// Covers Butler v2.x and Corvus v4.x format flags

export function flagToTitle(flag: string, db?: any): string {
  const m: Record<string, string> = {
    // === Core milestones ===
    first_colony: '🏗️ 建立第一个外星殖民地',
    colony_founded: '🌍 新殖民地',
    first_colony_finished: '🏗️ 首颗殖民完成',
    first_colony_established: '🏗️ 殖民地建立',
    encountered_first_wormhole: '🌀 首次遭遇虫洞',
    encountered_first_gateway: '🚪 发现远古星门',
    encountered_first_lgate: '🌌 发现L星门',
    encountered_first_primitive: '🦴 发现原始文明',
    encountered_first_shroud_tunnel: '🌀 发现虚境隧道',
    drones_encountered: '🤖 遭遇远古无人机',
    amoeba_encountered: '🦠 遭遇太空变形虫',
    void_clouds_encountered: '☁️ 遭遇虚空云',
    void_clouds_first_contact: '☁️ 与虚空云首次接触',
    drones_first_contact: '🤖 与远古无人机首次接触',
    caravaneers_first_contact: '🐫 与商队首次接触',

    // === Megastructures ===
    built_dyson_sphere: '⭐ 戴森球建造',
    started_first_dyson_sphere: '⭐ 戴森球工程启动',
    finished_dyson_sphere: '🌟 戴森球竣工',
    finished_think_tank: '🧠 科学枢纽竣工',
    built_sentry_array: '🔭 哨兵阵列建成',
    built_mega_shipyard: '🚢 巨型船坞建成',
    built_mega_art_installation_site: '🎨 巨型艺术设施',
    built_think_tank: '🧠 智库建成',
    built_interstellar_assembly_site: '🏛️ 星际集会场所',
    built_spy_orb: '🛰️ 间谍卫星',
    built_generator_district: '⚡ 建设发电区划',
    built_farming_district: '🌾 建设农业区划',
    built_city_district: '🏙️ 建设城市区划',
    built_artificial_ship: '🚀 建造首艘人工飞船',

    // === Resources ===
    rare_crystals_found: '💎 发现稀有水晶',
    exotic_gases_found: '💨 发现奇异气体',
    dark_matter_found: '🌑 发现暗物质',
    zro_found: '✨ 发现Zro',
    living_metal_found: '🛠️ 发现活性金属',
    astral_threads_found: '🌀 发现星界丝线',
    strategic_resource_found: '💎 发现战略资源',
    found_toxic_terraform_candidate: '☣️ 发现毒性改造候选',

    // === Achievements ===
    archaeologist_achievement: '🏺 考古学成就达成',
    fine_print_achievement: '📜 小字成就',
    green_thumb_achievement: '🌿 绿色拇指成就',
    unlimited_power_achievement: '⚡ 无限力量成就',

    // === Wars & Conflicts ===
    has_won_war: '⚔️ 赢得关键战争',
    has_conquer_other_homeworld: '💀 征服异族母星',
    has_won_space_battle: '⚔️ 赢得太空战斗',
    fired_cracker: '💥 使用碎星炮',
    first_rebellion: '⚡ 首次叛乱',
    scrapper_killed: '💀 击杀拆解者',
    synth_queen_failed_attack: '🤖 机械女皇攻击失败',
    synth_queen_crisis_2: '🤖 机械女皇危机',
    synth_queen_history_started: '🤖 机械女皇起源',
    synth_queen_conversation_ongoing: '🤖 与机械女皇对话中',
    aggressive_drone_expansion_country: '🤖 激进无人机扩张',

    // === Crisis ===
    no_machine_uprising: '🤖 机械叛乱已被压制',
    crisis_stage_2: '🦠 危机第二阶段',
    crisis_20600_happened: '🦠 肃正协议觉醒',
    crisis_20300_happened: '🦠 虫群入侵',
    spawned_STORMS_EVISCERATED_FAUNA: '⛈️ 风暴虚空兽出现',
    spawned_STORMS_ANOM_TRAVELLERS: '⛈️ 风暴异常旅者',
    affected_by_gravity_storm: '⛈️ 受重力风暴影响',
    disabled_enigmatic_fortress: '🏰 失能谜团要塞',
    eviscerated_space_fauna_object: '⛈️ 虚空兽残骸',
    space_storm_object: '⛈️ 太空风暴体',

    // === Diplomacy & Events ===
    first_contact_event: '👽 首次接触事件',
    first_contact: '👽 首次接触',
    had_first_contact: '👽 首次外交接触',
    first_trade_deal: '💰 首次贸易协定',
    has_market_access: '💰 银河市场开放',
    has_negotiated_trade_deal: '🤝 达成贸易协定',
    has_research_pact: '🔬 签订科研协议',
    has_activated_edict: '📜 启用法令',
    galactic_community_founded: '🌐 银河共同体成立',
    galcom_founding_begun: '🌐 银河共同体筹建',
    galactic_market_station_flag: '💰 银河市场站成立',
    first_council_formed: '🏛️ 首个委员会成立',
    in_diplomacy_with26: '🤝 与#26文明外交',
    closed_mindwarden_diplomacy: '🚫 关闭心卫外交',
    truce: '🕊️ 停战协议',
    favor_gained: '💎 获得外交支持',
    cooldown_bulwark_event_chain_5_subject: '🛡️ 堡垒事件链冷却',

    // === Contact & Embassy ===
    seen_aliens: '👽 发现外星文明',
    hostile_first_contact_attempted: '⚠️ 敌对首次接触尝试',
    failed_capture_attempt: '❌ 捕获尝试失败',
    hivers_appeared: '🐝 蜂群出现',
    myrmeku: '🐜 蚁虫出现',

    // === Colonization & Exploration ===
    surveyed_phaseshift_planet: '🔍 调查相位转换星球',
    pyorun_czyrni_surveyed: '🔍 调查Pyo星系',
    first_system_survey_finished: '🔭 首次星系调查完成',
    first_anomaly_finished: '🔬 首个异常调查完成',
    first_arc_site: '🏺 首个考古遗址',
    first_contact_completed: '👽 首次接触完成',
    outer_system_mining_stations_constructed: '⛏️ 外环采矿站建成',
    encountered_first: '👾 首次遭遇',
    origin_lithoid_used: '💎 岩质起源触发',
    origin_lost_colony_used: '🚀 失落殖民地起源触发',
    fumongus_colony: '🍄 真菌殖民地',
    spawning_planet: '🐛 产卵星球',
    cara_home_tradestation: '🏠 首都贸易站建成',

    // === Leaders ===
    official_level_up: '🏛️ 官员晋升',
    official_level_4: '🏛️ 官员达到4级',
    official_level_5: '🏛️ 官员达到5级',
    commander_governor_assigned: '🎖️ 指挥官总督任命',
    scientist_level_up: '🔬 科学家晋升',
    scientist_level_4: '🔬 科学家达到4级',
    scientists_level_5: '🔬 科学家达到5级',
    hired_commander: '🎖️ 雇佣指挥官',
    hired_admiral_merc_leader: '🚢 雇佣佣兵舰队指挥官',
    veteran_commander: '🎖️ 老兵指挥官',
    scholarium_scientist: '📚 学术科学家',
    scholarium_arctrellis: '📚 学术Arctrellis',

    // === Other events ===
    first_specimen_acquired_event_occured: '🏺 首个标本收集完成',
    first_species_modification: '🧬 首次物种改造',
    first_robot: '🤖 首台机器人',
    first_rare_tech: '🔬 首个稀有科技',
    first_deficit: '⚠️ 首次资源短缺',
    first_ascension_perk: '⬆️ 首次飞升天赋',
    astral_rift_planet: '🌀 星界裂隙星球',
    caravaneer_crossed_empire: '🐫 商队穿越帝国',
    caravan_destroyed: '🐫 商队被毁',
    caravaneer_purchased_relic: '🏺 购买遗珍',

    // === Storage ===
    energy_storage_1000: '⚡ 能源储备突破1000',
    food_storage_1000: '🌾 粮食储备突破1000',
    mineral_storage_1000: '💎 矿物储备突破1000',
    alloys_storage_1000: '🔩 合金储备突破1000',
    consumer_goods_storage_1000: '📦 消费品储备突破1000',

    // === Story ===
    StoryFirst: '📖 先驱者第一章',
    StoryFirstRewardGiven: '📖 先驱者第一章完成',
    Story5: '📖 先驱者第五章',
    Story7: '📖 先驱者第七章',
    curator_intro: '🏛️ 策展人介绍',
    restored_node: '🔧 修复节点',
    machine_age_nanites_studied: '🤖 纳米机器研究完成',
    trigger: '📜 触发',
    speech_1: '🎙️ 首次演讲',
    grand_archive_kickstart_proposed: '📚 大档案馆启动提议',
    sleepers_awake_happened: '💤 沉睡者苏醒',
    fine_print: '📜 小字条款',
    is_in_recruit_window: '🎯 招募窗口开启',
    has_modified_species: '🧬 物种改造完成',

    // === Misc ===
    had_comet: '☄️ 彗星经过',
    had_uprising: '⚡ 发生起义',
    planet_building_built: '🏗️ 行星建筑完成',
    planetary_decision_enacted: '📜 行星决策执行',
    mining_station_built: '⛏️ 采矿站建成',
    spawned: '🐛 生物生成',
    spawned: '🐛 生物生成',
    should_not_have_upkeep: '💰 免除维持费',
    no_more_amoeba_garrison_spawns: '🦠 变形虫驻军停止',
    mining_drone_expansion_country: '🤖 采矿无人机扩张',
    ignore_country_clone_pulse: '🧬 忽略克隆脉冲',
    psionic_aura_space_object: '🧠 灵能光环天体',
  };

  if (m[flag]) return m[flag];

  // Pattern-based rules
  if (flag.startsWith('fc_event_')) return `👽 首次接触事件 #${flag.slice(9)}`;
  if (flag.startsWith('colony_')) return '🌍 殖民地事件';
  if (flag.startsWith('surveyed_')) return `🔍 调查${flag.slice(9).replace(/_/g,' ')}星系`;
  if (flag.startsWith('encountered_')) return '👾 遭遇外星生命';
  if (flag.startsWith('established_comms_')) return '📡 建立通讯';
  if (flag.startsWith('anomaly_')) return `🔬 异常调查: ${flag.slice(8)}`;
  if (flag.startsWith('marauder_')) return '🏴‍☠️ 掠夺者事件';
  if (flag.startsWith('triggered_')) return `📜 故事事件: ${flag.slice(10).replace(/_/g,' ')}`;
  if (flag.startsWith('built_')) return `🏗️ 建造: ${flag.slice(6).replace(/_/g,' ')}`;
  if (flag.startsWith('started_')) return `🔨 工程启动: ${flag.slice(8).replace(/_/g,' ')}`;
  if (flag.startsWith('finished_')) return `✅ 竣工: ${flag.slice(9).replace(/_/g,' ')}`;
  if (flag.startsWith('completed_')) return '✅ 任务完成';
  if (flag.startsWith('discovered_')) return '🔭 新发现';
  if (flag.startsWith('found_')) return '💎 发现资源';
  if (flag.startsWith('specimens_')) return '🏺 标本收集';
  if (flag.startsWith('curator_')) return '🏛️ 策展人';
  if (flag.startsWith('pirate_')) return '🏴‍☠️ 海盗';
  if (flag.startsWith('crystal_')) return '💎 晶态实体';
  if (flag.startsWith('amoeba_')) return '🦠 变形虫';
  if (flag.startsWith('tiyanki_')) return '🐋 缇扬奇';
  if (flag.startsWith('drone_')) return '🤖 无人机';
  if (flag.startsWith('caravan')) return '🐫 商队';
  if (flag.startsWith('caravaneer')) return '🐫 商队';
  if (flag.startsWith('void_cloud')) return '☁️ 虚空云';
  if (flag.startsWith('synth_queen')) return '🤖 机械女皇';
  if (flag.startsWith('crisis_')) return '🦠 危机事件';
  if (flag.startsWith('storm')) return '⛈️ 风暴';
  if (flag.startsWith('spawned_')) return '🐛 生成事件';
  if (flag.startsWith('storage_')) return '📦 储备达标';
  if (flag.match(/^has_/)) return '⚡ 帝国事件';
  if (flag.match(/^first_/)) return '🎯 帝国里程碑';
  if (flag.match(/^official_/)) return '🏛️ 官员事件';
  if (flag.match(/^scientist/)) return '🔬 科学家';
  if (flag.match(/^commander/)) return '🎖️ 指挥官';
  if (flag.match(/^hired_/)) return '📋 雇佣';
  if (flag.match(/^become_subject_of_/)) return '🔗 成为附庸';
  if (flag.match(/^establish_embassy_with_/)) return `🏛️ 向 #${flag.replace('establish_embassy_with_','')} 派遣大使`;
  if (flag.match(/^establish_research_pact_with_/)) return `🔬 与 #${flag.replace('establish_research_pact_with_','')} 签订科研协议`;
  if (flag.match(/^establish_migration_pact_with_/)) return `🚶 与 #${flag.replace('establish_migration_pact_with_','')} 签订移民条约`;
  if (flag.match(/^first_contact_completed/)) return `👽 完成首次接触`;
  if (flag.match(/^met_fallen_empire_/)) return '🏛️ 遭遇堕落帝国';
  if (flag.match(/^fc_event_/)) return `👽 第${flag.slice(9)}次接触事件`;
  if (flag.match(/^fumongus/)) return '🍄 真菌相关';
  if (flag.match(/^myrmeku/)) return '🐜 蚁虫事件';
  if (flag.match(/^hivers/)) return '🐝 蜂群事件';
  if (flag.match(/^pyorun/)) return '🔭 Pyorun星系';
  if (flag.match(/^cara/)) return '🏠 首都事件';
  if (flag.match(/^seen_/)) return '👽 发现新事物';
  if (flag.match(/^hostile_/)) return '⚠️ 敌对事件';
  if (flag.match(/^failed_/)) return '❌ 失败';
  if (flag.match(/^galactic_community/)) return '🌐 银河共同体';
  if (flag.match(/^galcom/)) return '🌐 银河共同体';
  if (flag.match(/^in_diplomacy/)) return '🤝 外交中';

  // DB enrichment for anomaly IDs
  if (db) {
    const anomM = flag.match(/^anomaly\.(\d+)/);
    if (anomM) {
      try {
        const row = db.prepare('SELECT zh_name FROM game_data WHERE key = ?').get(`anomaly.${anomM[1]}`);
        if (row?.zh_name) return `🔬 调查: ${row.zh_name}`;
      } catch {}
    }
  }

  return flag.replace(/_/g, ' ');
}
