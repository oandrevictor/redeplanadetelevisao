import type { EpisodeKind, EventInstance } from "../types";

export type FootageView = {
  id: string;
  title: string;
  category: EventInstance["category"];
  duration: number;
  heat: number;
  description: string;
  actorIds: string[];
  occurredAtWeek: number;
  requiredAnchor: boolean;
};

export function toFootageView(event: EventInstance): FootageView {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    duration: event.duration,
    heat: event.heat,
    description: event.description,
    actorIds: [...event.actorIds],
    occurredAtWeek: event.occurredAt.week,
    requiredAnchor: event.templateId.startsWith("anchor:"),
  };
}

export function isRequiredEpisodeFootage(
  event: EventInstance,
  episodeKind: EpisodeKind,
): boolean {
  if (episodeKind === "premiere" || episodeKind === "challenge") {
    return event.templateId === "anchor:challenge-result";
  }
  if (episodeKind === "vote") {
    return event.templateId === "anchor:nomination-result";
  }
  if (episodeKind === "elimination") {
    return event.templateId === "anchor:elimination-result"
      || event.templateId === "anchor:farewell";
  }
  return event.templateId === "anchor:finalist-speech"
    || event.templateId === "anchor:season-retrospective";
}

export function toEpisodeFootageView(
  event: EventInstance,
  episodeKind: EpisodeKind,
): FootageView {
  return {
    ...toFootageView(event),
    requiredAnchor: isRequiredEpisodeFootage(event, episodeKind),
  };
}
