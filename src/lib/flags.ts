// Flag name → Chinese title mapping (with bulk DB enrichment)
// Covers Butler v2.x and Corvus v4.x format flags

import type { DatabaseSync } from 'node:sqlite';

let _locMap: Map<string, string> | null = null;
let _flagTitleMap: Map<string, string> | null = null;
let _mapsLoaded = false;

/** Bulk-load game_data + event graph flag titles into memory (called once per process) */
export function loadLocMap(db: DatabaseSync): Map<string, string> {
  if (_mapsLoaded) return _locMap!;

  _locMap = new Map<string, string>();
  try {
    const rows = db.prepare('SELECT key, zh_name FROM game_data WHERE zh_name IS NOT NULL AND zh_name != \'\'').all() as { key: string; zh_name: string }[];
    for (const r of rows) _locMap.set(r.key, r.zh_name);
  } catch { /* table might not exist yet */ }

  // Build flag→title map from event graph: for each flag, find the event node that sets it
  _flagTitleMap = new Map<string, string>();
  try {
    const rows = db.prepare(
      `SELECT DISTINCT f.flag_name, n.zh_title FROM game_event_flags f
       JOIN game_event_nodes n ON f.node_id = n.id
       WHERE f.operation = 'set' AND n.zh_title IS NOT NULL AND n.zh_title != ''`
    ).all() as { flag_name: string; zh_title: string }[];
    for (const r of rows) {
      if (!_flagTitleMap.has(r.flag_name.toLowerCase())) {
        _flagTitleMap.set(r.flag_name.toLowerCase(), r.zh_title);
      }
    }
  } catch { /* table might not exist */ }

  _mapsLoaded = true;
  return _locMap!;
}

function getFlagTitleMap(): Map<string, string> | null {
  if (_mapsLoaded) return _flagTitleMap;
  return null;
}

function getLocMap(db?: DatabaseSync): Map<string, string> | null {
  if (_mapsLoaded) return _locMap;
  if (db) return loadLocMap(db);
  return null;
}

