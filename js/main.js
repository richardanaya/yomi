/**
 * YOMI — entry point: wire DOM, canvas, game.
 */

import { Renderer } from "./render.js";
import { Game } from "./game.js";
import { loadAssets } from "./assets.js";

const $ = (sel) => document.querySelector(sel);

const screens = {
  title: $("#screen-title"),
  help: $("#screen-help"),
  game: $("#screen-game"),
};

const titleVideo = $("#title-video");

function ensureTitleVideo() {
  if (!titleVideo || titleVideo.classList.contains("hidden")) return;
  if (!titleVideo.getAttribute("src")) return;
  titleVideo.muted = true;
  const p = titleVideo.play();
  if (p && typeof p.catch === "function") {
    // Autoplay blocked or missing file — leave still image underneath
    p.catch(() => {});
  }
}

function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle("active", k === name);
  }
  if (name === "title") ensureTitleVideo();
  else if (titleVideo && !titleVideo.paused) titleVideo.pause();
}

// ——— DOM refs ———
const canvas = $("#game-canvas");
const hudDepth = $("#hud-depth");
const hudHearts = $("#hud-hearts");
const hudSpiritFill = $("#hud-spirit-fill");
const hudSpiritText = $("#hud-spirit-text");
const hudSpiritBeads = $("#hud-spirit-beads");
const hudSpiritTicks = $("#hud-spirit-ticks");
const kiGauge = document.querySelector(".ki-gauge");
const statusLine = $("#status-line");

/** SVG ring circumference for r=22 */
const KI_RING_C = 2 * Math.PI * 22;

function buildKiTicks() {
  if (!hudSpiritTicks || hudSpiritTicks.childElementCount) return;
  // 10 tick marks around the ring (in unrotated viewBox coords; svg is rotated -90deg)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x1 = 28 + Math.cos(a) * 18.5;
    const y1 = 28 + Math.sin(a) * 18.5;
    const x2 = 28 + Math.cos(a) * 21.2;
    const y2 = 28 + Math.sin(a) * 21.2;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1.toFixed(2));
    line.setAttribute("y1", y1.toFixed(2));
    line.setAttribute("x2", x2.toFixed(2));
    line.setAttribute("y2", y2.toFixed(2));
    line.dataset.i = String(i);
    hudSpiritTicks.appendChild(line);
  }
}

function updateKiMeter(energy, maxEnergy) {
  const pct = Math.max(0, Math.min(1, energy / Math.max(1, maxEnergy)));
  if (hudSpiritFill) {
    hudSpiritFill.style.strokeDasharray = String(KI_RING_C);
    hudSpiritFill.style.strokeDashoffset = String(KI_RING_C * (1 - pct));
  }
  if (hudSpiritText) {
    hudSpiritText.textContent = String(energy);
    hudSpiritText.title = `${energy} / ${maxEnergy}`;
  }
  if (kiGauge) {
    kiGauge.classList.toggle("ki-full", pct >= 0.99);
    kiGauge.classList.toggle("ki-low", pct > 0 && pct <= 0.25);
    kiGauge.classList.toggle("ki-empty", pct <= 0);
  }
  // Magatama-style beads: 10 slots
  if (hudSpiritBeads) {
    const slots = 10;
    if (hudSpiritBeads.childElementCount !== slots) {
      hudSpiritBeads.innerHTML = "";
      for (let i = 0; i < slots; i++) {
        const b = document.createElement("div");
        b.className = "ki-bead";
        hudSpiritBeads.appendChild(b);
      }
    }
    const beads = hudSpiritBeads.children;
    const filled = pct * slots;
    for (let i = 0; i < slots; i++) {
      beads[i].classList.remove("on", "partial");
      if (i < Math.floor(filled)) beads[i].classList.add("on");
      else if (i < filled) beads[i].classList.add("partial");
    }
  }
  // Light ticks up to current percent
  if (hudSpiritTicks) {
    buildKiTicks();
    const lit = Math.round(pct * 10);
    hudSpiritTicks.querySelectorAll("line").forEach((line, i) => {
      line.classList.toggle("lit", i < lit);
    });
  }
}
const floatMsg = $("#float-msg");
const modeButtons = document.querySelectorAll(".mode-btn");
const modalBlessing = $("#modal-blessing");
const blessingOptions = $("#blessing-options");
const modalPause = $("#modal-pause");
const modalDeath = $("#modal-death");
const modalWin = $("#modal-win");
const deathMsg = $("#death-msg");
const deathStats = $("#death-stats");
const winStats = $("#win-stats");

const renderer = new Renderer(canvas);
const btnStart = $("#btn-start");
let floatTimer = null;
let animId = null;
let helpReturn = "title";

function showFloat(text, danger = false) {
  floatMsg.textContent = text;
  floatMsg.classList.toggle("danger", danger);
  floatMsg.classList.remove("hidden");
  clearTimeout(floatTimer);
  floatTimer = setTimeout(() => floatMsg.classList.add("hidden"), 2200);
}

const hitFlash = $("#hit-flash");
function flashHit() {
  if (!hitFlash) return;
  hitFlash.classList.remove("flash");
  // Retrigger CSS animation
  void hitFlash.offsetWidth;
  hitFlash.classList.add("flash");
}

