import type { BroadcastCut, GameState } from "../types";

export type AudienceForecast = {
  points: number;
  excitement: number;
  variety: number;
  representedParticipantIds: string[];
};

export function selectAudienceForecast(state: GameState, cuts: BroadcastCut[]): AudienceForecast {
  const events = new Map(state.house.eventHistory.map((event) => [event.id, event]));
  const selected = cuts.map((cut) => events.get(cut.eventInstanceId)).filter((event) => event !== undefined);
  const categories = new Set(selected.map((event) => event.category));
  const represented = new Set(cuts.flatMap((cut) => cut.perspectiveIds));
  const averageHeat = selected.length
    ? selected.reduce((sum, event) => sum + event.heat, 0) / selected.length
    : 0;
  const controversy = [...represented].reduce(
    (sum, id) => sum + (state.characters[id]?.audience.controversy ?? 0),
    0,
  ) / Math.max(1, represented.size);
  const repeatedCharacterPenalty = cuts.length - represented.size;
  const points = Math.round(Math.min(60, Math.max(
    10,
    17
      + averageHeat * 0.16
      + categories.size * 1.4
      + Math.min(8, cuts.length * 1.2)
      + controversy * 0.04
      - Math.max(0, repeatedCharacterPenalty) * 0.8,
  )));
  return {
    points,
    excitement: Math.round(Math.min(100, averageHeat + controversy * 0.15)),
    variety: categories.size,
    representedParticipantIds: [...represented],
  };
}
