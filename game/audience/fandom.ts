import type {
  AudiencePortrayal,
  AudienceState,
  BroadcastEpisode,
  BroadcastSegment,
  ParticipantId,
} from "../types";
import { clamp, clamp01, mean, normalizeWeights, sum, toUnit } from "./math";
import { assertAudienceState, assertBroadcastEpisode } from "./validation";

export type FavoriteLossInput = {
  audience: AudienceState;
  eliminatedParticipantId: ParticipantId;
  episode: BroadcastEpisode;
  activeParticipantIds?: readonly ParticipantId[];
};

export type FavoriteLossClusterImpact = {
  clusterId: string;
  lostFavoriteShare: number;
  transferredShare: number;
  unalignedShare: number;
  favoriteLossShock: number;
};

export type FavoriteLossApplication = {
  audience: AudienceState;
  impacts: FavoriteLossClusterImpact[];
  farewellQuality: number;
  publiclyBlamedParticipantIds: ParticipantId[];
};

const positivePortrayals = new Set<AudiencePortrayal>([
  "sympathetic",
  "competent",
  "vulnerable",
  "justified",
]);
const blamePortrayals = new Set<AudiencePortrayal>([
  "aggressive",
  "dishonest",
  "contradictory",
]);

function portrayalScore(
  segment: Exclude<BroadcastSegment, { kind: "commercial" }>,
  participantId: ParticipantId,
  scores: ReadonlySet<AudiencePortrayal>,
): number {
  const portrayals = segment.portrayals[participantId] ?? [];
  if (portrayals.length === 0) return 0;
  return portrayals.filter((portrayal) => scores.has(portrayal)).length / portrayals.length;
}

function deriveFarewellQuality(episode: BroadcastEpisode, eliminatedParticipantId: ParticipantId): number {
  const visibleSegments = episode.segments.filter(
    (segment): segment is Exclude<BroadcastSegment, { kind: "commercial" }> =>
      segment.kind !== "commercial" && segment.participantIds.includes(eliminatedParticipantId),
  );
  if (visibleSegments.length === 0) return 0;
  return clamp01(mean(visibleSegments.map((segment) => {
    const emotionalSignals =
      (segment.signals.vulnerability ?? 0) * 0.4
      + (segment.signals.redemption ?? 0) * 0.35
      + (segment.signals.relationships ?? 0) * 0.25;
    const positive = portrayalScore(segment, eliminatedParticipantId, positivePortrayals);
    return (
      segment.contextCompleteness * 0.4
      + positive * 0.32
      + emotionalSignals * 0.18
      + segment.storylineHook * 0.1
    );
  })));
}

function derivePublicBlame(
  episode: BroadcastEpisode,
  eliminatedParticipantId: ParticipantId,
): Record<ParticipantId, number> {
  const scores: Record<ParticipantId, number> = {};
  for (const segment of episode.segments) {
    if (segment.kind === "commercial" || !segment.participantIds.includes(eliminatedParticipantId)) continue;
    for (const participantId of segment.participantIds) {
      if (participantId === eliminatedParticipantId) continue;
      let score = portrayalScore(segment, participantId, blamePortrayals) * 0.58;
      if (
        segment.kind === "important_event"
        && segment.harmedParticipantIds.includes(eliminatedParticipantId)
        && segment.favoredParticipantIds.includes(participantId)
      ) {
        score += 0.32;
      }
      score += (segment.signals.conflict ?? 0) * (1 - segment.contextCompleteness) * 0.1;
      scores[participantId] = Math.max(scores[participantId] ?? 0, clamp01(score));
    }
  }
  return scores;
}

function publicAssociation(
  audience: AudienceState,
  fromId: ParticipantId,
  toId: ParticipantId,
): number {
  return Math.max(0, clamp(
    audience.publicKnowledge.participantAssociations[`${fromId}>${toId}`]
      ?? audience.publicKnowledge.participantAssociations[`${toId}>${fromId}`]
      ?? 0,
    -1,
    1,
  ));
}

/**
 * Applies the one-episode loss response using only information present in the
 * broadcast and public audience knowledge. The eliminated participant's fan
 * history is retained; only their current primary-favorite allocation moves.
 */
