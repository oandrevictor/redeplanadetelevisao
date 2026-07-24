import type { SeasonSave } from "./serialization";

export function migrateSeason(
  save: SeasonSave,
  current: { schemaVersion: number; engineVersion: string; catalogVersion: string },
): SeasonSave | null {
  if (save.schemaVersion === current.schemaVersion) return {
    ...save,
    actionLog: save.actionLog ?? [],
  };
  if (save.schemaVersion === 1 && current.schemaVersion === 2) {
    const snapshot = structuredClone(save.snapshot);
    snapshot.schemaVersion = 2;
    snapshot.engineVersion = current.engineVersion;
    snapshot.catalogVersion = current.catalogVersion;
    snapshot.competition.nominationHistory ??= [];
    snapshot.competition.eliminationHistory ??= [];
    snapshot.narrative.publicStorylines ??= {};
    snapshot.broadcasts = snapshot.broadcasts.map((broadcast) => ({
      ...broadcast,
      audienceForecast: broadcast.audienceForecast ?? 0,
    }));
    return {
      ...save,
      schemaVersion: 2,
      engineVersion: current.engineVersion,
      catalogVersion: current.catalogVersion,
      snapshot,
      actionLog: save.actionLog ?? [],
    };
  }
  // Unknown future versions fail without mutating the supplied save.
  return null;
}
