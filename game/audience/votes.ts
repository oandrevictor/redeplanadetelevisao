import type {
  AudienceState,
  AudienceVoteResult,
  ParticipantId,
} from "../types";
import { AUDIENCE_CLUSTERS } from "./catalog";
import { clamp, clamp01, mean, normalizeWeights, softmax, sum, toUnit } from "./math";
import { assertAudienceState } from "./validation";

export type CalculateAudienceVoteInput = {
  audience: AudienceState;
  kind: AudienceVoteResult["kind"];
  week: number;
  participantIds: readonly ParticipantId[];
  lockedAfterEpisodeId: string;
};

export type CloseAudienceVoteResult = {
  audience: AudienceState;
  result: AudienceVoteResult;
};

function uniqueSortedParticipantIds(ids: readonly ParticipantId[]): ParticipantId[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function candidateScore(
  audience: AudienceState,
  clusterId: string,
  participantId: ParticipantId,
  participantIds: readonly ParticipantId[],
  kind: AudienceVoteResult["kind"],
): number {
  const cluster = audience.clusters[clusterId];
  const fan = cluster.participantFans[participantId];
  const awareness = toUnit(fan?.awareness ?? 0);
  const sentiment = clamp((fan?.sentiment ?? 0) / 100, -1, 1);
  const positiveSentiment = Math.max(0, sentiment);
  const antiFan = Math.max(0, -sentiment) * awareness;
  const attachment = toUnit(fan?.attachment ?? 0);
  const favoriteShare = cluster.favoriteShares[participantId] ?? 0;

  if (kind === "final") {
    return (
      0.1
      + favoriteShare * 2.2
      + positiveSentiment * awareness * 0.78
      + attachment * 0.88
      + awareness * 0.14
      - antiFan * 0.5
      - toUnit(fan?.fatigue ?? 0) * 0.12
    );
  }

  const protectionOfOpposingFavorite = sum(
    participantIds
      .filter((otherId) => otherId !== participantId)
      .map((otherId) => cluster.favoriteShares[otherId] ?? 0),
  );
  return (
    0.1
    + awareness * 0.2
    + antiFan * 1.65
    + protectionOfOpposingFavorite * 0.68
    - positiveSentiment * awareness * 0.62
    - attachment * 0.48
    - favoriteShare * 1.72
  );
}

function clusterTurnout(
  audience: AudienceState,
  clusterId: string,
  participantIds: readonly ParticipantId[],
): number {
  const definition = AUDIENCE_CLUSTERS.find((entry) => entry.id === clusterId);
  const cluster = audience.clusters[clusterId];
  if (!definition || !cluster) return 0;
  const fans = participantIds.map((participantId) => cluster.participantFans[participantId]);
  const averageAwareness = mean(fans.map((fan) => toUnit(fan?.awareness ?? 0)));
  const maximumAttachment = Math.max(0, ...fans.map((fan) => toUnit(fan?.attachment ?? 0)));
  const maximumEmotion = Math.max(
    0,
    ...fans.map((fan) => clamp01(Math.abs(fan?.sentiment ?? 0) / 100)),
  );
  const returnIntent = toUnit(cluster.returnIntent);
  const engagement = clamp01(
    0.2
    + averageAwareness * 0.3
    + maximumAttachment * 0.24
    + maximumEmotion * 0.14
    + returnIntent * 0.12,
  );
  const mobileAccessBoost = definition.demographics.platform.mobile_clips * 0.12;
  return clamp01(definition.habits.votingPropensity * engagement + mobileAccessBoost);
}

/**
 * Calculates a locked vote without consuming RNG. All variation comes from
 * the public fandom state established by broadcasts.
 */
export function calculateAudienceVote(input: CalculateAudienceVoteInput): AudienceVoteResult {
  const participantIds = uniqueSortedParticipantIds(input.participantIds);
  const stateParticipantIds = Object.keys(
    Object.values(input.audience.clusters)[0]?.participantFans ?? {},
  );
  assertAudienceState(input.audience, stateParticipantIds);
  if (!Number.isInteger(input.week) || input.week <= 0) {
    throw new Error("Audience vote week must be a positive integer.");
  }
  if (!input.lockedAfterEpisodeId.trim()) {
    throw new Error("Audience vote must identify the episode that locked it.");
  }
  if (participantIds.length < 2) {
    throw new Error("Audience vote requires at least two distinct participants.");
  }
  for (const participantId of participantIds) {
    if (!stateParticipantIds.includes(participantId)) {
      throw new Error(`Audience vote references unknown participant: ${participantId}`);
    }
  }

  const clusterShares: Record<string, Record<ParticipantId, number>> = {};
  const aggregateVotes: Record<ParticipantId, number> = Object.fromEntries(
    participantIds.map((participantId) => [participantId, 0]),
  );
  let turnoutHouseholds = 0;

  for (const definition of [...AUDIENCE_CLUSTERS].sort((left, right) => left.id.localeCompare(right.id))) {
    const scores = Object.fromEntries(participantIds.map((participantId) => [
      participantId,
      candidateScore(input.audience, definition.id, participantId, participantIds, input.kind),
    ])) as Record<ParticipantId, number>;
    const preferences = softmax(scores, input.kind === "final" ? 0.42 : 0.38);
    clusterShares[definition.id] = preferences;
    const clusterTurnoutHouseholds =
      input.audience.market.universeHouseholds
      * definition.populationShare
      * clusterTurnout(input.audience, definition.id, participantIds);
    turnoutHouseholds += clusterTurnoutHouseholds;
    for (const participantId of participantIds) {
      aggregateVotes[participantId] += clusterTurnoutHouseholds * preferences[participantId];
    }
  }

  const shares = normalizeWeights(aggregateVotes);
  const selectedParticipantId = [...participantIds].sort((left, right) =>
    shares[right] - shares[left] || left.localeCompare(right))[0];
  return {
    id: `audience-${input.kind}-${input.week}-${input.lockedAfterEpisodeId}`,
    kind: input.kind,
    week: input.week,
    participantIds,
    shares,
    turnoutHouseholds,
    clusterShares,
    selectedParticipantId,
    lockedAfterEpisodeId: input.lockedAfterEpisodeId,
  };
}

export function closeAudienceVote(
  audience: AudienceState,
  input: Omit<CalculateAudienceVoteInput, "audience">,
): CloseAudienceVoteResult {
  if (audience.pendingVote) {
    throw new Error(`Audience vote ${audience.pendingVote.id} is already locked.`);
  }
  const result = calculateAudienceVote({ ...input, audience });
  if (audience.voteHistory.some((vote) => vote.id === result.id)) {
    throw new Error(`Audience vote ${result.id} has already been resolved.`);
  }
  const nextAudience = { ...audience, pendingVote: result };
  assertAudienceState(nextAudience, Object.keys(
    Object.values(audience.clusters)[0]?.participantFans ?? {},
  ));
  return {
    audience: nextAudience,
    result,
  };
}

export function consumePendingAudienceVote(
  audience: AudienceState,
  expectedKind?: AudienceVoteResult["kind"],
): { audience: AudienceState; result: AudienceVoteResult } {
  const result = audience.pendingVote;
  if (!result) throw new Error("There is no locked audience vote to resolve.");
  if (expectedKind && result.kind !== expectedKind) {
    throw new Error(`Expected a ${expectedKind} vote but found ${result.kind}.`);
  }
  if (audience.voteHistory.some((vote) => vote.id === result.id)) {
    throw new Error(`Audience vote ${result.id} has already been resolved.`);
  }
  const nextAudience: AudienceState = {
    ...audience,
    pendingVote: null,
    voteHistory: [...audience.voteHistory, result],
  };
  assertAudienceState(nextAudience, Object.keys(
    Object.values(audience.clusters)[0]?.participantFans ?? {},
  ));
  return { audience: nextAudience, result };
}
