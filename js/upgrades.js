/**
 * Gifts left at wayside shrines in Yomi.
 * Each is a scrap of doctrine, not a stat sheet.
 */

export const BLESSINGS = {
  restoration: {
    id: "restoration",
    name: "Mizuagari",
    nameJa: "水揚",
    desc: "Wash the blood from your body. Inochi returns in full.",
    cost: 0,
    apply(player) {
      player.hp = player.maxHp;
    },
  },
  fortitude: {
    id: "fortitude",
    name: "Kōtetsu",
    nameJa: "鋼鉄",
    desc: "The flesh hardens like lacquered armor. +1 max Inochi, and heal 1.",
    cost: 0,
    maxOnce: false,
    canOffer(player) {
      return player.maxHp < 8;
    },
    apply(player) {
      player.maxHp = Math.min(8, player.maxHp + 1);
      player.hp = Math.min(player.maxHp, player.hp + 1);
    },
  },
  bloodlust: {
    id: "bloodlust",
    name: "Chishio",
    nameJa: "血潮",
    desc: "Every yokai that falls feeds your Ki (+6).",
    cost: 1,
    apply(player) {
      player.blessings.add("bloodlust");
    },
  },
  mightyBash: {
    id: "mightyBash",
    name: "Iron Keri",
    nameJa: "鉄蹴",
    desc: "Your Keri drives foes two stones back, not one.",
    cost: 0,
    apply(player) {
      player.blessings.add("mightyBash");
      player.bashPower = 2;
    },
  },
  sweepingBash: {
    id: "sweepingBash",
    name: "Sweeping Keri",
    nameJa: "扇蹴",
    desc: "Keri fans outward—an arc of bodies, not a single shove. Opens the path to Mawashi-geri.",
    cost: 0,
    // Superseded once you have the full circle
    canOffer(player) {
      return !player.blessings.has("spinningBash");
    },
    apply(player) {
      player.blessings.add("sweepingBash");
    },
  },
  spinningBash: {
    id: "spinningBash",
    name: "Mawashi-geri",
    nameJa: "回し蹴",
    desc: "Keri becomes a full circle. Everything beside you reels.",
    cost: 0,
    requires: ["sweepingBash"],
    requireLabel: "扇蹴 · Sweeping Keri",
    apply(player) {
      player.blessings.add("spinningBash");
    },
  },
  quickBash: {
    id: "quickBash",
    name: "Swift Keri",
    nameJa: "迅蹴",
    desc: "Your foot returns to ready sooner. Keri recovers faster.",
    cost: 0,
    apply(player) {
      player.blessings.add("quickBash");
      player.bashCooldownMax = 3;
    },
  },
  greaterThrow: {
    id: "greaterThrow",
    name: "Tōnage",
    nameJa: "遠投",
    desc: "The released wakizashi flies farther into the dark.",
    cost: 0,
    apply(player) {
      player.throwRange += 1;
    },
  },
  greaterThrow2: {
    id: "greaterThrow2",
    name: "Tōnage · Ni",
    nameJa: "遠投・弐",
    desc: "Still farther. The short blade drinks distance.",
    cost: 1,
    requires: ["greaterThrow"],
    requireLabel: "遠投 · Tōnage",
    apply(player) {
      player.throwRange += 1;
      player.blessings.add("greaterThrow2");
    },
  },
  greaterEnergy: {
    id: "greaterEnergy",
    name: "Ki-okoshi",
    nameJa: "氣起",
    desc: "The breath deepens. Max Ki rises by 20.",
    cost: 0,
    apply(player) {
      player.maxEnergy += 20;
      player.energy = Math.min(player.maxEnergy, player.energy + 20);
    },
  },
  greaterEnergy2: {
    id: "greaterEnergy2",
    name: "Ki-okoshi · Ni",
    nameJa: "氣起・弐",
    desc: "Deeper still. Max Ki rises by 15 more.",
    cost: 1,
    requires: ["greaterEnergy"],
    requireLabel: "氣起 · Ki-okoshi",
    apply(player) {
      player.maxEnergy += 15;
      player.energy = Math.min(player.maxEnergy, player.energy + 15);
      player.blessings.add("greaterEnergy2");
    },
  },
  deepLunge: {
    id: "deepLunge",
    name: "Kan-tsuki",
    nameJa: "貫突",
    desc: "Tsuki does not stop at the first body. The line continues.",
    cost: 0,
    apply(player) {
      player.blessings.add("deepLunge");
    },
  },
  patience: {
    id: "patience",
    name: "Tamerau",
    nameJa: "躊躇",
    desc: "Learn to still the feet. Skip a turn and let the dead commit.",
    cost: 0,
    apply(player) {
      player.blessings.add("patience");
    },
  },
  wingedSandals: {
    id: "wingedSandals",
    name: "Tengu-geta",
    nameJa: "天狗下駄",
    desc: "Borrowed wings of the mountain. Hishō reaches one stone farther. Opens the path to Rakka.",
    cost: 1,
    apply(player) {
      player.leapRange += 1;
      player.blessings.add("wingedSandals");
    },
  },
  staggeringLeap: {
    id: "staggeringLeap",
    name: "Rakka",
    nameJa: "落花",
    desc: "Where you land, nearby yokai stagger—stunned for a breath.",
    cost: 2,
    requires: ["wingedSandals"],
    requireLabel: "天狗下駄 · Tengu-geta",
    apply(player) {
      player.blessings.add("staggeringLeap");
    },
  },
  regeneration: {
    id: "regeneration",
    name: "Ikikaeri",
    nameJa: "生き返",
    desc: "Once per stratum: three kills in three breaths mend 1 Inochi.",
    cost: 1,
    apply(player) {
      player.blessings.add("regeneration");
    },
  },
  surge: {
    id: "surge",
    name: "Hatsunori",
    nameJa: "初乗",
    desc: "Three kills in three breaths: Ki floods full, Keri resets, the wakizashi returns to the hand.",
    cost: 1,
    apply(player) {
      player.blessings.add("surge");
    },
  },
};

