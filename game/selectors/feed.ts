import type { EventInstance, GameState, StoryWindow } from "../types";

export type FeedEntry = {
  id: string;
  time: string;
  camera: string;
  title: string;
  body: string;
  eventInstanceId: string;
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
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    camera: `CAM ${String(cameraNumber).padStart(2, "0")} · ${locations[(event.sequence - 1) % locations.length]}`,
    title: event.title,
    body: event.description,
  };
}

export function selectFeedEvents(
  state: GameState,
  window: Extract<StoryWindow, "arrival" | "party">,
  week = state.clock.week,
): FeedEntry[] {
  return state.house.eventHistory
    .filter((event) => event.window === window && event.occurredAt.week === week)
    .sort((left, right) => left.sequence - right.sequence)
    .map(toFeedEntry);
}
