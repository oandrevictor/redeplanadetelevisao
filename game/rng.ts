import type { GameState } from "./types";

function xmur3(value: string): number {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function createRng(seed: string): GameState["rng"] {
  const normalized = seed.trim() || "rede-plana";
  return {
    seed: normalized,
    state: [0, 1, 2, 3].map((index) => xmur3(`${normalized}:${index}`)),
    counter: 0,
  };
}

export function nextRandom(rng: GameState["rng"]): [number, GameState["rng"]] {
  const state = [...rng.state];
  const result = Math.imul(((state[1] * 5) >>> 0), 0x7ffff) >>> 0;
  const value = (((result << 7) | (result >>> 25)) * 9) >>> 0;
  const temporary = (state[1] << 9) >>> 0;
  state[2] ^= state[0];
  state[3] ^= state[1];
  state[1] ^= state[2];
  state[0] ^= state[3];
  state[2] ^= temporary;
  state[3] = ((state[3] << 11) | (state[3] >>> 21)) >>> 0;
  return [value / 4294967296, { ...rng, state: state.map((item) => item >>> 0), counter: rng.counter + 1 }];
}

export function randomInt(rng: GameState["rng"], maximum: number): [number, GameState["rng"]] {
  if (!Number.isInteger(maximum) || maximum <= 0) throw new Error("maximum must be a positive integer");
  const [value, next] = nextRandom(rng);
  return [Math.floor(value * maximum), next];
}
