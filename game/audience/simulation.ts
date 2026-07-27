import { castById } from "../content/cast";
import { nextRandom } from "../rng";
import type {
  AudienceClusterDefinition,
  AudienceClusterState,
  AudienceEpisodeResult,
  AudienceFactorContribution,
  AudienceInterest,
  AudiencePortrayal,
  AudienceState,
  BroadcastEpisode,
  BroadcastSegment,
  CharacterState,
  ClusterEpisodeResult,
  GameState,
  ParticipantFanDelta,
  ParticipantId,
} from "../types";
import { AUDIENCE_CLUSTERS, AUDIENCE_INTERESTS } from "./catalog";
import { applyFavoriteLoss } from "./fandom";
import { selectAudienceForecastDetails, type AudienceForecastOptions } from "./forecast";
import {
  clamp,
  clamp01,
  directionFor,
  mean,
  normalizeWeights,
  round,
  sum,
  toUnit,
  weightedMean,
} from "./math";
import {
  deriveLegacyAudienceSummaries,
  selectParticipantAudienceAggregates,
} from "./selectors";
import {
  assertAudienceResult,
  assertAudienceState,
  assertBroadcastEpisode,
} from "./validation";

export type SimulateAudienceEpisodeInput = {
  audience: AudienceState;
  episode: BroadcastEpisode;
  rng: GameState["rng"];
  participantIds?: readonly ParticipantId[];
  eligibleFavoriteParticipantIds?: readonly ParticipantId[];
  forecastOptions?: Omit<AudienceForecastOptions, "participantIds">;
};

export type SimulateAudienceEpisodeOutput = {
  audience: AudienceState;
  result: AudienceEpisodeResult;
  rng: GameState["rng"];
  legacyAudience: Record<ParticipantId, CharacterState["audience"]>;
};

type ContentLikeSegment = Exclude<BroadcastSegment, { kind: "commercial" }>;

type ClusterRuntime = {
  definition: AudienceClusterDefinition;
  state: AudienceClusterState;
  population: number;
  maxWatching: number;
  startHouseholds: number;
  watching: number;
  reached: number;
  firstTimeReach: number;
  reentries: number;
  viewerSeconds: number;
  satisfactionMass: number;
  satisfactionViewerSeconds: number;
  contentSeconds: number;
  commercialSeconds: number;
  contextDeficitMass: number;
  hookMass: number;
  participantEpisodeExposure: Record<ParticipantId, number>;
  signalEpisodeExposure: Record<AudienceInterest, number>;
  returnIntentBefore: number;
  favoriteLossCuriosity: number;
};

type UtilityComponents = {
  contentFit: number;
  favoritePull: number;
  antiFanLoad: number;
  contextAndPayoff: number;
  novelty: number;
  pacing: number;
  toneTolerance: number;
  utility: number;
};

const portrayalValence: Record<AudiencePortrayal, number> = {
  sympathetic: 0.72,
  aggressive: -0.36,
  competent: 0.56,
  vulnerable: 0.48,
  dishonest: -0.88,
  justified: 0.58,
  contradictory: -0.52,
  defensive: -0.18,
  neutral: 0,
};

function validateRng(rng: GameState["rng"]): void {
  if (!rng.seed.trim()) throw new Error("Audience simulation RNG seed cannot be empty.");
  if (rng.state.length !== 4 || rng.state.some((value) =>
    !Number.isInteger(value) || value < 0 || value > 0xffff_ffff)) {
    throw new Error("Audience simulation requires a valid four-word RNG state.");
  }
  if (!Number.isInteger(rng.counter) || rng.counter < 0) {
    throw new Error("Audience simulation RNG counter is invalid.");
  }
}

