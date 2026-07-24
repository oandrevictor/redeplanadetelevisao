import type { CommandResult, GameCommand } from "./commands";
import { castById } from "./content/cast";
import { generateWindow } from "./engine/generate-window";
import { assertInvariants } from "./invariants";
import { nextRandom } from "./rng";
import { selectActiveCast } from "./selectors/active-cast";
import { createInitialState } from "./state";
import type { GameState, ParticipantId } from "./types";

const clamp = (value: number) => Math.min(100, Math.max(0, value));

function appendChallengeAnchor(
  state: GameState,
  challengeType: Extract<GameCommand, { type: "CONFIRM_CHALLENGE" }>["challengeType"],
  standings: Array<{ participantId: ParticipantId; score: number }>,
  winnerId: ParticipantId,
): void {
  const sequence = state.house.eventHistory.length + 1;
  state.house.eventHistory.push({
    id: `event-${state.seasonId}-${state.clock.tick}-${sequence}`,
    templateId: "anchor:challenge-result",
    templateRevision: 1,
    sequence,
    occurredAt: { ...state.clock },
    window: state.clock.window,
    roleBindings: {
      winner: [winnerId],
      contestants: standings.map((standing) => standing.participantId),
    },
    actorIds: standings.map((standing) => standing.participantId),
    sourceEventIds: [],
    sourceThreadIds: [],
    title: `${castById[winnerId].name.split(" ")[0]} vence a prova`,
    description: `A prova de ${challengeType} termina com uma classificação completa e uma nova liderança na casa.`,
    category: "Prova",
    duration: 8,
    heat: 88,
    effects: [],
    scoreBreakdown: { mandatoryAnchor: 100 },
  });
  state.clock.tick += 1;
}

function invalid(state: GameState, diagnostic: string): CommandResult {
  return { state: { ...state, diagnostics: [...state.diagnostics, diagnostic] }, diagnostic };
}

function challenge(state: GameState, command: Extract<GameCommand, { type: "CONFIRM_CHALLENGE" }>): CommandResult {
  const activeIds = selectActiveCast(state);
  if (activeIds.length < 2) return invalid(state, "A challenge requires at least two active contestants.");
  if (state.competition.challengeHistory.some((result) => result.week === state.clock.week)) {
    return invalid(state, "This week's challenge has already been resolved.");
  }
  const next = structuredClone(state);
  const standings = activeIds.map((participantId) => {
    let uncertainty: number;
    [uncertainty, next.rng] = nextRandom(next.rng);
    const profile = castById[participantId];
    const runtime = next.characters[participantId];
    const score =
      profile.challengeTraits[command.challengeType] * 16
      + profile.personalityTraits.competitividade * 2
      + runtime.condition.energy * 0.12
      + runtime.condition.morale * 0.06
      - runtime.condition.stress * 0.08
      + uncertainty * 22;
    return { participantId, score: Math.round(score * 100) / 100 };
  }).sort((left, right) => right.score - left.score || left.participantId.localeCompare(right.participantId));
  const winnerId = standings[0].participantId;
  next.competition.leaderId = winnerId;
  next.characters[winnerId].game.leadershipWins += 1;
  next.competition.challengeHistory.push({ week: next.clock.week, type: command.challengeType, standings, winnerId });
  next.clock.window = "post_challenge";
  appendChallengeAnchor(next, command.challengeType, standings, winnerId);
  return { state: generateWindow(next) };
}

function formNomination(state: GameState): CommandResult {
  const activeIds = selectActiveCast(state);
  const leaderId = state.competition.leaderId;
  if (!leaderId || !activeIds.includes(leaderId)) return invalid(state, "An active leader is required to form a nomination.");
  if (activeIds.length < 3) return invalid(state, "At least three active contestants are required.");
  if (state.competition.nomineeIds.length > 0) return invalid(state, "This week's nomination has already been formed.");
  const next = structuredClone(state);
  const targets = activeIds.filter((id) => id !== leaderId).sort((left, right) => {
    const leftRelationship = next.relationships[`${leaderId}>${left}`];
    const rightRelationship = next.relationships[`${leaderId}>${right}`];
    const score = (id: ParticipantId, relationship: typeof leftRelationship) =>
      relationship.rivalry + relationship.resentment + next.characters[id].game.perceivedThreat
      - relationship.trust - relationship.affinity;
    return score(right, rightRelationship) - score(left, leftRelationship) || left.localeCompare(right);
  });
  next.competition.nomineeIds = targets.slice(0, 2);
  for (const id of next.competition.nomineeIds) next.characters[id].game.nominations += 1;
  next.clock.window = "post_nomination";
  return { state: generateWindow(next) };
}

