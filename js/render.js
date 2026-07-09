/**
 * Canvas renderer — Japanese underworld aesthetic with Imagine art.
 */

import { Hex } from "./hex.js";
import { TILE } from "./map.js";
import { computeDangerTiles, getEnemyAttackTiles } from "./ai.js";
import { getAsset } from "./assets.js";

const COLORS = {
  bg: "#0c0a12",
  land: "#2a2438",
  landEdge: "#4a4060",
  abyss: "#120608",
  abyssGlow: "#3a1018",
  exit: "#1a4a38",
  exitEdge: "#3a9e70",
  shrine: "#4a3820",
  shrineEdge: "#d4a84b",
  magatama: "#3a2040",
  magatamaEdge: "#c070e0",
  walk: "rgba(74, 158, 122, 0.42)",
  leap: "rgba(74, 160, 200, 0.4)",
  bash: "rgba(212, 168, 75, 0.4)",
  throwT: "rgba(232, 160, 176, 0.4)",
  danger: "rgba(185, 28, 60, 0.16)",
  threat: "rgba(230, 50, 70, 0.42)",
  threatEdge: "rgba(255, 100, 110, 0.85)",
  hover: "rgba(232, 220, 196, 0.35)",
  player: "#e8dcc4",
  playerAccent: "#d4a84b",
  oni: "#c41e3a",
  tengu: "#2a6a4a",
  bakemono: "#8a5a20",
  onryo: "#6a40a0",
  bomb: "#e07030",
  yari: "#c0c8d0",
};