function stableParticipantIds(
  audience: AudienceState,
  explicit?: readonly ParticipantId[],
): ParticipantId[] {
  const ids = explicit ?? Object.keys(
    Object.values(audience.clusters)[0]?.participantFans ?? {},
  );
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function averageSignalIntensity(segment: ContentLikeSegment): number {
  return mean(Object.values(segment.signals).filter(
    (value): value is number => value !== undefined,
  ), 0.35);
}

function weightedSignalValue(
  values: Record<AudienceInterest, number>,
  signals: Partial<Record<AudienceInterest, number>>,
  fallback: number,
): number {
  const active = AUDIENCE_INTERESTS
    .filter((interest) => (signals[interest] ?? 0) > 0)
    .map((interest) => ({
      value: values[interest],
      weight: signals[interest] ?? 0,
    }));
  return weightedMean(active, fallback);
}

function participantPull(
  cluster: AudienceClusterState,
  participantIds: readonly ParticipantId[],
): { pull: number; antiFanLoad: number } {
  let pull = 0.3;
  let antiFanLoad = 0;
  for (const participantId of participantIds) {
    const fan = cluster.participantFans[participantId];
    if (!fan) continue;
    const favoriteShare = cluster.favoriteShares[participantId] ?? 0;
    const positiveSentiment = clamp01(fan.sentiment / 100);
    const antiFanCuriosity =
      clamp01(-fan.sentiment / 100) * toUnit(fan.awareness) * 0.16;
    antiFanLoad += antiFanCuriosity;
    pull += favoriteShare * (
      0.34
      + toUnit(fan.attachment) * 0.38
      + positiveSentiment * 0.28
    ) + antiFanCuriosity;
  }
  return { pull: clamp01(pull), antiFanLoad: clamp01(antiFanLoad) };
}

function pacingFit(segment: ContentLikeSegment, definition: AudienceClusterDefinition): number {
  const idealSeconds =
    205
    - definition.habits.zapping * 95
    + definition.habits.loyalty * 35;
  const ratio = Math.max(0.05, segment.durationSeconds / idealSeconds);
  return clamp01(Math.exp(-Math.abs(Math.log(ratio)) * 0.68));
}

function toneFit(segment: ContentLikeSegment, definition: AudienceClusterDefinition): number {
  if (segment.kind === "content") {
    switch (segment.tone) {
      case "engracado":
        return clamp01(0.3 + definition.interests.humor * 0.7);
      case "triste":
      case "emocional":
        return clamp01(
          0.22
          + definition.interests.vulnerability * 0.43
          + definition.interests.relationships * 0.35,
        );
      case "malicioso":
      case "conflituoso":
        return clamp01(
          0.18
          + definition.interests.conflict * 0.45
          + definition.habits.conflictTolerance * 0.37,
        );
      case "neutro":
        return 0.68;
    }
  }
  const conflictHeat = segment.signals.conflict ?? 0;
  const emotionalHeat = Math.max(
    segment.signals.vulnerability ?? 0,
    segment.signals.relationships ?? 0,
  );
  return clamp01(
    0.46
    + conflictHeat * definition.habits.conflictTolerance * 0.27
    + emotionalHeat * definition.interests.vulnerability * 0.27,
  );
}

function utilityFor(
  runtime: ClusterRuntime,
  segment: ContentLikeSegment,
): UtilityComponents {
  const signalFit = weightedSignalValue(
    runtime.definition.interests,
    segment.signals,
    0.46,
  );
  const relevantFatigue = weightedSignalValue(
    Object.fromEntries(AUDIENCE_INTERESTS.map((interest) => [
      interest,
      toUnit(runtime.state.interestFatigue[interest] ?? 0),
    ])) as Record<AudienceInterest, number>,
    segment.signals,
    0,
  );
  const contentFit = clamp01(signalFit * (1 - relevantFatigue * 0.42));
  const participantAttention = participantPull(runtime.state, segment.participantIds);
  const favoritePull = participantAttention.pull;
  const contextAndPayoff = clamp01(
    segment.contextCompleteness * 0.65 + segment.storylineHook * 0.35,
  );
  const participantRepetition = mean(
    segment.participantIds.map((participantId) =>
      clamp01((runtime.participantEpisodeExposure[participantId] ?? 0) / 18)),
    0,
  );
  const novelty = clamp01(
    runtime.definition.habits.noveltySeeking
    * (1 - relevantFatigue * 0.5)
    * (1 - participantRepetition * 0.42),
  );
  const pacing = pacingFit(segment, runtime.definition);
  const toneTolerance = toneFit(segment, runtime.definition);
  const utility = clamp01(
    contentFit * 0.3
    + favoritePull * 0.25
    + contextAndPayoff * 0.15
    + novelty * 0.1
    + pacing * 0.1
    + toneTolerance * 0.1,
  );
  return {
    contentFit,
    favoritePull,
    antiFanLoad: participantAttention.antiFanLoad,
    contextAndPayoff,
    novelty,
    pacing,
    toneTolerance,
    utility,
  };
}

function componentFactors(
  components: UtilityComponents,
  clusterId: string,
  segmentId: string,
): AudienceFactorContribution[] {
  const definitions: Array<{
    key: keyof Omit<UtilityComponents, "utility" | "antiFanLoad">;
    label: string;
    weight: number;
  }> = [
    { key: "contentFit", label: "Afinidade com o conteúdo", weight: 0.3 },
    { key: "favoritePull", label: "Favoritos e antifãs", weight: 0.25 },
    { key: "contextAndPayoff", label: "Contexto e payoff", weight: 0.15 },
    { key: "novelty", label: "Novidade sem repetição", weight: 0.1 },
    { key: "pacing", label: "Ritmo da edição", weight: 0.1 },
    { key: "toneTolerance", label: "Tolerância ao tom", weight: 0.1 },
  ];
  const factors: AudienceFactorContribution[] = definitions.map(({ key, label, weight }) => {
    const value = (components[key] - 0.5) * weight;
    return {
      key,
      label,
      value: round(value, 4),
      direction: directionFor(value),
      clusterId,
      segmentId,
    };
  });
  if (components.antiFanLoad > 0) {
    factors.push({
      key: "antiFanLoad",
      label: "Desgaste de antifãs",
      value: round(-components.antiFanLoad * 0.12, 4),
      direction: "negative",
      clusterId,
      segmentId,
    });
  }
  return factors;
}

function identityResonance(
  definition: AudienceClusterDefinition,
  participantId: ParticipantId,
): number {
  const profile = castById[participantId]?.audienceProfile;
  if (!profile) return 0.5;
  const tags = [...profile.publicIdentityTags, ...profile.representationTags]
    .map((tag) => tag.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase());
  const matches: number[] = [];
  for (const tag of tags) {
    if (tag.includes("mulher")) matches.push(definition.demographics.gender.women);
    if (tag.includes("homem")) matches.push(definition.demographics.gender.men);
    if (tag.includes("nao-bin") || tag.includes("nonbinary")) {
      matches.push(definition.demographics.gender.nonbinary_other);
    }
    if (tag.includes("nordeste")) matches.push(definition.demographics.region.northeast);
    if (tag.includes("centro-oeste")) matches.push(definition.demographics.region.center_west);
    if (tag.includes("sudeste")) matches.push(definition.demographics.region.southeast);
    if (tag === "sul" || tag.startsWith("sul-")) matches.push(definition.demographics.region.south);
    if (tag === "norte" || tag.startsWith("norte-")) matches.push(definition.demographics.region.north);
    if (tag.includes("interior") || tag.includes("rural")) {
      matches.push(Math.max(
        definition.demographics.urbanity.interior,
        definition.demographics.urbanity.rural,
      ));
    }
    if (
      tag.includes("urbana")
      || tag.includes("urbano")
      || tag.includes("periferia")
      || tag.includes("capital")
    ) {
      matches.push(definition.demographics.urbanity.metro);
    }
    const ageMatch = tag.match(/(?:^|-)(\d{2})(?:-anos|$)/);
    if (ageMatch) {
      const age = Number(ageMatch[1]);
      const ageBand =
        age <= 24 ? "16_24"
          : age <= 34 ? "25_34"
            : age <= 49 ? "35_49"
              : age <= 64 ? "50_64"
                : "65_plus";
      matches.push(definition.demographics.age[ageBand]);
    }
  }
  if (matches.length === 0) {
    return clamp01(0.35 + definition.values.representation * 0.3);
  }
  // Authored identity signals are secondary and never create content tastes.
  return clamp01(mean(matches) * 0.72 + definition.values.representation * 0.28);
}

function psychographicCompatibility(
  definition: AudienceClusterDefinition,
  participantId: ParticipantId,
): number {
  const tags = castById[participantId]?.audienceProfile.psychographicTags;
  if (!tags) return 0.5;
  const entries = Object.entries(tags) as Array<[AudienceInterest, number]>;
  if (entries.length === 0) return 0.5;
  return clamp01(weightedMean(entries.map(([interest, participantStrength]) => ({
    value: definition.interests[interest],
    weight: participantStrength,
  })), 0.5));
}

function participantCompatibility(
  definition: AudienceClusterDefinition,
  participantId: ParticipantId,
): number {
  return clamp01(
    psychographicCompatibility(definition, participantId) * 0.75
    + identityResonance(definition, participantId) * 0.25,
  );
}

function segmentPortrayalValence(
  segment: ContentLikeSegment,
  participantId: ParticipantId,
): number {
  const portrayals = segment.portrayals[participantId] ?? ["neutral"];
  let value = mean(portrayals.map((portrayal) => portrayalValence[portrayal]), 0);
  if (segment.kind === "important_event") {
    if (segment.favoredParticipantIds.includes(participantId)) value += 0.28;
    if (segment.harmedParticipantIds.includes(participantId)) value -= 0.28;
  }
  return clamp(value, -1, 1);
}

function updateFandom(
  runtime: ClusterRuntime,
  segment: ContentLikeSegment,
  averageWatching: number,
): void {
  const audienceFraction = runtime.population > 0
    ? clamp01(averageWatching / runtime.population)
    : 0;
  const minutes = segment.durationSeconds / 60;
  const effectiveExposure = minutes * audienceFraction;
  const signalIntensity = averageSignalIntensity(segment);
  const perspectiveIds = segment.kind === "content"
    ? new Set(segment.perspectiveIds)
    : new Set(segment.participantIds);

  for (const participantId of segment.participantIds) {
    const fan = runtime.state.participantFans[participantId];
    if (!fan) continue;
    const perspectiveBoost = perspectiveIds.has(participantId) ? 1.12 : 0.88;
    const exposure = effectiveExposure * perspectiveBoost;
    const compatibility = participantCompatibility(runtime.definition, participantId);
    const valence = segmentPortrayalValence(segment, participantId);
    const castingInfluence = clamp(
      0.42 * Math.exp(-fan.exposureMinutes / 24),
      0.08,
      0.42,
    );
    const contextEffect =
      (segment.contextCompleteness - 0.5)
      * runtime.definition.values.fairness
      * (Math.abs(valence) > 0.15 ? 0.7 : 0.25);
    const fatigueDampener = 1 - toUnit(fan.fatigue) * 0.5;
    const awarenessRate =
      exposure
      * (0.015 + signalIntensity * 0.012 + segment.storylineHook * 0.008);
    fan.awareness = clamp(
      fan.awareness + (100 - fan.awareness) * (1 - Math.exp(-awarenessRate)),
      0,
      100,
    );
    const sentimentDelta = exposure * (
      (compatibility - 0.5) * 3.2 * castingInfluence
      + valence * 3.4 * (1 - castingInfluence * 0.35)
      + contextEffect
    ) * fatigueDampener;
    fan.sentiment = clamp(fan.sentiment + sentimentDelta, -100, 100);
    const attachmentDelta = exposure * (
      Math.max(0, fan.sentiment / 100) * 1.35
      + Math.max(0, compatibility - 0.45) * 0.85
      + Math.max(0, valence) * 0.7
      - Math.max(0, -valence) * 0.8
    ) * fatigueDampener;
    fan.attachment = clamp(fan.attachment + attachmentDelta, 0, 100);
    fan.exposureMinutes += exposure;
    const priorEpisodeExposure = runtime.participantEpisodeExposure[participantId] ?? 0;
    fan.fatigue = clamp(
      fan.fatigue
      + exposure * 0.38
      + Math.max(0, priorEpisodeExposure - 8) * exposure * 0.025,
      0,
      100,
    );
    runtime.participantEpisodeExposure[participantId] = priorEpisodeExposure + exposure;
  }
}

function updateInterestFatigue(
  runtime: ClusterRuntime,
  segment: ContentLikeSegment,
  averageWatching: number,
): void {
  const audienceFraction = runtime.population > 0
    ? clamp01(averageWatching / runtime.population)
    : 0;
  const minutes = segment.durationSeconds / 60;
  for (const interest of AUDIENCE_INTERESTS) {
    const strength = segment.signals[interest] ?? 0;
    if (strength <= 0) continue;
    const priorEpisodeExposure = runtime.signalEpisodeExposure[interest];
    const addedExposure = strength * audienceFraction * minutes;
    runtime.signalEpisodeExposure[interest] += addedExposure;
    runtime.state.interestFatigue[interest] = clamp01(
      toUnit(runtime.state.interestFatigue[interest])
      + addedExposure * 0.012
      + Math.max(0, priorEpisodeExposure - 6) * addedExposure * 0.002,
    );
  }
}

function updatePublicKnowledge(
  audience: AudienceState,
  runtimes: readonly ClusterRuntime[],
  segment: ContentLikeSegment,
): void {
  const totalWatching = sum(runtimes.map((runtime) => runtime.watching));
  const audienceFraction = audience.market.universeHouseholds > 0
    ? clamp01(totalWatching / audience.market.universeHouseholds)
    : 0;
  const minutes = segment.durationSeconds / 60;
  const storylineId = segment.kind === "important_event"
    ? `chain:${segment.chainId}`
    : `event:${segment.sourceEventId}`;
  const existingStoryline = toUnit(audience.publicKnowledge.storylines[storylineId] ?? 0);
  audience.publicKnowledge.storylines[storylineId] = clamp01(
    existingStoryline
    + segment.storylineHook * audienceFraction * Math.min(1, minutes / 3) * 0.45,
  );
  const participantIds = [...new Set(segment.participantIds)].sort();
  for (let leftIndex = 0; leftIndex < participantIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < participantIds.length; rightIndex += 1) {
      const left = participantIds[leftIndex];
      const right = participantIds[rightIndex];
      const leftValence = segmentPortrayalValence(segment, left);
      const rightValence = segmentPortrayalValence(segment, right);
      const cooperativeSignal = clamp01(
        (segment.signals.relationships ?? 0) * 0.52
        + (segment.signals.vulnerability ?? 0) * 0.2
        + (segment.signals.humor ?? 0) * 0.13
        + (segment.signals.authenticity ?? 0) * 0.15,
      ) * clamp01(1 - Math.abs(leftValence - rightValence) * 0.45);
      const rivalrySignal = clamp01(
        (segment.signals.conflict ?? 0) * 0.72
        + Math.abs(leftValence - rightValence) * 0.28,
      );
      const associationDelta =
        audienceFraction
        * segment.contextCompleteness
        * Math.min(1, minutes / 4)
        * 0.16
        * clamp(cooperativeSignal - rivalrySignal, -1, 1);
      for (const key of [`${left}>${right}`, `${right}>${left}`]) {
        audience.publicKnowledge.participantAssociations[key] = clamp(
          (audience.publicKnowledge.participantAssociations[key] ?? 0)
          + associationDelta,
          -1,
          1,
        );
      }
    }
  }
}

