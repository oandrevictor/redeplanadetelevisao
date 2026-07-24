import type { GameState } from "../types";
import type { EventCandidate } from "./enumerate";
import { selectActiveCast } from "../selectors/active-cast";

export type ConstraintResult = { accepted: boolean; reasons: string[] };

export function checkConstraints(state: GameState, candidate: EventCandidate): ConstraintResult {
  const reasons: string[] = [];
  const active = new Set(selectActiveCast(state));
  if (candidate.actorIds.some((id) => !active.has(id))) reasons.push("inactive actor");
  if (new Set(candidate.actorIds).size !== candidate.actorIds.length) reasons.push("roles must be distinct");
  if (!candidate.template.windows.includes(state.clock.window)) reasons.push("wrong story window");
  if (candidate.template.tags.includes("callback")) {
    const matchingThread = Object.values(state.narrative.threads).some((thread) =>
      thread.status === "open" && candidate.actorIds.every((id) => thread.actorIds.includes(id)));
    if (!matchingThread) reasons.push("callback requires an open thread with these actors");
  }
  for (const role of candidate.template.roles) {
    const boundIds = candidate.bindings[role.name] ?? [];
    if (role.leader && boundIds.some((id) => id !== state.competition.leaderId)) {
      reasons.push(`${role.name} must be the leader`);
    }
    if (role.nominee && boundIds.some((id) => !state.competition.nomineeIds.includes(id))) {
      reasons.push(`${role.name} must be a nominee`);
    }
  }

  const recentTemplate = [...state.house.eventHistory].reverse().find((event) => event.templateId === candidate.template.id);
  if (recentTemplate && state.clock.tick - recentTemplate.occurredAt.tick < candidate.template.cooldown.templateTicks) {
    reasons.push("template cooldown");
  }
  const templateAlreadyUsedInWindow = state.house.eventHistory.some((event) =>
    event.templateId === candidate.template.id
    && event.occurredAt.week === state.clock.week
    && event.window === state.clock.window);
  if (templateAlreadyUsedInWindow) {
    reasons.push("template already used in this story window");
  }

  const pair = [...candidate.actorIds].sort().join(">");
  const recentPair = [...state.house.eventHistory].reverse().find((event) => [...event.actorIds].sort().join(">") === pair);
  if (recentPair && state.clock.tick - recentPair.occurredAt.tick < candidate.template.cooldown.pairTicks) {
    reasons.push("pair cooldown");
  }

  return { accepted: reasons.length === 0, reasons };
}
