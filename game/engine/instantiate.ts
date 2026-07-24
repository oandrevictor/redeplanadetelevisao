import { castById } from "../content/cast";
import type { AppliedEffect, EventInstance, GameState } from "../types";
import type { EventCandidate } from "./enumerate";

const replaceRoles = (copy: string, bindings: EventCandidate["bindings"]) =>
  Object.entries(bindings).reduce((result, [role, ids]) => {
    const name = castById[ids[0]]?.name.split(" ")[0] ?? ids[0];
    return result.replaceAll(`{${role}}`, name);
  }, copy);

export function instantiateEvent(state: GameState, candidate: EventCandidate): EventInstance {
  const sequence = state.house.eventHistory.length + 1;
  const effects: AppliedEffect[] = candidate.template.effects.map((effect, effectIndex) => {
    if (effect.type === "characterDelta") {
      return { type: effect.type, participantId: candidate.bindings[effect.role][0], field: effect.field, delta: effect.delta };
    }
    if (effect.type === "relationshipDelta") {
      return {
        type: effect.type, fromId: candidate.bindings[effect.fromRole][0], toId: candidate.bindings[effect.toRole][0],
        field: effect.field, delta: effect.delta,
      };
    }
    return {
      type: "openThread",
      threadId: `thread-${state.seasonId}-${state.clock.tick}-${sequence}-${effectIndex}`,
      threadType: effect.threadType,
      actorIds: effect.roles.flatMap((role) => candidate.bindings[role]),
    };
  });
  return {
    id: `event-${state.seasonId}-${state.clock.tick}-${sequence}`,
    templateId: candidate.template.id, templateRevision: candidate.template.revision, sequence,
    occurredAt: { ...state.clock }, window: state.clock.window,
    roleBindings: structuredClone(candidate.bindings), actorIds: [...candidate.actorIds],
    sourceEventIds: [], sourceThreadIds: [],
    title: replaceRoles(candidate.template.title, candidate.bindings),
    description: replaceRoles(candidate.template.description, candidate.bindings),
    category: candidate.template.category,
    duration: Math.max(3, Math.min(8, Math.round(3 + candidate.score / 35))),
    heat: Math.max(20, Math.min(100, Math.round(candidate.score))),
    effects, scoreBreakdown: { ...candidate.scoreBreakdown },
  };
}
