import type {
  AudienceInterest,
  AudiencePortrayal,
  EventCategory,
  ParticipantId,
} from "../types";

const categorySignals: Record<EventCategory, Partial<Record<AudienceInterest, number>>> = {
  "Convivência": { relationships: 0.75, authenticity: 0.55, vulnerability: 0.35 },
  "Conflito": { conflict: 0.95, authenticity: 0.45, spectacle: 0.7 },
  "Humor": { humor: 1, relationships: 0.4, spectacle: 0.45 },
  "Prova": { competition: 1, strategy: 0.45, spectacle: 0.75 },
  "Festa": { spectacle: 0.85, relationships: 0.7, humor: 0.55 },
  "Votação": { strategy: 0.9, conflict: 0.65, fairness: 0.7 },
  "Memória": { vulnerability: 0.85, redemption: 0.75, relationships: 0.6 },
};

const tagSignals: Record<string, Partial<Record<AudienceInterest, number>>> = {
  strategy: { strategy: 0.95 },
  challenge: { competition: 0.95, spectacle: 0.65 },
  friction: { conflict: 0.85 },
  humor: { humor: 0.95 },
  party: { spectacle: 0.8, relationships: 0.55 },
  bond: { relationships: 0.9, vulnerability: 0.45 },
  risk: { conflict: 0.65, spectacle: 0.6 },
  trigger: { conflict: 0.8, authenticity: 0.55 },
  decompression: { redemption: 0.75, fairness: 0.5 },
  aftermath: { vulnerability: 0.8, redemption: 0.65 },
  callback: { strategy: 0.55, authenticity: 0.7, redemption: 0.4 },
  nominee: { strategy: 0.65, fairness: 0.7, conflict: 0.55 },
  leader: { strategy: 0.75, competition: 0.55 },
};

function mergeSignal(
  target: Partial<Record<AudienceInterest, number>>,
  source: Partial<Record<AudienceInterest, number>>,
): void {
  for (const [key, value] of Object.entries(source) as Array<[AudienceInterest, number]>) {
    target[key] = Math.max(target[key] ?? 0, value);
  }
}

export function deriveAudienceSignals(
  category: EventCategory,
  tags: readonly string[] = [],
  authored: Partial<Record<AudienceInterest, number>> = {},
): Partial<Record<AudienceInterest, number>> {
  const signals: Partial<Record<AudienceInterest, number>> = {};
  mergeSignal(signals, categorySignals[category]);
  for (const tag of tags) if (tagSignals[tag]) mergeSignal(signals, tagSignals[tag]);
  mergeSignal(signals, authored);
  return signals;
}

export function neutralPortrayals(
  participantIds: readonly ParticipantId[],
): Partial<Record<ParticipantId, AudiencePortrayal[]>> {
  return Object.fromEntries(participantIds.map((id) => [id, ["neutral"]]));
}
