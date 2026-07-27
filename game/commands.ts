import type { BroadcastCut, BroadcastEpisode, ChallengeType, ParticipantId, StoryWindow } from "./types";

export type GameCommand =
  | { type: "START_SEASON"; seed: string }
  | { type: "SELECT_CHALLENGE"; challengeType: ChallengeType }
  | { type: "CONFIRM_CHALLENGE"; challengeType: ChallengeType }
  | { type: "ADVANCE_STORY"; to: StoryWindow }
  | { type: "START_PARTY" }
  | { type: "FORM_NOMINATION" }
  | { type: "REGISTER_AUDIENCE_RESULT"; participantId: ParticipantId }
  | { type: "CLOSE_AUDIENCE_VOTE" }
  | { type: "RESOLVE_ELIMINATION"; participantId?: ParticipantId }
  | { type: "BROADCAST_EPISODE"; cuts: BroadcastCut[] }
  | { type: "AIR_EPISODE"; episode: BroadcastEpisode }
  | { type: "ADVANCE_WEEK" }
  | { type: "CLOSE_FINAL_VOTE" }
  | { type: "RESOLVE_FINAL"; winnerId?: ParticipantId };

export type CommandResult = { state: import("./types").GameState; diagnostic?: string };
