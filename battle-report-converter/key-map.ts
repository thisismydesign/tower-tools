// Maps the game's report vocabularies onto one set of column names, so runs
// from any format land in the same CSV column.
//
// The format has changed more than once, and not all at once: one variant
// keeps the old section headers with newer key casing. Nothing here keys off
// dates — a report is interpreted purely from its own section and key names,
// so old exports and future ones both work.
//
// Older reports used self-describing keys ("Thorn damage"); newer ones repeat
// a bare key under several section headers ("Thorns" is both damage dealt and
// enemies hit), so a key only means something together with its section. The
// older names win, matching `expected format.csv`.
//
// Every variant is listed explicitly, including ones that differ only by
// casing. When the game renames a key again, add the `Section/Key` here and
// point it at the existing column.

/** Section headers that mean the same thing under a different spelling. */
export const SECTION_ALIASES: Record<string, string> = {
  // Seen in one export where a stray character was prepended.
  'EBattle Report': 'Battle Report',
}

/**
 * `Section/Key` in the new format -> canonical old column name.
 * Only entries that need translating; anything absent passes through.
 */
export const KEY_MAP: Record<string, string> = {
  // --- Battle Report ---------------------------------------------------
  'Battle Report/Coins Earned': 'Coins earned',
  'Battle Report/Coins Per Hour': 'Coins per hour',

  // --- Combat: a variant kept the old sections but recased the keys -----
  'Combat/Damage Dealt': 'Damage dealt',
  'Combat/Tagged by Death Wave': 'Tagged by Deathwave',

  // --- Damage: new drops the "Damage" suffix ---------------------------
  'Damage/Damage Dealt': 'Damage dealt',
  'Damage/Projectiles': 'Projectiles Damage',
  'Damage/Rend Armor': 'Rend Armor Damage',
  'Damage/Death Ray': 'Death Ray Damage',
  'Damage/Thorns': 'Thorn damage',
  'Damage/Orbs': 'Orb Damage',
  'Damage/Land Mines': 'Land Mine Damage',
  'Damage/Chain Lightning': 'Chain Lightning Damage',
  'Damage/Smart Missiles': 'Smart Missile Damage',
  'Damage/Inner Land Mines': 'Inner Land Mine Damage',
  'Damage/Poison Swamp': 'Swamp Damage',
  'Damage/Death Wave': 'Death Wave Damage',
  'Damage/Black Hole': 'Black Hole Damage',
  'Damage/Flame Bot': 'Flame Bot Damage',
  'Damage/Electrons': 'Electrons Damage',
  'Damage/Attack Chip': 'Attack Chip Damage',

  // --- Damage Taken: split into Tower and Wall -------------------------
  'Damage Taken/Tower': 'Damage Taken',
  'Damage Taken/Wall': 'Damage Taken Wall',

  // --- Health ----------------------------------------------------------
  'Bonus Health Gained/From Death Wave': 'HP From Death Wave',
  // Distinct from Utility/Recovery Packages, which is a count.
  'Health Regenerated/Recovery Packages': 'Health From Recovery Packages',

  // --- Enemies Hit By --------------------------------------------------
  'Enemies Hit By/Orbs': 'Enemies Hit by Orbs',
  'Enemies Hit By/Death Wave': 'Tagged by Deathwave',

  // --- Kills -----------------------------------------------------------
  'Enemies Destroyed By/Orbs': 'Destroyed By Orbs',
  'Enemies Destroyed By/Death Ray': 'Destroyed by Death Ray',
  'Enemies Destroyed By/Land Mines': 'Destroyed by Land Mine',
  'Enemies Destroyed By/Thorns': 'Destroyed by Thorns',
  'Killed With Effect Active/Spotlight': 'Destroyed in Spotlight',
  'Killed With Effect Active/Golden Bot': 'Destroyed in Golden Bot',

  // --- Enemies ---------------------------------------------------------
  'Total Enemies/Summoned Enemies': 'Summoned enemies',

  // --- Coins: old spelled out the source -------------------------------
  'Coins/Coins Earned': 'Coins earned',
  'Coins/Black Hole': 'Coins From Black Hole',
  'Coins/Death Wave': 'Coins From Death Wave',
  'Coins/Golden Tower': 'Coins From Golden Tower',
  'Coins/Orbs': 'Coins From Orb',
  'Coins/Spotlight': 'Coins From Spotlight',
  'Coins/Coin Bonus Upgrade': 'Coins from Coin Upgrade',
  'Coins/Coins From Coin Bonuses': 'Coins from Coin Bonuses',
  'Coins/Golden Bot': 'Golden Bot Coins Earned',
  // Already a coin total; the section rule would make it "Coins From Coins
  // Fetched" and split it from the older column.
  'Coins/Coins Fetched': 'Coins Fetched',

  // --- Cash ------------------------------------------------------------
  'Cash/Cash Earned': 'Cash earned',
  'Cash/Golden Tower': 'Cash From Golden Tower',
  // As above: "Cash From Interest earned" would split it from "Interest earned".
  'Cash/Interest earned': 'Interest earned',
}

/**
 * For sections whose remaining keys are bare and would collide across
 * sections, qualify them with a prefix or suffix.
 */
export const SECTION_RULES: Record<string, (key: string) => string> = {
  Damage: (key) => `${key} Damage`,
  'Damage Blocked': (key) => `Damage Blocked ${key}`,
  'Enemies Hit By': (key) => `Enemies Hit by ${key}`,
  'Enemies Destroyed By': (key) => `Destroyed by ${key}`,
  'Killed With Effect Active': (key) => `Destroyed in ${key}`,
  Coins: (key) => `Coins From ${key}`,
  Cash: (key) => `Cash From ${key}`,
}

/** Sections whose keys are already unambiguous and pass through untouched. */
const PASS_THROUGH_SECTIONS = new Set([
  'Battle Report',
  'Records',
  'Counts',
  'Utility',
  'Health Regenerated',
  'Total Enemies',
  'Currencies',
  // Old-format sections are already canonical.
  'Combat',
  'Enemies Destroyed',
  'Bots',
  'Guardian',
  'Killed By',
  '',
])

/** The column a `section` + `key` pair belongs in. */
export function canonicalKey(section: string, key: string): string {
  const resolved = SECTION_ALIASES[section] ?? section

  const mapped = KEY_MAP[`${resolved}/${key}`]
  if (mapped) return mapped

  if (PASS_THROUGH_SECTIONS.has(resolved)) return key

  const rule = SECTION_RULES[resolved]
  return rule ? rule(key) : key
}
