import { AUDIENCE_SCHEDULES } from "./audience/catalog";
import { selectParticipantAudienceAggregates } from "./audience/selectors";
import { reduceGame } from "./reducer";
import { selectActiveCast } from "./selectors/active-cast";
import { createInitialState } from "./state";
import type { GameCommand } from "./commands";
import type {
  AudienceEpisodeResult,
  AudiencePortrayal,
  BroadcastEpisode,
  BroadcastSegment,
  ContentSegment,
  CutTone,
  EpisodeKind,
  EventInstance,
  GameState,
  ParticipantId,
} from "./types";

export type SimulationStrategy = "random" | "maximum_heat" | "favorite_focused" | "conflict_focused";

export type StrategyTradeoffMetrics = {
  seasons: number;
  episodes: number;
  averageRating: number;
  averagePeakRating: number;
  averagePeakLift: number;
  averageCompletionRate: number;
  averageReturnIntent: number;
  averageCohortRetentionSpread: number;
  averageFandomMovement: number;
  averageVoteMargin: number;
};

export type SimulationReport = {
  seasons: number;
  completed: number;
  deadlocks: number;
  invariantFailures: number;
  templateFrequency: Record<string, number>;
  categoryFrequency: Record<string, number>;
  pairRepetitions: number;
  leadershipDistribution: Record<string, number>;
  nominationDistribution: Record<string, number>;
  screenTimeTotals: Record<string, number>;
  threadsOpened: number;
  threadsResolved: number;
  commandLatencyP95Ms: number;
  strategySupport: Record<SimulationStrategy, Record<string, number>>;
  broadcastsSimulated: number;
  ratingStability: {
    averageRating: number;
    standardDeviation: number;
    minimum: number;
    maximum: number;
    averageSeasonSlope: number;
    monotonicCollapseSeasons: number;
    saturationEpisodeRate: number;
    collapseEpisodeRate: number;
  };
  outcomeDiversity: {
    winnerDistribution: Record<string, number>;
    uniqueWinners: number;
    primaryFavoriteDistribution: Record<string, number>;
    averageCohortReturnIntentSpread: number;
    averageFavoriteShareEntropy: number;
    averageVoteMargin: number;
  };
  strategyTradeoffs: Record<SimulationStrategy, StrategyTradeoffMetrics>;
};

type StrategyAccumulator = {
  seasons: number;
  episodes: number;
  ratings: number[];
  peaks: number[];
  completions: number[];
  returnIntents: number[];
  cohortSpreads: number[];
  fandomMovements: number[];
  voteMargins: number[];
};

const strategies: SimulationStrategy[] = ["random", "maximum_heat", "favorite_focused", "conflict_focused"];

const mean = (values: readonly number[]): number =>
  values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;

const standardDeviation = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