function translateFlag(flag: string, db?: DatabaseSync): string {
  const locMap = getLocMap(db);
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
    spawned_obj: '🐛 生物生成',
    renowned_militarist1: '🎖️ 著名军事家',
    mercenary_enclave_leader: '🎖️ 佣兵飞地领袖',
    wrecked_fleet_chain: '🚢 漂流舰队',
    fleet_maneuvers: '🚢 舰队演习',
    lost_colony_found_homeworld: '🌍 发现失落殖民地母星',
    lost_colony_parent: '🔭 发现失落殖民地来源',
    yuht_homeworld_found: '🏺 发现尤特母星',
    horror_spawned: '👾 星际恐魔出现',
    colony_event: '🌍 殖民地事件',
    mega_shipyard_built: '🚢 巨型船坞建成',
    has_habitat: '🏠 拥有轨道居住站',
    artifact_yuht_research_completed: '🏺 尤特遗物研究完成',
    yuht_research_started: '🏺 开始尤特研究',
    yuht_world_found: '🏺 发现尤特世界',
    yuht_intro: '🏺 尤特线索发现',
    yuht_6: '🏺 尤特线索 #6',
    yuht_9: '🏺 尤特线索 #9',
    yuhtaan: '🏺 尤坦',
    jabbardeeni_cache: '🏺 贾巴迪尼遗物',
    Story8: '📖 先驱者第八章',
    first_100k_fleet: '🚢 舰队战力突破10万',
    first_terraform: '🌍 首次环境改造',
    first_titan: '🚢 首艘泰坦',
    first_gateway: '🚪 发现首座星门',
    first_wormhole: '🌀 发现首个虫洞',
    first_vassal: '🔗 首次获得附庸',
    first_relic: '🏺 获得首件遗珍',
    first_repeatable_tech: '🔬 完成首项循环科技',
    first_storm_appears_within_borders: '⛈️ 帝国境内首次出现风暴',
    federation_formed: '🤝 联邦成立',
    first_federation_formed: '🤝 首次组建联邦',
    joined_council: '🏛️ 加入星海理事会',
    encountered_solarpunk: '👽 遭遇太阳朋克文明',
    galactic_community_resolution_passed: '🌐 星海共同体决议通过',
    crystal_sphere_sent: '💎 晶态球体已发送',
    precursor_adakkaria: '🏺 先驱者: 阿达卡里亚',
    precursor_1: '🏺 先驱者线索 #1',
    precursor_2: '🏺 先驱者线索 #2',
    precursor_3: '🏺 先驱者线索 #3',
    precursor_4: '🏺 先驱者线索 #4',
    precursor_5: '🏺 先驱者线索 #5',
    precursor_system: '🏺 发现先驱者星系',
    precursor_world: '🏺 发现先驱者母星',
    precursor_zroni_1: '🏺 先驱者: 泽珞族',
    precursor_collector_fired: '🏺 先驱者收集器激活',
    first_precursor: '🏺 首次发现先驱者',
    yuht_system: '🏺 尤特星系',
    yuht_system_discovered: '🏺 发现尤特星系',
    yuht_homeworld: '🏺 尤特母星',
    dimensional_horror: '👾 异次元恐魔',
    met_ubume: '👽 遇见乌布姆',
    phasphifting: '🌀 相位转换',
    caravaneer_home: '🐫 商队母星系',
    should_not_have_upkeep: '💰 免除维持费',
    no_more_amoeba_garrison_spawns: '🦠 变形虫驻军停止',
    mining_drone_expansion_country: '🤖 采矿无人机扩张',
    ignore_country_clone_pulse: '🧬 忽略克隆脉冲',
    psionic_aura_space_object: '🧠 灵能光环天体',

    // === Common narrative flags ===
    enclave_first_contact: '与太空城邦首次接触',
    jaunting_traveler_first_contact: '与漫游旅者首次接触',
    marauders_first_contact: '与掠夺者首次接触',
    solarpunk_discovered: '发现太阳朋克文明',
    galactic_market_founded: '银河市场成立',
    galactic_council_formed: '银河理事会成立',
    great_khan_dead: '大可汗陨落',
    great_khan_announcement: '大可汗宣告崛起',
    horde_triggered: '大可汗部落崛起',
    cosmic_storm_has_occurred: '宇宙风暴爆发',
    zro_deposit_spawned: '发现卓尘矿藏',
    enigmatic_cache_ship: '神秘缓存舰出现',
    dimensional_fleet: '异次元舰队出现',
    aggressive_drone_expansion_fleet: '激进无人机扩张舰队出现',
    mercedes_spawned: '特殊舰船“梅赛德斯”出现',
    cloning_approach_selected: '选定克隆研究方案',
    resolution_with_breach_effect_passed: '通过违反银河法的决议',
    leader_death_events_blocked: '领袖死亡事件暂时停用',
    immune_to_negative_traits: '领袖免疫负面特质',
    no_vessel: '未发现可用舰船',
    special_science_ship: '特殊科研船出现',
    lost_amoeba_fleet0: '失散的太空变形虫舰队出现',
    renowned_xenophobe2: '著名排外主义者出现',
    name_space_amoeba_plural: '太空变形虫',
    '2505_fired': '事件 2505 触发',
    creator: '创造者相关事件',

    // === Frequently encountered anomaly categories ===
    anomaly_ANCREL_RUBRICATOR_CAT: '异常调查：古代遗物线索',
    anomaly_RAPID_DESERTIFICATION_CAT: '异常调查：急速荒漠化',
    anomaly_SURVIVAL_POD_WARM_CAT: '异常调查：温热的逃生舱',
    anomaly_INTEMPORAL_ORB_CAT: '异常调查：超越时间的球体',
    anomaly_stolen_ship_cat: '异常调查：失窃舰船',
    anomaly_on_solar_sails_cat: '异常调查：太阳帆',
  };

  if (m[flag]) return m[flag];
  if (m[flag.toLowerCase()]) return m[flag.toLowerCase()];

  // Lookup from event graph flag→title map (only for exact flag name matches)
  const ftMap = getFlagTitleMap();
  if (ftMap && ftMap.size > 0) {
    const found = ftMap.get(flag.toLowerCase());
    if (found) return found;
  }

  // Bulk lookup from pre-loaded localization map (before generic patterns)
  if (locMap && locMap.size > 0) {
    const key = flag.toLowerCase();
    let found: string | undefined;
    // Exact match
    found = locMap.get(key);
    // Strip trailing numeric suffixes: first_contact_completed30 → first_contact_completed
    if (!found) {
      const stripped = key.replace(/\d+$/, '');
      if (stripped !== key) found = locMap.get(stripped);
    }
    // Strip trailing empire IDs: establish_embassy_with_16777219 → establish_embassy_with
    if (!found) {
      const stripped = key.replace(/_\d{5,}$/, '');
      if (stripped !== key) found = locMap.get(stripped);
    }
    // Strip known prefixes: first_X → look up X, has_X → look up X
    if (!found) {
      for (const prefix of ['first_', 'has_', 'is_', 'does_']) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          found = locMap.get(rest);
          if (found) {
            const prefixLabel: Record<string, string> = { first_: '首次 ', has_: '', is_: '', does_: '' };
            found = (prefixLabel[prefix] || '') + found;
            break;
          }
        }
      }
    }
    // Try underscore→space
    if (!found) {
      const spacedKey = key.replace(/_/g, ' ');
      if (spacedKey !== key) found = locMap.get(spacedKey);
    }
    if (found) return found;
  }

  // Pattern-based rules
  if (flag.startsWith('fc_event_')) return `👽 首次接触事件 #${flag.slice(9)}`;
  if (flag.startsWith('colony_')) return '🌍 殖民地事件';
  if (flag.startsWith('surveyed_')) return `🔍 调查${flag.slice(9).replace(/_/g,' ')}星系`;
  if (flag.startsWith('encountered_')) return '👾 遭遇外星生命';
  if (flag.startsWith('established_comms_')) return '📡 建立通讯';
  if (flag.startsWith('anomaly_')) return `异常调查：${humanizeFlag(flag.slice(8))}`;
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
  if (flag.match(/^has_/)) return `⚡ ${humanizeFlag(flag.slice(4))}`;
  if (flag.match(/^first_/)) return `🎯 首次 ${humanizeFlag(flag.slice(6))}`;
  if (flag.match(/^official_/)) return '🏛️ 官员事件';
  if (flag.match(/^scientist/)) return '🔬 科学家';
  if (flag.match(/^commander/)) return '🎖️ 指挥官';
  if (flag.match(/^hired_/)) return '📋 雇佣';
  if (flag.match(/^become_subject_of_/)) return '🔗 成为附庸';
  if (flag.match(/^establish_embassy_with_/)) return `🏛️ 向 #${flag.replace('establish_embassy_with_','')} 派遣大使`;
  if (flag.match(/^establish_research_pact_with_/)) return `🔬 与 #${flag.replace('establish_research_pact_with_','')} 签订科研协议`;
  if (flag.match(/^establish_migration_pact_with_/)) return `🚶 与 #${flag.replace('establish_migration_pact_with_','')} 签订移民条约`;
  if (flag.match(/^first_contact_completed/)) return `👽 完成首次接触`;
  if (flag.match(/^met_fallen_empire_/)) return `🏛️ 遭遇堕落帝国 #${flag.replace('met_fallen_empire_','')}`;
  if (flag.match(/^fc_event_/)) return `👽 首次接触事件 #${flag.slice(9)}`;
  if (flag.match(/^fumongus/)) return `🍄 真菌事件: ${humanizeFlag(flag)}`;
  if (flag.match(/^myrmeku/)) return `🐜 蚁虫事件: ${humanizeFlag(flag)}`;
  if (flag.match(/^hivers/)) return `🐝 蜂群事件: ${humanizeFlag(flag)}`;
  if (flag.match(/^pyorun/)) return `🔭 Pyorun星系: ${humanizeFlag(flag)}`;
  if (flag.match(/^cara/)) return `🏠 首都事件: ${humanizeFlag(flag)}`;
  if (flag.match(/^seen_/)) return `👽 发现: ${humanizeFlag(flag.slice(5))}`;
  if (flag.match(/^hostile_/)) return `⚠️ 敌对: ${humanizeFlag(flag.slice(8))}`;
  if (flag.match(/^failed_/)) return `❌ 失败: ${humanizeFlag(flag.slice(7))}`;
  if (flag.match(/^galactic_community/)) return `🌐 银河共同体: ${humanizeFlag(flag)}`;
  if (flag.match(/^galcom/)) return `🌐 银河共同体: ${humanizeFlag(flag)}`;
  if (flag.match(/^in_diplomacy/)) return `🤝 外交: ${humanizeFlag(flag)}`;

  if (flag.endsWith('_first_contact')) return `与${humanizeFlag(flag.slice(0, -14))}首次接触`;
  if (flag.endsWith('_discovered')) return `发现${humanizeFlag(flag.slice(0, -11))}`;
  if (flag.endsWith('_spawned')) return `${humanizeFlag(flag.slice(0, -8))}出现`;
  if (flag.endsWith('_formed')) return `${humanizeFlag(flag.slice(0, -7))}成立`;
  if (flag.endsWith('_founded')) return `${humanizeFlag(flag.slice(0, -8))}成立`;
  if (flag.endsWith('_triggered')) return `${humanizeFlag(flag.slice(0, -10))}事件触发`;
  if (flag.endsWith('_selected')) return `选定${humanizeFlag(flag.slice(0, -9))}`;
  if (flag.endsWith('_found')) return `发现${humanizeFlag(flag.slice(0, -6))}`;
  if (flag.endsWith('_passed')) return `${humanizeFlag(flag.slice(0, -7))}通过`;

  return humanizeFlag(flag);
}

const termMap: Record<string, string> = {
  amoeba: '太空变形虫',
  crystal: '晶态实体',
  drone: '无人机',
  fleet: '舰队',
  galactic: '银河',
  market: '市场',
  council: '理事会',
  community: '共同体',
  system: '星系',
  homeworld: '母星',
  ship: '舰船',
  science: '科研',
  storm: '风暴',
  traveler: '旅者',
  vessel: '舰船',
  xenophobe: '排外主义者',
};

function humanizeFlag(value: string): string {
  return value
    .replace(/_CAT$/i, '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => termMap[part.toLowerCase()] || part)
    .join(' ');
}

function stripDecorativeSymbols(value: string): string {
  return value
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function flagToTitle(flag: string, db?: DatabaseSync): string {
  return stripDecorativeSymbols(translateFlag(flag, db));
}

export function localizeMilestoneTitle(rawFlag: string | null, currentTitle: string, db?: DatabaseSync): string {
  const cleanCurrent = stripDecorativeSymbols(currentTitle);
  if (/[\u3400-\u9fff]/u.test(cleanCurrent)) return cleanCurrent;

  const source = rawFlag || currentTitle;
  return flagToTitle(source.trim().replace(/\s+/g, '_'), db);
}
