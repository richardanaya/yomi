/**
 * Player actions & combat resolution.
 * Samurai terms (display): Nadegiri, Tsuki (katana), Keri, Nage (wakizashi), Hishō, Ki.
 */

import { Hex, HEX_DIRS } from "./hex.js";
import { isLandTile, TILE } from "./map.js";

export function createPlayer() {
  return {
    hex: new Hex(0, 0),
    hp: 3,
    maxHp: 3,
    energy: 100,
    maxEnergy: 100,
    bashCooldown: 0,
    bashCooldownMax: 4,
    bashPower: 1,
    leapRange: 2,
    throwRange: 2,
    hasYari: true,
    yariHex: null,
    blessings: new Set(),
    killStreak: 0, // consecutive turns with a kill
    regenUsedThisFloor: false,
    hasMagatama: false,
    kills: 0,
  };
}

export function enemyAt(state, hex) {
  if (!hex) return null;
  return state.enemies.find((e) => e.alive && e.hex.equals(hex)) || null;
}

export function bombAt(state, hex) {
  if (!hex) return null;
  return state.bombs.find((b) => b.hex.equals(hex)) || null;
}

export function isBlocked(state, hex, { ignoreYari = false, ignoreAltar = false } = {}) {
  if (!isLandTile(hex, state.tiles)) return true;
  if (enemyAt(state, hex)) return true;
  if (bombAt(state, hex)) return true;
  if (!ignoreAltar && state.shrine && hex.equals(state.shrine) && !state.prayed) return true;
  if (!ignoreYari && state.player.yariHex && hex.equals(state.player.yariHex)) {
    // yari tile is walkable (pick up)
  }
  return false;
}

/** Walkable for player (can step on yari, exit, magatama; not enemies/bombs/active shrine) */
export function canPlayerStep(state, hex) {
  if (!isLandTile(hex, state.tiles)) return false;
  if (enemyAt(state, hex)) return false;
  if (bombAt(state, hex)) return false;
  if (state.shrine && hex.equals(state.shrine) && !state.prayed) return false;
  // Can't exit without wakizashi reclaimed
  if (hex.equals(state.exit) && !state.player.hasYari) return false;
  // Depth 16: portal requires magatama
  if (state.depth === 16 && hex.equals(state.exit) && !state.player.hasMagatama) return false;
  return true;
}

/**
 * Nadegiri (撫斬): yokai adjacent to BOTH start and end positions die.
 */
export function resolveSlash(state, from, to) {
  const killed = [];
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (from.distance(e.hex) === 1 && to.distance(e.hex) === 1) {
      e.alive = false;
      killed.push(e);
    }
  }
  return killed;
}

/**
 * Tsuki (突): katana thrust along a straight advance.
 * Katana stays in hand even if wakizashi is thrown.
 * Never by stepping onto a yokai — needs space between (distance ≥ 2).
 * With Deep Tsuki (deepLunge), the line can pierce through the first body.
 */
export function resolveThrust(state, from, to) {
  const killed = [];
  return thrustToward(state, from, to, killed);
}

function thrustToward(state, from, to, killed) {
  const moveDist = from.distance(to);
  if (moveDist === 0) return killed;

  // Must be a pure hex-axis advance
  const dir = from.directionTo(to);
  if (dir === null) return killed;

  // Yokai on the open path between from and to (not the landing stone).
  // Only count if there was space at the start (distance ≥ 2) — never a bump into adjacent.
  const path = from.lineTo(to);
  for (const h of path) {
    if (h.equals(to)) continue;
    const e = enemyAt(state, h);
    if (!e) continue;
    if (from.distance(e.hex) < 2) continue;
    e.alive = false;
    killed.push(e);
    if (!state.player.blessings.has("deepLunge")) break;
  }

  // Yokai one step beyond the landing stone, same line — the classic "gap then thrust"
  // from ··· empty landing ··· yokai  (from.distance(yokai) >= 2)
  const ahead = to.neighbor(dir);
  const e = enemyAt(state, ahead);
  if (e && from.distance(e.hex) >= 2 && from.directionTo(e.hex) === dir) {
    e.alive = false;
    killed.push(e);
    if (state.player.blessings.has("deepLunge")) {
      const beyond = ahead.neighbor(dir);
      const e2 = enemyAt(state, beyond);
      if (e2) {
        e2.alive = false;
        killed.push(e2);
      }
    }
  }

  return killed;
}

