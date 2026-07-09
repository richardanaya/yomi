/**
 * Load and cache game art (Grok Imagine assets).
 */

const MANIFEST = {
  samurai: "assets/samurai.png",
  samuraiUnarmed: "assets/samurai-unarmed.png",
  oni: "assets/oni.png",
  tengu: "assets/tengu.png",
  bakemono: "assets/bakemono.png",
  onryo: "assets/onryo.png",
  land: "assets/land.jpg",
  abyss: "assets/abyss.jpg",
  shrine: "assets/shrine.png",
  torii: "assets/torii.png",
  magatama: "assets/magatama.png",
  yari: "assets/wakizashi.png", // thrown short blade (legacy key)
  wakizashi: "assets/wakizashi.png",
  bomb: "assets/bomb.png",
  keri: "assets/keri.png",
  title: "assets/title.jpg",
};

const cache = new Map();
let ready = false;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function loadAssets() {
  if (ready) return cache;
  const entries = Object.entries(MANIFEST);
  await Promise.all(
    entries.map(async ([key, src]) => {
      try {
        const img = await loadImage(src);
        cache.set(key, img);
      } catch (err) {
        console.warn(err.message);
      }
    })
  );
  ready = true;
  return cache;
}

export function getAsset(key) {
  return cache.get(key) || null;
}

export function assetsReady() {
  return ready;
}
