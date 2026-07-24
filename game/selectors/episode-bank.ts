import type { EventInstance, GameState } from "../types";

export type EpisodeKind = "premiere" | "challenge" | "vote" | "elimination" | "final";

const windowsByEpisode: Record<EpisodeKind, Set<EventInstance["window"]>> = {
  premiere: new Set(["arrival", "post_challenge"]),
  challenge: new Set(["post_challenge"]),
  vote: new Set(["party", "campaign", "post_nomination"]),
  elimination: new Set(["post_nomination", "elimination", "post_elimination"]),
  final: new Set(["final"]),
};

export function selectAvailableFootage(
  state: GameState,
  options: { week: number; episodeKind: EpisodeKind; excludedInstanceIds?: Iterable<string> },
): EventInstance[] {
  const excluded = new Set(options.excludedInstanceIds ?? []);
  return state.house.eventHistory
    .filter((event) => {
      const arrivalForPremiere = options.episodeKind === "premiere" && options.week === 1 && event.window === "arrival";
      const sameWeek = event.occurredAt.week === options.week;
      return (sameWeek || arrivalForPremiere)
        && windowsByEpisode[options.episodeKind].has(event.window)
        && !excluded.has(event.id);
    })
    .sort((left, right) => left.sequence - right.sequence);
}