const POOL = Object.keys(BLESSINGS);

/** Whether a prerequisite blessing / rank is already on the path. */
export function hasBlessingReq(player, reqId) {
  if (player.blessings.has(reqId)) return true;
  // Some ranks are tracked on stats as well as the set
  if (reqId === "greaterThrow" && player.throwRange >= 3) return true;
  if (reqId === "greaterEnergy" && player.maxEnergy >= 120) return true;
  return false;
}

export function offerBlessings(player, count = 3, rng = Math.random) {
  const owned = player.blessings;
  const candidates = POOL.filter((id) => {
    const b = BLESSINGS[id];
    if (owned.has(id)) return false;
    // Rank I already taken via stats
    if (id === "greaterThrow" && (owned.has("greaterThrow") || player.throwRange > 2)) return false;
    if (id === "greaterThrow2" && (owned.has("greaterThrow2") || player.throwRange >= 4)) return false;
    if (id === "greaterEnergy" && (owned.has("greaterEnergy") || player.maxEnergy > 100)) return false;
    if (id === "greaterEnergy2" && (owned.has("greaterEnergy2") || player.maxEnergy >= 135)) return false;
    // Skill chains — must walk the earlier form first
    if (b.requires) {
      for (const r of b.requires) {
        if (!hasBlessingReq(player, r)) return false;
      }
    }
    if (b.canOffer && !b.canOffer(player)) return false;
    return true;
  });

  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const picks = [];
  if (player.hp < player.maxHp && shuffled.includes("restoration")) {
    picks.push("restoration");
  }

  for (const id of shuffled) {
    if (picks.length >= count) break;
    if (!picks.includes(id)) picks.push(id);
  }

  return picks.map((id) => BLESSINGS[id]);
}

export function applyBlessing(player, blessingId) {
  const b = BLESSINGS[blessingId];
  if (!b) return false;
  if (b.cost > 0) {
    if (player.hp <= b.cost) return false;
    player.hp -= b.cost;
  }
  b.apply(player);
  if (
    blessingId !== "restoration" &&
    blessingId !== "fortitude" &&
    blessingId !== "greaterEnergy" &&
    blessingId !== "greaterEnergy2" &&
    blessingId !== "greaterThrow" &&
    blessingId !== "greaterThrow2"
  ) {
    player.blessings.add(blessingId);
  } else if (
    [
      "bloodlust",
      "mightyBash",
      "sweepingBash",
      "spinningBash",
      "quickBash",
      "deepLunge",
      "patience",
      "wingedSandals",
      "staggeringLeap",
      "regeneration",
      "surge",
    ].includes(blessingId)
  ) {
    player.blessings.add(blessingId);
  } else {
    if (blessingId === "greaterThrow") player.blessings.add("greaterThrow");
    if (blessingId === "greaterThrow2") player.blessings.add("greaterThrow2");
    if (blessingId === "greaterEnergy") player.blessings.add("greaterEnergy");
    if (blessingId === "greaterEnergy2") player.blessings.add("greaterEnergy2");
  }
  return true;
}
