import type { EventTemplate, GameState, ParticipantId, ScoreBreakdown } from "../types";
import { selectActiveCast } from "../selectors/active-cast";

export type EventCandidate = {
  template: EventTemplate;
  bindings: Record<string, ParticipantId[]>;
  actorIds: ParticipantId[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
};

export function enumerateCandidates(state: GameState, templates: readonly EventTemplate[]): EventCandidate[] {
  const activeIds = selectActiveCast(state);
  const candidates: EventCandidate[] = [];
  for (const template of templates) {
    if (!template.windows.includes(state.clock.window) || template.roles.length !== 2) continue;
    const [first, second] = template.roles;
    for (const firstId of activeIds) {
      for (const secondId of activeIds) {
        if ((second.distinct ?? true) && firstId === secondId) continue;
        candidates.push({
          template,
          bindings: { [first.name]: [firstId], [second.name]: [secondId] },
          actorIds: [firstId, secondId],
          score: 0,
          scoreBreakdown: {},
        });
      }
    }
  }
  return candidates;
}
