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
  for (const [key, relationship] of Object.entries(state.relationships)) {
    if (relationship.fromId === relationship.toId) errors.push(`self relationship: ${key}`);
    for (const field of ["affinity", "trust", "respect", "rivalry", "resentment", "attraction", "strategicAlignment"] as const) {
      if (!bounded(relationship[field])) errors.push(`relationship ${key}.${field} is out of bounds`);
    }
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
  }
  for (const broadcast of state.broadcasts) {
    for (const cut of broadcast.cuts) if (!ids.has(cut.eventInstanceId)) errors.push(`cut references missing event: ${cut.eventInstanceId}`);
  }
  return errors;
}

export function assertInvariants(state: GameState): void {
  const errors = collectInvariantErrors(state);
  if (errors.length) throw new Error(`Game state invariant failure:\n${errors.join("\n")}`);
}