function reconcileFavorites(
  cluster: AudienceClusterState,
  participantIds: readonly ParticipantId[],
): void {
  const scores = Object.fromEntries(participantIds.map((participantId) => {
    const fan = cluster.participantFans[participantId];
    const awareness = toUnit(fan?.awareness ?? 0);
    const attachment = toUnit(fan?.attachment ?? 0);
    const positiveSentiment = clamp01((fan?.sentiment ?? 0) / 100);
    const score =
      awareness * (0.18 + positiveSentiment * 0.42)
      + attachment * 0.62;
    return [participantId, score];
  })) as Record<ParticipantId, number>;
  const scoreTotal = sum(Object.values(scores));
  const alignedTarget = clamp01(scoreTotal / (scoreTotal + 0.85)) * 0.94;
  const desiredWeights = scoreTotal > 0
    ? normalizeWeights(scores)
    : (Object.fromEntries(
      participantIds.map((participantId) => [participantId, 0]),
    ) as Record<ParticipantId, number>);
  for (const participantId of participantIds) {
    const oldShare = cluster.favoriteShares[participantId] ?? 0;
    const desiredShare = alignedTarget * (desiredWeights[participantId] ?? 0);
    cluster.favoriteShares[participantId] = clamp01(oldShare * 0.68 + desiredShare * 0.32);
  }
  const total = sum(participantIds.map((participantId) => cluster.favoriteShares[participantId] ?? 0));
  if (total > 1) {
    for (const participantId of participantIds) {
      cluster.favoriteShares[participantId] /= total;
    }
    cluster.unalignedShare = 0;
  } else {
    cluster.unalignedShare = 1 - total;
  }
}

