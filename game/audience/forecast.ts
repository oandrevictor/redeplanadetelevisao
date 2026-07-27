import type {
  AudienceEpisodeResult,
  AudienceFactorContribution,
  AudienceState,
  BroadcastEpisode,
  EpisodeKind,
  ParticipantId,
} from "../types";
import { AUDIENCE_CLUSTERS } from "./catalog";
import { clamp01, directionFor, mean, round, sum, toUnit } from "./math";
import { assertAudienceState, assertBroadcastEpisode } from "./validation";

export type AudienceForecastOptions = {
  participantIds?: readonly ParticipantId[];
  /**
   * Unit interval. When omitted, public storyline strength and accumulated
   * return intent provide a deterministic season-momentum estimate.
   */
  seasonMomentum?: number;
};

export type AudienceForecastDetails = {
  forecast: AudienceEpisodeResult["forecast"];
  expectedHouseholds: number;
  clusterTuneIn: Record<string, number>;
  factorContributions: AudienceFactorContribution[];
};

const kindWeights: Record<EpisodeKind, Partial<Record<
  | "strategy"
  | "competition"
  | "conflict"
  | "humor"
  | "relationships"
  | "vulnerability"
  | "fairness"
  | "authenticity"
  | "redemption"
  | "spectacle"
  | "representation",
  number
>>> = {
  premiere: {
    spectacle: 0.28,
    relationships: 0.2,
    authenticity: 0.16,
    humor: 0.12,
    representation: 0.14,
    competition: 0.1,
  },
  challenge: {
    competition: 0.52,
    spectacle: 0.23,
    strategy: 0.15,
    fairness: 0.1,
  },
  vote: {
    strategy: 0.34,
    fairness: 0.23,
    conflict: 0.18,
    relationships: 0.15,
    authenticity: 0.1,
  },
  elimination: {
    relationships: 0.25,
    vulnerability: 0.2,
    fairness: 0.18,
    conflict: 0.14,
    redemption: 0.13,
    spectacle: 0.1,
  },
  final: {
    spectacle: 0.27,
    competition: 0.2,
    redemption: 0.17,
    representation: 0.13,
    relationships: 0.13,
    authenticity: 0.1,
  },
};

function kindAffinity(clusterId: string, kind: EpisodeKind): number {
  const definition = AUDIENCE_CLUSTERS.find((entry) => entry.id === clusterId);
  if (!definition) return 0.5;
  const weights = kindWeights[kind];
  return sum(
    Object.entries(weights).map(([interest, weight]) =>
      definition.interests[interest as keyof typeof definition.interests] * (weight ?? 0)),
  );
}

function favoritePull(
  audience: AudienceState,
  clusterId: string,
  episodeParticipantIds: ReadonlySet<ParticipantId>,
): number {
  const cluster = audience.clusters[clusterId];
  if (!cluster) return 0.25;
  let pull = 0;
  let representedFavoriteShare = 0;
  for (const participantId of episodeParticipantIds) {
    const share = cluster.favoriteShares[participantId] ?? 0;
    const fan = cluster.participantFans[participantId];
    if (!fan) continue;
    representedFavoriteShare += share;
    const sentiment = clamp01((fan.sentiment + 100) / 200);
    const antiFanCuriosity = clamp01(-fan.sentiment / 100) * toUnit(fan.awareness) * 0.22;
    pull += share * (
      toUnit(fan.attachment) * 0.58
      + toUnit(fan.awareness) * 0.16
      + sentiment * 0.26
    ) + antiFanCuriosity;
  }
  // A cast without established favorites still has modest discovery appeal.
  return clamp01(0.24 + pull + representedFavoriteShare * 0.16);
}

function episodeParticipants(episode: BroadcastEpisode): Set<ParticipantId> {
  return new Set(
    episode.segments.flatMap((segment) => segment.kind === "commercial" ? [] : segment.participantIds),
  );
}

function publicStorylineStrength(audience: AudienceState): number {
  return mean(Object.values(audience.publicKnowledge.storylines).map(toUnit), 0.35);
}

function scheduleStrength(episode: BroadcastEpisode): number {
  return clamp01(
    episode.schedule.leadInStrength * 0.4
    + episode.schedule.promotion * 0.35
    + (1 - episode.schedule.competitionPressure) * 0.25,
  );
}

/**
 * Pure forecast selector. It never consumes RNG and depends only on the
 * immutable episode input plus audience state available before transmission.
 */
