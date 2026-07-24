import type { GameState, ParticipantId } from "../types";

export function selectActiveCast(state: GameState): ParticipantId[] {
  return state.castOrder.filter((id) => {
    const status = state.characters[id]?.status;
    return status === "active" || status === "finalist" || status === "winner";
  });
}
