/**
 * Yokai AI — attack priority, then movement.
 * Turn order: bombs explode → demons attack → demons walk.
 */

import { HEX_DIRS } from "./hex.js";
import { isLandTile } from "./map.js";
import { enemyAt, bombAt } from "./combat.js";

export function enemyTurn(state) {
  const log = [];
  const fx = [];

  // 1. Bombs explode
  const bombResults = explodeBombs(state);
  log.push(...bombResults.msgs);
  if (bombResults.fx?.length) fx.push(...bombResults.fx);
  if (state.player.hp <= 0) {
    return { log, dead: true, killer: "a bakemono bomb", fx };
  }

  // 2. Demons attack (in list order)
  const living = state.enemies.filter((e) => e.alive);
  for (const e of living) {
    if (e.stunned > 0) continue;
    const atk = tryAttack(state, e);
    if (atk.didAttack) {
      log.push(...atk.msgs);
      if (atk.fx) {
        if (Array.isArray(atk.fx)) fx.push(...atk.fx);
        else fx.push(atk.fx);
      }
      if (state.player.hp <= 0) {
        return { log, dead: true, killer: killerName(e), fx };
      }
    }
    e._attacked = atk.didAttack;
  }

  // 3. Demons that didn't attack walk
  for (const e of living) {
    if (!e.alive) continue;
    if (e.stunned > 0) {
      e.stunned -= 1;
      e._attacked = false;
      continue;
    }
    if (e._attacked) {
      // Charge management for those who attacked
      if (e.type === "bakemono") e.charge = 0;
      if (e.type === "onryo") e.charge = 0;
      e._attacked = false;
      continue;
    }
    // Gain charge if didn't attack
    if (e.type === "bakemono") e.charge = Math.min(2, e.charge + 1);
    if (e.type === "onryo") e.charge = Math.min(1, e.charge + 1);

    walkEnemy(state, e);
    e._attacked = false;
  }

  return { log, dead: false, fx };
}

function killerName(e) {
  switch (e.type) {
    case "oni":
      return "an Oni's club";
    case "tengu":
      return "a Tengu's arrow";
    case "bakemono":
      return "Bakemono fire";
    case "onryo":
      return "an Onryō's scream";
    default:
      return "the dark itself";
  }
}

function explodeBombs(state) {
  const msgs = [];
  const fx = [];
  const remaining = [];
  for (const b of state.bombs) {
    b.fuse -= 1;
    if (b.fuse > 0) {
      remaining.push(b);
      continue;
    }
    // Explode: damage player if on bomb tile or adjacent
    const d = state.player.hex.distance(b.hex);
    if (d <= 1) {
      state.player.hp -= 1;
      msgs.push("A talisman blooms in fire!");
    }
    // Kill enemies in blast
    for (const e of state.enemies) {
      if (e.alive && e.hex.distance(b.hex) <= 1) {
        e.alive = false;
        fx.push({
          type: "slash",
          at: { q: e.hex.q, r: e.hex.r },
          duration: 380,
          angle: -0.4,
        });
      }
    }
  }
  state.bombs = remaining;
  return { msgs, fx };
}

function tryAttack(state, e) {
  const player = state.player.hex;
  switch (e.type) {
    case "oni":
      return attackOni(state, e, player);
    case "tengu":
      return attackTengu(state, e, player);
    case "bakemono":
      return attackBakemono(state, e, player);
    case "onryo":
      return attackOnryo(state, e, player);
    default:
      return { didAttack: false, msgs: [] };
  }
}

function attackOni(state, e, player) {
  if (e.hex.distance(player) === 1) {
    state.player.hp -= 1;
    return { didAttack: true, msgs: ["The Oni's club falls."] };
  }
  return { didAttack: false, msgs: [] };
}

function attackTengu(state, e, player) {
  const dist = e.hex.distance(player);
  if (dist < 2 || dist > 5) return { didAttack: false, msgs: [] };
  const dir = e.hex.directionTo(player);
  if (dir === null) return { didAttack: false, msgs: [] };
  // Clear line of sight (blocked by enemies, shrine)
  if (!clearLine(state, e.hex, player, { blockOnEnemy: true })) {
    return { didAttack: false, msgs: [] };
  }
  state.player.hp -= 1;
  return {
    didAttack: true,
    msgs: ["A Tengu arrow splits the dark."],
    fx: {
      type: "arrow",
      from: { q: e.hex.q, r: e.hex.r },
      to: { q: player.q, r: player.r },
      duration: 420,
    },
  };
}

