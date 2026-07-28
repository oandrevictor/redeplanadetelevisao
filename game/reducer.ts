import type { CommandResult, GameCommand } from "./commands";
import {
  closeAudienceVote,
  consumePendingAudienceVote,
  deriveLegacyAudienceSummaries,
  simulateAudienceEpisode,
} from "./audience";
import { deriveAudienceSignals, neutralPortrayals } from "./audience/signals";
import { castById } from "./content/cast";
import { generateWindow } from "./engine/generate-window";
import { assertInvariants } from "./invariants";
import { nextRandom } from "./rng";
import { selectActiveCast } from "./selectors/active-cast";
import { selectAudienceForecast } from "./selectors/audience-forecast";
import { selectLegacyAudienceVoteChoice } from "./selectors/legacy-audience-vote";
import { createInitialState } from "./state";
import type { AudienceInterest, BroadcastEpisode, GameState, ParticipantId } from "./types";

const clamp = (value: number) => Math.min(100, Math.max(0, value));

function syncLegacyAudience(state: GameState): void {
  const summaries = deriveLegacyAudienceSummaries(state.audienceModel, state.castOrder);
  for (const participantId of state.castOrder) {
    if (state.characters[participantId] && summaries[participantId]) {
      state.characters[participantId].audience = summaries[participantId];
    }
  }
}

function latestAudienceEpisodeId(
  state: GameState,
  kind: "vote" | "final",
): string | null {
  return [...state.broadcasts].reverse().find((broadcast) =>
    broadcast.week === state.clock.week
    && broadcast.episode?.kind === kind
    && broadcast.result)?.result?.episodeId ?? null;
}

function broadcastProvenanceError(state: GameState, episode: BroadcastEpisode): string | null {
  const canonicalEvents = new Map(state.house.eventHistory.map((event) => [event.id, event]));
  for (const segment of episode.segments) {
    if (segment.kind === "commercial") continue;
    if (segment.kind === "important_event") {
      if (
        segment.sourceBeatIds.some((beatId) => !beatId.startsWith(`${segment.chainId}-beat-`))
        || new Set(segment.sourceBeatIds).size !== segment.sourceBeatIds.length
      ) {
        return `Important segment ${segment.id} does not reference a frozen canonical beat sequence.`;
      }
      continue;
    }
    const canonical = canonicalEvents.get(segment.sourceEventId);
    if (!canonical) {
      return `Content segment ${segment.id} references footage outside canonical season history.`;
    }
    const visibleIds = [...segment.participantIds].sort();
    const canonicalIds = [...canonical.actorIds].sort();
    if (
      visibleIds.length !== canonicalIds.length
      || visibleIds.some((participantId, index) => participantId !== canonicalIds[index])
    ) {
      return `Content segment ${segment.id} changes the frozen visible participants.`;
    }
    const signalKeys = new Set([
      ...Object.keys(canonical.audienceSignals),
      ...Object.keys(segment.signals),
    ] as AudienceInterest[]);
    for (const interest of signalKeys) {
      if ((canonical.audienceSignals[interest] ?? 0) !== (segment.signals[interest] ?? 0)) {
        return `Content segment ${segment.id} changes frozen audience signal ${interest}.`;
      }
    }
    const canonicalEliminatedId = canonical.templateId === "anchor:elimination-result"
      ? canonical.roleBindings.eliminated?.[0]
      : undefined;
    if (segment.revealsEliminatedParticipantId !== canonicalEliminatedId) {
      return `Content segment ${segment.id} changes its canonical elimination reveal.`;
    }
  }

  if (episode.kind === "elimination") {
    const revealIds = episode.segments.flatMap((segment) =>
      segment.kind === "content" && segment.revealsEliminatedParticipantId
        ? [segment.revealsEliminatedParticipantId]
        : []);
    const expectedEliminatedId = state.audienceModel.mode === "clustered"
      ? state.audienceModel.pendingVote?.kind === "elimination"
        ? state.audienceModel.pendingVote.selectedParticipantId
        : null
      : state.competition.nomineeIds.find(
        (participantId) => state.characters[participantId]?.flags.audienceResult === true,
      ) ?? null;
    if (revealIds.length !== 1 || !expectedEliminatedId || revealIds[0] !== expectedEliminatedId) {
      return "An elimination broadcast must contain exactly one canonical reveal matching the locked result.";
    }
  }
  return null;
}

