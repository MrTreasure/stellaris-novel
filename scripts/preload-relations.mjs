// Build event relationship graph from all Stellaris game data sources
// Usage: node scripts/preload-relations.mjs
//
// Parses: events, anomalies, archaeology, special_projects, on_actions, event_chains
// Builds: game_event_nodes, game_event_edges, game_event_flags, game_event_chains, game_event_chain_nodes

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { parsePDSText, findAllEventBlocks, findBlocks, asArray, asString, isBlockNode } from './pds-parser.mjs';
import { getDb, closeDb, batchInsert, getGameVersion, setGameVersion, fileHash, detectChanges, updateFileHashes } from './shared.mjs';

const STELLARIS = 'E:/SteamLibrary/steamapps/common/Stellaris';

// ===== Helpers =====

function loadLocalisation() {
  const locDir = join(STELLARIS, 'localisation/simp_chinese');
  if (!existsSync(locDir)) return new Map();

  const map = new Map();
  for (const f of readdirSync(locDir).filter(f => f.endsWith('.yml'))) {
    const content = readFileSync(join(locDir, f), 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('l_')) continue;
      let m = t.match(/^([\w.]+):\s+"(.+)"$/) || t.match(/^([\w.]+):\d+\s+"(.+)"$/);
      if (!m) continue;
      const rawKey = m[1].toLowerCase();
      let pk;
      if (rawKey.endsWith('.desc') || rawKey.endsWith('_desc')) pk = rawKey.replace(/\.(desc)$/, '').replace(/_(desc)$/, '');
      else if (rawKey.endsWith('_name')) pk = rawKey.slice(0, -5);
      else if (rawKey.endsWith('_title')) pk = rawKey.slice(0, -6);
      else pk = rawKey;

      const entry = map.get(pk);
      if (entry) {
        if (rawKey.endsWith('desc') || rawKey.endsWith('_desc')) entry.desc = m[2];
        else entry.name = m[2];
      } else {
        const isDesc = rawKey.endsWith('desc') || rawKey.endsWith('_desc');
        map.set(pk, { name: isDesc ? '' : m[2], desc: isDesc ? m[2] : '' });
      }
    }
  }
  return map;
}

function localName(loc, key) {
  if (!key) return '';
  const k = key.toLowerCase();
  let entry = loc.get(k);
  // Also try stripping common suffixes if direct lookup fails
  if (!entry) {
    for (const suffix of ['_title', '_name', '_desc']) {
      if (k.endsWith(suffix)) {
        entry = loc.get(k.slice(0, -suffix.length));
        if (entry) break;
      }
    }
  }
  return entry?.name || entry?.desc || '';
}

function localDesc(loc, key) {
  if (!key) return '';
  const k = key.toLowerCase();
  let entry = loc.get(k);
  if (!entry) {
    for (const suffix of ['_desc', '_title', '_name']) {
      if (k.endsWith(suffix)) {
        entry = loc.get(k.slice(0, -suffix.length));
        if (entry) break;
      }
    }
  }
  return entry?.desc || entry?.name || '';
}

// Extract conditions from a block as JSON string for storage
function extractConditions(block) {
  const cond = block.trigger;
  if (!cond) return null;
  return JSON.stringify(cond);
}

// Extract effects from a block as JSON string
function extractEffects(block) {
  const parts = {};
  if (block.immediate) parts.immediate = block.immediate;
  if (block.after) parts.after = block.after;
  if (block.hidden_effect) parts.hidden_effect = block.hidden_effect;
  if (block.effect) parts.effect = block.effect;
  if (Object.keys(parts).length === 0) return null;
  return JSON.stringify(parts);
}

// Normalize event ID to a consistent format
function normalizeId(id) {
  if (!id) return null;
  const s = String(id).toLowerCase().replace(/\s+/g, '_');
  return s;
}

// ===== Main sync function =====