function favoriteParticipantId(
  cluster: AudienceClusterState,
  participantIds: readonly ParticipantId[],
): ParticipantId | null {
  const ordered = [...participantIds].sort((left, right) =>
    (cluster.favoriteShares[right] ?? 0) - (cluster.favoriteShares[left] ?? 0)
    || left.localeCompare(right));
  return ordered.length > 0 && (cluster.favoriteShares[ordered[0]] ?? 0) > 0
    ? ordered[0]
    : null;
}

function calculateReturnIntent(
  runtime: ClusterRuntime,
  totalEpisodeSeconds: number,
): { satisfaction: number; completion: number; returnIntent: number } {
  const satisfaction = runtime.satisfactionViewerSeconds > 0
    ? clamp01(runtime.satisfactionMass / runtime.satisfactionViewerSeconds)
    : 0.4;
  const completion = runtime.startHouseholds > 0
    ? clamp01(runtime.watching / runtime.startHouseholds)
    : 0;
  const favoriteAttachment = sum(
    Object.entries(runtime.state.favoriteShares).map(([participantId, share]) =>
      share * toUnit(runtime.state.participantFans[participantId]?.attachment ?? 0)),
  );
  const storylineAnticipation = runtime.contentSeconds > 0
    ? clamp01(runtime.hookMass / runtime.contentSeconds)
    : 0;
  const repetitionPenalty = mean(
    Object.values(runtime.state.interestFatigue).map(toUnit),
    0,
  ) * 0.12;
  const advertisingPenalty = totalEpisodeSeconds > 0
    ? (runtime.commercialSeconds / totalEpisodeSeconds)
      * (1 - runtime.definition.habits.adTolerance)
      * 0.28
    : 0;
  const incoherencePenalty = runtime.contentSeconds > 0
    ? (runtime.contextDeficitMass / runtime.contentSeconds)
      * runtime.definition.values.fairness
      * 0.16
    : 0;
  const favoriteLossPenalty = toUnit(runtime.state.favoriteLossShock) * 0.18;
  const returnIntent = clamp01(
    satisfaction * 0.35
    + completion * 0.2
    + favoriteAttachment * 0.2
    + storylineAnticipation * 0.15
    + toUnit(runtime.state.habit) * 0.1
    + runtime.favoriteLossCuriosity * 0.12
    - repetitionPenalty
    - advertisingPenalty
    - incoherencePenalty
    - favoriteLossPenalty,
  );
  return { satisfaction, completion, returnIntent };
}