function sharedAllianceLoyalty(state: GameState, fromId: ParticipantId, toId: ParticipantId): number {
  return Object.values(state.alliances).some((alliance) =>
    alliance.status === "active" && alliance.memberIds.includes(fromId) && alliance.memberIds.includes(toId))
    ? 35
    : 0;
}

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
    audienceSignals: deriveAudienceSignals("Prova", ["challenge"]),
    observablePortrayals: neutralPortrayals(standings.map((standing) => standing.participantId)),
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
  const leaderProfile = castById[leaderId];
  const leaderScore = (targetId: ParticipantId) => {
    const relationship = next.relationships[`${leaderId}>${targetId}`];
    const target = next.characters[targetId];
    return (
      (relationship.rivalry + relationship.resentment) * (0.7 + leaderProfile.personalityTraits.impulsividade * 0.12)
      + target.game.perceivedThreat * (0.7 + leaderProfile.personalityTraits.estrategia * 0.15)
      - (relationship.trust + relationship.affinity + relationship.strategicAlignment)
        * (0.35 + leaderProfile.personalityTraits.lealdade * 0.08)
      - sharedAllianceLoyalty(next, leaderId, targetId) * (0.6 + leaderProfile.personalityTraits.lealdade * 0.15)
    );
  };
  const leaderTargetId = activeIds
    .filter((id) => id !== leaderId)
    .sort((left, right) => leaderScore(right) - leaderScore(left) || left.localeCompare(right))[0];

  const ballots = [];
  const totals: Record<ParticipantId, number> = Object.fromEntries(activeIds.map((id) => [id, 0]));
  for (const voterId of activeIds.filter((id) => id !== leaderId)) {
    const voterProfile = castById[voterId];
    const candidates = activeIds.filter((id) => id !== voterId && id !== leaderId && id !== leaderTargetId);
    const scored = candidates.map((targetId) => {
      const relationship = next.relationships[`${voterId}>${targetId}`];
      let variation: number;
      [variation, next.rng] = nextRandom(next.rng);
      const threat = next.characters[targetId].game.perceivedThreat;
      const score =
        relationship.rivalry * 0.8
        + relationship.resentment * (0.6 + voterProfile.personalityTraits.impulsividade * 0.12)
        + threat * (0.35 + voterProfile.personalityTraits.estrategia * 0.12)
        - relationship.trust * (0.45 + voterProfile.personalityTraits.lealdade * 0.1)
        - relationship.affinity * 0.45
        - relationship.strategicAlignment * 0.35
        - sharedAllianceLoyalty(next, voterId, targetId) * (0.5 + voterProfile.personalityTraits.lealdade * 0.15)
        + variation * 8;
      const motiveTags = [
        ...(threat >= 45 ? ["strategic_threat"] : []),
        ...(relationship.rivalry >= 45 ? ["rivalry"] : []),
        ...(relationship.resentment >= 35 ? ["recent_grievance"] : []),
        ...(relationship.trust <= 35 ? ["distrust"] : []),
        ...(relationship.strategicAlignment <= 35 ? ["outside_bloc"] : []),
      ];
      return { targetId, relationship, score, motiveTags: motiveTags.length ? motiveTags : ["weakest_connection"] };
    }).sort((left, right) => right.score - left.score || left.targetId.localeCompare(right.targetId));
    const choice = scored[0];
    if (!choice) continue;
    totals[choice.targetId] += 1;
    next.characters[choice.targetId].game.votesReceived += 1;
    ballots.push({
      voterId,
      targetId: choice.targetId,
      motiveTags: choice.motiveTags,
      relationship: {
        affinity: choice.relationship.affinity,
        trust: choice.relationship.trust,
        respect: choice.relationship.respect,
        rivalry: choice.relationship.rivalry,
        resentment: choice.relationship.resentment,
        strategicAlignment: choice.relationship.strategicAlignment,
      },
      score: Math.round(choice.score * 100) / 100,
    });
  }

  const eligibleHouseTargets = activeIds.filter((id) => id !== leaderId && id !== leaderTargetId);
  const highestTotal = Math.max(...eligibleHouseTargets.map((id) => totals[id]));
  const tiedIds = eligibleHouseTargets.filter((id) => totals[id] === highestTotal);
  const houseTargetId = [...tiedIds]
    .sort((left, right) => leaderScore(right) - leaderScore(left) || left.localeCompare(right))[0];
  const tieBreakingDecision = tiedIds.length > 1
    ? `${castById[leaderId].name} desempatou entre ${tiedIds.map((id) => castById[id].name).join(", ")}.`
    : null;

  next.competition.nomineeIds = [leaderTargetId, houseTargetId];
  for (const id of next.competition.nomineeIds) next.characters[id].game.nominations += 1;
  next.competition.nominationHistory.push({
    week: next.clock.week,
    leaderId,
    leaderTargetId,
    ballots,
    totals,
    houseTargetId,
    tieBreakingDecision,
  });
  next.clock.window = "post_nomination";
  appendNominationFootage(next);
  return { state: generateWindow(next) };
}