export function syncRelations(db, { changed, isFirst }) {
  const loc = loadLocalisation();
  console.log(`  本地化: ${loc.size} 条目`);

  const nodes = [];
  const edges = [];
  const flags = [];
  const chains = [];
  const chainNodes = [];
  const nodeSet = new Set(); // prevent duplicate node IDs

  function addNode(id, nodeType, titleKey, descKey, filePath, rawText) {
    const normId = normalizeId(id);
    if (!normId || nodeSet.has(`${nodeType}:${normId}`)) return;
    nodeSet.add(`${nodeType}:${normId}`);
    nodes.push({
      id: normId,
      node_type: nodeType,
      title_key: titleKey || null,
      desc_key: descKey || null,
      zh_title: localName(loc, titleKey || id) || localName(loc, id) || null,
      zh_description: localDesc(loc, descKey || id) || null,
      file_path: filePath || null,
      raw_text: (rawText || '').slice(0, 8000),
    });
  }

  function addEdge(sourceId, targetId, edgeType, optionNameKey, conditions, effects) {
    const srcNorm = normalizeId(sourceId);
    const tgtNorm = normalizeId(targetId);
    if (!srcNorm || !tgtNorm) return;
    edges.push({
      source_id: srcNorm,
      target_id: tgtNorm,
      edge_type: edgeType,
      option_name_key: optionNameKey || null,
      conditions: conditions || null,
      effects: effects || null,
    });
  }

  function addFlag(nodeId, flagName, operation, scope = 'country') {
    const normId = normalizeId(nodeId);
    if (!normId || !flagName) return;
    flags.push({
      node_id: normId,
      flag_name: flagName,
      operation,
      scope,
    });
  }

  // ===== 1. Parse events =====
  console.log('  [1/6] 解析事件...');
  const evtDir = join(STELLARIS, 'events');
  let eventCount = 0;
  if (existsSync(evtDir)) {
    for (const f of readdirSync(evtDir).filter(f => f.endsWith('.txt'))) {
      const fp = join(evtDir, f);
      const content = readFileSync(fp, 'utf-8');
      let root;
      try { root = parsePDSText(content); } catch { continue; }

      const eventBlocks = findAllEventBlocks(root);
      for (const { type, block } of eventBlocks) {
        const id = block.id;
        if (!id) continue;
        const idStr = asString(id);
        eventCount++;

        addNode(idStr, 'event',
          asString(block.title) || null,
          asString(block.desc) || null,
          `events/${f}`,
          JSON.stringify(block).slice(0, 8000)
        );

        // Extract flags from immediate/after blocks
        for (const section of ['immediate', 'after']) {
          const secBlock = block[section];
          if (!secBlock || !isBlockNode(secBlock)) continue;
          extractFlagsFromBlock(secBlock, idStr, addFlag);
        }

        // Parse trigger conditions for flags
        const triggerBlock = block.trigger;
        if (triggerBlock && isBlockNode(triggerBlock)) {
          extractFlagChecks(triggerBlock, idStr, addFlag);
        }

        // Parse options → edges to triggered events
        const options = asArray(block.option);
        for (const opt of options) {
          if (!isBlockNode(opt)) continue;
          const optName = asString(opt.name);

          // Hidden effects often trigger other events
          if (opt.hidden_effect && isBlockNode(opt.hidden_effect)) {
            const triggered = extractTriggeredEvents(opt.hidden_effect);
            for (const tgt of triggered) {
              addEdge(idStr, tgt, 'option', optName,
                extractConditions(opt), extractEffects(opt));
            }
          }

          // Direct event triggers in options
          const triggered = extractTriggeredEvents(opt);
          for (const tgt of triggered) {
            addEdge(idStr, tgt, 'option', optName,
              extractConditions(opt), extractEffects(opt));
          }

          // Flag operations in option
          extractFlagsFromBlock(opt, idStr, addFlag);
        }

        // Immediate/Actions triggering other events
        for (const section of ['immediate', 'after']) {
          const secBlock = block[section];
          if (!secBlock || !isBlockNode(secBlock)) continue;
          const triggered = extractTriggeredEvents(secBlock);
          for (const tgt of triggered) {
            addEdge(idStr, tgt, section === 'immediate' ? 'immediate' : 'after',
              null, null, extractEffects(block));
          }
        }
      }
    }
  }
  console.log(`    解析到 ${eventCount} 个事件`);

  // ===== 2. Parse anomalies =====
  console.log('  [2/6] 解析异常...');
  const anomDir = join(STELLARIS, 'common/anomalies');
  let anomCatCount = 0;
  if (existsSync(anomDir)) {
    for (const f of readdirSync(anomDir).filter(f => f.endsWith('.txt'))) {
      const fp = join(anomDir, f);
      const content = readFileSync(fp, 'utf-8');
      let root;
      try { root = parsePDSText(content); } catch { continue; }

      for (const [key, val] of Object.entries(root)) {
        if (!isBlockNode(val)) continue;
        // Skip known non-category entries
        if (key.startsWith('@')) continue;

        anomCatCount++;
        addNode(key, 'anomaly',
          `${key}_desc`, // PDS convention: category desc key
          null,
          `common/anomalies/${f}`,
          JSON.stringify(val).slice(0, 3000)
        );

        // Parse on_success → event IDs
        const onSuccess = val.on_success;
        if (onSuccess && isBlockNode(onSuccess)) {
          for (const [weight, outcome] of Object.entries(onSuccess)) {
            if (!isBlockNode(outcome)) {
              // Direct event reference: "1 = anomaly.35"
              if (typeof outcome === 'string' && outcome.includes('.')) {
                addEdge(key, outcome, 'on_success', null, null, null);
              }
              continue;
            }
            // Block outcome with modifier + event
            const evt = outcome.anomaly_event || outcome.event;
            if (evt) {
              addEdge(key, asString(evt), 'on_success', null, null, null);
            }
          }
        }
      }
    }
  }
  console.log(`    解析到 ${anomCatCount} 个异常分类`);

  // ===== 3. Parse archaeological sites =====
  console.log('  [3/6] 解析考古遗址...');
  const archDir = join(STELLARIS, 'common/archaeological_site_types');
  let archCount = 0;
  if (existsSync(archDir)) {
    for (const f of readdirSync(archDir).filter(f => f.endsWith('.txt'))) {
      const fp = join(archDir, f);
      const content = readFileSync(fp, 'utf-8');
      let root;
      try { root = parsePDSText(content); } catch { continue; }

      for (const [key, val] of Object.entries(root)) {
        if (!isBlockNode(val) || key.startsWith('@') || key === 'random') continue;
        archCount++;

        const descKey = isBlockNode(val.desc) ? asString(val.desc.text) : asString(val.desc);
        addNode(key, 'archaeology', descKey, null,
          `common/archaeological_site_types/${f}`,
          JSON.stringify(val).slice(0, 3000)
        );

        // Parse stages → events
        const stages = asArray(val.stage);
        for (let si = 0; si < stages.length; si++) {
          const stage = stages[si];
          if (!isBlockNode(stage)) continue;
          const stageEvent = stage.event;
          if (stageEvent) {
            addEdge(key, asString(stageEvent), 'stage', `stage_${si + 1}`, null, null);
            chainNodes.push({
              chain_id: key,
              node_id: normalizeId(asString(stageEvent)),
              stage_order: si + 1,
              stage_type: si === stages.length - 1 ? 'ending' : 'progress',
            });
          }
        }

        // on_visible triggers
        if (val.on_visible && isBlockNode(val.on_visible)) {
          const triggered = extractTriggeredEvents(val.on_visible);
          for (const tgt of triggered) {
            addEdge(key, tgt, 'on_visible', null, null, null);
          }
        }
      }
    }
  }
  console.log(`    解析到 ${archCount} 个考古遗址`);

  // ===== 4. Parse special projects =====
  console.log('  [4/6] 解析特殊项目...');
  const projDir = join(STELLARIS, 'common/special_projects');
  let projCount = 0;
  if (existsSync(projDir)) {
    for (const f of readdirSync(projDir).filter(f => f.endsWith('.txt'))) {
      const fp = join(projDir, f);
      const content = readFileSync(fp, 'utf-8');
      let root;
      try { root = parsePDSText(content); } catch { continue; }

      const projects = findBlocks(root, 'special_project');
      for (const proj of projects) {
        const key = asString(proj.key);
        if (!key) continue;
        projCount++;

        addNode(key, 'project', null, null,
          `common/special_projects/${f}`,
          JSON.stringify(proj).slice(0, 3000)
        );

        // on_success → events
        if (proj.on_success && isBlockNode(proj.on_success)) {
          const triggered = extractTriggeredEvents(proj.on_success);
          for (const tgt of triggered) {
            addEdge(key, tgt, 'on_success', null, null, null);
          }
        }

        // on_fail → events
        if (proj.on_fail && isBlockNode(proj.on_fail)) {
          const triggered = extractTriggeredEvents(proj.on_fail);
          for (const tgt of triggered) {
            addEdge(key, tgt, 'on_fail', null, null, null);
          }
        }
      }
    }
  }
  console.log(`    解析到 ${projCount} 个项目`);

  // ===== 5. Parse on_actions =====
  console.log('  [5/6] 解析 on_action...');
  const onActionDir = join(STELLARIS, 'common/on_actions');
  let onActionCount = 0;
  if (existsSync(onActionDir)) {
    for (const f of readdirSync(onActionDir).filter(f => f.endsWith('.txt'))) {
      const fp = join(onActionDir, f);
      const content = readFileSync(fp, 'utf-8');
      let root;
      try { root = parsePDSText(content); } catch { continue; }

      for (const [key, val] of Object.entries(root)) {
        if (!isBlockNode(val) || key.startsWith('@')) continue;
        onActionCount++;

        const nodeId = `on_action.${key}`;
        addNode(nodeId, 'on_action', key, null,
          `common/on_actions/${f}`,
          JSON.stringify(val).slice(0, 2000)
        );

        // events = { xxx yyy } → edges to events
        if (val.events && isBlockNode(val.events)) {
          for (const evtId of Object.values(val.events)) {
            if (typeof evtId === 'string') {
              addEdge(nodeId, evtId, 'on_action', null, null, null);
            }
          }
        }

        // random_events = { n = xxx n = yyy }
        if (val.random_events && isBlockNode(val.random_events)) {
          for (const evtId of Object.values(val.random_events)) {
            if (typeof evtId === 'string') {
              addEdge(nodeId, evtId, 'random_on_action', null, null, null);
            }
          }
        }
      }
    }
  }
  console.log(`    解析到 ${onActionCount} 个 on_action`);

  // ===== 6. Parse native event chains =====
  console.log('  [6/6] 解析原生事件链...');
  const chainDir = join(STELLARIS, 'common/event_chains');
  let nativeChainCount = 0;
  if (existsSync(chainDir)) {
    for (const f of readdirSync(chainDir).filter(f => f.endsWith('.txt'))) {
      const fp = join(chainDir, f);
      const content = readFileSync(fp, 'utf-8');
      let root;
      try { root = parsePDSText(content); } catch { continue; }

      for (const [key, val] of Object.entries(root)) {
        if (!isBlockNode(val) || key.startsWith('@')) continue;
        nativeChainCount++;

        const icon = asString(val.icon);
        const category = asString(val.situation_log_category) || guessChainCategory(key);

        const zhTitle = localName(loc, `${key}_title`) || localName(loc, `event_chain_${key}_title`) || key;
        chains.push({
          chain_id: key,
          name_key: `${key}_title`,
          zh_name: zhTitle,
          category,
          root_node_id: null,
          source: 'native',
        });
      }
    }
  }
  console.log(`    解析到 ${nativeChainCount} 个原生事件链`);

  // ===== 7. Build additional chains from graph connectivity =====
  console.log('  构建连通分量...');
  const prefixGroups = buildChainGroups(edges);
  for (const [prefix, eventIds] of prefixGroups) {
    if (eventIds.length < 2) continue;
    // Skip if already covered by native chains
    if (chains.some(c => c.chain_id === prefix)) continue;

    const category = guessChainCategory(prefix);
    const zhLabel = localName(loc, prefix) || prefix;

    chains.push({
      chain_id: prefix,
      name_key: prefix,
      zh_name: zhLabel,
      category,
      root_node_id: null,
      source: 'connected',
    });
  }

  // ===== Write to database =====
  console.log(`  写入: ${nodes.length} nodes, ${edges.length} edges, ${flags.length} flags, ${chains.length} chains`);

  if (isFirst) {
    db.exec('DELETE FROM game_event_nodes');
    db.exec('DELETE FROM game_event_edges');
    db.exec('DELETE FROM game_event_flags');
    db.exec('DELETE FROM game_event_chains');
    db.exec('DELETE FROM game_event_chain_nodes');
  }

  batchInsert(db, 'game_event_nodes', nodes);
  batchInsert(db, 'game_event_edges', edges);
  batchInsert(db, 'game_event_flags', flags);
  batchInsert(db, 'game_event_chains', chains);
  batchInsert(db, 'game_event_chain_nodes', chainNodes);

  console.log(`  完成: nodes=${nodes.length}, edges=${edges.length}, flags=${flags.length}, chains=${chains.length}`);
  return { nodes: nodes.length, edges: edges.length, flags: flags.length, chains: chains.length };
}

