import { collectInvariantErrors } from "../invariants";
import type { GameState } from "../types";

export const SAVE_FORMAT = "rede-plana-season";

export type SeasonSave = {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  engineVersion: string;
  catalogVersion: string;
  seasonId: string;
  seed: string;
  savedAt: string;
  snapshot: GameState;
};

export function serializeSeason(state: GameState): string {
  const envelope: SeasonSave = {
    format: SAVE_FORMAT,
    schemaVersion: state.schemaVersion,
    engineVersion: state.engineVersion,
    catalogVersion: state.catalogVersion,
    seasonId: state.seasonId,
    seed: state.rng.seed,
    savedAt: new Date().toISOString(),
    snapshot: state,
  };
  return JSON.stringify(envelope);
}

export function deserializeSeason(value: string): SeasonSave | null {
  try {
    const parsed = JSON.parse(value) as Partial<SeasonSave>;
    if (parsed.format !== SAVE_FORMAT || !parsed.snapshot) return null;
    if (parsed.schemaVersion !== parsed.snapshot.schemaVersion) return null;
    if (parsed.engineVersion !== parsed.snapshot.engineVersion) return null;
    if (parsed.catalogVersion !== parsed.snapshot.catalogVersion) return null;
    if (collectInvariantErrors(parsed.snapshot).length > 0) return null;
    return parsed as SeasonSave;
  } catch {
    return null;
  }
}
