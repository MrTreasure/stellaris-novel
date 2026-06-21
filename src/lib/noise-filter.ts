// Whitelist-based noise filter: uses the game's own event graph data (game_event_flags)
// to determine which flags are real game events vs. system/AI noise.
// A flag is valid if it appears as a flag operation in any known event node.

import type { DatabaseSync } from 'node:sqlite';

let _knownFlags: Set<string> | null = null;

/** Load known flag names from the event graph (game_event_flags table) */
export function loadKnownFlags(db: DatabaseSync): Set<string> {
  if (_knownFlags) return _knownFlags;
  _knownFlags = new Set<string>();
  try {
    const rows = db.prepare('SELECT DISTINCT flag_name FROM game_event_flags').all() as { flag_name: string }[];
    for (const r of rows) _knownFlags.add(r.flag_name.toLowerCase());
  } catch { /* table might not exist yet */ }
  return _knownFlags;
}

function getKnownFlags(db?: DatabaseSync): Set<string> | null {
  if (_knownFlags) return _knownFlags;
  if (db) return loadKnownFlags(db);
  return null;
}

/** Check if a flag name is noise (NOT a known game event flag) */
export function isNoiseFlag(name: string, db?: DatabaseSync): boolean {
  if (!name) return true;
  const known = getKnownFlags(db);
  if (known && known.size > 0) {
    // Whitelist: flag is NOT noise if it appears in the event graph
    const key = name.toLowerCase();
    if (known.has(key)) return false;
    // Also try stripping trailing numbers: "first_contact_completed30" → "first_contact_completed"
    const stripped = key.replace(/\d+$/, '');
    if (stripped !== key && known.has(stripped)) return false;
    // Strip trailing empire IDs: "establish_embassy_with_16777219" → "establish_embassy_with"
    const stripped2 = key.replace(/_\d{5,}$/, '');
    if (stripped2 !== key && known.has(stripped2)) return false;
    return true; // Not in whitelist → noise
  }
  // Fallback: if event graph isn't loaded, use structural heuristics only
  return isStructuralNoise(name);
}

/** Quick structural check for obviously non-event keys */
function isStructuralNoise(name: string): boolean {
  // Single-word structural keys
  if (['owner','target','pop_group','enclave','guardian','leader','upgrade','parent',
       'design','station','deposit','heir','ruler','governor','megastructure','value',
       'habitat','ship_design','fleet_template','auto_move_target','build_queue','army_build_queue'].includes(name)) return true;
  // Planet/habitat ID patterns
  if (/^habitat\d+$/.test(name)) return true;
  // Starting/init markers
  if (name.startsWith('starting_')) return true;
  // Species tracking
  if (name.startsWith('mechanical_species')) return true;
  return false;
}
