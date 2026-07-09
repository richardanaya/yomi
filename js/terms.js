/**
 * Player-facing language for YOMI.
 * Combat is footwork: steel only speaks when the body arrives.
 */

export const TERMS = {
  weapon: "Wakizashi",
  weaponJa: "脇差",
  weaponFull: "Wakizashi (脇差)",
  blade: "Katana",
  bladeJa: "刀",

  slash: "Nadegiri",
  slashJa: "撫斬",
  slashDesc:
    "A brushing cut. If your step grazes a yokai on both sides of the path, the edge finishes what the feet began.",

  thrust: "Tsuki",
  thrustJa: "突",
  thrustDesc:
    "A katana thrust. Commit toward a yokai with at least one empty stone between you. You never step onto their body.",

  move: "Ayumi",
  moveJa: "歩",
  moveDesc: "One careful step onto neighboring stone.",

  leap: "Hishō",
  leapJa: "飛翔",
  leapDesc: "A spirit-bound jump across the stones. Drains Ki.",

  bash: "Keri",
  bashJa: "蹴",
  bashDesc:
    "A driving kick (keri). Send a yokai stumbling—into black water if fortune is cruel to them.",

  throw: "Nage",
  throwJa: "投",
  throwDesc:
    "Hurl the wakizashi. Until you reclaim it, the torii will not open. The katana stays for Tsuki.",

  wait: "Tamerau",
  waitJa: "躊躇",
  waitDesc: "Still the breath. Let the dead move first.",

  pray: "Inoru",
  prayJa: "祈",

  energy: "Ki",
  energyJa: "氣",
  vitality: "Inochi",
  vitalityJa: "命",

  held: "Gripped",
  thrown: "Released",
  ready: "Ready",
};

export const MODE_LABELS = {
  move: "Ayumi",
  bash: "Keri",
  throw: "Nage",
  wait: "Tamerau",
};
