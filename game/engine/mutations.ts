import type { AppliedEffect, GameState } from "../types";

const clamp = (value: number) => Math.min(100, Math.max(0, value));

function applyCharacterDelta(state: GameState, effect: Extract<AppliedEffect, { type: "characterDelta" }>) {
  const character = state.characters[effect.participantId];
  const [section, field] = effect.field.split(".");
  if (section !== "condition" && section !== "game" && section !== "audience") return;
  const record = character[section] as unknown as Record<string, number>;
  if (typeof record[field] !== "number") return;
  record[field] = clamp(record[field] + effect.delta);
}

export function applyEventEffects(state: GameState, effects: AppliedEffect[]): void {
  for (const effect of effects) {
    if (effect.type === "characterDelta") applyCharacterDelta(state, effect);
    if (effect.type === "relationshipDelta") {
      const relationship = state.relationships[`${effect.fromId}>${effect.toId}`];
      relationship[effect.field] = clamp(relationship[effect.field] + effect.delta);
      relationship.lastInteractionTick = state.clock.tick;
    }
    if (effect.type === "openThread") {
      state.narrative.threads[effect.threadId] = {
        id: effect.threadId, type: effect.threadType, actorIds: [...effect.actorIds],
        status: "open", progress: 0, openedAtTick: state.clock.tick,
      };
      if (effect.threadType === "alliance") {
        const memberIds = [...new Set(effect.actorIds)].sort();
        const allianceId = `alliance-${memberIds.join("-")}`;
        const existing = state.alliances[allianceId];
        if (existing) {
          existing.status = "active";
          existing.cohesion = clamp(existing.cohesion + 10);
        } else {
          state.alliances[allianceId] = {
            id: allianceId,
            memberIds,
            status: "active",
            secrecy: 70,
            cohesion: 55,
          };
        }
      }
    }
    if (effect.type === "advanceThread") {
      const thread = state.narrative.threads[effect.threadId];
      if (!thread) continue;
      thread.progress = clamp(thread.progress + effect.delta);
      if (effect.resolve || thread.progress >= 100) thread.status = "resolved";
    }
    if (effect.type === "setFlag") {
      if (effect.participantId) state.characters[effect.participantId].flags[effect.key] = effect.value;
    }
  }
}
