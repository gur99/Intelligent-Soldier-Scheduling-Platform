// Simple deterministic pseudo-random generator (Mulberry32-style)

export function createSeededRNG(seedInput) {
  let seed = 0;
  if (typeof seedInput === "number" && Number.isFinite(seedInput)) {
    seed = seedInput;
  } else if (typeof seedInput === "string" && seedInput.trim() !== "") {
    // Hash string to 32-bit int
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedInput.length; i++) {
      h ^= seedInput.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    seed = h >>> 0;
  } else {
    seed = Date.now() >>> 0;
  }

  let state = seed || 1;

  function next() {
    // Mulberry32
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return next;
}

