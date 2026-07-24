import { reduceGame } from "./reducer";
import { selectActiveCast } from "./selectors/active-cast";
import { createInitialState } from "./state";
import type { GameCommand } from "./commands";
import type { BroadcastCut, GameState } from "./types";

export type SimulationStrategy = "random" | "maximum_heat" | "favorite_focused" | "conflict_focused";

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
};

const strategies: SimulationStrategy[] = ["random", "maximum_heat", "favorite_focused", "conflict_focused"];

function cutsFor(state: GameState, strategy: SimulationStrategy): BroadcastCut[] {
  const events = state.house.eventHistory.filter((event) => event.occurredAt.week === state.clock.week);
  const ordered = [...events].sort((left, right) => {
    if (strategy === "maximum_heat" || strategy === "conflict_focused") return right.heat - left.heat;
    if (strategy === "favorite_focused") {
      const favorite = state.castOrder[0];
      return Number(right.actorIds.includes(favorite)) - Number(left.actorIds.includes(favorite)) || right.heat - left.heat;
    }
    return left.id.localeCompare(right.id);
  }).slice(0, 3);
  return ordered.map((event) => ({
    eventInstanceId: event.id,
    perspectiveIds: strategy === "favorite_focused" && event.actorIds.includes(state.castOrder[0])
      ? [state.castOrder[0]]
      : [...event.actorIds],
    tone: strategy === "conflict_focused" ? "conflituoso" : strategy === "favorite_focused" ? "emocional" : "neutro",
  }));
}

function runCommand(state: GameState, command: GameCommand, latencies: number[]): GameState {
  const started = performance.now();
  const result = reduceGame(state, command);
  latencies.push(performance.now() - started);
  if (result.diagnostic) throw new Error(result.diagnostic);
  return result.state;
}

function simulateOne(seed: string, strategy: SimulationStrategy, latencies: number[]): GameState {
  let state = runCommand(createInitialState(seed, "dynamic"), { type: "START_SEASON", seed }, latencies);
  const challengeTypes = ["resistencia", "sorte", "atencao"] as const;
  let weekIndex = 0;
  while (selectActiveCast(state).length > 3) {
    state = runCommand(state, { type: "CONFIRM_CHALLENGE", challengeType: challengeTypes[weekIndex % 3] }, latencies);
    state = runCommand(state, { type: "START_PARTY" }, latencies);
    const cuts = cutsFor(state, strategy);
    if (cuts.length) state = runCommand(state, { type: "BROADCAST_EPISODE", cuts }, latencies);
    state = runCommand(state, { type: "FORM_NOMINATION" }, latencies);
    const eliminatedId = strategy === "favorite_focused"
      ? [...state.competition.nomineeIds].sort((left, right) =>
        state.characters[left].audience.support - state.characters[right].audience.support)[0]
      : state.competition.nomineeIds[0];
    state = runCommand(state, { type: "REGISTER_AUDIENCE_RESULT", participantId: eliminatedId }, latencies);
    state = runCommand(state, { type: "RESOLVE_ELIMINATION", participantId: eliminatedId }, latencies);
    if (selectActiveCast(state).length > 3) state = runCommand(state, { type: "ADVANCE_WEEK" }, latencies);
    weekIndex += 1;
  }
  return runCommand(state, { type: "RESOLVE_FINAL", winnerId: selectActiveCast(state)[0] }, latencies);
}

export function simulateSeasons(seasons = 250): SimulationReport {
  const report: SimulationReport = {
    seasons, completed: 0, deadlocks: 0, invariantFailures: 0,
    templateFrequency: {}, categoryFrequency: {}, pairRepetitions: 0,
    leadershipDistribution: {}, nominationDistribution: {}, screenTimeTotals: {},
    threadsOpened: 0, threadsResolved: 0, commandLatencyP95Ms: 0,
    strategySupport: { random: {}, maximum_heat: {}, favorite_focused: {}, conflict_focused: {} },
  };
  const latencies: number[] = [];
  for (let index = 0; index < seasons; index += 1) {
    const strategy = strategies[index % strategies.length];
    try {
      const state = simulateOne(`simulator-${index}`, strategy, latencies);
      if (state.competition.winnerId) report.completed += 1;
      else report.deadlocks += 1;
      for (const event of state.house.eventHistory) {
        report.templateFrequency[event.templateId] = (report.templateFrequency[event.templateId] ?? 0) + 1;
        report.categoryFrequency[event.category] = (report.categoryFrequency[event.category] ?? 0) + 1;
      }
      for (let eventIndex = 1; eventIndex < state.house.eventHistory.length; eventIndex += 1) {
        const previous = [...state.house.eventHistory[eventIndex - 1].actorIds].sort().join(">");
        const current = [...state.house.eventHistory[eventIndex].actorIds].sort().join(">");
        if (previous === current) report.pairRepetitions += 1;
      }
      for (const challenge of state.competition.challengeHistory) {
        report.leadershipDistribution[challenge.winnerId] = (report.leadershipDistribution[challenge.winnerId] ?? 0) + 1;
      }
      for (const nomination of state.competition.nominationHistory) {
        for (const id of [nomination.leaderTargetId, nomination.houseTargetId]) {
          report.nominationDistribution[id] = (report.nominationDistribution[id] ?? 0) + 1;
        }
      }
      for (const [id, character] of Object.entries(state.characters)) {
        report.screenTimeTotals[id] = (report.screenTimeTotals[id] ?? 0) + character.audience.screenTime;
        report.strategySupport[strategy][id] = (report.strategySupport[strategy][id] ?? 0) + character.audience.support;
      }
      const threads = Object.values(state.narrative.threads);
      report.threadsOpened += threads.length;
      report.threadsResolved += threads.filter((thread) => thread.status === "resolved").length;
    } catch (error) {
      if (error instanceof Error && error.message.includes("invariant")) report.invariantFailures += 1;
      else report.deadlocks += 1;
    }
  }
  latencies.sort((left, right) => left - right);
  report.commandLatencyP95Ms = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  return report;
}
