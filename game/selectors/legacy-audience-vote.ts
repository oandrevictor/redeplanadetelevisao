import type { AudienceVoteResult, GameState, ParticipantId } from "../types";

/**
 * Deterministic compatibility selector used only while a season is in
 * `legacy` or `shadow` audience rollout mode. It keeps those modes playable
 * without allowing an arbitrary production-UI override.
 */
export function selectLegacyAudienceVoteChoice(
  state: GameState,
  kind: AudienceVoteResult["kind"],
  participantIds: readonly ParticipantId[],
): ParticipantId | null {
  const candidates = [...new Set(participantIds)]
    .filter((participantId) => Boolean(state.characters[participantId]))
    .sort();
  if (candidates.length === 0) return null;

  return candidates.toSorted((left, right) => {
    const leftAudience = state.characters[left].audience;
    const rightAudience = state.characters[right].audience;
    const score = (participantId: ParticipantId) => {
      const audience = state.characters[participantId].audience;
      return kind === "elimination"
        ? audience.controversy * 0.55 + audience.awareness * 0.25 - audience.support * 0.35
        : audience.support * 0.65 + audience.awareness * 0.2 - audience.controversy * 0.25;
    };
    return score(right) - score(left)
      || rightAudience.awareness - leftAudience.awareness
      || left.localeCompare(right);
  })[0] ?? null;
}