/**
 * Landing tiles: empty land only — never walk/leap onto a yokai.
 */
export function canPlayerMoveTo(state, hex, { isLeap = false } = {}) {
  if (!isLandTile(hex, state.tiles)) return false;
  if (enemyAt(state, hex)) return false;
  if (bombAt(state, hex)) return false;
  if (state.shrine && hex.equals(state.shrine) && !state.prayed) return false;
  if (hex.equals(state.exit) && !state.player.hasYari) return false;
  if (state.depth === 16 && hex.equals(state.exit) && !state.player.hasMagatama) return false;
  return true;
}

export function getWalkTargets(state) {
  const p = state.player.hex;
  const targets = [];
  for (const dir of HEX_DIRS) {
    const n = p.add(dir);
    if (canPlayerMoveTo(state, n)) targets.push(n);
  }
  return targets;
}

export function getLeapTargets(state) {
  const p = state.player;
  if (p.energy < 50) return [];
  const range = p.leapRange;
  const targets = [];
  // Leap to distance 2..range (not 1 — that's walk)
  for (let d = 2; d <= range; d++) {
    for (const h of p.hex.ring(d)) {
      if (canPlayerMoveTo(state, h, { isLeap: true })) targets.push(h);
    }
  }
  return targets;
}

/**
 * True when the player has no Ayumi/Hishō landing and cannot clear a
 * neighboring body with Keri or Nage — softlock / cornered to death.
 */
export function isPlayerTrapped(state) {
  if (getWalkTargets(state).length > 0) return false;
  if (getLeapTargets(state).length > 0) return false;

  const p = state.player;
  for (const dir of HEX_DIRS) {
    const n = p.hex.add(dir);
    const e = enemyAt(state, n);
    if (!e) continue;
    // Would that stone be a step if the body were gone?
    if (!isLandTile(n, state.tiles)) continue;
    if (bombAt(state, n)) continue;
    if (state.shrine && n.equals(state.shrine) && !state.prayed) continue;
    if (n.equals(state.exit) && !p.hasYari) continue;
    if (state.depth === 16 && n.equals(state.exit) && !p.hasMagatama) continue;

    if (p.bashCooldown === 0) return false; // Keri can drive them off
    if (p.hasYari && p.hex.distance(n) <= p.throwRange) return false; // Nage
  }
  return true;
}

export function getBashTargets(state) {
  if (state.player.bashCooldown > 0) return [];
  const p = state.player.hex;
  if (state.player.blessings.has("spinningBash")) {
    return HEX_DIRS.map((d) => p.add(d)).filter((h) => state.tiles.has(h.key()));
  }
  // Default: any adjacent tile (click which direction to bash)
  return HEX_DIRS.map((d) => p.add(d)).filter((h) => state.tiles.has(h.key()));
}

export function getThrowTargets(state) {
  if (!state.player.hasYari) return [];
  const origin = state.player.hex;
  const range = state.player.throwRange;
  const targets = [];
  for (let d = 1; d <= range; d++) {
    for (const h of origin.ring(d)) {
      if (!state.tiles.has(h.key())) continue;
      if (!isLandTile(h, state.tiles) && !enemyAt(state, h)) continue;
      targets.push(h);
    }
  }
  return targets;
}

export function applyKills(state, killed) {
  if (!killed.length) {
    state.player.killStreak = 0;
    return;
  }
  state.player.killStreak += 1;
  state.player.kills += killed.length;

  for (const e of killed) {
    // Energy from killing adjacent-ish is handled in move; bloodlust:
    if (state.player.blessings.has("bloodlust")) {
      state.player.energy = Math.min(state.player.maxEnergy, state.player.energy + 6);
    }
  }

  // Surge / Regeneration on 3 consecutive kill-turns
  if (state.player.killStreak >= 3) {
    if (state.player.blessings.has("surge")) {
      state.player.energy = Math.min(state.player.maxEnergy, state.player.energy + 100);
      state.player.bashCooldown = 0;
      // Recall yari
      if (!state.player.hasYari) {
        state.player.hasYari = true;
        state.player.yariHex = null;
      }
    }
    if (state.player.blessings.has("regeneration") && !state.player.regenUsedThisFloor) {
      if (state.player.hp < state.player.maxHp) {
        state.player.hp += 1;
        state.player.regenUsedThisFloor = true;
      }
    }
    state.player.killStreak = 0;
  }
}