function appendNominationFootage(state: GameState): void {
  const result = state.competition.nominationHistory.at(-1);
  if (!result) return;
  const append = (
    templateId: string,
    actorIds: ParticipantId[],
    roleBindings: Record<string, ParticipantId[]>,
    title: string,
    description: string,
    heat: number,
  ) => {
    const sequence = state.house.eventHistory.length + 1;
    state.house.eventHistory.push({
      id: `event-${state.seasonId}-${state.clock.tick}-${sequence}`,
      templateId,
      templateRevision: 1,
      sequence,
      occurredAt: { ...state.clock },
      window: "post_nomination",
      roleBindings,
      actorIds,
      sourceEventIds: [],
      sourceThreadIds: [],
      title,
      description,
      category: "Votação",
      duration: templateId === "anchor:nomination-result" ? 6 : 3,
      heat,
      audienceSignals: deriveAudienceSignals("Votação", ["strategy", "nominee"]),
      observablePortrayals: neutralPortrayals(actorIds),
      effects: [],
      scoreBreakdown: { mandatoryAnchor: templateId.startsWith("anchor:") ? 100 : 0 },
    });
    state.clock.tick += 1;
  };
  append(
    "anchor:nomination-result",
    selectActiveCast(state),
    { leader: [result.leaderId], nominees: [result.leaderTargetId, result.houseTargetId] },
    `${castById[result.leaderTargetId].name.split(" ")[0]} e ${castById[result.houseTargetId].name.split(" ")[0]} estão na berlinda`,
    `${castById[result.leaderId].name.split(" ")[0]} fez a indicação do líder e a casa completou a votação.`,
    92,
  );
  for (const ballot of result.ballots) {
    append(
      "anchor:house-ballot",
      [ballot.voterId, ballot.targetId],
      { voter: [ballot.voterId], target: [ballot.targetId] },
      `${castById[ballot.voterId].name.split(" ")[0]} vota em ${castById[ballot.targetId].name.split(" ")[0]}`,
      `O voto foi motivado por ${ballot.motiveTags.join(", ").replaceAll("_", " ")}.`,
      72,
    );
  }
}

function eliminate(state: GameState, participantId: ParticipantId): CommandResult {
  if (!state.competition.nomineeIds.includes(participantId)) return invalid(state, "Only a current nominee can be eliminated.");
  if (state.characters[participantId]?.status !== "active") return invalid(state, "Contestant is not active.");
  const next = structuredClone(state);
  const nomineeIds = [...next.competition.nomineeIds];
  next.clock.window = "elimination";
  const revealAlreadyRecorded = next.house.eventHistory.some((event) =>
    event.occurredAt.week === next.clock.week
    && event.templateId === "anchor:elimination-result"
    && event.roleBindings.eliminated?.includes(participantId));
  if (!revealAlreadyRecorded) appendEliminationFootage(next, participantId, nomineeIds);
  next.characters[participantId].status = "eliminated";
  next.competition.eliminatedIds.push(participantId);
  next.competition.eliminationHistory.push({
    week: next.clock.week,
    eliminatedId: participantId,
    nomineeIds,
    resolvedAtTick: next.clock.tick,
  });
  next.competition.nomineeIds = [];
  if (next.competition.leaderId === participantId) next.competition.leaderId = null;
  for (const thread of Object.values(next.narrative.threads)) {
    if (thread.status === "open" && thread.actorIds.includes(participantId)) {
      thread.status = "resolved";
      thread.progress = 100;
    }
  }
  for (const alliance of Object.values(next.alliances)) {
    if (!alliance.memberIds.includes(participantId)) continue;
    const remainingMembers = alliance.memberIds.filter((id) => id !== participantId && next.characters[id].status === "active");
    alliance.status = remainingMembers.length >= 2 ? "fractured" : "dissolved";
    alliance.cohesion = clamp(alliance.cohesion - 25);
  }
  for (const id of selectActiveCast(next)) {
    next.characters[id].condition.stress = clamp(next.characters[id].condition.stress - 10);
    next.characters[id].condition.energy = clamp(next.characters[id].condition.energy + 8);
  }
  next.clock.window = "post_elimination";
  const generated = generateWindow(next);
  const remaining = selectActiveCast(generated);
  if (remaining.length === 3) {
    for (const id of remaining) generated.characters[id].status = "finalist";
    generated.clock.window = "final";
    appendFinalFootage(generated, remaining);
  }
  return { state: generated };
}