const round = (value: number, digits = 4): number => {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function favoriteFor(state: GameState): ParticipantId {
  const active = selectActiveCast(state);
  const aggregates = selectParticipantAudienceAggregates(state.audienceModel, active);
  return [...active].sort((left, right) =>
    (aggregates[right]?.favoriteShare ?? 0) - (aggregates[left]?.favoriteShare ?? 0)
    || (aggregates[right]?.attachment ?? 0) - (aggregates[left]?.attachment ?? 0)
    || left.localeCompare(right))[0] ?? state.castOrder[0];
}

function strategyRank(
  state: GameState,
  event: EventInstance,
  strategy: SimulationStrategy,
  episodeKind: EpisodeKind,
  favoriteId: ParticipantId,
): number {
  const conflict = Math.max(
    event.audienceSignals.conflict ?? 0,
    event.category === "Conflito" ? 1 : 0,
  );
  if (strategy === "random") {
    return stableHash(`${state.seasonId}:${state.clock.week}:${episodeKind}:${event.id}`) / 0xffff_ffff;
  }
  if (strategy === "maximum_heat") {
    return event.heat / 100 + (event.audienceSignals.spectacle ?? 0) * 0.18;
  }
  if (strategy === "favorite_focused") {
    return (event.actorIds.includes(favoriteId) ? 1.4 : 0)
      + (event.audienceSignals.vulnerability ?? 0) * 0.28
      + (event.audienceSignals.relationships ?? 0) * 0.2
      + event.heat / 500;
  }
  return conflict * 1.25
    + event.heat / 250
    + (event.audienceSignals.strategy ?? 0) * 0.12;
}

function episodeCandidates(
  state: GameState,
  kind: EpisodeKind,
): { candidates: EventInstance[]; required: EventInstance[] } {
  const thisWeek = state.house.eventHistory.filter((event) =>
    event.occurredAt.week === state.clock.week && event.actorIds.length > 0);
  if (kind === "final") {
    const finalEvents = thisWeek.filter((event) => event.window === "final");
    return { candidates: finalEvents, required: finalEvents };
  }
  if (kind === "elimination") {
    const anchors = thisWeek.filter((event) =>
      event.templateId === "anchor:elimination-result"
      || event.templateId === "anchor:farewell");
    const recap = thisWeek.filter((event) =>
      event.window !== "final" && !anchors.includes(event));
    return {
      candidates: [...recap.slice(-5), ...anchors],
      required: anchors,
    };
  }
  const candidates = thisWeek.filter((event) =>
    event.window !== "elimination" && event.window !== "final");
  const required = candidates.filter((event) =>
    event.templateId === "anchor:nomination-result");
  return { candidates, required };
}

function orderedEpisodeEvents(
  state: GameState,
  strategy: SimulationStrategy,
  kind: EpisodeKind,
  favoriteId: ParticipantId,
): EventInstance[] {
  const { candidates, required } = episodeCandidates(state, kind);
  const limit = kind === "vote" ? 10 : kind === "elimination" ? 8 : 12;
  const ranked = [...candidates].sort((left, right) =>
    strategyRank(state, right, strategy, kind, favoriteId)
    - strategyRank(state, left, strategy, kind, favoriteId)
    || left.sequence - right.sequence
    || left.id.localeCompare(right.id));
  const selectedById = new Map<string, EventInstance>();
  for (const event of required) selectedById.set(event.id, event);
  for (const event of ranked) {
    if (selectedById.size >= Math.max(limit, required.length)) break;
    selectedById.set(event.id, event);
  }
  const selected = [...selectedById.values()];

  if (kind === "elimination") {
    const reveal = selected.filter((event) => event.templateId === "anchor:elimination-result");
    const farewell = selected.filter((event) => event.templateId === "anchor:farewell");
    const recaps = selected.filter((event) =>
      event.templateId !== "anchor:elimination-result"
      && event.templateId !== "anchor:farewell");
    return [...recaps, ...reveal, ...farewell];
  }
  if (kind === "final") {
    const retrospective = selected.filter((event) => event.templateId === "anchor:season-retrospective");
    const speeches = selected.filter((event) => event.templateId !== "anchor:season-retrospective");
    return [...speeches, ...retrospective];
  }
  const nominationReveal = selected.filter((event) => event.templateId === "anchor:nomination-result");
  return [
    ...selected.filter((event) => event.templateId !== "anchor:nomination-result"),
    ...nominationReveal,
  ];
}

function toneFor(
  event: EventInstance,
  strategy: SimulationStrategy,
  favoriteId: ParticipantId,
  index: number,
): CutTone {
  if (strategy === "favorite_focused") {
    if (event.actorIds.includes(favoriteId)) return "emocional";
    return (event.audienceSignals.humor ?? 0) >= 0.7 ? "engracado" : "neutro";
  }
  if (strategy === "conflict_focused") {
    return index % 3 === 2 ? "malicioso" : "conflituoso";
  }
  if (strategy === "maximum_heat") {
    if ((event.audienceSignals.conflict ?? 0) >= 0.55) return "conflituoso";
    if ((event.audienceSignals.humor ?? 0) >= 0.6) return "engracado";
    if ((event.audienceSignals.vulnerability ?? 0) >= 0.6) return "emocional";
    return "neutro";
  }
  const palette: readonly CutTone[] = ["neutro", "engracado", "emocional", "conflituoso"];
  return palette[stableHash(`${event.id}:tone`) % palette.length];
}

function perspectivesFor(
  event: EventInstance,
  strategy: SimulationStrategy,
  favoriteId: ParticipantId,
): ParticipantId[] {
  if (strategy === "maximum_heat") return [...event.actorIds];
  if (strategy === "favorite_focused" && event.actorIds.includes(favoriteId)) {
    return [favoriteId];
  }
  if (strategy === "conflict_focused") {
    return [event.actorIds[stableHash(`${event.id}:perspective`) % event.actorIds.length]];
  }
  if (strategy === "random" && event.actorIds.length > 1 && stableHash(event.id) % 3 === 0) {
    return [event.actorIds[stableHash(`${event.id}:single`) % event.actorIds.length]];
  }
  return [...event.actorIds];
}

function portrayalsFor(
  event: EventInstance,
  tone: CutTone,
  perspectiveIds: readonly ParticipantId[],
): Partial<Record<ParticipantId, AudiencePortrayal[]>> {
  return Object.fromEntries(event.actorIds.map((participantId) => {
    const canonical = event.observablePortrayals[participantId] ?? ["neutral"];
    const editorial: AudiencePortrayal[] = [];
    const hasPerspective = perspectiveIds.includes(participantId);
    if (tone === "emocional" && hasPerspective) editorial.push("sympathetic", "vulnerable");
    if (tone === "engracado" && hasPerspective) editorial.push("sympathetic");
    if (tone === "conflituoso") editorial.push(hasPerspective ? "justified" : "aggressive");
    if (tone === "malicioso") editorial.push(hasPerspective ? "justified" : "dishonest");
    return [participantId, [...new Set([...canonical, ...editorial])]];
  }));
}

function contentSegmentFor(
  state: GameState,
  event: EventInstance,
  strategy: SimulationStrategy,
  kind: EpisodeKind,
  favoriteId: ParticipantId,
  index: number,
  episodeId: string,
): ContentSegment {
  const tone = toneFor(event, strategy, favoriteId, index);
  const perspectiveIds = perspectivesFor(event, strategy, favoriteId);
  const anchor = event.templateId.startsWith("anchor:");
  const contextBase =
    strategy === "maximum_heat" ? 0.62
      : strategy === "favorite_focused" ? 0.58
        : strategy === "conflict_focused" ? 0.38
          : 0.7;
  const contextCompleteness = Math.min(
    1,
    contextBase
      + (anchor ? 0.2 : 0)
      + (event.sourceEventIds.length > 0 ? 0.08 : 0)
      + (strategy === "favorite_focused" && event.actorIds.includes(favoriteId) ? 0.08 : 0),
  );
  const pendingEliminatedId = state.audienceModel.pendingVote?.kind === "elimination"
    ? state.audienceModel.pendingVote.selectedParticipantId
    : undefined;
  const revealsEliminatedParticipantId = kind === "elimination"
    && event.templateId === "anchor:elimination-result"
    ? event.roleBindings.eliminated?.[0] ?? pendingEliminatedId
    : undefined;
  return {
    id: `${episodeId}:content:${index + 1}`,
    kind: "content",
    title: event.title,
    durationSeconds: Math.max(60, Math.round(event.duration * 45)),
    sourceEventId: event.id,
    participantIds: [...event.actorIds],
    perspectiveIds,
    tone,
    signals: structuredClone(event.audienceSignals),
    portrayals: portrayalsFor(event, tone, perspectiveIds),
    contextCompleteness,
    storylineHook: Math.min(
      1,
      0.22
        + event.heat / 160
        + (event.sourceThreadIds.length > 0 ? 0.12 : 0)
        + (anchor ? 0.08 : 0),
    ),
    ...(revealsEliminatedParticipantId ? { revealsEliminatedParticipantId } : {}),
  };
}

function insertCommercials(
  contents: readonly ContentSegment[],
  strategy: SimulationStrategy,
  favoriteId: ParticipantId,
  episodeId: string,
): BroadcastSegment[] {
  if (contents.length < 2) return [...contents];
  const positions = new Set<number>();
  if (strategy === "maximum_heat") {
    positions.add(Math.max(1, Math.ceil(contents.length * 0.58)));
  } else if (strategy === "conflict_focused") {
    positions.add(1);
    if (contents.length >= 5) positions.add(Math.ceil(contents.length * 0.55));
  } else if (strategy === "favorite_focused") {
    const lowFavoriteIndex = contents.findIndex((segment, index) =>
      index > 0 && !segment.participantIds.includes(favoriteId));
    positions.add(lowFavoriteIndex > 0 ? lowFavoriteIndex : Math.ceil(contents.length * 0.48));
  } else {
    positions.add(Math.ceil(contents.length * 0.4));
    if (contents.length >= 6) positions.add(Math.ceil(contents.length * 0.76));
  }

  const segments: BroadcastSegment[] = [];
  let breakNumber = 0;
  for (const [index, content] of contents.entries()) {
    if (positions.has(index)) {
      breakNumber += 1;
      segments.push({
        id: `${episodeId}:commercial:${breakNumber}`,
        kind: "commercial",
        title: `Intervalo comercial ${breakNumber}`,
        durationSeconds:
          strategy === "maximum_heat" ? 60
            : strategy === "conflict_focused" ? 120
              : strategy === "favorite_focused" ? 75
                : 90,
        breakNumber,
      });
    }
    segments.push(content);
  }
  return segments;
}

/**
 * Creates the immutable edit used by calibration runs. The builder only reads
 * canonical EventInstances, so hidden traits and unaired house state never
 * become audience signals.
 */
export function buildSimulationEpisode(
  state: GameState,
  strategy: SimulationStrategy,
  kind: Extract<EpisodeKind, "vote" | "elimination" | "final">,
): BroadcastEpisode {
  const favoriteId = favoriteFor(state);
  const episodeId = `${state.seasonId}:week-${state.clock.week}:${kind}:${strategy}`;
  const events = orderedEpisodeEvents(state, strategy, kind, favoriteId);
  const contents = events.map((event, index) =>
    contentSegmentFor(state, event, strategy, kind, favoriteId, index, episodeId));
  if (contents.length === 0) {
    throw new Error(`No canonical footage is available for the ${kind} episode.`);
  }
  return {
    id: episodeId,
    week: state.clock.week,
    kind,
    schedule: { ...AUDIENCE_SCHEDULES[kind] },
    segments: insertCommercials(contents, strategy, favoriteId, episodeId),
  };
}

function runCommand(state: GameState, command: GameCommand, latencies: number[]): GameState {
  const started = performance.now();
  const result = reduceGame(state, command);
  latencies.push(performance.now() - started);
  if (result.diagnostic) throw new Error(result.diagnostic);
  return result.state;
}

function simulateOne(seed: string, strategy: SimulationStrategy, latencies: number[]): GameState {
  let state = runCommand(
    createInitialState(seed, "dynamic", "clustered"),
    { type: "START_SEASON", seed },
    latencies,
  );
  const challengeTypes = ["resistencia", "sorte", "atencao"] as const;
  let weekIndex = 0;
  while (selectActiveCast(state).length > 3) {
    state = runCommand(
      state,
      { type: "CONFIRM_CHALLENGE", challengeType: challengeTypes[weekIndex % challengeTypes.length] },
      latencies,
    );
    state = runCommand(state, { type: "START_PARTY" }, latencies);
    state = runCommand(state, { type: "FORM_NOMINATION" }, latencies);
    state = runCommand(
      state,
      { type: "AIR_EPISODE", episode: buildSimulationEpisode(state, strategy, "vote") },
      latencies,
    );
    state = runCommand(state, { type: "CLOSE_AUDIENCE_VOTE" }, latencies);
    state = runCommand(
      state,
      { type: "AIR_EPISODE", episode: buildSimulationEpisode(state, strategy, "elimination") },
      latencies,
    );
    state = runCommand(state, { type: "RESOLVE_ELIMINATION" }, latencies);
    if (selectActiveCast(state).length > 3) {
      state = runCommand(state, { type: "ADVANCE_WEEK" }, latencies);
    }
    weekIndex += 1;
  }
  state = runCommand(
    state,
    { type: "AIR_EPISODE", episode: buildSimulationEpisode(state, strategy, "final") },
    latencies,
  );
  state = runCommand(state, { type: "CLOSE_FINAL_VOTE" }, latencies);
  return runCommand(state, { type: "RESOLVE_FINAL" }, latencies);
}

function resultRecords(state: GameState): Array<{
  episode: BroadcastEpisode;
  result: AudienceEpisodeResult;
}> {
  return state.broadcasts.flatMap((broadcast) =>
    broadcast.episode && broadcast.result
      ? [{ episode: broadcast.episode, result: broadcast.result }]
      : []);
}

function linearSlope(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (const [index, value] of values.entries()) {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function normalizedFavoriteEntropy(state: GameState): number {
  const entropies = Object.values(state.audienceModel.clusters).map((cluster) => {
    const weights = [...Object.values(cluster.favoriteShares), cluster.unalignedShare]
      .filter((value) => value > 0);
    if (weights.length <= 1) return 0;
    const total = weights.reduce((sum, value) => sum + value, 0);
    const entropy = -weights.reduce((sum, value) => {
      const probability = value / total;
      return sum + probability * Math.log(probability);
    }, 0);
    return entropy / Math.log(weights.length);
  });
  return mean(entropies);
}

function primaryFavorites(state: GameState): ParticipantId[] {
  return Object.values(state.audienceModel.clusters).flatMap((cluster) => {
    const favorite = Object.entries(cluster.favoriteShares)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    return favorite && favorite[1] > 0 ? [favorite[0]] : [];
  });
}

function voteMargins(state: GameState): number[] {
  return state.audienceModel.voteHistory.map((vote) => {
    const shares = Object.values(vote.shares).sort((left, right) => right - left);
    return (shares[0] ?? 0) - (shares[1] ?? 0);
  });
}

function emptyStrategyAccumulator(): StrategyAccumulator {
  return {
    seasons: 0,
    episodes: 0,
    ratings: [],
    peaks: [],
    completions: [],
    returnIntents: [],
    cohortSpreads: [],
    fandomMovements: [],
    voteMargins: [],
  };
}

function finalizedStrategyMetrics(accumulator: StrategyAccumulator): StrategyTradeoffMetrics {
  return {
    seasons: accumulator.seasons,
    episodes: accumulator.episodes,
    averageRating: round(mean(accumulator.ratings)),
    averagePeakRating: round(mean(accumulator.peaks)),
    averagePeakLift: round(mean(accumulator.peaks) - mean(accumulator.ratings)),
    averageCompletionRate: round(mean(accumulator.completions)),
    averageReturnIntent: round(mean(accumulator.returnIntents)),
    averageCohortRetentionSpread: round(mean(accumulator.cohortSpreads)),
    averageFandomMovement: round(mean(accumulator.fandomMovements)),
    averageVoteMargin: round(mean(accumulator.voteMargins)),
  };
}

export function simulateSeasons(seasons = 250): SimulationReport {
  const strategySupport: SimulationReport["strategySupport"] = {
    random: {},
    maximum_heat: {},
    favorite_focused: {},
    conflict_focused: {},
  };
  const templateFrequency: Record<string, number> = {};
  const categoryFrequency: Record<string, number> = {};
  const leadershipDistribution: Record<string, number> = {};
  const nominationDistribution: Record<string, number> = {};
  const screenTimeTotals: Record<string, number> = {};
  const winnerDistribution: Record<string, number> = {};
  const primaryFavoriteDistribution: Record<string, number> = {};
  const strategyAccumulators: Record<SimulationStrategy, StrategyAccumulator> = {
    random: emptyStrategyAccumulator(),
    maximum_heat: emptyStrategyAccumulator(),
    favorite_focused: emptyStrategyAccumulator(),
    conflict_focused: emptyStrategyAccumulator(),
  };
  const latencies: number[] = [];
  const allRatings: number[] = [];
  const seasonSlopes: number[] = [];
  const cohortReturnIntentSpreads: number[] = [];
  const favoriteEntropies: number[] = [];
  const allVoteMargins: number[] = [];
  let completed = 0;
  let deadlocks = 0;
  let invariantFailures = 0;
  let pairRepetitions = 0;
  let threadsOpened = 0;
  let threadsResolved = 0;
  let monotonicCollapseSeasons = 0;
  let saturatedEpisodes = 0;
  let collapsedEpisodes = 0;
  let broadcastsSimulated = 0;

  for (let index = 0; index < seasons; index += 1) {
    const strategy = strategies[index % strategies.length];
    try {
      const state = simulateOne(`simulator-${index}`, strategy, latencies);
      if (state.competition.winnerId) completed += 1;
      else deadlocks += 1;
      strategyAccumulators[strategy].seasons += 1;

      for (const event of state.house.eventHistory) {
        templateFrequency[event.templateId] = (templateFrequency[event.templateId] ?? 0) + 1;
        categoryFrequency[event.category] = (categoryFrequency[event.category] ?? 0) + 1;
      }
      for (let eventIndex = 1; eventIndex < state.house.eventHistory.length; eventIndex += 1) {
        const previous = [...state.house.eventHistory[eventIndex - 1].actorIds].sort().join(">");
        const current = [...state.house.eventHistory[eventIndex].actorIds].sort().join(">");
        if (previous === current) pairRepetitions += 1;
      }
      for (const challenge of state.competition.challengeHistory) {
        leadershipDistribution[challenge.winnerId] = (leadershipDistribution[challenge.winnerId] ?? 0) + 1;
      }
      for (const nomination of state.competition.nominationHistory) {
        for (const id of [nomination.leaderTargetId, nomination.houseTargetId]) {
          nominationDistribution[id] = (nominationDistribution[id] ?? 0) + 1;
        }
      }
      for (const [id, character] of Object.entries(state.characters)) {
        screenTimeTotals[id] = (screenTimeTotals[id] ?? 0) + character.audience.screenTime;
        strategySupport[strategy][id] = (strategySupport[strategy][id] ?? 0) + character.audience.support;
      }
      const threads = Object.values(state.narrative.threads);
      threadsOpened += threads.length;
      threadsResolved += threads.filter((thread) => thread.status === "resolved").length;

      const records = resultRecords(state);
      const seasonRatings = records.map(({ result }) => result.averageRating);
      allRatings.push(...seasonRatings);
      broadcastsSimulated += records.length;
      seasonSlopes.push(linearSlope(seasonRatings));
      if (
        seasonRatings.length >= 3
        && seasonRatings.every((rating, ratingIndex) =>
          ratingIndex === 0 || rating <= seasonRatings[ratingIndex - 1])
        && seasonRatings.at(-1)! < seasonRatings[0] * 0.85
      ) {
        monotonicCollapseSeasons += 1;
      }

      const accumulator = strategyAccumulators[strategy];
      accumulator.episodes += records.length;
      for (const { episode, result } of records) {
        accumulator.ratings.push(result.averageRating);
        accumulator.peaks.push(result.peakRating);
        accumulator.completions.push(result.completionRate);
        const returnIntent = mean(Object.values(result.nextEpisodeIntent));
        accumulator.returnIntents.push(returnIntent);
        const cohortSpread = standardDeviation(
          result.clusterResults.map((cluster) => cluster.returnIntentAfter),
        );
        accumulator.cohortSpreads.push(cohortSpread);
        cohortReturnIntentSpreads.push(cohortSpread);
        accumulator.fandomMovements.push(mean(result.participantFanDeltas.map((delta) =>
          Math.abs(delta.sentimentAfter - delta.sentimentBefore)
          + Math.abs(delta.attachmentAfter - delta.attachmentBefore))));

        const ratingCeiling =
          state.audienceModel.market.universeHouseholds
          * episode.schedule.tvOnRate
          / state.audienceModel.market.householdsPerPoint;
        if (result.averageRating >= ratingCeiling * 0.9) saturatedEpisodes += 1;
        if (result.averageRating < result.forecast.low * 0.55) collapsedEpisodes += 1;
      }

      const margins = voteMargins(state);
      accumulator.voteMargins.push(...margins);
      allVoteMargins.push(...margins);
      favoriteEntropies.push(normalizedFavoriteEntropy(state));
      for (const participantId of primaryFavorites(state)) {
        primaryFavoriteDistribution[participantId] =
          (primaryFavoriteDistribution[participantId] ?? 0) + 1;
      }
      if (state.competition.winnerId) {
        winnerDistribution[state.competition.winnerId] =
          (winnerDistribution[state.competition.winnerId] ?? 0) + 1;
      }
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("invariant")) {
        invariantFailures += 1;
      } else {
        deadlocks += 1;
      }
    }
  }

  latencies.sort((left, right) => left - right);
  const strategyTradeoffs = Object.fromEntries(strategies.map((strategy) => [
    strategy,
    finalizedStrategyMetrics(strategyAccumulators[strategy]),
  ])) as Record<SimulationStrategy, StrategyTradeoffMetrics>;
  return {
    seasons,
    completed,
    deadlocks,
    invariantFailures,
    templateFrequency,
    categoryFrequency,
    pairRepetitions,
    leadershipDistribution,
    nominationDistribution,
    screenTimeTotals,
    threadsOpened,
    threadsResolved,
    commandLatencyP95Ms: round(latencies[Math.floor(latencies.length * 0.95)] ?? 0),
    strategySupport,
    broadcastsSimulated,
    ratingStability: {
      averageRating: round(mean(allRatings)),
      standardDeviation: round(standardDeviation(allRatings)),
      minimum: round(allRatings.length > 0 ? Math.min(...allRatings) : 0),
      maximum: round(allRatings.length > 0 ? Math.max(...allRatings) : 0),
      averageSeasonSlope: round(mean(seasonSlopes)),
      monotonicCollapseSeasons,
      saturationEpisodeRate: round(
        broadcastsSimulated > 0 ? saturatedEpisodes / broadcastsSimulated : 0,
      ),
      collapseEpisodeRate: round(
        broadcastsSimulated > 0 ? collapsedEpisodes / broadcastsSimulated : 0,
      ),
    },
    outcomeDiversity: {
      winnerDistribution,
      uniqueWinners: Object.keys(winnerDistribution).length,
      primaryFavoriteDistribution,
      averageCohortReturnIntentSpread: round(mean(cohortReturnIntentSpreads)),
      averageFavoriteShareEntropy: round(mean(favoriteEntropies)),
      averageVoteMargin: round(mean(allVoteMargins)),
    },
    strategyTradeoffs,
  };
}