function aggregateFanDeltas(
  before: ReturnType<typeof selectParticipantAudienceAggregates>,
  after: ReturnType<typeof selectParticipantAudienceAggregates>,
  participantIds: readonly ParticipantId[],
): ParticipantFanDelta[] {
  return participantIds.map((participantId) => ({
    participantId,
    awarenessBefore: before[participantId].awareness,
    awarenessAfter: after[participantId].awareness,
    sentimentBefore: before[participantId].sentiment,
    sentimentAfter: after[participantId].sentiment,
    attachmentBefore: before[participantId].attachment,
    attachmentAfter: after[participantId].attachment,
    favoriteShareBefore: before[participantId].favoriteShare,
    favoriteShareAfter: after[participantId].favoriteShare,
  }));
}

function trimFactorContributions(
  factors: readonly AudienceFactorContribution[],
): AudienceFactorContribution[] {
  const stable = [...factors].sort((left, right) =>
    Math.abs(right.value) - Math.abs(left.value)
    || (left.segmentId ?? "").localeCompare(right.segmentId ?? "")
    || (left.clusterId ?? "").localeCompare(right.clusterId ?? "")
    || left.key.localeCompare(right.key));
  const positive = stable.filter((factor) => factor.direction === "positive").slice(0, 18);
  const negative = stable.filter((factor) => factor.direction === "negative").slice(0, 18);
  const neutral = stable.filter((factor) => factor.direction === "neutral").slice(0, 2);
  return [...positive, ...negative, ...neutral];
}

/**
 * Atomically simulates a complete, already-frozen broadcast timeline.
 * UI playback should reveal the returned checkpoints and must never rerun this
 * function for the same episode ID.
 */