const ENEMY_ASSET = {
  oni: "oni",
  tengu: "tengu",
  bakemono: "bakemono",
  onryo: "onryo",
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hexSize = 28;
    this.origin = { x: 0, y: 0 };
    this.hoverHex = null;
    /** @type {Set<string>|null} attack region for hovered yokai */
    this.hoverThreat = null;
    this.highlights = new Map();
    this.pulse = 0;
    this._patterns = new Map();
    /** @type {Array<{type:string, from:{q:number,r:number}, to:{q:number,r:number}, duration:number, age:number}>} */
    this.fx = [];
    this._lastFrame = performance.now();
  }

  /** Queue combat VFX (e.g. Tengu arrows, kill slashes). */
  addFx(list) {
    if (!list?.length) return;
    for (const f of list) {
      this.fx.push({
        ...f,
        duration: f.duration ?? 400,
        // Negative age = wait for delay before drawing
        age: -(f.delay || 0),
      });
    }
  }

  updateFx(dtMs) {
    if (!this.fx.length) return;
    for (const f of this.fx) f.age += dtMs;
    this.fx = this.fx.filter((f) => f.age < f.duration + 80);
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = w;
    this.viewH = h;
    this._patterns.clear();
  }

  fitToMap(radius) {
    const base = 30;
    const mapW = Math.sqrt(3) * base * (radius * 2 + 1);
    const mapH = 1.5 * base * (radius * 2) + 2 * base;
    const pad = 12;
    const availW = Math.max(80, this.viewW - pad * 2);
    const availH = Math.max(80, this.viewH - pad * 2);
    const scale = Math.min(availW / mapW, availH / mapH, 1.85);
    this.hexSize = Math.max(20, Math.min(48, Math.floor(base * scale)));
    this.origin = { x: this.viewW / 2, y: this.viewH / 2 };
  }

  hexToScreen(hex) {
    const p = hex.toPixel(this.hexSize);
    return { x: p.x + this.origin.x, y: p.y + this.origin.y };
  }

  screenToHex(sx, sy) {
    return Hex.fromPixel(sx - this.origin.x, sy - this.origin.y, this.hexSize);
  }

  setHighlights(entries) {
    this.highlights = new Map(entries);
  }

  getPattern(key) {
    if (this._patterns.has(key)) return this._patterns.get(key);
    const img = getAsset(key);
    if (!img) return null;
    const size = Math.max(48, Math.floor(this.hexSize * 2.2));
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const octx = off.getContext("2d");
    octx.drawImage(img, 0, 0, size, size);
    const pat = this.ctx.createPattern(off, "repeat");
    this._patterns.set(key, pat);
    return pat;
  }

  draw(state) {
    const ctx = this.ctx;
    const w = this.viewW;
    const h = this.viewH;
    const now = performance.now();
    const dt = Math.min(64, now - (this._lastFrame || now));
    this._lastFrame = now;
    this.pulse = (this.pulse + 0.03) % (Math.PI * 2);
    this.updateFx(dt);

    ctx.clearRect(0, 0, w, h);

    // Atmospheric wash
    const grd = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.6);
    grd.addColorStop(0, "rgba(40, 22, 48, 0.45)");
    grd.addColorStop(0.55, "rgba(18, 12, 28, 0.2)");
    grd.addColorStop(1, "rgba(8, 6, 14, 0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // Focused threat when hovering a yokai; otherwise faint global danger
    let hoverThreat = null;
    let hoverEnemy = null;
    if (this.hoverHex) {
      hoverEnemy = state.enemies.find((e) => e.alive && e.hex.equals(this.hoverHex)) || null;
      if (hoverEnemy) hoverThreat = getEnemyAttackTiles(state, hoverEnemy);
    }
    this.hoverThreat = hoverThreat;

    const danger = hoverThreat ? new Set() : computeDangerTiles(state);

    for (const tile of state.tiles.values()) {
      this.drawTile(state, tile, danger, hoverThreat);
    }

    // Props on special tiles (under units)
    for (const tile of state.tiles.values()) {
      this.drawTileProp(state, tile);
    }

    for (const b of state.bombs) {
      this.drawBomb(b);
    }

    if (state.player.yariHex) {
      this.drawYari(state.player.yariHex);
    }

    for (const e of state.enemies) {
      if (e.alive) this.drawEnemy(e);
    }

    this.drawPlayer(state.player);

    // Combat VFX on top of units
    this.drawFx();

    if (this.hoverHex && state.tiles.has(this.hoverHex.key())) {
      const outline = hoverEnemy ? COLORS.threatEdge : COLORS.hover;
      this.strokeHex(this.hoverHex, outline, hoverEnemy ? 3 : 2.5);
    }
  }

  drawFx() {
    for (const f of this.fx) {
      if (f.age < 0) continue;
      if (f.type === "arrow") this.drawArrowFx(f);
      else if (f.type === "slash") this.drawSlashFx(f);
    }
  }

  /** Katana cut flash over a killed yokai's hex. */
  drawSlashFx(f) {
    const ctx = this.ctx;
    if (!f.at) return;
    const pos = this.hexToScreen(new Hex(f.at.q, f.at.r));
    const t = Math.min(1, Math.max(0, f.age / f.duration));
    // Fast draw, slow fade
    const draw = Math.min(1, t / 0.22);
    const fade = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55;
    const size = this.hexSize * (1.15 + t * 0.25);
    const baseAngle = f.angle ?? -0.65;

    ctx.save();
    ctx.translate(pos.x, pos.y - this.hexSize * 0.08);
    ctx.globalAlpha = 0.95 * fade;

    // Soft impact bloom
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.35 * (0.6 + draw * 0.5), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 220, 180, ${0.22 * fade})`;
    ctx.fill();

    // Main slash stroke
    const len = size * 1.15 * draw;
    ctx.rotate(baseAngle);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Outer glow
    ctx.strokeStyle = "rgba(255, 80, 100, 0.55)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-len * 0.55, -len * 0.08);
    ctx.quadraticCurveTo(0, len * 0.12, len * 0.55, -len * 0.05);
    ctx.stroke();

    // Bright core
    const grad = ctx.createLinearGradient(-len * 0.5, 0, len * 0.5, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.35, "#fff6e8");
    grad.addColorStop(0.5, "#ffffff");
    grad.addColorStop(0.65, "#ffe0a0");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-len * 0.55, -len * 0.08);
    ctx.quadraticCurveTo(0, len * 0.12, len * 0.55, -len * 0.05);
    ctx.stroke();

    // Second thinner counter-cut (X)
    ctx.rotate(1.15);
    const len2 = len * 0.72;
    ctx.strokeStyle = "rgba(255, 200, 120, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-len2 * 0.45, 0);
    ctx.lineTo(len2 * 0.45, 0);
    ctx.stroke();

    // Sparks at peak
    if (t < 0.5) {
      ctx.rotate(-1.15);
      const sparkN = 5;
      for (let i = 0; i < sparkN; i++) {
        const a = baseAngle + (i / sparkN) * Math.PI * 2;
        const d = size * (0.25 + t * 0.55 + (i % 2) * 0.08);
        ctx.fillStyle = i % 2 ? "#ffd78a" : "#ffffff";
        ctx.globalAlpha = 0.85 * fade * (1 - t / 0.5);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  drawArrowFx(f) {
    const ctx = this.ctx;
    const fromHex = new Hex(f.from.q, f.from.r);
    const toHex = new Hex(f.to.q, f.to.r);
    const a = this.hexToScreen(fromHex);
    const b = this.hexToScreen(toHex);
    const t = Math.min(1, f.age / f.duration);
    // Ease-out so the shot snaps into the target
    const ease = 1 - Math.pow(1 - t, 2.4);
    const x = a.x + (b.x - a.x) * ease;
    const y = a.y + (b.y - a.y) * ease;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const len = Math.max(14, this.hexSize * 0.55);
    const fade = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;

    ctx.save();
    ctx.globalAlpha = 0.9 * fade;
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Motion streak
    ctx.strokeStyle = "rgba(180, 255, 200, 0.35)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-len * 1.1, 0);
    ctx.lineTo(-len * 0.15, 0);
    ctx.stroke();

    // Shaft
    ctx.strokeStyle = "#e8dcc4";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-len * 0.55, 0);
    ctx.lineTo(len * 0.25, 0);
    ctx.stroke();

    // Fletching
    ctx.fillStyle = "#2a8a5a";
    ctx.beginPath();
    ctx.moveTo(-len * 0.55, 0);
    ctx.lineTo(-len * 0.72, -3.5);
    ctx.lineTo(-len * 0.4, 0);
    ctx.lineTo(-len * 0.72, 3.5);
    ctx.closePath();
    ctx.fill();

    // Arrowhead
    ctx.fillStyle = "#c0c8d0";
    ctx.strokeStyle = "#d4a84b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(len * 0.55, 0);
    ctx.lineTo(len * 0.18, -4.2);
    ctx.lineTo(len * 0.22, 0);
    ctx.lineTo(len * 0.18, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tip gleam
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(len * 0.42, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Thin flight line (fades quickly)
    if (t < 0.7) {
      ctx.save();
      ctx.globalAlpha = 0.2 * (1 - t / 0.7);
      ctx.strokeStyle = "#7ee8d4";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTile(state, tile, danger, hoverThreat) {
    const ctx = this.ctx;
    const { hex, type } = tile;
    const key = hex.key();
    const hl = this.highlights.get(key);
    const threatened = hoverThreat && hoverThreat.has(key);

    let stroke = COLORS.landEdge;
    if (type === TILE.ABYSS) stroke = COLORS.abyssGlow;
    else if (state.exit && hex.equals(state.exit)) stroke = COLORS.exitEdge;
    else if (state.shrine && hex.equals(state.shrine) && !state.prayed) stroke = COLORS.shrineEdge;
    else if (state.magatama && hex.equals(state.magatama)) stroke = COLORS.magatamaEdge;

    // Textured fill
    const patKey = type === TILE.ABYSS ? "abyss" : "land";
    const pat = this.getPattern(patKey);
    if (pat) {
      this.clipHex(hex, () => {
        const pos = this.hexToScreen(hex);
        ctx.save();
        // Offset pattern per tile for variety
        const ox = ((hex.q * 17 + hex.r * 31) % 40) - 20;
        const oy = ((hex.q * 13 + hex.r * 7) % 40) - 20;
        ctx.translate(pos.x + ox, pos.y + oy);
        ctx.fillStyle = pat;
        ctx.fillRect(-this.hexSize * 2, -this.hexSize * 2, this.hexSize * 4, this.hexSize * 4);
        ctx.restore();
        // Slight darken so sprites pop; keep land readable
        ctx.fillStyle = type === TILE.ABYSS ? "rgba(20,4,8,0.2)" : "rgba(12,8,24,0.22)";
        this.pathHex(hex);
        ctx.fill();
      });
    } else {
      this.fillHex(hex, type === TILE.ABYSS ? COLORS.abyss : COLORS.land, null);
    }

    // Special tile tint under props
    if (type === TILE.LAND) {
      if (state.exit && hex.equals(state.exit)) {
        this.fillHex(hex, "rgba(30, 100, 70, 0.35)", null);
      } else if (state.shrine && hex.equals(state.shrine) && !state.prayed) {
        this.fillHex(hex, "rgba(180, 140, 40, 0.28)", null);
      } else if (state.magatama && hex.equals(state.magatama)) {
        this.fillHex(hex, "rgba(140, 60, 180, 0.3)", null);
      }
    }

    this.strokeHex(hex, stroke, 1.2);

    // Global faint danger (when not focusing a yokai)
    if (!hoverThreat && danger.has(key)) {
      this.fillHex(hex, COLORS.danger, null);
    }

    // Focused attack region for hovered yokai
    if (threatened) {
      const pulse = 0.38 + Math.sin(this.pulse * 2) * 0.08;
      this.fillHex(hex, `rgba(230, 45, 65, ${pulse})`, null);
      this.strokeHex(hex, COLORS.threatEdge, 2);
    }

    if (hl) {
      const c =
        hl === "walk" ? COLORS.walk :
        hl === "leap" ? COLORS.leap :
        hl === "bash" ? COLORS.bash :
        COLORS.throwT;
      this.fillHex(hex, c, null);
      this.strokeHex(hex, c.replace(/[\d.]+\)$/, "0.9)"), 1.5);
    }

    // Abyss pulse
    if (type === TILE.ABYSS) {
      ctx.save();
      ctx.globalAlpha = 0.12 + Math.sin(this.pulse + hex.q * 0.7 + hex.r) * 0.08;
      this.fillHex(hex, "#ff3040", null);
      ctx.restore();
    }
  }

  drawTileProp(state, tile) {
    const { hex, type } = tile;
    if (type !== TILE.LAND) return;
    const pos = this.hexToScreen(hex);
    const size = this.hexSize * 1.25;

    if (state.exit && hex.equals(state.exit)) {
      this.drawSprite(getAsset("torii"), pos.x, pos.y - size * 0.1, size * 1.1, size * 1.1);
    } else if (state.shrine && hex.equals(state.shrine) && !state.prayed) {
      this.drawSprite(getAsset("shrine"), pos.x, pos.y - size * 0.08, size * 1.05, size * 1.05);
    } else if (state.magatama && hex.equals(state.magatama)) {
      const pulse = 1 + Math.sin(this.pulse * 1.5) * 0.08;
      this.drawSprite(getAsset("magatama"), pos.x, pos.y, size * 0.95 * pulse, size * 0.95 * pulse);
    }
  }

  pathHex(hex) {
    const corners = this.hexCorners(hex);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
  }

  clipHex(hex, fn) {
    const ctx = this.ctx;
    ctx.save();
    this.pathHex(hex);
    ctx.clip();
    fn();
    ctx.restore();
  }

  fillHex(hex, fill, stroke) {
    const ctx = this.ctx;
    this.pathHex(hex);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }

  strokeHex(hex, color, width) {
    const ctx = this.ctx;
    this.pathHex(hex);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  hexCorners(hex) {
    const c = this.hexToScreen(hex);
    const corners = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      corners.push({
        x: c.x + this.hexSize * Math.cos(angle),
        y: c.y + this.hexSize * Math.sin(angle),
      });
    }
    return corners;
  }

  drawSprite(img, x, y, w, h) {
    if (!img) return;
    const ctx = this.ctx;
    const aspect = img.width / img.height;
    let dw = w;
    let dh = h;
    if (aspect > 1) {
      dh = w / aspect;
    } else {
      dw = h * aspect;
    }
    ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
  }

  drawPlayer(player) {
    const pos = this.hexToScreen(player.hex);
    const ctx = this.ctx;
    const size = this.hexSize * 1.85;
    const img = player.hasYari
      ? getAsset("samurai") || getAsset("samuraiUnarmed")
      : getAsset("samuraiUnarmed") || getAsset("samurai");

    ctx.save();

    // Drop shadow
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + size * 0.4, size * 0.3, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fill();

    if (img) {
      this.drawSprite(img, pos.x, pos.y - size * 0.12, size, size);
    } else {
      this.drawFallbackUnit(pos, COLORS.player, COLORS.playerAccent, "侍");
    }

    ctx.restore();
  }

  drawEnemy(e) {
    const pos = this.hexToScreen(e.hex);
    const ctx = this.ctx;
    const size = this.hexSize * 1.7;
    const assetKey = ENEMY_ASSET[e.type] || "oni";
    const img = getAsset(assetKey);
    const accent =
      e.type === "oni" ? COLORS.oni :
      e.type === "tengu" ? COLORS.tengu :
      e.type === "bakemono" ? COLORS.bakemono :
      COLORS.onryo;

    ctx.save();
    if (e.stunned > 0) ctx.globalAlpha = 0.55;

    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + size * 0.38, size * 0.28, size * 0.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fill();

    if (img) {
      this.drawSprite(img, pos.x, pos.y - size * 0.1, size, size);
    } else {
      const glyphs = { oni: "鬼", tengu: "天", bakemono: "化", onryo: "怨" };
      this.drawFallbackUnit(pos, accent, "rgba(255,255,255,0.3)", glyphs[e.type] || "?");
    }

    // Charge pip
    if (e.type === "bakemono" || e.type === "onryo") {
      const ready = e.type === "bakemono" ? e.charge >= 2 : e.charge >= 1;
      const px = pos.x + size * 0.32;
      const py = pos.y - size * 0.38;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = ready ? "#f0c040" : "#333";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawFallbackUnit(pos, fill, stroke, glyph) {
    const ctx = this.ctx;
    const r = this.hexSize * 0.36;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `bold ${Math.floor(r * 1.1)}px "Noto Serif JP", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(glyph, pos.x, pos.y + 1);
  }

  drawBomb(b) {
    const pos = this.hexToScreen(b.hex);
    const size = this.hexSize * 0.85;
    const pulse = 1 + Math.sin(this.pulse * 2.2) * 0.1;
    const img = getAsset("bomb");
    if (img) {
      this.drawSprite(img, pos.x, pos.y, size * pulse, size * pulse);
    } else {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, this.hexSize * 0.22 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.bomb;
      ctx.fill();
      ctx.restore();
    }
  }

  drawYari(hex) {
    const pos = this.hexToScreen(hex);
    // Small ground pickup — short blade, modest on the hex
    const size = this.hexSize * 0.42;
    const img = getAsset("wakizashi") || getAsset("yari");
    if (img) {
      this.drawSprite(img, pos.x, pos.y + this.hexSize * 0.08, size, size);
    } else {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = COLORS.yari;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pos.x - 5, pos.y + 6);
      ctx.lineTo(pos.x + 5, pos.y - 6);
      ctx.stroke();
      ctx.restore();
    }
  }
}
