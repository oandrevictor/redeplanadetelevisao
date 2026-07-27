import type {
  AudienceClusterState,
  AudienceEngineMode,
  AudienceInterest,
  AudienceState,
  ParticipantFanState,
  ParticipantId,
} from "../types";
import {
  AUDIENCE_CLUSTERS,
  AUDIENCE_INTERESTS,
  AUDIENCE_MARKET,
  AUDIENCE_TUNING_VERSION,
} from "./catalog";

function createParticipantFans(participantIds: readonly ParticipantId[]): Record<ParticipantId, ParticipantFanState> {
  const participantFans: Record<ParticipantId, ParticipantFanState> = {};
  for (const participantId of participantIds) {
    participantFans[participantId] = {
      awareness: 0,
      sentiment: 0,
      attachment: 0,
      exposureMinutes: 0,
      fatigue: 0,
    };
  }
  return participantFans;
}

function createFavoriteShares(participantIds: readonly ParticipantId[]): Record<ParticipantId, number> {
  const favoriteShares: Record<ParticipantId, number> = {};
  for (const participantId of participantIds) favoriteShares[participantId] = 0;
  return favoriteShares;
}

function createInterestFatigue(): Record<AudienceInterest, number> {
  const interestFatigue = {} as Record<AudienceInterest, number>;
  for (const interest of AUDIENCE_INTERESTS) interestFatigue[interest] = 0;
  return interestFatigue;
}

export function createInitialAudienceState(
  castOrder: readonly ParticipantId[],
  mode: AudienceEngineMode = "clustered",
): AudienceState {
  // First occurrence wins, preserving the canonical cast order while preventing
  // duplicate input IDs from creating ambiguous initialization behavior.
  const participantIds = [...new Set(castOrder)];
  const clusters: Record<string, AudienceClusterState> = {};

  for (const definition of AUDIENCE_CLUSTERS) {
    clusters[definition.id] = {
      clusterId: definition.id,
      habit: definition.habits.baseTuneIn,
      returnIntent: definition.habits.loyalty,
      participantFans: createParticipantFans(participantIds),
      favoriteShares: createFavoriteShares(participantIds),
      unalignedShare: 1,
      interestFatigue: createInterestFatigue(),
      lastEpisodeId: null,
      favoriteLossShock: 0,
    };
  }

  return {
    mode,
    tuningVersion: AUDIENCE_TUNING_VERSION,
    market: { ...AUDIENCE_MARKET },
    clusters,
    publicKnowledge: {
      storylines: {},
      participantAssociations: {},
    },
    pendingVote: null,
    voteHistory: [],
  };
}
