import { eventTemplates } from "../content/templates/index";
import { nextRandom } from "../rng";
import type { GameState } from "../types";
import { checkConstraints } from "./constraints";
import { enumerateCandidates } from "./enumerate";
import { instantiateEvent } from "./instantiate";
import { applyEventEffects } from "./mutations";
import { scoreCandidate } from "./score";
import { selectCandidate } from "./select";

const budgets: Partial<Record<GameState["clock"]["window"], number>> = {
  arrival: 4, post_challenge: 3, leader_reign: 2, party: 4, campaign: 2,
  post_nomination: 3, post_elimination: 3, final: 2,
};

export function generateWindow(state: GameState, requestedBudget?: number): GameState {
  const key = `${state.clock.week}:${state.clock.window}`;
  if (state.house.generatedWindows.includes(key)) return state;
  const next = structuredClone(state);
  const budget = requestedBudget ?? budgets[next.clock.window] ?? 1;

  for (let count = 0; count < budget; count += 1) {
    const enumerated = enumerateCandidates(next, eventTemplates).filter((candidate) => checkConstraints(next, candidate).accepted);
    const scored = [];
    for (const candidate of enumerated) {
      let variation: number;
      [variation, next.rng] = nextRandom(next.rng);
      scored.push(scoreCandidate(next, candidate, variation));
    }
    const selection = selectCandidate(scored, next.rng);
    next.rng = selection.rng;
    if (!selection.candidate) break;
    const event = instantiateEvent(next, selection.candidate);
    applyEventEffects(next, event.effects);
    next.house.eventHistory.push(event);
    next.clock.tick += 1;
  }
  next.house.generatedWindows.push(key);
  return next;
}