// ===== Helpers for extracting from blocks =====

/** Recursively extract country_event/planet_event/ship_event IDs from a block */
function extractTriggeredEvents(block) {
  const results = [];
  if (!isBlockNode(block)) return results;

  for (const [key, val] of Object.entries(block)) {
    // Direct event trigger: country_event = { id = xxx }
    if (['country_event','planet_event','ship_event','fleet_event','pop_event','event'].includes(key)) {
      const items = asArray(val);
      for (const item of items) {
        if (isBlockNode(item) && item.id) {
          results.push(asString(item.id));
        }
      }
    }

    // enable_special_project = { name = "XXX" }
    if (key === 'enable_special_project') {
      const items = asArray(val);
      for (const item of items) {
        if (isBlockNode(item) && item.name) {
          results.push(asString(item.name));
        }
      }
    }

    // begin_event_chain = { ... }
    if (key === 'begin_event_chain') {
      const items = asArray(val);
      for (const item of items) {
        if (typeof item === 'string') results.push(item);
      }
    }

    // Recurse into nested blocks
    if (isBlockNode(val)) {
      results.push(...extractTriggeredEvents(val));
    } else if (Array.isArray(val)) {
      for (const v of val) {
        if (isBlockNode(v)) results.push(...extractTriggeredEvents(v));
      }
    }
  }
  return results;
}

