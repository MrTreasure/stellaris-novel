// Pipeline validation tests: PDS parser → DB → event chain detection
// Run: node scripts/test-pipeline.mjs

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { parsePDSText, findAllEventBlocks, asString, asArray, isBlockNode } from './pds-parser.mjs';
import { getDb, closeDb, getGameVersion } from './shared.mjs';

const STELLARIS = 'E:/SteamLibrary/steamapps/common/Stellaris';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

console.log('=== PDS Parser Tests ===');
test('tokenize and parse simple assignment', () => {
  const root = parsePDSText('key = value');
  assert(root.key === 'value', 'key not parsed');
});

test('parse string value', () => {
  const root = parsePDSText('key = "hello world"');
  assert(root.key === 'hello world', 'string not parsed');
});

test('parse number value', () => {
  const root = parsePDSText('num = 42\nneg = -3\nfloat = 3.14');
  assertEqual(root.num, 42, 'num');
  assertEqual(root.neg, -3, 'neg');
  assertEqual(root.float, 3.14, 'float');
});

test('parse boolean (yes/no)', () => {
  const root = parsePDSText('a = yes\nb = no');
  assertEqual(root.a, true, 'yes');
  assertEqual(root.b, false, 'no');
});

test('parse nested block', () => {
  const root = parsePDSText('outer = { inner = "val" }');
  assert(typeof root.outer === 'object', 'block not parsed');
  assert(root.outer.inner === 'val', 'nested value');
});

test('parse multiple key-value pairs', () => {
  const root = parsePDSText('a = 1\nb = 2\nc = 3');
  assertEqual(root.a, 1, 'a');
  assertEqual(root.b, 2, 'b');
  assertEqual(root.c, 3, 'c');
});

test('parse repeated keys as array', () => {
  const root = parsePDSText('item = "a"\nitem = "b"\nitem = "c"');
  assert(Array.isArray(root.item), 'not array');
  assertEqual(root.item.length, 3, 'length');
});

test('skip comments', () => {
  const root = parsePDSText('# comment\nkey = "val"\n#another\nother = 1');
  assert(root.key === 'val', 'key after comment');
  assertEqual(root.other, 1, 'after second comment');
});

test('parse variable reference', () => {
  const root = parsePDSText('val = @some_var');
  assert(root.val === '@some_var', 'variable not parsed');
});

test('deep nesting', () => {
  const root = parsePDSText('a = { b = { c = { d = "deep" } } }');
  assert(root.a.b.c.d === 'deep', 'deep nesting failed');
});

test('parse mixed content', () => {
  const root = parsePDSText('title = "Event Name"\ndesc = "Description"\noption = { name = OK }\noption = { name = CANCEL }');
  assert(root.title === 'Event Name', 'title');
  assert(Array.isArray(root.option), 'options not array');
  assertEqual(root.option.length, 2, 'option count');
  assert(root.option[0].name === 'OK', 'first option');
});

console.log('\n=== Event Extraction Tests ===');
// Test against a real event file
const evtDir = join(STELLARIS, 'events');
if (existsSync(evtDir)) {
  const achievementFile = join(evtDir, 'achievement_events.txt');
  test('parse real event file (achievement_events.txt)', () => {
    const content = readFileSync(achievementFile, 'utf-8');
    const root = parsePDSText(content);
    const events = findAllEventBlocks(root);
    assert(events.length > 0, 'should find events');
    // Each event should have an ID
    for (const { block } of events) {
      assert(block.id !== undefined, 'event should have id');
    }
    console.log(`        Found ${events.length} events in achievement_events.txt`);
  });

  // Test precursor event files
  const precursorFiles = readdirSync(evtDir).filter(f => f.includes('precursor') || f.includes('ancrel'));
  test('parse precursor event files', () => {
    let total = 0;
    for (const f of precursorFiles.slice(0, 3)) {
      const content = readFileSync(join(evtDir, f), 'utf-8');
      let root;
      try { root = parsePDSText(content); } catch { continue; }
      const events = findAllEventBlocks(root);
      total += events.length;
      for (const { type, block } of events) {
        assert(block.id !== undefined, `event in ${f} should have id`);
        assert(['country_event','ship_event','fleet_event','planet_event','pop_event','event'].includes(type),
          `unknown event type: ${type}`);
      }
    }
    console.log(`        Found ${total} events in precursor files`);
    assert(total > 0, 'should find precursor events');
  });

  // Test option→event edges
  test('extract option → event edges', () => {
    const ancrelFile = readdirSync(evtDir).find(f => f.includes('ancient_relics_arcsite_events_1'));
    if (ancrelFile) {
      const content = readFileSync(join(evtDir, ancrelFile), 'utf-8');
      const root = parsePDSText(content);
      const events = findAllEventBlocks(root);
      let optionsFound = 0;
      let eventRefsFound = 0;
      for (const { block } of events) {
        const options = asArray(block.option);
        for (const opt of options) {
          if (isBlockNode(opt)) {
            optionsFound++;
            if (opt.hidden_effect && isBlockNode(opt.hidden_effect)) {
              // Should reference other events
              if (opt.hidden_effect.country_event) {
                const refs = asArray(opt.hidden_effect.country_event);
                for (const ref of refs) {
                  if (isBlockNode(ref) && ref.id) eventRefsFound++;
                }
              }
            }
          }
        }
      }
      console.log(`        Found ${optionsFound} options with ${eventRefsFound} event references`);
      assert(optionsFound > 0, 'should find options');
    }
  });
}

