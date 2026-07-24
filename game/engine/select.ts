import { nextRandom } from "../rng";
import type { GameState } from "../types";
import type { EventCandidate } from "./enumerate";

export function selectCandidate(
  candidates: EventCandidate[],
  rng: GameState["rng"],
): { candidate: EventCandidate | null; rng: GameState["rng"] } {
  if (candidates.length === 0) return { candidate: null, rng };
  const best = Math.max(...candidates.map((candidate) => candidate.score));
  const pool = candidates.filter((candidate) => candidate.score >= best - 18);
  const minimum = Math.min(...pool.map((candidate) => candidate.score));
  const weights = pool.map((candidate) => Math.max(1, candidate.score - minimum + 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const [roll, nextRng] = nextRandom(rng);
  let cursor = roll * total;
  for (let index = 0; index < pool.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return { candidate: pool[index], rng: nextRng };
  }
  return { candidate: pool[pool.length - 1], rng: nextRng };
}