export function selectAudienceForecastDetails(
  audience: AudienceState,
  episode: BroadcastEpisode,
  options: AudienceForecastOptions = {},
): AudienceForecastDetails {
  const participantIds = options.participantIds ?? Object.keys(
    Object.values(audience.clusters)[0]?.participantFans ?? {},
  );
  assertAudienceState(audience, participantIds);
  assertBroadcastEpisode(episode, participantIds);

  const visibleParticipants = episodeParticipants(episode);
  const storyline = publicStorylineStrength(audience);
  const averageReturnIntent = mean(
    AUDIENCE_CLUSTERS.map((definition) =>
      toUnit(audience.clusters[definition.id]?.returnIntent ?? definition.habits.loyalty)),
    0.5,
  );
  const momentum = clamp01(
    options.seasonMomentum
      ?? (episode.kind === "premiere" ? 0.55 : averageReturnIntent * 0.72 + storyline * 0.28),
  );
  const schedule = scheduleStrength(episode);
  const clusterTuneIn: Record<string, number> = {};
  const factors: AudienceFactorContribution[] = [];
  let expectedHouseholds = 0;

  for (const definition of [...AUDIENCE_CLUSTERS].sort((left, right) => left.id.localeCompare(right.id))) {
    const state = audience.clusters[definition.id];
    const habit = clamp01(
      definition.habits.baseTuneIn * 0.48
      + toUnit(state?.habit ?? definition.habits.baseTuneIn) * 0.27
      + definition.habits.daypartAvailability * 0.25,
    );
    const returnIntent = toUnit(state?.returnIntent ?? definition.habits.loyalty);
    const episodeAffinity = kindAffinity(definition.id, episode.kind);
    const participantPull = favoritePull(audience, definition.id, visibleParticipants);
    const favoriteAndStoryline = clamp01(participantPull * 0.72 + storyline * 0.28);

    const demand = clamp01(
      habit * 0.3
      + returnIntent * 0.25
      + episodeAffinity * 0.15
      + favoriteAndStoryline * 0.15
      + schedule * 0.1
      + momentum * 0.05,
    );
    // Demand is the share of households currently using television that pick
    // Rede Plana, not a share of the complete measurable universe.
    const tuneIn = clamp01(episode.schedule.tvOnRate * (0.12 + demand * 0.34));
    clusterTuneIn[definition.id] = tuneIn;
    expectedHouseholds += audience.market.universeHouseholds * definition.populationShare * tuneIn;

    const baseline = 0.5;
    factors.push(
      {
        key: "habit",
        label: "Hábito e disponibilidade",
        value: round((habit - baseline) * 0.3, 4),
        direction: directionFor(habit - baseline),
        clusterId: definition.id,
      },
      {
        key: "return_intent",
        label: "Intenção de retorno",
        value: round((returnIntent - baseline) * 0.25, 4),
        direction: directionFor(returnIntent - baseline),
        clusterId: definition.id,
      },
      {
        key: "episode_affinity",
        label: "Afinidade com o tipo de programa",
        value: round((episodeAffinity - baseline) * 0.15, 4),
        direction: directionFor(episodeAffinity - baseline),
        clusterId: definition.id,
      },
      {
        key: "favorite_pull",
        label: "Favoritos e histórias públicas",
        value: round((favoriteAndStoryline - baseline) * 0.15, 4),
        direction: directionFor(favoriteAndStoryline - baseline),
        clusterId: definition.id,
      },
    );
  }

  const expected = expectedHouseholds / audience.market.householdsPerPoint;
  const maximumPoints = audience.market.universeHouseholds / audience.market.householdsPerPoint;
  const forecast = {
    low: round(Math.max(0, expected * 0.92), 2),
    expected: round(expected, 2),
    high: round(Math.min(maximumPoints, expected * 1.08), 2),
  };
  const factorContributions = factors
    .sort((left, right) =>
      Math.abs(right.value) - Math.abs(left.value)
      || (left.clusterId ?? "").localeCompare(right.clusterId ?? "")
      || left.key.localeCompare(right.key))
    .slice(0, 24);

  return { forecast, expectedHouseholds, clusterTuneIn, factorContributions };
}

export function selectClusterAudienceForecast(
  audience: AudienceState,
  episode: BroadcastEpisode,
  options: AudienceForecastOptions = {},
): AudienceEpisodeResult["forecast"] {
  return selectAudienceForecastDetails(audience, episode, options).forecast;
}
