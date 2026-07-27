import { cast } from "./content/cast";
import { createInitialAudienceState } from "./audience/initial-state";
import { createRng, nextRandom } from "./rng";
import type {
  AudienceEngineMode,
  CharacterState,
  GameState,
  RelationshipKey,
  RelationshipState,
} from "./types";

export const SCHEMA_VERSION = 3;
export const ENGINE_VERSION = "0.3.0";
export const CATALOG_VERSION = "0.3.0";

const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));

export function createInitialState(
  seed: string,
  mode: GameState["mode"] = "shadow",
  audienceMode: AudienceEngineMode =
    mode === "legacy" ? "legacy" : mode === "shadow" ? "shadow" : "clustered",
): GameState {
  let rng = createRng(seed);
  const characters: Record<string, CharacterState> = {};
  for (const profile of cast) {
    characters[profile.id] = {
      participantId: profile.id,
      status: "active",
      condition: { energy: 80, stress: 20, morale: 60, inhibition: 55 },
      game: { socialCapital: 50, perceivedThreat: 30, leadershipWins: 0, nominations: 0, votesReceived: 0 },
      audience: { support: 50, awareness: 10, controversy: 0, screenTime: 0 },
      arcProgress: Object.fromEntries(profile.possibleArcs.map((arc) => [arc, 0])),
      flags: {},
    };
  }

  const relationships: Record<RelationshipKey, RelationshipState> = {};
  for (const from of cast) {
    for (const to of cast) {
      if (from.id === to.id) continue;
      let variation: number;
      [variation, rng] = nextRandom(rng);
      const neutral = clamp(50 + Math.round((variation - 0.5) * 6));
      relationships[`${from.id}>${to.id}`] = {
        fromId: from.id, toId: to.id, affinity: neutral, trust: neutral, respect: neutral,
        rivalry: clamp(20 + Math.round((0.5 - variation) * 4)), resentment: 0, attraction: 0,
        strategicAlignment: neutral, lastInteractionTick: null,
      };
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION, engineVersion: ENGINE_VERSION, catalogVersion: CATALOG_VERSION,
    seasonId: `season-${createRng(seed).state[0].toString(36)}`, mode, revision: 0, diagnostics: [], rng,
    clock: { tick: 0, week: 1, day: 1, window: "arrival" },
    castOrder: cast.map((profile) => profile.id), characters, relationships, alliances: {},
    competition: {
      leaderId: null,
      nomineeIds: [],
      challengeHistory: [],
      nominationHistory: [],
      eliminationHistory: [],
      eliminatedIds: [],
      winnerId: null,
    },
    house: { eventHistory: [], generatedWindows: [] },
    narrative: { threads: {}, publicStorylines: {} },
    audienceModel: createInitialAudienceState(cast.map((profile) => profile.id), audienceMode),
    broadcasts: [],
  };
}
