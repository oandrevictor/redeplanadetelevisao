import type { EventInstance, GameState } from "../types";
import { selectReleasedEvents } from "./released-events";

export type EpisodeKind = "premiere" | "challenge" | "vote" | "elimination" | "final";

const windowsByEpisode: Record<EpisodeKind, Set<EventInstance["window"]>> = {
  premiere: new Set(["arrival"]),
  challenge: new Set(["pre_challenge"]),
  // The voting episode is assembled before the house forms the nomination.
  // Post-nomination material is released through the feed afterwards.
  vote: new Set(["party", "campaign"]),
  elimination: new Set(["elimination", "post_elimination"]),
  final: new Set(["final"]),
};

export function selectAvailableFootage(
  state: GameState,
  options: { week: number; episodeKind: EpisodeKind; excludedInstanceIds?: Iterable<string> },
): EventInstance[] {
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