function updateHud(state) {
  hudDepth.textContent = String(state.depth);

  hudHearts.innerHTML = "";
  for (let i = 0; i < state.player.maxHp; i++) {
    const h = document.createElement("div");
    h.className = "heart" + (i < state.player.hp ? "" : " empty");
    hudHearts.appendChild(h);
  }

  updateKiMeter(state.player.energy, state.player.maxEnergy);

  // Mode buttons — Keri/yari state is visible here (disabled when unavailable)
  for (const btn of modeButtons) {
    const mode = btn.dataset.mode;
    btn.classList.toggle("active", mode === state.mode);
    if (mode === "bash") {
      btn.disabled = state.player.bashCooldown > 0;
      const label = btn.querySelector("span:last-child");
      if (label) {
        label.textContent =
          state.player.bashCooldown > 0 ? `Keri (${state.player.bashCooldown})` : "Keri";
      }
    } else if (mode === "throw") {
      btn.disabled = !state.player.hasYari;
    } else if (mode === "wait") {
      btn.disabled = !state.player.blessings.has("patience");
    } else {
      btn.disabled = false;
    }
  }

  // Status
  const tips = {
    move: "Green stones: Ayumi · Blue: Hishō · Gold shrine: step close, then touch it.",
    bash: "Point Keri at a neighboring stone.",
    throw: "Name a stone for the thrown wakizashi.",
    wait: "Tamerau — still the breath (Space).",
  };
  statusLine.textContent = tips[state.mode] || "";
}

function resize() {
  const stage = $("#stage");
  const rect = stage.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
  if (game) {
    const state = game.getState();
    // radius from map — count max distance from 0,0
    let radius = 4;
    for (const t of state.tiles.values()) {
      radius = Math.max(radius, Math.max(Math.abs(t.hex.q), Math.abs(t.hex.r), Math.abs(t.hex.s)));
    }
    renderer.fitToMap(radius);
    redraw();
  }
}

function redraw() {
  if (!game) return;
  const state = game.getState();
  renderer.setHighlights(game.getHighlights());
  renderer.draw(state);
}

let game = null;

function startGame() {
  hideModals();
  game = new Game({
    onStateChange(state) {
      updateHud(state);
      redraw();
    },
    onMessage(msg) {
      showFloat(msg, /strike|arrow|beam|bomb|Fallen|damage|club|fire|grief|talisman/i.test(msg));
    },
    onHit() {
      flashHit();
    },
    onFx(fx) {
      renderer.addFx(fx);
    },
    onBlessing(options, choose) {
      blessingOptions.innerHTML = "";
      for (const b of options) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "blessing-card";
        card.innerHTML = `
          <h4>${b.nameJa} · ${b.name}</h4>
          <p>${b.desc}</p>
          ${b.requireLabel ? `<div class="req">Path: ${b.requireLabel}</div>` : ""}
          ${b.cost > 0 ? `<div class="cost">Offers ${b.cost} Inochi in blood</div>` : ""}
        `;
        card.addEventListener("click", () => {
          modalBlessing.classList.add("hidden");
          choose(b.id);
        });
        blessingOptions.appendChild(card);
      }
      modalBlessing.classList.remove("hidden");
      $("#btn-skip-blessing").onclick = () => {
        modalBlessing.classList.add("hidden");
        choose(null);
      };
    },
    onDeath(killer, stats) {
      deathMsg.textContent = `It was ${killer} that closed the story.`;
      deathStats.textContent = `Stratum ${stats.depth} · ${stats.kills} felled · ${stats.turns} breaths`;
      modalDeath.classList.remove("hidden");
    },
    onWin(stats) {
      winStats.textContent = `${stats.kills} yokai left behind · ${stats.turns} breaths in the dark`;
      modalWin.classList.remove("hidden");
    },
  });

  // Playtest / debug access
  window.__YOMI__ = { game, renderer };

  showScreen("game");
  resize();
  startLoop();
}

function hideModals() {
  modalBlessing.classList.add("hidden");
  modalPause.classList.add("hidden");
  modalDeath.classList.add("hidden");
  modalWin.classList.add("hidden");
}

function startLoop() {
  cancelAnimationFrame(animId);
  const tick = () => {
    redraw();
    animId = requestAnimationFrame(tick);
  };
  animId = requestAnimationFrame(tick);
}

// ——— Events ———
$("#btn-start").addEventListener("click", () => {
  if (btnStart.disabled) return;
  startGame();
});
$("#btn-help").addEventListener("click", () => {
  helpReturn = "title";
  showScreen("help");
});
$("#btn-help-back").addEventListener("click", () => {
  showScreen(helpReturn === "game" ? "game" : "title");
  if (helpReturn === "game") resize();
});

$("#btn-menu").addEventListener("click", () => {
  modalPause.classList.remove("hidden");
});
$("#btn-resume").addEventListener("click", () => modalPause.classList.add("hidden"));
$("#btn-restart").addEventListener("click", () => {
  hideModals();
  startGame();
});
$("#btn-to-title").addEventListener("click", () => {
  hideModals();
  showScreen("title");
  cancelAnimationFrame(animId);
});
$("#btn-how").addEventListener("click", () => {
  modalPause.classList.add("hidden");
  helpReturn = "game";
  showScreen("help");
});