function eliminate(state: GameState, participantId: ParticipantId): CommandResult {
  if (!state.competition.nomineeIds.includes(participantId)) return invalid(state, "Only a current nominee can be eliminated.");
  if (state.characters[participantId]?.status !== "active") return invalid(state, "Contestant is not active.");
  const next = structuredClone(state);
  next.characters[participantId].status = "eliminated";
  next.competition.eliminatedIds.push(participantId);
  next.competition.nomineeIds = [];
  if (next.competition.leaderId === participantId) next.competition.leaderId = null;
  next.clock.window = "post_elimination";
  return { state: generateWindow(next) };
}

export function reduceGame(state: GameState, command: GameCommand): CommandResult {
  let result: CommandResult;
  switch (command.type) {
    case "START_SEASON":
      result = { state: generateWindow(createInitialState(command.seed, state.mode)) };
      break;
    case "SELECT_CHALLENGE": {
      const next = structuredClone(state);
      next.characters[next.castOrder[0]].flags.selectedChallenge = command.challengeType;
      result = { state: next };
      break;
    }
    case "CONFIRM_CHALLENGE":
      result = challenge(state, command);
      break;
    case "ADVANCE_STORY": {
      const next = structuredClone(state);
      next.clock.window = command.to;
      result = { state: generateWindow(next) };
      break;
    }
    case "START_PARTY": {
      const next = structuredClone(state);
      next.clock.window = "party";
      result = { state: generateWindow(next) };
      break;
    }
    case "FORM_NOMINATION":
      result = formNomination(state);
      break;
    case "REGISTER_AUDIENCE_RESULT": {
      if (!state.competition.nomineeIds.includes(command.participantId)) {
        result = invalid(state, "Audience result must reference a current nominee.");
      } else {
        const next = structuredClone(state);
        next.characters[command.participantId].flags.audienceResult = true;
        result = { state: next };
      }
      break;
    }
    case "RESOLVE_ELIMINATION":
      result = eliminate(state, command.participantId);
      break;
    case "BROADCAST_EPISODE": {
      const eventIds = new Set(state.house.eventHistory.map((event) => event.id));
      if (command.cuts.some((cut) => !eventIds.has(cut.eventInstanceId))) {
        result = invalid(state, "A broadcast cut references an event that did not happen.");
      } else {
        const next = structuredClone(state);
        next.broadcasts.push({ week: next.clock.week, cuts: structuredClone(command.cuts) });
        for (const cut of command.cuts) {
          for (const id of cut.perspectiveIds) {
            const audience = next.characters[id]?.audience;
            if (!audience) continue;
            audience.screenTime = clamp(audience.screenTime + 5);
            audience.awareness = clamp(audience.awareness + 4);
          }
        }
        result = { state: next };
      }
      break;
    }
    case "ADVANCE_WEEK": {
      if (selectActiveCast(state).length <= 3) {
        result = invalid(state, "The final begins when three contestants remain.");
      } else {
        const next = structuredClone(state);
        next.clock = { tick: next.clock.tick + 1, week: next.clock.week + 1, day: 1, window: "pre_challenge" };
        next.competition.leaderId = null;
        next.competition.nomineeIds = [];
        result = { state: generateWindow(next) };
      }
      break;
    }
    case "RESOLVE_FINAL": {
      const active = selectActiveCast(state);
      if (active.length !== 3 || !active.includes(command.winnerId)) {
        result = invalid(state, "Final winner must be one of exactly three active finalists.");
      } else {
        const next = structuredClone(state);
        for (const id of active) next.characters[id].status = id === command.winnerId ? "winner" : "finalist";
        next.competition.winnerId = command.winnerId;
        next.clock.window = "final";
        result = { state: next };
      }
      break;
    }
  }

  if (!result.diagnostic) {
    result.state.revision = state.revision + 1;
    assertInvariants(result.state);
  }
  return result;
}

export function gameReducer(state: GameState, command: GameCommand): GameState {
  return reduceGame(state, command).state;
}
