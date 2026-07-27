import type { SeasonSave } from "./serialization";
import { createInitialAudienceState } from "../audience/initial-state";
import { deriveAudienceSignals, neutralPortrayals } from "../audience/signals";
import type { ParticipantId } from "../types";

function migrateV1ToV2(save: SeasonSave): SeasonSave {
  const snapshot = structuredClone(save.snapshot);
  snapshot.schemaVersion = 2;
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
    snapshot,
    actionLog: save.actionLog ?? [],
  };
}

function seedLegacyFandom(
  save: SeasonSave,
  current: { schemaVersion: number; engineVersion: string; catalogVersion: string },
): SeasonSave {
  const snapshot = structuredClone(save.snapshot);
  const audienceModel = createInitialAudienceState(
    snapshot.castOrder,
    snapshot.mode === "legacy" ? "legacy" : "shadow",
  );

  for (const cluster of Object.values(audienceModel.clusters)) {
    const rawScores: Record<ParticipantId, number> = {};
    let totalScore = 0;
    for (const participantId of snapshot.castOrder) {
      const legacy = snapshot.characters[participantId]?.audience;
      const fan = cluster.participantFans[participantId];
      if (!legacy || !fan) continue;
      fan.awareness = Math.max(0, Math.min(100, legacy.awareness));
      fan.sentiment = Math.max(-100, Math.min(100, (legacy.support - 50) * 2));
      fan.attachment = Math.max(0, Math.min(100, legacy.support * legacy.awareness / 100));
      fan.exposureMinutes = Math.max(0, legacy.screenTime);
      fan.fatigue = Math.max(0, Math.min(100, legacy.screenTime * 0.35));
      const score = Math.max(0, fan.sentiment) / 100 * fan.awareness / 100;
      rawScores[participantId] = score;
      totalScore += score;
    }
    const alignedShare = Math.min(0.72, totalScore * 0.18);
    for (const participantId of snapshot.castOrder) {
      cluster.favoriteShares[participantId] = totalScore > 0
        ? alignedShare * (rawScores[participantId] ?? 0) / totalScore
        : 0;
    }
    cluster.unalignedShare = 1 - alignedShare;
  }

  snapshot.schemaVersion = current.schemaVersion;
  snapshot.engineVersion = current.engineVersion;
  snapshot.catalogVersion = current.catalogVersion;
  snapshot.audienceModel = audienceModel;
  snapshot.house.eventHistory = snapshot.house.eventHistory.map((event) => ({
    ...event,
    audienceSignals: event.audienceSignals ?? deriveAudienceSignals(event.category),
    observablePortrayals: event.observablePortrayals ?? neutralPortrayals(event.actorIds),
  }));
  snapshot.broadcasts = snapshot.broadcasts.map((broadcast) => ({
    ...broadcast,
    detailLevel: broadcast.result ? "clustered" : "legacy",
  }));

  return {
    ...save,
    schemaVersion: current.schemaVersion,
    engineVersion: current.engineVersion,
    catalogVersion: current.catalogVersion,
    snapshot,
    actionLog: save.actionLog ?? [],
  };
}

export function migrateSeason(
  save: SeasonSave,
  current: { schemaVersion: number; engineVersion: string; catalogVersion: string },
): SeasonSave | null {
  if (save.schemaVersion > current.schemaVersion) return null;
  let migrated = structuredClone(save);
  if (migrated.schemaVersion === 1) migrated = migrateV1ToV2(migrated);
  if (migrated.schemaVersion === 2 && current.schemaVersion >= 3) migrated = seedLegacyFandom(migrated, current);
  if (migrated.schemaVersion === current.schemaVersion) {
    migrated.engineVersion = current.engineVersion;
    migrated.catalogVersion = current.catalogVersion;
    migrated.snapshot.engineVersion = current.engineVersion;
    migrated.snapshot.catalogVersion = current.catalogVersion;
    migrated.actionLog ??= [];
    return migrated;
  }
  // Unknown future versions fail without mutating the supplied save.
  return null;
}