function appendEliminationFootage(
  state: GameState,
  eliminatedId: ParticipantId,
  nomineeIds: ParticipantId[],
): void {
  const append = (templateId: string, actorIds: ParticipantId[], title: string, description: string, duration: number) => {
    const sequence = state.house.eventHistory.length + 1;
    state.house.eventHistory.push({
      id: `event-${state.seasonId}-${state.clock.tick}-${sequence}`,
      templateId,
      templateRevision: 1,
      sequence,
      occurredAt: { ...state.clock },
      window: "elimination",
      roleBindings: { eliminated: [eliminatedId], nominees: [...nomineeIds] },
      actorIds,
      sourceEventIds: [],
      sourceThreadIds: [],
      title,
      description,
      category: "Memória",
      duration,
      heat: 90,
      audienceSignals: deriveAudienceSignals("Memória", ["aftermath"]),
      observablePortrayals: neutralPortrayals(actorIds),
      effects: [],
      scoreBreakdown: { mandatoryAnchor: 100 },
    });
    state.clock.tick += 1;
  };
  append(
    "anchor:elimination-result",
    [...nomineeIds],
    `${castById[eliminatedId].name} deixa a casa`,
    `O resultado encerra a trajetória de ${castById[eliminatedId].name} na semana ${state.clock.week}.`,
    6,
  );
  append(
    "anchor:farewell",
    [eliminatedId],
    `A despedida de ${castById[eliminatedId].name.split(" ")[0]}`,
    `${castById[eliminatedId].name.split(" ")[0]} se despede da casa e deixa uma última mensagem.`,
    5,
  );
}

function appendFinalFootage(state: GameState, finalistIds: ParticipantId[]): void {
  for (const finalistId of finalistIds) {
    const sequence = state.house.eventHistory.length + 1;
    state.house.eventHistory.push({
      id: `event-${state.seasonId}-${state.clock.tick}-${sequence}`,
      templateId: "anchor:finalist-speech",
      templateRevision: 1,
      sequence,
      occurredAt: { ...state.clock },
      window: "final",
      roleBindings: { finalist: [finalistId] },
      actorIds: [finalistId],
      sourceEventIds: [],
      sourceThreadIds: [],
      title: `O discurso final de ${castById[finalistId].name.split(" ")[0]}`,
      description: `${castById[finalistId].name} explica ao Brasil por que merece vencer.`,
      category: "Memória",
      duration: 6,
      heat: 90,
      audienceSignals: deriveAudienceSignals("Memória", ["aftermath", "redemption"]),
      observablePortrayals: neutralPortrayals([finalistId]),
      effects: [],
      scoreBreakdown: { mandatoryAnchor: 100 },
    });
    state.clock.tick += 1;
  }
  const sequence = state.house.eventHistory.length + 1;
  state.house.eventHistory.push({
    id: `event-${state.seasonId}-${state.clock.tick}-${sequence}`,
    templateId: "anchor:season-retrospective",
    templateRevision: 1,
    sequence,
    occurredAt: { ...state.clock },
    window: "final",
    roleBindings: { finalists: [...finalistIds] },
    actorIds: [...finalistIds],
    sourceEventIds: state.house.eventHistory.slice(-8).map((event) => event.id),
    sourceThreadIds: [],
    title: "A trajetória dos finalistas",
    description: "Uma retrospectiva reúne alianças, conflitos, provas e viradas que definiram a temporada.",
    category: "Memória",
    duration: 8,
    heat: 96,
    audienceSignals: deriveAudienceSignals("Memória", ["callback", "aftermath"]),
    observablePortrayals: neutralPortrayals(finalistIds),
    effects: [],
    scoreBreakdown: { mandatoryAnchor: 100 },
  });
  state.clock.tick += 1;
}