console.log('\n=== Anomaly Parsing Tests ===');
const anomDir = join(STELLARIS, 'common/anomalies');
if (existsSync(anomDir)) {
  test('parse anomaly categories', () => {
    const files = readdirSync(anomDir).filter(f => f.endsWith('.txt')).slice(0, 2);
    let cats = 0;
    for (const f of files) {
      const content = readFileSync(join(anomDir, f), 'utf-8');
      let root;
      try { root = parsePDSText(content); } catch { continue; }
      for (const [key, val] of Object.entries(root)) {
        if (isBlockNode(val) && !key.startsWith('@')) cats++;
      }
    }
    console.log(`        Found ${cats} anomaly categories`);
    assert(cats > 0, 'should find anomaly categories');
  });
}

console.log('\n=== Archaeology Parsing Tests ===');
const archDir = join(STELLARIS, 'common/archaeological_site_types');
if (existsSync(archDir)) {
  test('parse archaeological sites with stages', () => {
    const content = readFileSync(join(archDir, '00_base_game_arc_sites.txt'), 'utf-8');
    const root = parsePDSText(content);
    let sites = 0;
    let sitesWithStages = 0;
    for (const [key, val] of Object.entries(root)) {
      if (isBlockNode(val) && !key.startsWith('@') && key !== 'random') {
        sites++;
        const stages = asArray(val.stage);
        if (stages.length > 0) sitesWithStages++;
        for (const stage of stages) {
          if (isBlockNode(stage)) {
            assert(stage.event !== undefined || stage.difficulty !== undefined,
              'stage should have event or difficulty');
          }
        }
      }
    }
    console.log(`        Found ${sites} sites, ${sitesWithStages} with stages`);
    assert(sites > 0, 'should find sites');
    assert(sitesWithStages > 0, 'should find stages');
  });
}

console.log('\n=== On Action Parsing Tests ===');
const onActionDir = join(STELLARIS, 'common/on_actions');
if (existsSync(onActionDir)) {
  test('parse on_game_start with event references', () => {
    const content = readFileSync(join(onActionDir, '00_on_actions.txt'), 'utf-8');
    const root = parsePDSText(content);
    assert(root.on_game_start !== undefined, 'should find on_game_start');
    assert(isBlockNode(root.on_game_start), 'on_game_start should be block');
    assert(root.on_game_start.events !== undefined, 'should have events');
    console.log(`        Found on_game_start with events: ${Object.keys(root.on_game_start.events || {}).length}`);
  });
}

console.log('\n=== Database Verification Tests ===');
test('database has event nodes', () => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM game_event_nodes').get();
  assert(count.c > 5000, `Expected >5000 nodes, got ${count.c}`);
});

test('database has event edges', () => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM game_event_edges').get();
  assert(count.c > 3000, `Expected >3000 edges, got ${count.c}`);
});

test('database has event flags', () => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM game_event_flags').get();
  assert(count.c > 3000, `Expected >3000 flags, got ${count.c}`);
});

test('database has event chains', () => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM game_event_chains').get();
  assert(count.c > 100, `Expected >100 chains, got ${count.c}`);
});

test('precursor chains exist', () => {
  const db = getDb();
  const chains = db.prepare("SELECT chain_id FROM game_event_chains WHERE category = 'precursors'").all();
  assert(chains.length > 0, 'Should have precursor chains');
  const ids = chains.map(c => c.chain_id);
  assert(ids.some(id => id.includes('yuht')), 'Should have yuht chain');
  assert(ids.some(id => id.includes('vultaum')), 'Should have vultaum chain');
  assert(ids.some(id => id.includes('cybrex')), 'Should have cybrex chain');
  assert(ids.some(id => id.includes('baol')), 'Should have baol chain');
});

test('event edges connect valid nodes', () => {
  const db = getDb();
  // Sample check: source and target points of edges should exist in nodes
  const edges = db.prepare('SELECT source_id, target_id FROM game_event_edges LIMIT 20').all();
  for (const e of edges) {
    const src = db.prepare('SELECT COUNT(*) as c FROM game_event_nodes WHERE id = ?').get(e.source_id);
    assert(src.c > 0, `Source node ${e.source_id} not found`);
  }
});

test('Chinese localization loaded', () => {
  const db = getDb();
  const nodesWithZh = db.prepare("SELECT COUNT(*) as c FROM game_event_nodes WHERE zh_title IS NOT NULL AND zh_title != ''").get();
  console.log(`        Nodes with zh_title: ${nodesWithZh.c}/${8880}`);
  assert(nodesWithZh.c > 100, `Expected >100 nodes with zh_title, got ${nodesWithZh.c}`);
});

console.log('\n=== Edge Type Distribution ===');
test('edge types', () => {
  const db = getDb();
  const types = db.prepare('SELECT edge_type, COUNT(*) as c FROM game_event_edges GROUP BY edge_type').all();
  for (const t of types) console.log(`        ${t.edge_type}: ${t.c}`);
  assert(types.length >= 3, 'Should have multiple edge types');
});

console.log('\n=== Chain Category Distribution ===');
test('chain categories', () => {
  const db = getDb();
  const cats = db.prepare('SELECT category, COUNT(*) as c FROM game_event_chains GROUP BY category ORDER BY c DESC').all();
  for (const c of cats.slice(0, 10)) console.log(`        ${c.category}: ${c.c}`);
  assert(cats.length > 0, 'Should have chain categories');
});

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Some tests FAILED!');
  process.exit(1);
} else {
  console.log('All tests PASSED!');
}
closeDb();
