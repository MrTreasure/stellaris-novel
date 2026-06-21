import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { resolveChronicleEvent } from '../src/lib/chronicle-resolver.ts';

const db = new DatabaseSync('data/stellaris.db', { readOnly: true });

const initialization = resolveChronicleEvent(db, 'game_started', { playerOwned: false });
assert.equal(initialization.relevance, 'exclude', 'game_started should be excluded as initialization');

const tutorial = resolveChronicleEvent(db, 'tutorial_level_picked', { playerOwned: true });
assert.equal(tutorial.relevance, 'exclude', 'tutorial state should be excluded');

const playerStory = resolveChronicleEvent(db, 'yuht_homeworld_found', { playerOwned: true });
assert.equal(playerStory.relevance, 'include', 'player-owned story flag should be included');
assert.notEqual(playerStory.title, '未识别的游戏事件', 'known story flag should use SQLite localisation');
assert.ok(playerStory.description.length > 40, 'known story flag should include detailed SQLite narrative text');

const unrelatedStory = resolveChronicleEvent(db, 'yuht_homeworld_found', { playerOwned: false });
assert.equal(unrelatedStory.relevance, 'include', 'balanced mode should retain a visible country story when ownership metadata is unavailable');

const ambiguousStart = resolveChronicleEvent(db, 'starting_event', { playerOwned: false });
assert.notEqual(ambiguousStart.relevance, 'exclude', 'balanced mode must not discard potentially player-facing origin events');

const unrelatedGlobal = resolveChronicleEvent(db, 'astral_rift_with_relic_r_celestial_tear_being_explored', { playerOwned: false });
assert.equal(unrelatedGlobal.relevance, 'context', 'unowned global state should remain context only');

const stateOnly = resolveChronicleEvent(db, 'mining_station_built', { playerOwned: true });
assert.ok(stateOnly.description.length > 10, 'state-only events should include a graph-derived structured description');

console.log('Chronicle relevance filter: OK');