export function applyFavoriteLoss(input: FavoriteLossInput): FavoriteLossApplication {
  const participantIds = Object.keys(
    Object.values(input.audience.clusters)[0]?.participantFans ?? {},
  );
  assertAudienceState(input.audience, participantIds);
  assertBroadcastEpisode(input.episode, participantIds);
  if (!participantIds.includes(input.eliminatedParticipantId)) {
    throw new Error(`Favorite loss references unknown participant: ${input.eliminatedParticipantId}`);
  }
  const activeIds = [
    ...new Set(input.activeParticipantIds ?? participantIds.filter(
      (participantId) => participantId !== input.eliminatedParticipantId,
    )),
  ].filter((participantId) =>
    participantId !== input.eliminatedParticipantId && participantIds.includes(participantId));
  const farewellQuality = deriveFarewellQuality(input.episode, input.eliminatedParticipantId);
  const publicBlame = derivePublicBlame(input.episode, input.eliminatedParticipantId);
  const next = structuredClone(input.audience);
  const impacts: FavoriteLossClusterImpact[] = [];

  for (const cluster of Object.values(next.clusters)) {
    const lostFavoriteShare = clamp01(
      cluster.favoriteShares[input.eliminatedParticipantId] ?? 0,
    );
    const alignedBefore = sum(Object.values(cluster.favoriteShares));
    const exclusivity = alignedBefore > 0 ? clamp01(lostFavoriteShare / alignedBefore) : 0;
    const transferScores = Object.fromEntries(activeIds.map((participantId) => {
      const fan = cluster.participantFans[participantId];
      const positiveSentiment = clamp01((fan?.sentiment ?? 0) / 100);
      const establishedSecondaryAffinity =
        positiveSentiment * 0.3
        + toUnit(fan?.attachment ?? 0) * 0.43
        + (cluster.favoriteShares[participantId] ?? 0) * 0.17;
      const airedAlliance = publicAssociation(
        next,
        input.eliminatedParticipantId,
        participantId,
      ) * 0.1;
      return [participantId, establishedSecondaryAffinity + airedAlliance];
    })) as Record<ParticipantId, number>;
    const strongestSecondary = Math.max(0, ...Object.values(transferScores));
    const transferRate = clamp01(
      0.16 + strongestSecondary * 0.48 + farewellQuality * 0.24,
    );
    const transferredShare = lostFavoriteShare * transferRate;
    const normalizedTransfer = activeIds.length > 0
      ? normalizeWeights(transferScores)
      : {} as Record<ParticipantId, number>;

    cluster.favoriteShares[input.eliminatedParticipantId] = 0;
    for (const participantId of activeIds) {
      const allocation = transferredShare * (normalizedTransfer[participantId] ?? 0);
      cluster.favoriteShares[participantId] =
        (cluster.favoriteShares[participantId] ?? 0) + allocation;
      const association = publicAssociation(
        next,
        input.eliminatedParticipantId,
        participantId,
      );
      if (association > 0 && allocation > 0) {
        const fan = cluster.participantFans[participantId];
        fan.sentiment = clamp(
          fan.sentiment + allocation * association * 12,
          -100,
          100,
        );
        fan.attachment = clamp(
          fan.attachment + allocation * association * 9,
          0,
          100,
        );
      }
    }
    cluster.unalignedShare = clamp01(
      cluster.unalignedShare + lostFavoriteShare - transferredShare,
    );

    const favoriteLossShock = clamp01(
      lostFavoriteShare
      * (0.58 + exclusivity * 0.42)
      * (1 - farewellQuality * 0.43),
    );
    cluster.favoriteLossShock = Math.max(toUnit(cluster.favoriteLossShock), favoriteLossShock);
    // Farewell curiosity and revenge-watching soften, but do not erase, the
    // loss penalty applied by the next return-intent calculation.
    const curiosity = lostFavoriteShare * (0.035 + farewellQuality * 0.075);
    cluster.returnIntent = clamp01(
      toUnit(cluster.returnIntent) - favoriteLossShock * 0.27 + curiosity,
    );

    for (const [participantId, blame] of Object.entries(publicBlame)) {
      const fan = cluster.participantFans[participantId];
      if (!fan || blame <= 0) continue;
      fan.awareness = clamp(
        fan.awareness + lostFavoriteShare * blame * 7,
        0,
        100,
      );
      fan.sentiment = clamp(
        fan.sentiment - lostFavoriteShare * blame * (8 + exclusivity * 9),
        -100,
        100,
      );
    }

    // Reconcile floating-point drift without changing established shares.
    const favoriteTotal = sum(Object.values(cluster.favoriteShares));
    cluster.unalignedShare = clamp01(1 - favoriteTotal);
    impacts.push({
      clusterId: cluster.clusterId,
      lostFavoriteShare,
      transferredShare,
      unalignedShare: cluster.unalignedShare,
      favoriteLossShock,
    });
  }

  return {
    audience: next,
    impacts,
    farewellQuality,
    publiclyBlamedParticipantIds: Object.entries(publicBlame)
      .filter(([, score]) => score > 0)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([participantId]) => participantId),
  };
}