function attackBakemono(state, e, player) {
  if (e.charge < 2) return { didAttack: false, msgs: [] };
  const dist = e.hex.distance(player);
  if (dist > 3) return { didAttack: false, msgs: [] };

  // Prefer tile adjacent to player, in range, not adjacent to other demons
  const candidates = [];
  for (const dir of HEX_DIRS) {
    const h = player.add(dir);
    if (e.hex.distance(h) > 3) continue;
    if (!isLandTile(h, state.tiles)) continue;
    if (enemyAt(state, h)) continue;
    if (bombAt(state, h)) continue;
    if (h.equals(e.hex)) continue;
    // Not adjacent to other demons
    let nearDemon = false;
    for (const o of state.enemies) {
      if (!o.alive || o === e) continue;
      if (o.hex.distance(h) === 1) {
        nearDemon = true;
        break;
      }
    }
    if (nearDemon) continue;
    candidates.push(h);
  }

  // Also allow player's tile? Hoplite throws adjacent to player. Skip player tile for fairness.
  if (!candidates.length) {
    // Fallback: any land in range near player
    for (const h of player.spiral(1)) {
      if (e.hex.distance(h) <= 3 && isLandTile(h, state.tiles) && !enemyAt(state, h) && !h.equals(e.hex)) {
        candidates.push(h);
      }
    }
  }

  if (!candidates.length) return { didAttack: false, msgs: [] };

  // Prefer closer to bakemono among candidates near player
  candidates.sort((a, b) => e.hex.distance(a) - e.hex.distance(b));
  const target = candidates[0];
  state.bombs.push({ hex: target, fuse: 1 }); // explodes next enemy phase after this one... 
  // Actually: bombs explode at start of next full enemy turn. Fuse 1 means after player acts once more.
  // Turn: player move → bombs explode → attacks → walks.
  // So bomb thrown now shouldn't explode same turn. fuse=2 with decrement at start, or fuse=1 and explode only if placed previous turn.
  // Place with fuse=2; explodeBombs decrements first so next enemy turn fuse becomes 1, still there; wait we need explode after player turn.
  // Place fuse=1: next enemy turn start, fuse becomes 0 and explodes. Good — player gets one turn to move.

  e.charge = 0;
  return { didAttack: true, msgs: ["The Bakemono seeds fire among the stones."] };
}

function attackOnryo(state, e, player) {
  if (e.charge < 1) return { didAttack: false, msgs: [] };
  const dist = e.hex.distance(player);
  if (dist < 1 || dist > 5) return { didAttack: false, msgs: [] };
  const dir = e.hex.directionTo(player);
  if (dir === null) return { didAttack: false, msgs: [] };

  // Won't fire if any yokai is on the beam within range 5 (including behind the player)
  let scan = e.hex;
  for (let i = 1; i <= 5; i++) {
    scan = scan.neighbor(dir);
    if (!state.tiles.has(scan.key())) break;
    if (enemyAt(state, scan)) return { didAttack: false, msgs: [] };
  }

  // Line of sight to player (shrine blocks)
  let cur = e.hex;
  for (let i = 1; i <= dist; i++) {
    cur = cur.neighbor(dir);
    if (state.shrine && cur.equals(state.shrine) && !state.prayed && i < dist) {
      return { didAttack: false, msgs: [] };
    }
  }

  state.player.hp -= 1;
  e.charge = 0;
  return { didAttack: true, msgs: ["The Onryō's grief becomes flame."] };
}

function clearLine(state, from, to, { blockOnEnemy = true } = {}) {
  const path = from.lineTo(to);
  for (const h of path) {
    if (h.equals(to)) return true;
    if (blockOnEnemy && enemyAt(state, h)) return false;
    if (state.shrine && h.equals(state.shrine) && !state.prayed) return false;
  }
  return true;
}

function walkEnemy(state, e) {
  switch (e.type) {
    case "oni":
      walkOni(state, e);
      break;
    case "tengu":
    case "bakemono":
    case "onryo":
      walkRanged(state, e);
      break;
  }
}

function walkableForEnemy(state, hex, self) {
  if (!isLandTile(hex, state.tiles)) return false;
  if (state.player.hex.equals(hex)) return false;
  if (enemyAt(state, hex)) return false;
  if (bombAt(state, hex)) return false;
  if (state.shrine && hex.equals(state.shrine) && !state.prayed) return false;
  // Avoid exit/stairs as resting preference? Can walk through.
  return true;
}

function walkOni(state, e) {
  const player = state.player.hex;
  const curDist = e.hex.distance(player);

  const options = [];
  for (let dir = 0; dir < 6; dir++) {
    const n = e.hex.neighbor(dir);
    if (!walkableForEnemy(state, n, e)) continue;
    const d = n.distance(player);
    options.push({ hex: n, d });
  }

  const closer = options.filter((o) => o.d < curDist);
  if (closer.length) {
    e.hex = closer[Math.floor(Math.random() * closer.length)].hex;
    return;
  }

  // Equal distance or wait
  const equal = options.filter((o) => o.d === curDist);
  const choices = [...equal.map((o) => o.hex), null]; // null = wait
  const pick = choices[Math.floor(Math.random() * choices.length)];
  if (pick) e.hex = pick;
}

