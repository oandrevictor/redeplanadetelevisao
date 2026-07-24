import { castById } from "../content/cast";
import type { GameState } from "../types";
import type { EventCandidate } from "./enumerate";

export function scoreCandidate(state: GameState, candidate: EventCandidate, variation: number): EventCandidate {
  const [actorId, otherId] = candidate.actorIds;
  const actor = castById[actorId];
  const relationship = state.relationships[`${actorId}>${otherId}`];
  const actorState = state.characters[actorId];
  const recent = state.house.eventHistory.slice(-4);
  const actorExposure = recent.filter((event) => event.actorIds.includes(actorId)).length;
  const personalityFit =
    candidate.template.tags.includes("humor") ? actor.personalityTraits.carisma * 4
      : candidate.template.tags.includes("strategy") ? actor.personalityTraits.estrategia * 4
        : candidate.template.tags.includes("trigger") ? actor.personalityTraits.impulsividade * 4
          : actor.personalityTraits.percepcaoSocial * 3;
  const chemistry = candidate.template.tags.includes("friction") || candidate.template.tags.includes("trigger")
    ? (relationship.rivalry + relationship.resentment) * 0.18
    : (relationship.affinity + relationship.trust) * 0.12;
  const context = candidate.template.tags.includes("friction")
    ? actorState.condition.stress * 0.1
    : (100 - actorState.condition.stress) * 0.05;
  const breakdown = {
    progressionFit: 30,
    base: candidate.template.baseScore,
    personalityFit,
    relationshipChemistry: chemistry,
    contextFit: context,
    underexposedCoverage: Math.max(0, 8 - actorExposure * 4),
    seededVariation: variation * 8,
  };
  return { ...candidate, scoreBreakdown: breakdown, score: Object.values(breakdown).reduce((sum, value) => sum + value, 0) };
}
