/**
 * Axial hex coordinate math (pointy-top).
 * https://www.redblobgames.com/grids/hexagons/
 */

export class Hex {
  constructor(q, r) {
    this.q = q;
    this.r = r;
  }

  get s() {
    return -this.q - this.r;
  }

  key() {
    return `${this.q},${this.r}`;
  }

  equals(other) {
    return this.q === other.q && this.r === other.r;
  }

  add(other) {
    return new Hex(this.q + other.q, this.r + other.r);
  }

  sub(other) {
    return new Hex(this.q - other.q, this.r - other.r);
  }

  scale(k) {
    return new Hex(this.q * k, this.r * k);
  }

  neighbor(dir) {
    return this.add(HEX_DIRS[dir]);
  }

  distance(other) {
    const d = this.sub(other);
    return (Math.abs(d.q) + Math.abs(d.r) + Math.abs(d.s)) / 2;
  }

  /** All hexes at exact distance n */
  ring(n) {
    if (n === 0) return [this];
    const results = [];
    let hex = this.add(HEX_DIRS[4].scale(n));
    for (let dir = 0; dir < 6; dir++) {
      for (let i = 0; i < n; i++) {
        results.push(hex);
        hex = hex.neighbor(dir);
      }
    }
    return results;
  }

  /** All hexes within distance n (inclusive) */
  spiral(n) {
    const results = [this];
    for (let k = 1; k <= n; k++) {
      results.push(...this.ring(k));
    }
    return results;
  }

  /** Direction index (0–5) from this toward other, or null if not on a line */
  directionTo(other) {
    const d = other.sub(this);
    if (d.q === 0 && d.r === 0) return null;
    const dist = this.distance(other);
    if (dist === 0) return null;
    // Must be on one of the 6 axes
    if (d.q === 0 || d.r === 0 || d.s === 0) {
      const nq = d.q / dist;
      const nr = d.r / dist;
      for (let i = 0; i < 6; i++) {
        if (HEX_DIRS[i].q === nq && HEX_DIRS[i].r === nr) return i;
      }
    }
    return null;
  }

  /** Line of hexes from this to other (exclusive of start, inclusive of end) */
  lineTo(other) {
    const dist = this.distance(other);
    if (dist === 0) return [];
    const results = [];
    for (let i = 1; i <= dist; i++) {
      const t = i / dist;
      results.push(hexRound(this.q + (other.q - this.q) * t, this.r + (other.r - this.r) * t));
    }
    return results;
  }

  /** Pixel center for pointy-top hex of size `size` */
  toPixel(size) {
    const x = size * (Math.sqrt(3) * this.q + (Math.sqrt(3) / 2) * this.r);
    const y = size * ((3 / 2) * this.r);
    return { x, y };
  }

  static fromPixel(x, y, size) {
    const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
    const r = ((2 / 3) * y) / size;
    return hexRound(q, r);
  }
}

/** Pointy-top neighbor offsets: E, NE, NW, W, SW, SE */
export const HEX_DIRS = [
  new Hex(1, 0),
  new Hex(1, -1),
  new Hex(0, -1),
  new Hex(-1, 0),
  new Hex(-1, 1),
  new Hex(0, 1),
];

export function hexRound(q, r) {
  let s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  return new Hex(rq, rr);
}

export function parseKey(key) {
  const [q, r] = key.split(",").map(Number);
  return new Hex(q, r);
}

/** A* path length on walkable tiles. Returns Infinity if unreachable. */
export function pathDistance(start, goal, isWalkable) {
  if (start.equals(goal)) return 0;
  const startKey = start.key();
  const goalKey = goal.key();
  const open = [{ hex: start, f: start.distance(goal), g: 0 }];
  const gScore = new Map([[startKey, 0]]);
  const closed = new Set();

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const ck = current.hex.key();
    if (ck === goalKey) return current.g;
    if (closed.has(ck)) continue;
    closed.add(ck);

    for (const dir of HEX_DIRS) {
      const n = current.hex.add(dir);
      const nk = n.key();
      if (closed.has(nk)) continue;
      if (!n.equals(goal) && !isWalkable(n)) continue;
      // Allow goal even if occupied (for targeting)
      if (!n.equals(goal) && !isWalkable(n)) continue;
      const tg = current.g + 1;
      if (tg < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tg);
        open.push({ hex: n, f: tg + n.distance(goal), g: tg });
      }
    }
  }
  return Infinity;
}
