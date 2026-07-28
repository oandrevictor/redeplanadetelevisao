import type {
  AudienceState,
  CharacterState,
  ParticipantFanState,
  ParticipantId,
} from "../types";
import { AUDIENCE_CLUSTERS } from "./catalog";
import { clamp, clamp01, round, weightedMean } from "./math";

export type ParticipantAudienceAggregate = {
  participantId: ParticipantId;
  awareness: number;
  sentiment: number;
  attachment: number;
  fatigue: number;
  exposureMinutes: number;
  favoriteShare: number;
  antiFanShare: number;
};

function defaultFan(): ParticipantFanState {
  return {
    awareness: 0,
    sentiment: 0,
    attachment: 0,
    exposureMinutes: 0,
    fatigue: 0,
  };
}

export function selectParticipantAudienceAggregates(
  audience: AudienceState,
  participantIds: readonly ParticipantId[],
): Record<ParticipantId, ParticipantAudienceAggregate> {
  const aggregates: Record<ParticipantId, ParticipantAudienceAggregate> = {};
  for (const participantId of participantIds) {
    const entries = AUDIENCE_CLUSTERS.map((definition) => {
      const cluster = audience.clusters[definition.id];
      const fan = cluster?.participantFans[participantId] ?? defaultFan();
      return {
        weight: definition.populationShare,
        fan,
        favoriteShare: cluster?.favoriteShares[participantId] ?? 0,
      };
    });
    const sentiment = weightedMean(entries.map(({ fan, weight }) => ({ value: fan.sentiment, weight })));
    aggregates[participantId] = {
      participantId,
      awareness: round(weightedMean(
        entries.map(({ fan, weight }) => ({ value: fan.awareness, weight })),
      ), 4),
      sentiment: round(sentiment, 4),
      attachment: round(weightedMean(
        entries.map(({ fan, weight }) => ({ value: fan.attachment, weight })),
      ), 4),
      fatigue: round(weightedMean(
        entries.map(({ fan, weight }) => ({ value: fan.fatigue, weight })),
      ), 4),
      exposureMinutes: round(weightedMean(
        entries.map(({ fan, weight }) => ({ value: fan.exposureMinutes, weight })),
      ), 4),
      favoriteShare: round(weightedMean(
        entries.map(({ favoriteShare, weight }) => ({ value: favoriteShare, weight })),
      ), 6),
      antiFanShare: round(weightedMean(
        entries.map(({ fan, weight }) => ({
          value: clamp01(-fan.sentiment / 100) * clamp01(fan.awareness / 100),
          weight,
        })),
      ), 6),
    };
  }
  return aggregates;
}

/**
 * Compatibility selector for systems that still read CharacterState.audience.
 * The cohort/fan state remains the sole source of truth.
 */
export function deriveLegacyAudienceSummaries(
  audience: AudienceState,
  participantIds: readonly ParticipantId[],
): Record<ParticipantId, CharacterState["audience"]> {
  const aggregates = selectParticipantAudienceAggregates(audience, participantIds);
  const summaries: Record<ParticipantId, CharacterState["audience"]> = {};

  for (const participantId of participantIds) {
    const aggregate = aggregates[participantId];
    const sentimentValues = AUDIENCE_CLUSTERS.map((definition) => ({
      value: audience.clusters[definition.id]?.participantFans[participantId]?.sentiment ?? 0,
      weight: definition.populationShare,
    }));
    const variance = weightedMean(
      sentimentValues.map((entry) => ({
        value: (entry.value - aggregate.sentiment) ** 2,
        weight: entry.weight,
      })),
    );
    const polarization = Math.sqrt(Math.max(0, variance));
    summaries[participantId] = {
      support: round(clamp(
        50
        + aggregate.sentiment * 0.35
        + aggregate.attachment * 0.2
        + aggregate.favoriteShare * 25,
        0,
        100,
      ), 2),
      awareness: round(clamp(aggregate.awareness, 0, 100), 2),
      controversy: round(clamp(
        aggregate.antiFanShare * 58
        + polarization * 0.42
        + aggregate.fatigue * 0.08,
        0,
        100,
      ), 2),
      screenTime: round(clamp(aggregate.exposureMinutes, 0, 100), 2),
    };
  }
  return summaries;
}