function walkRanged(state, e) {
  const player = state.player.hex;
  // Prefer hexes at distance 3 from player from which they can shoot (on a line)
  const idealDist = 3;

  // Score neighbors
  const options = [];
  for (let dir = 0; dir < 6; dir++) {
    const n = e.hex.neighbor(dir);
    if (!walkableForEnemy(state, n, e)) continue;
    options.push(n);
  }

  // Can we already shoot from here? Stay if in good range
  const curDist = e.hex.distance(player);
  const onLine = e.hex.directionTo(player) !== null;

  // Prefer tiles that get us on a shooting line at range 2-5, ideally 3
  function score(h) {
    const d = h.distance(player);
    const line = h.directionTo(player) !== null;
    let s = 0;
    if (line && d >= 2 && d <= 5) s += 20 - Math.abs(d - idealDist) * 3;
    s -= Math.abs(d - idealDist) * 2;
    // Don't walk adjacent if tengu (can't shoot adj)
    if (e.type === "tengu" && d === 1) s -= 10;
    return s;
  }

  // Stay option
  let best = e.hex;
  let bestScore = score(e.hex) + 0.5; // slight preference to stay

  for (const n of options) {
    const sc = score(n);
    if (sc > bestScore) {
      bestScore = sc;
      best = n;
    }
  }

  // If nothing good, move closer to ideal distance ring
  if (best.equals(e.hex) && Math.abs(curDist - idealDist) > 0) {
    const toward = options.filter((n) => {
      const d = n.distance(player);
      return Math.abs(d - idealDist) < Math.abs(curDist - idealDist);
    });
    if (toward.length) {
      best = toward[Math.floor(Math.random() * toward.length)];
    } else if (options.length && Math.random() < 0.5) {
      best = options[Math.floor(Math.random() * options.length)];
    }
  }

  e.hex = best;
}

/**
 * Attack region for a single yokai (for hover preview).
 * Returns Set of hex keys they can currently threaten / place attacks on.
 */
export function getEnemyAttackTiles(state, e) {
  const tiles = new Set();
  if (!e || !e.alive) return tiles;

  switch (e.type) {
    case "oni":
      for (let d = 0; d < 6; d++) {
        const n = e.hex.neighbor(d);
        if (state.tiles.has(n.key())) tiles.add(n.key());
      }
      break;

    case "tengu":
      // Arrows on the six lines, range 2–5, blocked by bodies / shrine
      for (let dir = 0; dir < 6; dir++) {
        let cur = e.hex;
        for (let i = 1; i <= 5; i++) {
          cur = cur.neighbor(dir);
          if (!state.tiles.has(cur.key())) break;
          if (enemyAt(state, cur)) break;
          if (state.shrine && cur.equals(state.shrine) && !state.prayed) break;
          if (i >= 2) tiles.add(cur.key());
        }
      }
      break;

    case "onryo":
      // Fire beams range 1–5 along lines (show full reach; charge gates actual fire)
      for (let dir = 0; dir < 6; dir++) {
        let cur = e.hex;
        for (let i = 1; i <= 5; i++) {
          cur = cur.neighbor(dir);
          if (!state.tiles.has(cur.key())) break;
          if (enemyAt(state, cur)) break;
          if (state.shrine && cur.equals(state.shrine) && !state.prayed) break;
          tiles.add(cur.key());
        }
      }
      break;

    case "bakemono": {
      // Can plant a bomb on land within range 3; blast hits that stone + neighbors
      const place = [];
      for (let d = 1; d <= 3; d++) {
        for (const h of e.hex.ring(d)) {
          if (!state.tiles.has(h.key())) continue;
          place.push(h);
          tiles.add(h.key());
        }
      }
      // Include blast aureole around each possible landing (adjacent)
      for (const h of place) {
        for (let d = 0; d < 6; d++) {
          const n = h.neighbor(d);
          if (state.tiles.has(n.key())) tiles.add(n.key());
        }
      }
      break;
    }
  }
  return tiles;
}

/** Union of all living yokai attack regions (faint map tint). */
export function computeDangerTiles(state) {
  const danger = new Set();
  for (const e of state.enemies) {
    if (!e.alive || e.stunned > 0) continue;
    // Passive tint only for attacks that can fire this turn
    if (e.type === "onryo" && e.charge < 1) continue;
    if (e.type === "bakemono") {
      if (e.charge < 2) continue;
      // Placement reach only (blast aureole is for hover focus)
      for (let d = 1; d <= 3; d++) {
        for (const h of e.hex.ring(d)) {
          if (state.tiles.has(h.key())) danger.add(h.key());
        }
      }
      continue;
    }
    for (const key of getEnemyAttackTiles(state, e)) danger.add(key);
  }
  return danger;
}