/**
 * Restore 10 spirit when ending adjacent to a yokai (after move).
 */
export function spiritFromProximity(state) {
  const p = state.player.hex;
  for (const e of state.enemies) {
    if (e.alive && p.distance(e.hex) === 1) {
      state.player.energy = Math.min(state.player.maxEnergy, state.player.energy + 10);
      return;
    }
  }
}

export function performMove(state, to, { leap = false } = {}) {
  const from = state.player.hex;
  const msgs = [];
  let killed = [];

  if (leap) {
    state.player.energy -= 50;
  }

  // Slash first (based on from→to adjacency)
  killed.push(...resolveSlash(state, from, to));

  // Thrust
  killed.push(...resolveThrust(state, from, to));

  // Deduplicate
  killed = [...new Set(killed)];

  // Move player
  state.player.hex = to;

  // Pick up yari
  if (state.player.yariHex && to.equals(state.player.yariHex)) {
    state.player.hasYari = true;
    state.player.yariHex = null;
    msgs.push("The wakizashi returns to the hand.");
  }

  // Pick up magatama
  if (state.magatama && to.equals(state.magatama)) {
    state.player.hasMagatama = true;
    state.magatama = null;
    msgs.push("The Magatama answers your touch.");
  }

  // Staggering leap
  if (leap && state.player.blessings.has("staggeringLeap")) {
    for (let dir = 0; dir < 6; dir++) {
      const e = enemyAt(state, to.neighbor(dir));
      if (e) e.stunned = 1;
    }
  }

  applyKills(state, killed);
  if (killed.length) {
    const names = killed.map((e) => enemyName(e.type)).join(", ");
    msgs.push(leap ? `Hishō ends ${names}.` : `The path claims ${names}.`);
  }
  spiritFromProximity(state);

  return { killed, msgs, from, to, leap };
}

export function performBash(state, targetHex) {
  const msgs = [];
  const p = state.player.hex;
  if (state.player.bashCooldown > 0) return { msgs, killed: [] };

  let tiles = [];
  if (state.player.blessings.has("spinningBash")) {
    for (let i = 0; i < 6; i++) tiles.push(p.neighbor(i));
  } else if (state.player.blessings.has("sweepingBash")) {
    const dir = p.directionTo(targetHex) ?? approxDir(p, targetHex);
    tiles = [p.neighbor(dir), p.neighbor((dir + 5) % 6), p.neighbor((dir + 1) % 6)];
  } else {
    tiles = [targetHex];
  }

  const killed = [];
  const power = state.player.bashPower;
  let hitCount = 0;
  let pushedCount = 0;

  for (const tile of tiles) {
    if (!state.tiles.has(tile.key())) continue;
    // Prefer kicking whatever stands on this stone (exact hex match)
    const dir = p.directionTo(tile);
    if (dir === null && p.distance(tile) !== 1) continue;
    const pushDir = dir !== null ? dir : approxDir(p, tile);

    const outcome = bashEntity(state, tile, pushDir, power, killed);
    if (outcome.hit) hitCount += 1;
    if (outcome.moved) pushedCount += 1;
  }

  state.player.bashCooldown = state.player.bashCooldownMax;
  applyKills(state, killed);
  if (killed.length) {
    msgs.push(`Black water takes ${killed.map((e) => enemyName(e.type)).join(", ")}.`);
  } else if (pushedCount > 0) {
    msgs.push("Keri — they stumble back.");
  } else if (hitCount > 0) {
    msgs.push("Keri lands, but they hold their ground.");
  } else {
    msgs.push("Keri finds only air.");
  }
  return { msgs, killed };
}

