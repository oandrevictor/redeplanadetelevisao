import type { EventInstance } from "../types";

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
