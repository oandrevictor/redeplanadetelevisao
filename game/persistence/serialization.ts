import { collectInvariantErrors } from "../invariants";
import { migrateSeason } from "./migrations";
import { CATALOG_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from "../state";
import type { GameCommand } from "../commands";
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
  actionLog: GameCommand[];
};

export function serializeSeason(state: GameState, actionLog: GameCommand[] = []): string {
  const envelope: SeasonSave = {
    format: SAVE_FORMAT,
    schemaVersion: state.schemaVersion,
    engineVersion: state.engineVersion,
    catalogVersion: state.catalogVersion,
    seasonId: state.seasonId,
    seed: state.rng.seed,
    savedAt: new Date().toISOString(),
    snapshot: state,
    actionLog,
  };
  return JSON.stringify(envelope);
}

export function deserializeSeason(value: string): SeasonSave | null {
  try {
    const parsed = JSON.parse(value) as Partial<SeasonSave>;
    if (parsed.format !== SAVE_FORMAT || !parsed.snapshot) return null;
    const migrated = migrateSeason(parsed as SeasonSave, {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      catalogVersion: CATALOG_VERSION,
    });
    if (!migrated) return null;
    if (migrated.schemaVersion !== migrated.snapshot.schemaVersion) return null;
    if (migrated.engineVersion !== migrated.snapshot.engineVersion) return null;
    if (migrated.catalogVersion !== migrated.snapshot.catalogVersion) return null;
    if (collectInvariantErrors(migrated.snapshot).length > 0) return null;
    return migrated;
  } catch {
    return null;
  }
}