export function simulateAudienceEpisode(
  input: SimulateAudienceEpisodeInput,
): SimulateAudienceEpisodeOutput {
  const participantIds = stableParticipantIds(input.audience, input.participantIds);
  const explicitlyEligibleFavorites = new Set(
    input.eligibleFavoriteParticipantIds ?? participantIds,
  );
  const revealedEliminatedIds = new Set(
    input.episode.segments.flatMap((segment) =>
      segment.kind === "content" && segment.revealsEliminatedParticipantId
        ? [segment.revealsEliminatedParticipantId]
        : []),
  );
  const eligibleFavoriteParticipantIds = participantIds.filter((participantId) =>
    explicitlyEligibleFavorites.has(participantId) && !revealedEliminatedIds.has(participantId));
  assertAudienceState(input.audience, participantIds);
  assertBroadcastEpisode(input.episode, participantIds);
  validateRng(input.rng);
  if (Object.values(input.audience.clusters).some(
    (cluster) => cluster.lastEpisodeId === input.episode.id,
  )) {
    throw new Error(`Audience episode ${input.episode.id} has already been simulated.`);
  }

  const forecastDetails = selectAudienceForecastDetails(
    input.audience,
    input.episode,
    { ...input.forecastOptions, participantIds },
  );
  const fanBefore = selectParticipantAudienceAggregates(input.audience, participantIds);
  const nextAudience = structuredClone(input.audience);
  for (const value of Object.keys(nextAudience.publicKnowledge.storylines)) {
    nextAudience.publicKnowledge.storylines[value] = toUnit(
      nextAudience.publicKnowledge.storylines[value],
    ) * 0.92;
  }
  for (const value of Object.keys(nextAudience.publicKnowledge.participantAssociations)) {
    nextAudience.publicKnowledge.participantAssociations[value] = clamp(
      nextAudience.publicKnowledge.participantAssociations[value] * 0.96,
      -1,
      1,
    );
  }

  let rng = input.rng;
  let random: number;
  [random, rng] = nextRandom(rng);
  const episodeShock = (random - 0.5) * 0.1;
  const clusterShocks: Record<string, number> = {};
  const orderedDefinitions = [...AUDIENCE_CLUSTERS]
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const definition of orderedDefinitions) {
    [random, rng] = nextRandom(rng);
    clusterShocks[definition.id] = (random - 0.5) * 0.05;
  }
  [random, rng] = nextRandom(rng);
  const measurementPoints = (random - 0.5) * 0.6;

  const runtimes: ClusterRuntime[] = orderedDefinitions.map((definition) => {
    const state = nextAudience.clusters[definition.id];
    for (const participantId of participantIds) {
      state.participantFans[participantId].fatigue = clamp(
        state.participantFans[participantId].fatigue * 0.84,
        0,
        100,
      );
    }
    for (const interest of AUDIENCE_INTERESTS) {
      state.interestFatigue[interest] = clamp01(toUnit(state.interestFatigue[interest]) * 0.78);
    }
    const population = nextAudience.market.universeHouseholds * definition.populationShare;
    const startingFraction = clamp(
      forecastDetails.clusterTuneIn[definition.id]
      * (1 + episodeShock + clusterShocks[definition.id]),
      0,
      input.episode.schedule.tvOnRate,
    );
    const startHouseholds = population * startingFraction;
    return {
      definition,
      state,
      population,
      maxWatching: population * input.episode.schedule.tvOnRate,
      startHouseholds,
      watching: startHouseholds,
      reached: startHouseholds,
      firstTimeReach: 0,
      reentries: 0,
      viewerSeconds: 0,
      satisfactionMass: 0,
      satisfactionViewerSeconds: 0,
      contentSeconds: 0,
      commercialSeconds: 0,
      contextDeficitMass: 0,
      hookMass: 0,
      participantEpisodeExposure: Object.fromEntries(
        participantIds.map((participantId) => [participantId, 0]),
      ),
      signalEpisodeExposure: Object.fromEntries(
        AUDIENCE_INTERESTS.map((interest) => [interest, 0]),
      ) as Record<AudienceInterest, number>,
      returnIntentBefore: toUnit(state.returnIntent),
      favoriteLossCuriosity: 0,
    };
  });

  const checkpoints: AudienceEpisodeResult["checkpoints"] = [];
  const segmentFactors: AudienceFactorContribution[] = [];
  let elapsedSeconds = 0;
  let previousHouseholds = sum(runtimes.map((runtime) => runtime.watching));
  const totalEpisodeSeconds = sum(input.episode.segments.map((segment) => segment.durationSeconds));

  for (const [segmentIndex, segment] of input.episode.segments.entries()) {
    elapsedSeconds += segment.durationSeconds;
    const checkpointFactors: AudienceFactorContribution[] = [];

    if (segment.kind === "content" && segment.revealsEliminatedParticipantId) {
      const eliminatedParticipantId = segment.revealsEliminatedParticipantId;
      const prefixEpisode: BroadcastEpisode = {
        ...input.episode,
        segments: input.episode.segments.slice(0, segmentIndex + 1),
      };
      const favoriteLoss = applyFavoriteLoss({
        audience: nextAudience,
        eliminatedParticipantId,
        episode: prefixEpisode,
        activeParticipantIds: eligibleFavoriteParticipantIds,
      });
      nextAudience.clusters = favoriteLoss.audience.clusters;
      for (const runtime of runtimes) {
        runtime.state = nextAudience.clusters[runtime.definition.id];
        const impact = favoriteLoss.impacts.find(
          (candidate) => candidate.clusterId === runtime.definition.id,
        );
        if (!impact || impact.lostFavoriteShare <= 0) continue;
        runtime.favoriteLossCuriosity = clamp01(
          impact.lostFavoriteShare
          * (0.035 + favoriteLoss.farewellQuality * 0.075),
        );
        const factor: AudienceFactorContribution = {
          key: "favorite_eliminated",
          label: "Choque pela eliminação de um favorito",
          value: round(-impact.favoriteLossShock, 4),
          direction: "negative",
          clusterId: runtime.definition.id,
          segmentId: segment.id,
        };
        checkpointFactors.push(factor);
        segmentFactors.push(factor);
      }
    }

    for (const runtime of runtimes) {
      const beforeWatching = runtime.watching;
      const minutes = segment.durationSeconds / 60;
      let afterWatching: number;
      let averageWatching: number;

      if (segment.kind === "commercial") {
        const hazardPerMinute =
          0.015
          + runtime.definition.habits.zapping * 0.035
          + (1 - runtime.definition.habits.adTolerance) * 0.048
          + Math.min(0.025, (segment.breakNumber - 1) * 0.004);
        const churnFraction = clamp01(1 - Math.exp(-hazardPerMinute * minutes));
        const churn = beforeWatching * churnFraction;
        afterWatching = clamp(beforeWatching - churn, 0, runtime.maxWatching);
        averageWatching = (beforeWatching + afterWatching) / 2;
        runtime.commercialSeconds += segment.durationSeconds;
        const factor: AudienceFactorContribution = {
          key: "commercial_churn",
          label: `Intervalo comercial ${segment.breakNumber}`,
          value: round(-churnFraction, 4),
          direction: "negative",
          clusterId: runtime.definition.id,
          segmentId: segment.id,
        };
        checkpointFactors.push(factor);
        segmentFactors.push(factor);
      } else {
        const components = utilityFor(runtime, segment);
        const baseHazardPerMinute =
          0.007
          + runtime.definition.habits.zapping * 0.018
          + (1 - runtime.definition.habits.loyalty) * 0.01;
        const churnHazard =
          baseHazardPerMinute
          * (0.38 + (1 - components.utility) * 1.72);
        const churnFraction = clamp01(1 - Math.exp(-churnHazard * minutes));
        const churn = beforeWatching * churnFraction;
        const lapsedBefore = Math.max(0, runtime.reached - beforeWatching);
        const unseenBefore = Math.max(0, runtime.population - runtime.reached);
        const revealStrength = clamp01(
          segment.storylineHook * 0.34
          + components.favoritePull * 0.24
          + (segment.signals.conflict ?? 0) * 0.14
          + (segment.signals.spectacle ?? 0) * 0.14
          + segment.contextCompleteness * 0.14
          + runtime.favoriteLossCuriosity * 0.35,
        );
        const reentryFraction = clamp01(
          (0.004 + revealStrength * 0.025)
          * Math.sqrt(Math.max(0.25, minutes)),
        );
        const firstTuneFraction = clamp01(
          (0.0015 + revealStrength * 0.009)
          * Math.sqrt(Math.max(0.25, minutes)),
        );
        const returning = lapsedBefore * reentryFraction;
        const firstTime = unseenBefore * firstTuneFraction;
        afterWatching = clamp(
          beforeWatching - churn + returning + firstTime,
          0,
          runtime.maxWatching,
        );
        runtime.reached = clamp(runtime.reached + firstTime, 0, runtime.population);
        runtime.firstTimeReach = clamp(
          runtime.firstTimeReach + firstTime,
          0,
          runtime.population,
        );
        runtime.reentries = clamp(runtime.reentries + returning, 0, runtime.population);
        averageWatching = (beforeWatching + afterWatching) / 2;
        runtime.contentSeconds += segment.durationSeconds;
        runtime.satisfactionMass +=
          clamp01(components.utility - components.antiFanLoad * 0.18)
          * averageWatching
          * segment.durationSeconds;
        runtime.satisfactionViewerSeconds += averageWatching * segment.durationSeconds;
        runtime.contextDeficitMass +=
          (1 - segment.contextCompleteness) * segment.durationSeconds;
        runtime.hookMass += segment.storylineHook * segment.durationSeconds;
        updateFandom(runtime, segment, averageWatching);
        updateInterestFatigue(runtime, segment, averageWatching);
        const factors = componentFactors(
          components,
          runtime.definition.id,
          segment.id,
        );
        checkpointFactors.push(...factors);
        segmentFactors.push(...factors);
      }

      runtime.watching = afterWatching;
      runtime.viewerSeconds += averageWatching * segment.durationSeconds;
    }

    if (segment.kind !== "commercial") {
      updatePublicKnowledge(nextAudience, runtimes, segment);
    }
    const clusterViewers = Object.fromEntries(
      runtimes.map((runtime) => [runtime.definition.id, runtime.watching]),
    );
    const households = sum(Object.values(clusterViewers));
    const measuredRating = Math.max(
      0,
      households / nextAudience.market.householdsPerPoint + measurementPoints,
    );
    const activeTvHouseholds =
      nextAudience.market.universeHouseholds * input.episode.schedule.tvOnRate;
    checkpoints.push({
      segmentId: segment.id,
      label: segment.title,
      elapsedSeconds,
      households,
      rating: round(measuredRating, 3),
      share: round(activeTvHouseholds > 0 ? households / activeTvHouseholds : 0, 6),
      deltaHouseholds: households - previousHouseholds,
      clusterViewers,
      topFactors: checkpointFactors
        .sort((left, right) =>
          Math.abs(right.value) - Math.abs(left.value)
          || (left.clusterId ?? "").localeCompare(right.clusterId ?? "")
          || left.key.localeCompare(right.key))
        .slice(0, 4),
    });
    previousHouseholds = households;
  }

  for (const runtime of runtimes) {
    for (const participantId of participantIds) {
      if (!eligibleFavoriteParticipantIds.includes(participantId)) {
        runtime.state.favoriteShares[participantId] = 0;
      }
    }
    reconcileFavorites(runtime.state, eligibleFavoriteParticipantIds);
  }

  const clusterResults: ClusterEpisodeResult[] = [];
  const nextEpisodeIntent: Record<string, number> = {};
  for (const runtime of runtimes) {
    const { satisfaction, returnIntent } = calculateReturnIntent(
      runtime,
      totalEpisodeSeconds,
    );
    runtime.state.returnIntent = returnIntent;
    runtime.state.habit = clamp01(
      toUnit(runtime.state.habit) * 0.86
      + returnIntent * 0.09
      + satisfaction * 0.05,
    );
    runtime.state.favoriteLossShock = clamp01(
      toUnit(runtime.state.favoriteLossShock) * 0.35,
    );
    runtime.state.lastEpisodeId = input.episode.id;
    nextEpisodeIntent[runtime.definition.id] = returnIntent;

    const platform = runtime.definition.demographics.platform;
    const digitalPropensity =
      platform.connected_tv * 0.12
      + platform.catch_up * 0.17
      + platform.mobile_clips * 0.21;
    const digitalReach = clamp(
      runtime.population
      * digitalPropensity
      * (0.38 + satisfaction * 0.42 + runtime.definition.habits.noveltySeeking * 0.2),
      0,
      runtime.population,
    );
    const digitalPlatformWeight = Math.max(
      1e-9,
      platform.connected_tv + platform.catch_up + platform.mobile_clips,
    );
    const platformReachHouseholds = {
      linear: runtime.reached,
      connected_tv: digitalReach * platform.connected_tv / digitalPlatformWeight,
      catch_up: digitalReach * platform.catch_up / digitalPlatformWeight,
      mobile_clips: digitalReach * platform.mobile_clips / digitalPlatformWeight,
    };
    const averageAwareness = mean(Object.values(runtime.state.participantFans).map(
      (fan) => toUnit(fan.awareness),
    ), 0);
    const discussionHeat = clamp01(
      mean(Object.values(runtime.signalEpisodeExposure), 0) * 0.08
      + runtime.definition.interests.conflict * 0.24
      + runtime.definition.interests.strategy * 0.18
      + runtime.definition.habits.noveltySeeking * 0.18
      + satisfaction * 0.32,
    );
    const engagement = {
      vote: clamp01(
        runtime.definition.habits.votingPropensity
        * (0.28 + averageAwareness * 0.37 + satisfaction * 0.35),
      ),
      discuss: discussionHeat,
      follow: clamp01(
        satisfaction * 0.4
        + returnIntent * 0.35
        + platform.mobile_clips * 0.15
        + runtime.definition.habits.loyalty * 0.1,
      ),
    };
    clusterResults.push({
      clusterId: runtime.definition.id,
      populationHouseholds: runtime.population,
      startHouseholds: runtime.startHouseholds,
      averageHouseholds: totalEpisodeSeconds > 0
        ? runtime.viewerSeconds / totalEpisodeSeconds
        : runtime.startHouseholds,
      completionHouseholds: runtime.watching,
      uniqueReachHouseholds: runtime.reached,
      firstTimeReachHouseholds: runtime.firstTimeReach,
      reentryHouseholds: runtime.reentries,
      digitalReachHouseholds: digitalReach,
      platformReachHouseholds,
      engagement,
      satisfaction,
      returnIntentBefore: runtime.returnIntentBefore,
      returnIntentAfter: returnIntent,
      favoriteParticipantId: favoriteParticipantId(runtime.state, eligibleFavoriteParticipantIds),
    });
  }

  const totalViewerSeconds = sum(runtimes.map((runtime) => runtime.viewerSeconds));
  const averageHouseholds = totalEpisodeSeconds > 0
    ? totalViewerSeconds / totalEpisodeSeconds
    : sum(runtimes.map((runtime) => runtime.startHouseholds));
  const finalHouseholds = sum(runtimes.map((runtime) => runtime.watching));
  const startHouseholds = sum(runtimes.map((runtime) => runtime.startHouseholds));
  const activeTvHouseholdSeconds =
    nextAudience.market.universeHouseholds
    * input.episode.schedule.tvOnRate
    * totalEpisodeSeconds;
  const fanAfter = selectParticipantAudienceAggregates(nextAudience, participantIds);
  const platformReach = {
    linear: sum(clusterResults.map((cluster) => cluster.platformReachHouseholds.linear)),
    connected_tv: sum(clusterResults.map((cluster) => cluster.platformReachHouseholds.connected_tv)),
    catch_up: sum(clusterResults.map((cluster) => cluster.platformReachHouseholds.catch_up)),
    mobile_clips: sum(clusterResults.map((cluster) => cluster.platformReachHouseholds.mobile_clips)),
  };
  const result: AudienceEpisodeResult = {
    episodeId: input.episode.id,
    forecast: forecastDetails.forecast,
    averageRating: round(Math.max(
      0,
      averageHouseholds / nextAudience.market.householdsPerPoint + measurementPoints,
    ), 3),
    peakRating: round(Math.max(...checkpoints.map((checkpoint) => checkpoint.rating), 0), 3),
    share: round(
      activeTvHouseholdSeconds > 0
        ? totalViewerSeconds / activeTvHouseholdSeconds
        : 0,
      6,
    ),
    uniqueReach: sum(runtimes.map((runtime) => runtime.reached)),
    digitalReach: sum(clusterResults.map((cluster) => cluster.digitalReachHouseholds)),
    platformReach,
    completionRate: startHouseholds > 0 ? clamp01(finalHouseholds / startHouseholds) : 0,
    checkpoints,
    clusterResults,
    participantFanDeltas: aggregateFanDeltas(fanBefore, fanAfter, participantIds),
    nextEpisodeIntent,
    factorContributions: trimFactorContributions([
      ...forecastDetails.factorContributions,
      ...segmentFactors,
    ]),
    shocks: {
      episode: round(episodeShock, 8),
      measurementPoints: round(measurementPoints, 8),
      clusters: Object.fromEntries(Object.entries(clusterShocks).map(([clusterId, shock]) => [
        clusterId,
        round(shock, 8),
      ])),
    },
  };
  assertAudienceResult(result, nextAudience);
  assertAudienceState(nextAudience, participantIds);
  return {
    audience: nextAudience,
    result,
    rng,
    legacyAudience: deriveLegacyAudienceSummaries(nextAudience, participantIds),
  };
}
