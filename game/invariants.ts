import { castById } from "./content/cast";
import { selectActiveCast } from "./selectors/active-cast";
import type { GameState } from "./types";

const bounded = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;

export function collectInvariantErrors(state: GameState): string[] {
  const errors: string[] = [];
  const active = new Set(selectActiveCast(state));
  for (const [id, character] of Object.entries(state.characters)) {
    if (!castById[id]) errors.push(`runtime participant does not reference a profile: ${id}`);
    if (character.participantId !== id) errors.push(`runtime participant key mismatch: ${id}`);
    for (const [field, value] of Object.entries(character.condition)) {
      if (!bounded(value)) errors.push(`character ${id} condition ${field} is out of bounds`);
    }
    for (const [field, value] of Object.entries(character.audience)) {
      if (!bounded(value)) errors.push(`character ${id} audience ${field} is out of bounds`);
    }
  }
  if (state.competition.leaderId && !active.has(state.competition.leaderId)) errors.push("leader is not active");
  if (new Set(state.competition.nomineeIds).size !== state.competition.nomineeIds.length) errors.push("nominees are not unique");
  for (const id of state.competition.nomineeIds) if (!active.has(id)) errors.push(`nominee is not active: ${id}`);
  if (new Set(state.competition.eliminatedIds).size !== state.competition.eliminatedIds.length) errors.push("contestant eliminated twice");
  if (state.competition.eliminationHistory.length !== state.competition.eliminatedIds.length) {
    errors.push("elimination history and eliminated ids are out of sync");
  }
  for (const elimination of state.competition.eliminationHistory) {
    if (!elimination.nomineeIds.includes(elimination.eliminatedId)) {
      errors.push(`eliminated contestant was not nominated in week ${elimination.week}`);
    }
    if (state.characters[elimination.eliminatedId]?.status !== "eliminated") {
      errors.push(`elimination history has invalid status for ${elimination.eliminatedId}`);
    }
    for (const event of state.house.eventHistory) {
      if (!event.templateId.startsWith("anchor:")
        && event.occurredAt.tick >= elimination.resolvedAtTick
        && event.actorIds.includes(elimination.eliminatedId)) {
        errors.push(`eliminated actor appears in later live event: ${event.id}`);
      }
    }
  }
  for (const nomination of state.competition.nominationHistory) {
    if (nomination.leaderTargetId === nomination.leaderId) errors.push(`leader nominated themselves in week ${nomination.week}`);
    if (nomination.houseTargetId === nomination.leaderId) errors.push(`leader received house nomination in week ${nomination.week}`);
    for (const ballot of nomination.ballots) {
      if (ballot.voterId === ballot.targetId) errors.push(`self vote in week ${nomination.week}: ${ballot.voterId}`);
      if (!state.characters[ballot.voterId] || !state.characters[ballot.targetId]) {
        errors.push(`ballot references unknown participant in week ${nomination.week}`);
      }
    }
  }
  for (const [key, relationship] of Object.entries(state.relationships)) {
    if (relationship.fromId === relationship.toId) errors.push(`self relationship: ${key}`);
    for (const field of ["affinity", "trust", "respect", "rivalry", "resentment", "attraction", "strategicAlignment"] as const) {
      if (!bounded(relationship[field])) errors.push(`relationship ${key}.${field} is out of bounds`);
    }
  }
  for (const alliance of Object.values(state.alliances)) {
    if (new Set(alliance.memberIds).size !== alliance.memberIds.length || alliance.memberIds.length < 2) {
      errors.push(`alliance ${alliance.id} has invalid members`);
    }
    if (alliance.memberIds.some((id) => !state.characters[id])) errors.push(`alliance ${alliance.id} references unknown member`);
    if (!bounded(alliance.secrecy) || !bounded(alliance.cohesion)) errors.push(`alliance ${alliance.id} is out of bounds`);
  }
  const ids = new Set<string>();
  let previousSequence = 0;
  for (const event of state.house.eventHistory) {
    if (ids.has(event.id)) errors.push(`duplicate event id: ${event.id}`);
    ids.add(event.id);
    if (event.sequence <= previousSequence) errors.push(`non-monotonic event sequence: ${event.id}`);
    previousSequence = event.sequence;
    for (const sourceId of event.sourceEventIds) {
      if (!ids.has(sourceId)) errors.push(`event ${event.id} has invalid forward causal reference ${sourceId}`);
    }
    for (const threadId of event.sourceThreadIds) {
      const thread = state.narrative.threads[threadId];
      if (!thread || thread.openedAtTick > event.occurredAt.tick) {
        errors.push(`event ${event.id} has invalid thread reference ${threadId}`);
      }
    }
  }
  const anchorCounts = new Map<string, number>();
  for (const event of state.house.eventHistory.filter((item) => item.templateId.startsWith("anchor:"))) {
    const key = `${event.occurredAt.week}:${event.templateId}`;
    anchorCounts.set(key, (anchorCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of anchorCounts) {
    if (!key.endsWith("anchor:house-ballot") && !key.endsWith("anchor:finalist-speech") && count > 1) {
      errors.push(`scheduled anchor repeated: ${key}`);
    }
  }
  const winners = Object.values(state.characters).filter((character) => character.status === "winner");
  if (state.competition.winnerId && winners.length !== 1) errors.push("resolved season does not have exactly one winner");
  for (const broadcast of state.broadcasts) {
    for (const cut of broadcast.cuts) if (!ids.has(cut.eventInstanceId)) errors.push(`cut references missing event: ${cut.eventInstanceId}`);
  }
  return errors;
}

export function assertInvariants(state: GameState): void {
  const errors = collectInvariantErrors(state);
  if (errors.length) throw new Error(`Game state invariant failure:\n${errors.join("\n")}`);
}
