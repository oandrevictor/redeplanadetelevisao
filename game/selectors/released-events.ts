import type { EventInstance, GameState, StoryWindow } from "../types";

export type ReleasedEventOptions = {
  week?: number;
  windows?: Iterable<StoryWindow>;
};

export function isEventReleased(state: GameState, event: EventInstance): boolean {
  if (event.occurredAt.week > state.clock.week || event.occurredAt.tick > state.clock.tick) {
    return false;
  }

  const airedEpisodeKinds = new Set(state.broadcasts
    .filter((broadcast) => broadcast.week === event.occurredAt.week)
    .map((broadcast) => broadcast.episode?.kind)
    .filter((kind): kind is NonNullable<typeof kind> => Boolean(kind)));

  if (event.window === "post_challenge") {
    const expectedKind = event.occurredAt.week === 1 ? "premiere" : "challenge";
    return airedEpisodeKinds.has(expectedKind);
  }
  if (event.window === "post_nomination") {
    return airedEpisodeKinds.has("vote");
  }
  if (event.window === "elimination" || event.window === "post_elimination") {
    return state.competition.eliminationHistory.some((result) => result.week === event.occurredAt.week);
  }
  return true;
}

export function selectReleasedEvents(
  state: GameState,
  options: ReleasedEventOptions = {},
): EventInstance[] {
  const windows = options.windows ? new Set(options.windows) : null;
  const seen = new Set<string>();
  return state.house.eventHistory
    .filter((event) => isEventReleased(state, event))
    .filter((event) => options.week === undefined || event.occurredAt.week === options.week)
    .filter((event) => windows === null || windows.has(event.window))
    .sort((left, right) => left.sequence - right.sequence)
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
}

export function isStoryWindowReleased(
  state: GameState,
  window: StoryWindow,
  week = state.clock.week,
): boolean {
  return state.house.generatedWindows.includes(`${week}:${window}`);
}