function approxDir(from, to) {
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < 6; i++) {
    const n = from.neighbor(i);
    const score = -n.distance(to);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Knock entity on `tile` along `dir` for `power` steps.
 * Successful hits stagger yokai so they skip their following turn
 * (otherwise they immediately walk back and kick looks broken).
 */
function bashEntity(state, tile, dir, power, killed) {
  const e = enemyAt(state, tile);
  const b = bombAt(state, tile);
  if (!e && !b) return { hit: false, moved: false };

  let current = e ? e.hex : b.hex;
  let moved = false;
  const startKey = current.key();

  for (let step = 0; step < power; step++) {
    const dest = current.neighbor(dir);
    const t = state.tiles.get(dest.key());

    // Off the map → crush
    if (!t) {
      if (e && e.alive) {
        e.alive = false;
        killed.push(e);
      }
      if (b) state.bombs = state.bombs.filter((x) => x !== b);
      return { hit: true, moved: true };
    }

    // Shrine blocks further push
    if (state.shrine && dest.equals(state.shrine) && !state.prayed) {
      break;
    }

    // Abyss → fall
    if (t.type === TILE.ABYSS) {
      if (e && e.alive) {
        e.alive = false;
        killed.push(e);
      }
      if (b) state.bombs = state.bombs.filter((x) => x !== b);
      return { hit: true, moved: true };
    }

    // Can't occupy the player
    if (state.player.hex.equals(dest)) break;

    // Other bomb in the way (not the one we're pushing)
    const bombBlock = bombAt(state, dest);
    if (bombBlock && bombBlock !== b) break;

    // Another yokai in the way
    const blocker = enemyAt(state, dest);
    if (blocker && blocker !== e) {
      const pushed = pushAside(state, blocker, dir, killed);
      if (!pushed) {
        blocker.alive = false;
        killed.push(blocker);
      }
    }

    // Occupy dest
    if (e && e.alive) {
      e.hex = dest;
      moved = true;
    }
    if (b) {
      b.hex = dest;
      moved = true;
    }
    current = dest;
  }

  // Fully blocked forward: try a lateral shove so the kick still does something
  if (!moved && e && e.alive) {
    moved = pushAside(state, e, dir, killed);
  }

  // Stagger living targets that were hit (moved or held) so they don't walk back same turn
  if (e && e.alive) {
    e.stunned = Math.max(e.stunned || 0, 1);
  }

  return { hit: true, moved: moved || startKey !== (e && e.alive ? e.hex.key() : startKey) };
}

function pushAside(state, enemy, incomingDir, killed) {
  const order = [
    incomingDir,
    (incomingDir + 1) % 6,
    (incomingDir + 5) % 6,
    (incomingDir + 2) % 6,
    (incomingDir + 4) % 6,
  ];
  for (const d of order) {
    const dest = enemy.hex.neighbor(d);
    const t = state.tiles.get(dest.key());
    if (!t) continue;
    if (state.shrine && dest.equals(state.shrine) && !state.prayed) continue;
    if (enemyAt(state, dest)) continue;
    if (bombAt(state, dest)) continue;
    if (state.player.hex.equals(dest)) continue;
    if (t.type === TILE.ABYSS) {
      enemy.alive = false;
      killed.push(enemy);
      return true;
    }
    enemy.hex = dest;
    return true;
  }
  return false;
}

export function performThrow(state, targetHex) {
  const msgs = [];
  if (!state.player.hasYari) return { msgs, killed: [] };

  const killed = [];
  const e = enemyAt(state, targetHex);
  if (e) {
    e.alive = false;
    killed.push(e);
    // Yari lands on that tile
    state.player.yariHex = targetHex;
  } else {
    state.player.yariHex = targetHex;
  }
  state.player.hasYari = false;

  applyKills(state, killed);
  if (killed.length) {
    msgs.push(`The thrown wakizashi finds the ${enemyName(killed[0].type)}.`);
  } else {
    msgs.push("The wakizashi leaves the hand.");
  }
  return { msgs, killed };
}

export function enemyName(type) {
  switch (type) {
    case "oni":
      return "Oni";
    case "tengu":
      return "Tengu";
    case "bakemono":
      return "Bakemono";
    case "onryo":
      return "Onryō";
    default:
      return "Yokai";
  }
}

export function tickBashCooldown(state) {
  if (state.player.bashCooldown > 0) {
    state.player.bashCooldown -= 1;
  }
}
