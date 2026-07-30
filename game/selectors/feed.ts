import type { EventInstance, GameState, StoryWindow } from "../types";
import { selectReleasedEvents } from "./released-events";

export type FeedEntry = {
  id: string;
  time: string;
  camera: string;
  title: string;
  body: string;
  category: string;
  participantIds: string[];
  eventInstanceId: string;
  sequence: number;
};

export type FeedBatch = "intro" | "postChallenge" | "party" | "nomination" | "elimination";

type FeedSourceOptions = {
  dynamicReady: boolean;
  mode: GameState["mode"];
  dynamicAuthoritative?: boolean;
};

const locations = ["SALA", "QUARTO", "VARANDA", "COZINHA", "BAR", "PISTA"];

export function toFeedEntry(event: EventInstance): FeedEntry {
  const party = event.window === "party";
  const baseMinutes = party ? 23 * 60 + 18 : 8 * 60 + 14;
  const minutes = baseMinutes + (event.sequence - 1) * (party ? 37 : 29);
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const cameraNumber = ((event.sequence - 1) % 8) + 1;
  return {
    id: event.id,
    eventInstanceId: event.id,
    sequence: event.sequence,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    camera: `CAM ${String(cameraNumber).padStart(2, "0")} · ${locations[(event.sequence - 1) % locations.length]}`,
    title: event.title,
    body: event.description,
    category: event.category,
    participantIds: [...event.actorIds],
  };
}

export function selectFeedEvents(
  state: GameState,
  window: Extract<StoryWindow, "arrival" | "party">,
  week = state.clock.week,
): FeedEntry[] {
  return selectReleasedEvents(state, { week, windows: [window] })
    .map(toFeedEntry);
}

export function selectReleasedFeedEvents(
  state: GameState,
  week = state.clock.week,
): FeedEntry[] {
  return selectReleasedEvents(state, { week }).map(toFeedEntry);
}

export function selectFeedBatch(
  state: GameState,
  batch: FeedBatch,
  week = state.clock.week,
): FeedEntry[] {
  const windows: StoryWindow[] = batch === "intro"
    ? [week === 1 ? "arrival" : "pre_challenge"]
    : batch === "postChallenge"
      ? ["post_challenge"]
      : batch === "party"
        ? ["post_challenge", "party", "campaign"]
        : batch === "nomination"
          ? ["post_nomination"]
          : ["elimination", "post_elimination"];
  return selectReleasedEvents(state, { week, windows }).map(toFeedEntry);
}

export function selectFeedSource<T extends { id: string }>(
  dynamicItems: readonly T[],
  legacyItems: readonly T[],
  { dynamicReady, mode, dynamicAuthoritative = false }: FeedSourceOptions,
): T[] {
  const source = dynamicReady && mode === "dynamic" && (dynamicAuthoritative || dynamicItems.length > 0)
    ? dynamicItems
    : legacyItems;
  const seen = new Set<string>();
  return source.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
