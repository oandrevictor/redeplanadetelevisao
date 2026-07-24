import { eventTemplates } from "./content/templates/index";
import { checkConstraints } from "./engine/constraints";
import { enumerateCandidates } from "./engine/enumerate";
import { scoreCandidate } from "./engine/score";
import type { GameState } from "./types";

export function inspectCandidates(state: GameState) {
  const inspected = enumerateCandidates(state, eventTemplates)
    .map((candidate) => {
      const constraints = checkConstraints(state, candidate);
      const scored = scoreCandidate(state, candidate, 0);
      return {
        templateId: candidate.template.id,
        actorIds: candidate.actorIds,
        accepted: constraints.accepted,
        rejectionReasons: constraints.reasons,
        score: Math.round(scored.score * 100) / 100,
        scoreBreakdown: scored.scoreBreakdown,
      };
    })
    .sort((left, right) => Number(right.accepted) - Number(left.accepted) || right.score - left.score);
  const accepted = inspected.filter((candidate) => candidate.accepted);
  const best = accepted[0]?.score ?? 0;
  const lottery = accepted.filter((candidate) => candidate.score >= best - 18);
  const minimum = Math.min(...lottery.map((candidate) => candidate.score), best);
  const totalWeight = lottery.reduce((sum, candidate) => sum + Math.max(1, candidate.score - minimum + 1), 0);
  return inspected.map((candidate) => ({
    ...candidate,
    rank: candidate.accepted ? accepted.indexOf(candidate) + 1 : null,
    selectionProbability: lottery.includes(candidate) && totalWeight > 0
      ? Math.max(1, candidate.score - minimum + 1) / totalWeight
      : 0,
  }));
}
