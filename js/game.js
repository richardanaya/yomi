/**
 * Game state machine: floors, turns, UI bindings.
 */

import { generateMap, hashSeed } from "./map.js";
import {
  createPlayer,
  getWalkTargets,
  getLeapTargets,
  getBashTargets,
  getThrowTargets,
  performMove,
  performBash,
  performThrow,
  tickBashCooldown,
} from "./combat.js";
import { enemyTurn } from "./ai.js";
import { offerBlessings, applyBlessing } from "./upgrades.js";

export class Game {
  constructor({ onStateChange, onMessage, onBlessing, onDeath, onWin, onFloorClear, onHit, onFx }) {
    this.cbs = { onStateChange, onMessage, onBlessing, onDeath, onWin, onFloorClear, onHit, onFx };
    this.mode = "move"; // move | bash | throw | wait
    this.runSeed = Date.now();
    this.resetRun();
  }

  resetRun() {
    this.player = createPlayer();
    this.depth = 1;
    this.totalKills = 0;
    this.turn = 0;
    this.busy = false;
    this.mode = "move";
    this.loadFloor();
  }

  loadFloor() {
    const seed = hashSeed(this.runSeed, this.depth);
    const map = generateMap(this.depth, seed);
    this.tiles = map.tiles;
    this.spawn = map.spawn;
    this.exit = map.exit;
    this.shrine = map.shrine;
    this.magatama = map.magatama;
    this.enemies = map.enemies;
    this.prayed = false;
    this.bombs = [];
    this.player.hex = map.spawn;
    this.player.energy = this.player.maxEnergy;
    this.player.regenUsedThisFloor = false;
    this.player.killStreak = 0;
    // Keep wakizashi across floors if held; if thrown on previous floor, restore
    if (!this.player.hasYari) {
      this.player.hasYari = true;
      this.player.yariHex = null;
    }
    this.emit();
    this.cbs.onMessage?.(
      this.depth === 1
        ? "The first stones. Find the torii before the dark finds you."
        : `Stratum ${this.depth}. Another gate waits in the mist.`
    );
  }

  getState() {
    return {
      depth: this.depth,
      tiles: this.tiles,
      spawn: this.spawn,
      exit: this.exit,
      shrine: this.shrine,
      magatama: this.magatama,
      enemies: this.enemies,
      bombs: this.bombs,
      prayed: this.prayed,
      player: this.player,
      mode: this.mode,
      turn: this.turn,
    };
  }

  emit() {
    this.cbs.onStateChange?.(this.getState());
  }

  setMode(mode) {
    if (this.busy) return;
    if (mode === "wait" && !this.player.blessings.has("patience")) return;
    if (mode === "bash" && this.player.bashCooldown > 0) {
      this.cbs.onMessage?.("Your foot has not settled. Keri still sleeps.");
      return;
    }
    if (mode === "throw" && !this.player.hasYari) {
      this.cbs.onMessage?.("The wakizashi is elsewhere.");
      return;
    }
    this.mode = mode;
    this.emit();
  }

  getHighlights() {
    const state = this.getState();
    const entries = [];
    if (this.mode === "move") {
      for (const h of getWalkTargets(state)) entries.push([h.key(), "walk"]);
      for (const h of getLeapTargets(state)) entries.push([h.key(), "leap"]);
    } else if (this.mode === "bash") {
      for (const h of getBashTargets(state)) entries.push([h.key(), "bash"]);
    } else if (this.mode === "throw") {
      for (const h of getThrowTargets(state)) entries.push([h.key(), "throw"]);
    }
    // Shrine is clickable when adjacent (any mode)
    if (this.canPray() && this.shrine) {
      entries.push([this.shrine.key(), "bash"]);
    }
    return entries;
  }

  canPray() {
    if (this.prayed || !this.shrine) return false;
    return this.player.hex.distance(this.shrine) === 1;
  }

  handleHexClick(hex) {
    if (this.busy) return;
    if (!this.tiles.has(hex.key())) return;

    // Click shrine to pray (when standing beside it)
    if (this.shrine && hex.equals(this.shrine) && !this.prayed) {
      if (this.canPray()) {
        this.doPray();
      } else {
        this.cbs.onMessage?.("Draw closer. The shrine only hears those at its threshold.");
      }
      return;
    }

    if (this.mode === "move") {
      this.tryMove(hex);
    } else if (this.mode === "bash") {
      this.tryBash(hex);
    } else if (this.mode === "throw") {
      this.tryThrow(hex);
    }
  }