/** Extract flag set/remove operations from a block */
function extractFlagsFromBlock(block, nodeId, addFlagFn) {
  if (!isBlockNode(block)) return;

  for (const [key, val] of Object.entries(block)) {
    // set_country_flag = xxx
    if (key === 'set_country_flag') {
      const items = asArray(val);
      for (const item of items) {
        if (typeof item === 'string') addFlagFn(nodeId, item, 'set', 'country');
        else if (isBlockNode(item)) {
          addFlagFn(nodeId, asString(item.flag || item.name || item), 'set', 'country');
        }
      }
    }

    // remove_country_flag = xxx
    if (key === 'remove_country_flag') {
      const items = asArray(val);
      for (const item of items) {
        if (typeof item === 'string') addFlagFn(nodeId, item, 'remove', 'country');
      }
    }

    // set_global_flag = xxx
    if (key === 'set_global_flag') {
      const items = asArray(val);
      for (const item of items) {
        if (typeof item === 'string') addFlagFn(nodeId, item, 'set', 'global');
      }
    }

    // set_fleet_flag / set_planet_flag etc.
    if (key === 'set_fleet_flag' || key === 'set_planet_flag' || key === 'set_star_flag') {
      const scope = key.replace('set_', '').replace('_flag', '');
      const items = asArray(val);
      for (const item of items) {
        if (typeof item === 'string') addFlagFn(nodeId, item, 'set', scope);
      }
    }

    // Recurse
    if (isBlockNode(val)) extractFlagsFromBlock(val, nodeId, addFlagFn);
    else if (Array.isArray(val)) {
      for (const v of val) if (isBlockNode(v)) extractFlagsFromBlock(v, nodeId, addFlagFn);
    }
  }
}

