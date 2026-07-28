export const EDITOR_DURATION_CONFIG = {
  minMinutes: 38,
  maxMinutes: 46,
  commercialBreaks: 4,
  commercialBreakMinutes: 4,
} as const;

export type EditorialReading = {
  label: string;
  state: "empty" | "low" | "good" | "high";
};

export type RequiredEditorialEvent = {
  id: string;
  title: string;
  included: boolean;
};

export function classifyDuration(totalSeconds: number): EditorialReading {
  const totalMinutes = totalSeconds / 60;
  if (totalMinutes < EDITOR_DURATION_CONFIG.minMinutes) return { label: "Curta", state: "low" };
  if (totalMinutes > EDITOR_DURATION_CONFIG.maxMinutes) return { label: "Longa", state: "high" };
  return { label: "Adequada", state: "good" };
}

export function classifyRhythm(editorialDurationsMinutes: number[]): EditorialReading {
  if (editorialDurationsMinutes.length === 0) return { label: "Ainda sem leitura", state: "empty" };
  const average = editorialDurationsMinutes.reduce((sum, duration) => sum + duration, 0) / editorialDurationsMinutes.length;
  if (average < 5) return { label: "Acelerado", state: "high" };
  if (average > 7) return { label: "Lento", state: "low" };
  return { label: "Equilibrado", state: "good" };
}

export function classifyVariety(categories: string[]): EditorialReading {
  const distinctCategories = new Set(categories.filter(Boolean));
  if (distinctCategories.size === 0) return { label: "Ainda sem leitura", state: "empty" };
  if (distinctCategories.size === 1) return { label: "Baixa", state: "low" };
  if (distinctCategories.size === 2) return { label: "Moderada", state: "good" };
  return { label: "Boa", state: "good" };
}

export function classifyFocus(
  participantGroups: string[][],
  participantName: (id: string) => string,
): EditorialReading {
  const cutsWithParticipants = participantGroups.filter((group) => group.length > 0);
  if (cutsWithParticipants.length < 2) return { label: "Ainda sem leitura", state: "empty" };

  const appearances = new Map<string, number>();
  for (const group of cutsWithParticipants) {
    for (const id of new Set(group)) appearances.set(id, (appearances.get(id) ?? 0) + 1);
  }
  const leader = [...appearances.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  if (leader && leader[1] >= 2 && leader[1] >= cutsWithParticipants.length / 2) {
    return { label: `Concentrado em ${participantName(leader[0])}`, state: "high" };
  }
  return { label: "Distribuído", state: "good" };
}

export function buildEditorialAlerts(
  duration: EditorialReading,
  focus: EditorialReading,
  variety: EditorialReading,
  rhythm: EditorialReading,
): string[] {
  const alerts: string[] = [];
  if (duration.label === "Longa") alerts.push("Episódio longo: a duração acima da faixa pode cansar a audiência.");
  if (duration.label === "Curta") alerts.push("Episódio curto: a duração abaixo da faixa pode afetar a recepção do público.");
  if (focus.label.startsWith("Concentrado")) alerts.push(`${focus.label}. Confira se esse é o foco desejado.`);
  if (variety.label === "Baixa") alerts.push("Pouca variedade: considere combinar acontecimentos de tipos diferentes.");
  if (rhythm.label === "Acelerado") alerts.push("Ritmo acelerado: muitos cortes curtos podem dificultar o acompanhamento.");
  if (rhythm.label === "Lento") alerts.push("Ritmo lento: cortes longos em sequência podem reduzir a energia do episódio.");
  return alerts;
}

export function validateEditorCut(
  editorialEventCount: number,
  requiredEvents: RequiredEditorialEvent[],
): string | null {
  if (editorialEventCount < 2) {
    return "Inclua pelo menos dois acontecimentos editoriais antes de transmitir.";
  }
  const missing = requiredEvents.filter((event) => !event.included);
  if (missing.length === 1) return `Inclua o acontecimento obrigatório: ${missing[0].title}.`;
  if (missing.length > 1) return `Inclua os acontecimentos obrigatórios: ${missing.map((event) => event.title).join(", ")}.`;
  return null;
}

type TimelineLike = { id: string; kind: string };

export function selectEditorEpisodeBank<T>(
  canonicalEvents: T[],
  legacyEvents: T[],
  options: { requiresCanonicalHistory: boolean; dynamicEngine: boolean },
): T[] {
  if (options.requiresCanonicalHistory) return canonicalEvents;
  return options.dynamicEngine && canonicalEvents.length >= 2
    ? canonicalEvents
    : legacyEvents;
}

export function reconcileTimelineWithCanonicalHistory<T extends TimelineLike>(
  timeline: T[],
  canonicalEventIds: Iterable<string>,
): T[] {
  const canonicalIds = new Set(canonicalEventIds);
  const reconciled = timeline.filter(
    (item) => item.kind !== "event" || canonicalIds.has(item.id),
  );
  return reconciled.length === timeline.length ? timeline : reconciled;
}

export function firstEmptyProgramZoneIndex<T extends TimelineLike>(timeline: T[]): number {
  let zoneStart = 0;
  let zoneHasEditorialItem = false;
  for (let index = 0; index < timeline.length; index += 1) {
    if (timeline[index].kind === "ad") {
      if (!zoneHasEditorialItem) return zoneStart;
      zoneStart = index + 1;
      zoneHasEditorialItem = false;
    } else {
      zoneHasEditorialItem = true;
    }
  }
  return zoneHasEditorialItem ? timeline.length : zoneStart;
}

export function insertIntoFirstEmptyProgramZone<T extends TimelineLike>(timeline: T[], item: T): T[] {
  if (timeline.some((current) => current.id === item.id)) return timeline;
  const next = [...timeline];
  next.splice(firstEmptyProgramZoneIndex(timeline), 0, item);
  return next;
}

export function removeEditorialTimelineItem<T extends TimelineLike>(timeline: T[], id: string): T[] {
  return timeline.filter((item) => item.kind === "ad" || item.id !== id);
}

export function moveTimelineItem<T extends TimelineLike>(timeline: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (index < 0 || index >= timeline.length || nextIndex < 0 || nextIndex >= timeline.length) return timeline;
  const next = [...timeline];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}
