import type { EventInstance, GameState } from "../types";
import { isStoryWindowReleased, selectReleasedEvents } from "./released-events";

export type EpisodeKind = "premiere" | "challenge" | "vote" | "elimination" | "final";

const windowsByEpisode: Record<EpisodeKind, Set<EventInstance["window"]>> = {
  premiere: new Set(["arrival"]),
  challenge: new Set(["pre_challenge"]),
  // The voting episode is assembled before the house forms the nomination.
  // Post-nomination material is released through the feed afterwards.
  vote: new Set(["post_challenge", "party", "campaign"]),
  elimination: new Set(["post_nomination"]),
  final: new Set(["final"]),
};

export function selectAvailableFootage(
  state: GameState,
  options: { week: number; episodeKind: EpisodeKind; excludedInstanceIds?: Iterable<string> },
): EventInstance[] {
  if (options.episodeKind === "vote" && !isStoryWindowReleased(state, "party", options.week)) {
    return [];
  }
  const excluded = new Set(options.excludedInstanceIds ?? []);
  return selectReleasedEvents(state)
    .filter((event) => {
      const arrivalForPremiere = options.episodeKind === "premiere" && options.week === 1 && event.window === "arrival";
      const sameWeek = event.occurredAt.week === options.week;
      return (sameWeek || arrivalForPremiere)
        && windowsByEpisode[options.episodeKind].has(event.window)
        && !excluded.has(event.id);
    });
}