/** Extract flag checks from trigger blocks */
function extractFlagChecks(block, nodeId, addFlagFn) {
  if (!isBlockNode(block)) return;

  for (const [key, val] of Object.entries(block)) {
    if (key === 'has_country_flag') {
      const items = asArray(val);
      for (const item of items) {
        if (typeof item === 'string') addFlagFn(nodeId, item, 'has', 'country');
      }
    }
    if (key === 'has_global_flag') {
      const items = asArray(val);
      for (const item of items) {
        if (typeof item === 'string') addFlagFn(nodeId, item, 'has', 'global');
      }
    }
    if (key === 'has_fleet_flag' || key === 'has_planet_flag') {
      const scope = key.replace('has_', '').replace('_flag', '');
      const items = asArray(val);
      for (const item of items) {
        if (typeof item === 'string') addFlagFn(nodeId, item, 'has', scope);
      }
    }
    // NOT = { has_country_flag = xxx }
    if (key === 'NOT' && isBlockNode(val)) {
      extractFlagChecks(val, nodeId, addFlagFn);
    }

    if (isBlockNode(val)) extractFlagChecks(val, nodeId, addFlagFn);
    else if (Array.isArray(val)) {
      for (const v of val) if (isBlockNode(v)) extractFlagChecks(v, nodeId, addFlagFn);
    }
  }
}