  /** Flash cut VFX on every yokai that just died. */
  emitKillFx(killed) {
    if (!killed?.length) return;
    const fx = killed.map((e, i) => ({
      type: "slash",
      at: { q: e.hex.q, r: e.hex.r },
      duration: 420,
      delay: i * 45,
      // Slight variety so multi-kills don't stack perfectly
      angle: -0.75 + (i % 4) * 0.4,
      style: e._killStyle || "cut",
    }));
    this.cbs.onFx?.(fx);
  }

  tryMove(hex) {
    const state = this.getState();
    const walk = getWalkTargets(state);
    const leap = getLeapTargets(state);

    const isWalk = walk.some((h) => h.equals(hex));
    const isLeap = leap.some((h) => h.equals(hex));

    if (!isWalk && !isLeap) {
      this.cbs.onMessage?.("That stone will not take your weight.");
      return;
    }

    // Ayumi takes priority over Hishō if somehow both (they shouldn't overlap)
    const usedLeap = isLeap && !isWalk;
    const result = performMove(state, hex, { leap: usedLeap });

    this.syncFrom(state);
    this.emitKillFx(result.killed);
    this.afterPlayerAction(result.msgs);
  }

  tryBash(hex) {
    const state = this.getState();
    const targets = getBashTargets(state);
    if (!targets.some((h) => h.equals(hex))) {
      this.cbs.onMessage?.("Keri only reaches the stones at your side.");
      return;
    }
    const result = performBash(state, hex);
    this.syncFrom(state);
    this.mode = "move";
    this.emitKillFx(result.killed);
    this.afterPlayerAction(result.msgs);
  }

  tryThrow(hex) {
    const state = this.getState();
    const targets = getThrowTargets(state);
    if (!targets.some((h) => h.equals(hex))) {
      this.cbs.onMessage?.("Too far for the thrown wakizashi.");
      return;
    }
    const result = performThrow(state, hex);
    this.syncFrom(state);
    this.mode = "move";
    this.emitKillFx(result.killed);
    this.afterPlayerAction(result.msgs);
  }

  doWait() {
    if (!this.player.blessings.has("patience")) return;
    this.afterPlayerAction(["Tamerau. The breath stills. The dark moves."]);
  }

  doPray() {
    if (!this.canPray()) {
      this.cbs.onMessage?.("Draw closer. The shrine only hears those at its threshold.");
      return;
    }
    this.prayed = true;
    const options = offerBlessings(this.player, 3);
    this.busy = true;
    this.emit();
    this.cbs.onBlessing?.(options, (chosenId) => {
      if (chosenId) {
        const ok = applyBlessing(this.player, chosenId);
        if (!ok) {
          this.cbs.onMessage?.("The gift demands blood you cannot spare.");
        } else {
          this.cbs.onMessage?.("Something old settles into your bones.");
        }
      }
      this.busy = false;
      this.mode = "move";
      // Praying costs a turn
      this.afterPlayerAction(chosenId ? [] : ["You leave the shrine unanswered."]);
    });
  }

  syncFrom(state) {
    this.player = state.player;
    this.enemies = state.enemies;
    this.bombs = state.bombs;
    this.magatama = state.magatama;
    this.prayed = state.prayed;
  }

  afterPlayerAction(msgs = []) {
    for (const m of msgs) this.cbs.onMessage?.(m);

    // Check exit
    if (this.player.hex.equals(this.exit)) {
      this.onReachExit();
      return;
    }

    // Enemy turn
    const hpBefore = this.player.hp;
    const state = this.getState();
    const result = enemyTurn(state);
    this.syncFrom(state);
    tickBashCooldown(this.getState());
    this.turn += 1;

    const damage = hpBefore - this.player.hp;
    if (damage > 0) {
      this.cbs.onHit?.(damage);
    }

    if (result.fx?.length) {
      this.cbs.onFx?.(result.fx);
    }

    for (const m of result.log) this.cbs.onMessage?.(m);

    if (result.dead || this.player.hp <= 0) {
      this.player.hp = 0;
      this.emit();
      this.cbs.onDeath?.(result.killer || "a yokai", {
        depth: this.depth,
        kills: this.player.kills,
        turns: this.turn,
      });
      return;
    }

    this.mode = "move";
    this.emit();
  }

  onReachExit() {
    if (this.depth === 16) {
      if (!this.player.hasMagatama) {
        this.cbs.onMessage?.("The last gate wants the Magatama in your hand.");
        this.emit();
        return;
      }
      this.emit();
      this.cbs.onWin?.({
        depth: this.depth,
        kills: this.player.kills,
        turns: this.turn,
      });
      return;
    }

    this.depth += 1;
    this.cbs.onMessage?.(`The torii takes you under. Stratum ${this.depth}.`);
    this.loadFloor();
  }
}