export function reduceGame(state: GameState, command: GameCommand): CommandResult {
  let result: CommandResult;
  switch (command.type) {
    case "START_SEASON":
      result = {
        state: generateWindow(createInitialState(command.seed, state.mode, state.audienceModel.mode)),
      };
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
    case "CLOSE_AUDIENCE_VOTE": {
      const lockingEpisodeId = state.audienceModel.mode === "legacy"
        ? null
        : latestAudienceEpisodeId(state, "vote");
      if (state.audienceModel.mode !== "legacy" && !lockingEpisodeId) {
        result = invalid(state, "A clustered broadcast is required before closing the audience vote.");
      } else if (state.competition.nomineeIds.length < 2) {
        result = invalid(state, "At least two nominees are required to close the audience vote.");
      } else {
        try {
          const next = structuredClone(state);
          let authoritativeParticipantId = selectLegacyAudienceVoteChoice(
            next,
            "elimination",
            next.competition.nomineeIds,
          );
          if (next.audienceModel.mode !== "legacy" && lockingEpisodeId) {
            const closed = closeAudienceVote(next.audienceModel, {
              kind: "elimination",
              week: next.clock.week,
              participantIds: next.competition.nomineeIds,
              lockedAfterEpisodeId: lockingEpisodeId,
            });
            next.audienceModel = closed.audience;
            if (next.audienceModel.mode === "clustered") {
              authoritativeParticipantId = closed.result.selectedParticipantId;
            }
          }
          if (!authoritativeParticipantId) {
            result = invalid(state, "Unable to determine the audience result.");
            break;
          }
          next.characters[authoritativeParticipantId].flags.audienceResult = true;
          next.clock.window = "elimination";
          appendEliminationFootage(
            next,
            authoritativeParticipantId,
            next.competition.nomineeIds,
          );
          result = { state: next };
        } catch (error) {
          result = invalid(state, error instanceof Error ? error.message : "Unable to close the audience vote.");
        }
      }
      break;
    }
    case "RESOLVE_ELIMINATION": {
      if (state.audienceModel.mode === "clustered" && !state.audienceModel.pendingVote) {
        result = invalid(state, "A locked clustered audience vote is required to resolve elimination.");
        break;
      }
      const lockedParticipantId = state.audienceModel.pendingVote?.kind === "elimination"
        ? state.audienceModel.pendingVote.selectedParticipantId
        : null;
      if (
        lockedParticipantId
        && (
          !state.competition.nomineeIds.includes(lockedParticipantId)
          || state.characters[lockedParticipantId]?.status !== "active"
        )
      ) {
        result = invalid(state, "The locked audience result is no longer a valid active nominee.");
        break;
      }
      let participantId = command.participantId;
      let sourceState = state;
      if (
        state.audienceModel.mode === "clustered"
        && state.audienceModel.pendingVote?.kind === "elimination"
      ) {
        try {
          const consumed = consumePendingAudienceVote(state.audienceModel, "elimination");
          participantId = consumed.result.selectedParticipantId;
          sourceState = structuredClone(state);
          sourceState.audienceModel = consumed.audience;
        } catch (error) {
          result = invalid(state, error instanceof Error ? error.message : "Unable to resolve the audience vote.");
          break;
        }
      } else if (
        state.audienceModel.mode === "shadow"
        && state.audienceModel.pendingVote?.kind === "elimination"
      ) {
        try {
          const consumed = consumePendingAudienceVote(state.audienceModel, "elimination");
          sourceState = structuredClone(state);
          sourceState.audienceModel = consumed.audience;
        } catch (error) {
          result = invalid(state, error instanceof Error ? error.message : "Unable to archive the shadow audience vote.");
          break;
        }
      }
      participantId ??= state.competition.nomineeIds.find(
        (candidateId) => state.characters[candidateId]?.flags.audienceResult === true,
      );
      if (!participantId) {
        result = invalid(state, "A locked audience vote is required to resolve elimination.");
      } else {
        result = eliminate(sourceState, participantId);
      }
      break;
    }
    case "BROADCAST_EPISODE": {
      const eventIds = new Set(state.house.eventHistory.map((event) => event.id));
      if (command.cuts.some((cut) => !eventIds.has(cut.eventInstanceId))) {
        result = invalid(state, "A broadcast cut references an event that did not happen.");
      } else {
        const next = structuredClone(state);
        const forecast = selectAudienceForecast(next, command.cuts);
        const eventById = new Map(next.house.eventHistory.map((event) => [event.id, event]));
        const priorExposure = new Map<ParticipantId, number>();
        for (const broadcast of next.broadcasts) {
          for (const priorCut of broadcast.cuts) {
            for (const id of priorCut.perspectiveIds) priorExposure.set(id, (priorExposure.get(id) ?? 0) + 1);
          }
        }
        for (const cut of command.cuts) {
          const event = eventById.get(cut.eventInstanceId);
          if (!event) continue;
          const oneSided = cut.perspectiveIds.length < event.actorIds.length;
          const storylineKey = `${event.templateId}:${[...event.actorIds].sort().join("+")}`;
          next.narrative.publicStorylines[storylineKey] = clamp(
            (next.narrative.publicStorylines[storylineKey] ?? 0) + 1,
          );
          for (const id of event.actorIds) {
            const audience = next.characters[id]?.audience;
            if (!audience) continue;
            const perspective = cut.perspectiveIds.includes(id);
            const repeats = priorExposure.get(id) ?? 0;
            const diminishing = 1 / (1 + repeats * 0.3);
            const cameraConversion = 0.75 + castById[id].personalityTraits.conscienciaDasCameras * 0.08;
            audience.screenTime = clamp(audience.screenTime + event.duration * diminishing);
            audience.awareness = clamp(audience.awareness + 5 * diminishing * cameraConversion);
            let supportDelta = 0;
            let controversyDelta = 0;
            if (perspective) {
              supportDelta =
                cut.tone === "emocional" || cut.tone === "triste" ? 5
                  : cut.tone === "engracado" ? 3
                    : cut.tone === "malicioso" ? -3
                      : cut.tone === "conflituoso" ? -1
                        : 1;
              controversyDelta =
                cut.tone === "malicioso" ? 7
                  : cut.tone === "conflituoso" ? 6
                    : cut.tone === "engracado" ? 1
                      : 0;
            } else if (oneSided) {
              supportDelta = cut.tone === "malicioso" || cut.tone === "conflituoso" ? -3 : -1;
              controversyDelta = cut.tone === "malicioso" || cut.tone === "conflituoso" ? 4 : 1;
            }
            const heatFactor = event.heat / 100;
            audience.support = clamp(audience.support + supportDelta * diminishing * cameraConversion);
            audience.controversy = clamp(audience.controversy + controversyDelta * diminishing + heatFactor);
            if (perspective) priorExposure.set(id, repeats + 1);
          }
        }
        next.broadcasts.push({
          week: next.clock.week,
          cuts: structuredClone(command.cuts),
          audienceForecast: forecast.points,
        });
        result = { state: next };
      }
      break;
    }
    case "AIR_EPISODE": {
      if (state.broadcasts.some((broadcast) => broadcast.result?.episodeId === command.episode.id)) {
        result = invalid(state, `Audience episode ${command.episode.id} has already aired.`);
        break;
      }
      if (command.episode.week !== state.clock.week) {
        result = invalid(state, "A broadcast episode must belong to the current week.");
        break;
      }
      const provenanceError = broadcastProvenanceError(state, command.episode);
      if (provenanceError) {
        result = invalid(state, provenanceError);
        break;
      }
      try {
        const simulated = simulateAudienceEpisode({
          audience: state.audienceModel,
          episode: command.episode,
          rng: state.rng,
          participantIds: state.castOrder,
          eligibleFavoriteParticipantIds: selectActiveCast(state),
        });
        const next = structuredClone(state);
        next.audienceModel = simulated.audience;
        next.rng = simulated.rng;
        const audienceResult = simulated.result;
        if (next.audienceModel.mode === "clustered") syncLegacyAudience(next);
        const cuts = command.episode.segments.flatMap((segment) =>
          segment.kind === "content"
            ? [{
                eventInstanceId: segment.sourceEventId,
                perspectiveIds: [...segment.perspectiveIds],
                tone: segment.tone,
              }]
            : []);
        next.broadcasts.push({
          week: command.episode.week,
          cuts,
          audienceForecast: audienceResult.forecast.expected,
          detailLevel: "clustered",
          episode: structuredClone(command.episode),
          result: audienceResult,
        });
        result = { state: next };
      } catch (error) {
        result = invalid(state, error instanceof Error ? error.message : "Unable to simulate the audience.");
      }
      break;
    }
    case "ADVANCE_WEEK": {
      if (selectActiveCast(state).length <= 3) {
        result = invalid(state, "The final begins when three contestants remain.");
      } else if (state.audienceModel.pendingVote || state.competition.nomineeIds.length > 0) {
        result = invalid(state, "The current audience vote and elimination must resolve before advancing.");
      } else {
        const next = structuredClone(state);
        next.clock = { tick: next.clock.tick + 1, week: next.clock.week + 1, day: 1, window: "pre_challenge" };
        next.competition.leaderId = null;
        next.competition.nomineeIds = [];
        result = { state: generateWindow(next) };
      }
      break;
    }
    case "CLOSE_FINAL_VOTE": {
      const active = selectActiveCast(state);
      const lockingEpisodeId = state.audienceModel.mode === "legacy"
        ? null
        : latestAudienceEpisodeId(state, "final");
      if (active.length !== 3) {
        result = invalid(state, "The final audience vote requires exactly three finalists.");
      } else if (state.audienceModel.mode !== "legacy" && !lockingEpisodeId) {
        result = invalid(state, "The final episode must air before its audience vote closes.");
      } else {
        try {
          const next = structuredClone(state);
          if (next.audienceModel.mode !== "legacy" && lockingEpisodeId) {
            const closed = closeAudienceVote(next.audienceModel, {
              kind: "final",
              week: next.clock.week,
              participantIds: active,
              lockedAfterEpisodeId: lockingEpisodeId,
            });
            next.audienceModel = closed.audience;
          }
          result = { state: next };
        } catch (error) {
          result = invalid(state, error instanceof Error ? error.message : "Unable to close the final vote.");
        }
      }
      break;
    }
    case "RESOLVE_FINAL": {
      if (state.audienceModel.mode === "clustered" && !state.audienceModel.pendingVote) {
        result = invalid(state, "A locked clustered audience vote is required to resolve the final.");
        break;
      }
      const active = selectActiveCast(state);
      let winnerId = command.winnerId;
      let sourceState = state;
      if (
        state.audienceModel.mode === "clustered"
        && state.audienceModel.pendingVote?.kind === "final"
      ) {
        try {
          const consumed = consumePendingAudienceVote(state.audienceModel, "final");
          winnerId = consumed.result.selectedParticipantId;
          sourceState = structuredClone(state);
          sourceState.audienceModel = consumed.audience;
        } catch (error) {
          result = invalid(state, error instanceof Error ? error.message : "Unable to resolve the final vote.");
          break;
        }
      } else if (
        state.audienceModel.mode === "shadow"
        && state.audienceModel.pendingVote?.kind === "final"
      ) {
        try {
          const consumed = consumePendingAudienceVote(state.audienceModel, "final");
          sourceState = structuredClone(state);
          sourceState.audienceModel = consumed.audience;
        } catch (error) {
          result = invalid(state, error instanceof Error ? error.message : "Unable to archive the shadow final vote.");
          break;
        }
      }
      if (!winnerId) {
        const legacyWinnerId = selectLegacyAudienceVoteChoice(sourceState, "final", active);
        if (legacyWinnerId) winnerId = legacyWinnerId;
      }
      if (active.length !== 3 || !winnerId || !active.includes(winnerId)) {
        result = invalid(state, "Final winner must be one of exactly three active finalists.");
      } else {
        const next = structuredClone(sourceState);
        for (const id of active) next.characters[id].status = id === winnerId ? "winner" : "finalist";
        next.competition.winnerId = winnerId;
        next.clock.window = "final";
        const sequence = next.house.eventHistory.length + 1;
        next.house.eventHistory.push({
          id: `event-${next.seasonId}-${next.clock.tick}-${sequence}`,
          templateId: "anchor:winner-result",
          templateRevision: 1,
          sequence,
          occurredAt: { ...next.clock },
          window: "final",
          roleBindings: { winner: [winnerId], finalists: [...active] },
          actorIds: [...active],
          sourceEventIds: [],
          sourceThreadIds: [],
          title: `${castById[winnerId].name} vence a temporada`,
          description: "O resultado final encerra a temporada com um único vencedor.",
          category: "Memória",
          duration: 6,
          heat: 100,
          audienceSignals: deriveAudienceSignals("Memória", ["competition", "aftermath"]),
          observablePortrayals: neutralPortrayals(active),
          effects: [],
          scoreBreakdown: { mandatoryAnchor: 100 },
        });
        next.clock.tick += 1;
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