/** Build event chain groups from edges by detecting connected event ID prefixes */
function buildChainGroups(edges) {
  const groups = new Map();

  for (const edge of edges) {
    const srcId = edge.source_id;
    // Try to group by prefix (e.g., "anomaly.25" → "anomaly", "ancrel.1" → "ancrel")
    const prefix = extractIdPrefix(srcId);
    if (!prefix || prefix.length < 3) continue;

    if (!groups.has(prefix)) groups.set(prefix, new Set());
    groups.get(prefix).add(srcId);
    groups.get(prefix).add(edge.target_id);
  }

  // Filter: only keep groups with enough events
  const result = new Map();
  for (const [prefix, ids] of groups) {
    if (ids.size >= 2) result.set(prefix, [...ids]);
  }
  return result;
}

function extractIdPrefix(id) {
  if (!id) return null;
  // "anomaly.35" → "anomaly", "ancrel.1" → "ancrel", "distar.290" → "distar"
  const m = id.match(/^([a-z_]+)/i);
  return m?.[1] || null;
}

function guessChainCategory(key) {
  const lower = key.toLowerCase();
  if (/precursor|yuht|vultaum|irassian|cybrex|baol|zroni|first_league/.test(lower)) return 'precursors';
  if (/crisis|khan|unbidden|prethoryn|contingency|gray_goo/.test(lower)) return 'crisis';
  if (/war|conquer|military/.test(lower)) return 'military';
  if (/diplomacy|federation|galactic_community|galcom/.test(lower)) return 'diplomacy';
  if (/anomaly|archaeolog|exploration|survey/.test(lower)) return 'exploration';
  if (/first_contact/.test(lower)) return 'first_contact';
  if (/colony|colonization/.test(lower)) return 'colonization';
  if (/tech|research/.test(lower)) return 'technology';
  return 'story';
}

// ===== CLI mode =====
const isMain = process.argv[1]?.includes('preload-relations');
if (isMain) {
  const db = getDb();
  const oldVer = getGameVersion(db);
  console.log(`Relations: ${oldVer || '首次'}`);

  // Scan all relevant directories for changed files
  const dirs = [
    'events', 'common/anomalies', 'common/archaeological_site_types',
    'common/special_projects', 'common/on_actions', 'common/event_chains',
    'localisation/simp_chinese',
  ];

  let allChanged = [];
  let allFirst = true;
  for (const dir of dirs) {
    const fullPath = join(STELLARIS, dir);
    if (!existsSync(fullPath)) { console.log(`  ${dir}: 目录不存在,跳过`); continue; }
    const files = readdirSync(fullPath).filter(f => f.endsWith('.txt') || f.endsWith('.yml'))
      .map(f => {
        const fp = join(fullPath, f);
        return { absPath: fp, relPath: `${dir}/${f}`, hash: fileHash(fp) };
      });
    const { changed, isFirst } = detectChanges(db, dir, files);
    if (changed.length > 0) allChanged.push(...changed);
    if (!isFirst) allFirst = false;
  }

  if (allChanged.length === 0 && !allFirst) {
    console.log('  所有文件未变化,跳过');
    closeDb();
    process.exit(0);
  }

  const result = syncRelations(db, { changed: allChanged, isFirst: allFirst });

  // Update file hashes
  for (const dir of dirs) {
    const fullPath = join(STELLARIS, dir);
    if (!existsSync(fullPath)) continue;
    const files = readdirSync(fullPath).filter(f => f.endsWith('.txt') || f.endsWith('.yml'))
      .map(f => {
        const fp = join(fullPath, f);
        return { absPath: fp, relPath: `${dir}/${f}`, hash: fileHash(fp) };
      });
    updateFileHashes(db, dir, files, {});
  }

  setGameVersion(db, JSON.parse(readFileSync(join(STELLARIS, 'launcher-settings.json'), 'utf-8')).rawVersion);
  closeDb();
}
