export const EPSILON = 1e-9;

export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Audience definitions use fractions while long-lived audience state uses
 * percentages. Accepting either representation here keeps migrated v1/v2
 * saves deterministic without making callers guess which scale they hold.
 */
export function toUnit(value: number): number {
  return clamp01(Math.abs(value) > 1 ? value / 100 : value);
}

export function round(value: number, precision = 6): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values: readonly number[], fallback = 0): number {
  return values.length > 0 ? sum(values) / values.length : fallback;
}

export function weightedMean(
  values: ReadonlyArray<{ value: number; weight: number }>,
  fallback = 0,
): number {
  const totalWeight = sum(values.map((entry) => Math.max(0, entry.weight)));
  if (totalWeight <= EPSILON) return fallback;
  return values.reduce(
    (total, entry) => total + entry.value * Math.max(0, entry.weight),
    0,
  ) / totalWeight;
}

export function normalizeWeights<T extends string>(
  weights: Record<T, number>,
): Record<T, number> {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const positiveTotal = sum(entries.map(([, value]) => Math.max(0, value)));
  if (entries.length === 0) return {} as Record<T, number>;
  if (positiveTotal <= EPSILON) {
    const equal = 1 / entries.length;
    return Object.fromEntries(entries.map(([key]) => [key, equal])) as Record<T, number>;
  }
  return Object.fromEntries(
    entries.map(([key, value]) => [key, Math.max(0, value) / positiveTotal]),
  ) as Record<T, number>;
}

export function softmax<T extends string>(
  scores: Record<T, number>,
  temperature = 1,
): Record<T, number> {
  const entries = Object.entries(scores) as Array<[T, number]>;
  if (entries.length === 0) return {} as Record<T, number>;
  const safeTemperature = Math.max(0.05, temperature);
  const maximum = Math.max(...entries.map(([, value]) => value));
  const weights = Object.fromEntries(
    entries.map(([key, value]) => [
      key,
      Math.exp(clamp((value - maximum) / safeTemperature, -40, 40)),
    ]),
  ) as Record<T, number>;
  return normalizeWeights(weights);
}

export function directionFor(value: number): "positive" | "negative" | "neutral" {
  if (value > 0.0001) return "positive";
  if (value < -0.0001) return "negative";
  return "neutral";
}
