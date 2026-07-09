/**
 * Procedural hex map generation for each depth of Yomi.
 */

import { Hex, HEX_DIRS, pathDistance } from "./hex.js";

export const TILE = {
  LAND: "land",
  ABYSS: "abyss",
};

/**
 * Seeded RNG (mulberry32)
 */
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const str = String(p);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

/**
 * Generate a hexagonal map of radius R (default 4 → 61 tiles).
 * ~25–40% abyss depending on depth. Guarantees path from spawn to exit/shrine.
 */
export function generateMap(depth, seed, radius = 4) {
  const rng = makeRng(seed);
  const center = new Hex(0, 0);
  const allHexes = center.spiral(radius);
  const tiles = new Map();

  // Base: all land
  for (const h of allHexes) {
    tiles.set(h.key(), { hex: h, type: TILE.LAND });
  }

  // Abyss fraction increases with depth
  const abyssChance = Math.min(0.22 + depth * 0.012, 0.38);
  // Don't abyss the outer ring completely — keep connectivity
  for (const h of allHexes) {
    if (h.distance(center) === 0) continue;
    if (rng() < abyssChance) {
      tiles.get(h.key()).type = TILE.ABYSS;
    }
  }

  // Ensure rim has some land
  for (const h of center.ring(radius)) {
    if (rng() < 0.55) {
      tiles.get(h.key()).type = TILE.LAND;
    }
  }

  const isLand = (hex) => {
    const t = tiles.get(hex.key());
    return t && t.type === TILE.LAND;
  };

  // Pick spawn: near edge
  const edgeCandidates = center
    .ring(radius)
    .filter((h) => isLand(h))
    .concat(center.ring(radius - 1).filter((h) => isLand(h)));
  let spawn = edgeCandidates[Math.floor(rng() * edgeCandidates.length)] || center;
  tiles.get(spawn.key()).type = TILE.LAND;

  // Pick exit: opposite side of map
  const exitCandidates = allHexes
    .filter((h) => isLand(h) && h.distance(spawn) >= radius)
    .sort((a, b) => b.distance(spawn) - a.distance(spawn));
  let exit = exitCandidates[0];
  if (!exit) {
    // Force a far land tile
    exit = allHexes.reduce((best, h) =>
      h.distance(spawn) > best.distance(spawn) ? h : best
    );
  }
  tiles.get(exit.key()).type = TILE.LAND;

  // Ensure path spawn → exit by carving land
  ensurePath(spawn, exit, tiles, rng);

  // Shrine on depths 1–15 (not on spawn/exit)
  let shrine = null;
  if (depth <= 15) {
    const shrineCandidates = allHexes.filter(
      (h) =>
        isLand(h) &&
        !h.equals(spawn) &&
        !h.equals(exit) &&
        h.distance(spawn) >= 2 &&
        h.distance(exit) >= 2
    );
    if (shrineCandidates.length) {
      shrine = shrineCandidates[Math.floor(rng() * shrineCandidates.length)];
      ensurePath(spawn, shrine, tiles, rng);
    }
  }

  // Depth 16: magatama near center-ish, portal is exit
  let magatama = null;
  if (depth === 16) {
    const magCandidates = allHexes.filter(
      (h) => isLand(h) && !h.equals(spawn) && !h.equals(exit) && h.distance(spawn) >= 2
    );
    if (magCandidates.length) {
      magatama = magCandidates[Math.floor(rng() * magCandidates.length)];
      tiles.get(magatama.key()).type = TILE.LAND;
      ensurePath(spawn, magatama, tiles, rng);
      ensurePath(magatama, exit, tiles, rng);
    }
  }

  // Spawn enemies
  const enemies = spawnEnemies(depth, tiles, spawn, exit, shrine, magatama, rng);

  return {
    radius,
    tiles,
    spawn,
    exit,
    shrine,
    magatama,
    enemies,
    prayed: false,
    hasMagatama: depth !== 16,
  };
}

function ensurePath(from, to, tiles, rng) {
  const isWalkable = (h) => {
    const t = tiles.get(h.key());
    return t && t.type === TILE.LAND;
  };
  let dist = pathDistance(from, to, isWalkable);
  if (dist < Infinity) return;

  // Carve a rough straight path
  const line = from.lineTo(to);
  for (const h of [from, ...line]) {
    const t = tiles.get(h.key());
    if (t) t.type = TILE.LAND;
  }
  // Widen occasionally
  for (const h of line) {
    if (rng() < 0.35) {
      const n = h.neighbor(Math.floor(rng() * 6));
      const t = tiles.get(n.key());
      if (t) t.type = TILE.LAND;
    }
  }
}

function spawnEnemies(depth, tiles, spawn, exit, shrine, magatama, rng) {
  const landTiles = [...tiles.values()]
    .filter((t) => t.type === TILE.LAND)
    .map((t) => t.hex)
    .filter(
      (h) =>
        !h.equals(spawn) &&
        !h.equals(exit) &&
        !(shrine && h.equals(shrine)) &&
        !(magatama && h.equals(magatama)) &&
        h.distance(spawn) >= 2
    );

  // Count scales with depth
  let count = Math.min(2 + Math.floor(depth * 0.7), 12);
  if (depth === 1) count = 2;
  if (depth === 2) count = 3;

  // Shuffle land
  const pool = [...landTiles];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const enemies = [];
  for (let i = 0; i < count && i < pool.length; i++) {
    const type = pickEnemyType(depth, rng);
    enemies.push({
      id: `e${i}`,
      type,
      hex: pool[i],
      // Bakemono needs 2 charges to throw (gains 1 per non-attack turn); starts ready-ish
      charge: type === "bakemono" ? 1 : type === "onryo" ? 1 : 0,
      stunned: 0,
      alive: true,
    });
  }
  return enemies;
}

function pickEnemyType(depth, rng) {
  // Depth progression unlocks types
  const weights = [];
  weights.push({ type: "oni", w: 10 });
  if (depth >= 2) weights.push({ type: "tengu", w: 4 + depth * 0.3 });
  if (depth >= 4) weights.push({ type: "bakemono", w: 2 + depth * 0.2 });
  if (depth >= 6) weights.push({ type: "onryo", w: 1.5 + depth * 0.25 });

  const total = weights.reduce((s, x) => s + x.w, 0);
  let roll = rng() * total;
  for (const { type, w } of weights) {
    roll -= w;
    if (roll <= 0) return type;
  }
  return "oni";
}

export function isInMap(hex, tiles) {
  return tiles.has(hex.key());
}

export function isLandTile(hex, tiles) {
  const t = tiles.get(hex.key());
  return t && t.type === TILE.LAND;
}

export function isAbyss(hex, tiles) {
  const t = tiles.get(hex.key());
  return t && t.type === TILE.ABYSS;
}