$("#btn-death-retry").addEventListener("click", startGame);
$("#btn-death-title").addEventListener("click", () => {
  hideModals();
  showScreen("title");
});
$("#btn-win-again").addEventListener("click", startGame);
$("#btn-win-title").addEventListener("click", () => {
  hideModals();
  showScreen("title");
});

for (const btn of modeButtons) {
  btn.addEventListener("click", () => {
    if (!game) return;
    const mode = btn.dataset.mode;
    if (mode === "wait") {
      if (game.player.blessings.has("patience")) {
        game.doWait();
      }
      return;
    }
    game.setMode(mode);
  });
}

function canvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const src = evt.touches ? evt.touches[0] : evt;
  return {
    x: src.clientX - rect.left,
    y: src.clientY - rect.top,
  };
}

canvas.addEventListener("pointermove", (evt) => {
  if (!game) return;
  const { x, y } = canvasPos(evt);
  const hex = renderer.screenToHex(x, y);
  renderer.hoverHex = hex;
  // Contextual status
  const st = game.getState();
  if (!st.tiles.has(hex.key())) return;
  const tile = st.tiles.get(hex.key());
  const enemy = st.enemies.find((e) => e.alive && e.hex.equals(hex));
  if (enemy) {
    const ready =
      enemy.type === "bakemono"
        ? enemy.charge >= 2
          ? "ready"
          : "charging"
        : enemy.type === "onryo"
          ? enemy.charge >= 1
            ? "ready"
            : "resting"
          : null;
    const names = {
      oni: "Oni — red stones: club reach (adjacent).",
      tengu: "Tengu — red stones: arrow lines (range 2–5).",
      bakemono: `Bakemono — red: bomb reach & blast${ready ? ` (${ready})` : ""}.`,
      onryo: `Onryō — red stones: fire beams${ready ? ` (${ready})` : ""}.`,
    };
    statusLine.textContent = names[enemy.type] || "Something that should not walk.";
  } else if (st.exit && hex.equals(st.exit)) {
    statusLine.textContent =
      st.depth === 16
        ? "The last gate — only with the Magatama"
        : "Torii — the way under, if the wakizashi is yours";
  } else if (st.shrine && hex.equals(st.shrine) && !st.prayed) {
    statusLine.textContent = game.canPray()
      ? "Wayside shrine — touch it to hear the kami"
      : "Wayside shrine — stand on its threshold first";
  } else if (st.magatama && hex.equals(st.magatama)) {
    statusLine.textContent = "Magatama — the stolen soul-bead";
  } else if (tile.type === "abyss") {
    statusLine.textContent = "Black water — what falls in does not climb out";
  } else if (st.player.yariHex && hex.equals(st.player.yariHex)) {
    statusLine.textContent = "Your wakizashi — step here to take it back";
  }
});

canvas.addEventListener("pointerleave", () => {
  renderer.hoverHex = null;
  renderer.hoverThreat = null;
});

canvas.addEventListener("pointerdown", (evt) => {
  if (!game) return;
  if (evt.button !== undefined && evt.button !== 0) return;
  if (!modalBlessing.classList.contains("hidden")) return;
  if (!modalPause.classList.contains("hidden")) return;
  if (!modalDeath.classList.contains("hidden")) return;
  if (!modalWin.classList.contains("hidden")) return;
  const { x, y } = canvasPos(evt);
  const hex = renderer.screenToHex(x, y);
  game.handleHexClick(hex);
});

window.addEventListener("keydown", (evt) => {
  if (!game || screens.game.classList.contains("active") === false) return;
  if (modalBlessing && !modalBlessing.classList.contains("hidden")) return;
  if (!modalDeath.classList.contains("hidden") || !modalWin.classList.contains("hidden")) return;

  const key = evt.key.toLowerCase();
  if (key === "1" || key === "m") game.setMode("move");
  if (key === "2" || key === "b") game.setMode("bash");
  if (key === "3" || key === "t") game.setMode("throw");
  if (key === "p") {
    if (game.canPray()) game.doPray();
    else showFloat("Draw closer. The shrine only hears those at its threshold.");
  }
  if (key === " " || key === "4") {
    if (game.player.blessings.has("patience")) {
      evt.preventDefault();
      game.doWait();
    }
  }
  if (key === "escape") {
    if (modalPause.classList.contains("hidden")) modalPause.classList.remove("hidden");
    else modalPause.classList.add("hidden");
  }
});

window.addEventListener("resize", resize);

// Boot — preload art, then enable play
btnStart.disabled = true;
btnStart.textContent = "The dark gathers…";

loadAssets()
  .then(() => {
    btnStart.disabled = false;
    btnStart.textContent = "Cross the Threshold";
  })
  .catch(() => {
    btnStart.disabled = false;
    btnStart.textContent = "Cross the Threshold";
  });

buildKiTicks();
updateKiMeter(100, 100);
showScreen("title");
