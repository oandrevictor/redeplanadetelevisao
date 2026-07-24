export type ParticipantId = string;
export type AllianceId = string;
export type EventInstanceId = string;
export type StoryThreadId = string;
export type RelationshipKey = `${ParticipantId}>${ParticipantId}`;

export type ChallengeType = "resistencia" | "sorte" | "atencao";
export type PersonalityTrait =
  | "carisma"
  | "estrategia"
  | "impulsividade"
  | "lealdade"
  | "competitividade"
  | "percepcaoSocial"
  | "conscienciaDasCameras";
export type TraitScore = 1 | 2 | 3 | 4 | 5;
export type TriggerKey =
  | "ally_attacked"
  | "arrogance"
  | "broken_word"
  | "called_fake"
  | "caught_contradiction"
  | "cornered"
  | "excluded"
  | "intelligence_questioned"
  | "trust_betrayed";
export type BehaviorKey =
  | "bridges_groups"
  | "competes_intensely"
  | "jokes_under_pressure"
  | "observes_before_acting"
  | "overpromises"
  | "probes_inconsistency"
  | "protects_allies"
  | "retaliates_immediately"
  | "stores_resentment"
  | "weaponizes_humor";

export type StoryWindow =
  | "arrival"
  | "pre_challenge"
  | "post_challenge"
  | "leader_reign"
  | "party"
  | "campaign"
  | "nomination"
  | "post_nomination"
  | "elimination"
  | "post_elimination"
  | "final";

export type BroadcastStage = "idle" | "editing" | "live" | "summary" | "audience_vote";
export type EventEngineMode = "legacy" | "shadow" | "dynamic";
export type EventCategory =
  | "Convivência"
  | "Conflito"
  | "Humor"
  | "Prova"
  | "Festa"
  | "Votação"
  | "Memória";

export type CharacterProfile = {
  id: ParticipantId;
  name: string;
  age: number;
  city: string;
  occupation: string;
  bio: string;
  quote: string;
  publicPersona: string;
  challengeTraits: Record<ChallengeType, TraitScore>;
  personalityTraits: Record<PersonalityTrait, TraitScore>;
  personalTriggers: string[];
  behavioralTendencies: string[];
  contradictions: string[];
  strengths: string[];
  weaknesses: string[];
  possibleArcs: string[];
  tags: string[];
  portrait: { x: "0%" | "50%" | "100%"; y: "0%" | "100%" };
  triggerKeys: TriggerKey[];
  behaviorKeys: BehaviorKey[];
  drives: {
    visibility: TraitScore;
    belonging: TraitScore;
    control: TraitScore;
    fairness: TraitScore;
    status: TraitScore;
  };
};

export type CharacterState = {
  participantId: ParticipantId;
  status: "active" | "eliminated" | "finalist" | "winner";
  condition: { energy: number; stress: number; morale: number; inhibition: number };
  game: {
    socialCapital: number;
    perceivedThreat: number;
    leadershipWins: number;
    nominations: number;
    votesReceived: number;
  };
  audience: { support: number; awareness: number; controversy: number; screenTime: number };
  arcProgress: Record<string, number>;
  flags: Record<string, boolean | number | string>;
};

export type RelationshipField =
  | "affinity"
  | "trust"
  | "respect"
  | "rivalry"
  | "resentment"
  | "attraction"
  | "strategicAlignment";

export type RelationshipState = {
  fromId: ParticipantId;
  toId: ParticipantId;
  affinity: number;
  trust: number;
  respect: number;
  rivalry: number;
  resentment: number;
  attraction: number;
  strategicAlignment: number;
  lastInteractionTick: number | null;
};

export type AllianceState = {
  id: AllianceId;
  memberIds: ParticipantId[];
  status: "forming" | "active" | "fractured" | "dissolved";
  secrecy: number;
  cohesion: number;
};

export type GameClock = { tick: number; week: number; day: number; window: StoryWindow };
export type ScoreBreakdown = Record<string, number>;
export type AppliedEffect =
  | { type: "characterDelta"; participantId: ParticipantId; field: string; delta: number }
  | {
      type: "relationshipDelta";
      fromId: ParticipantId;
      toId: ParticipantId;
      field: RelationshipField;
      delta: number;
    }
  | { type: "openThread"; threadId: StoryThreadId; threadType: string; actorIds: ParticipantId[] }
  | { type: "setFlag"; participantId?: ParticipantId; key: string; value: boolean | number | string };

export type EventInstance = {
  id: EventInstanceId;
  templateId: string;
  templateRevision: number;
  sequence: number;
  occurredAt: GameClock;
  window: StoryWindow;
  roleBindings: Record<string, ParticipantId[]>;
  actorIds: ParticipantId[];
  sourceEventIds: EventInstanceId[];
  sourceThreadIds: StoryThreadId[];
  title: string;
  description: string;
  category: EventCategory;
  duration: number;
  heat: number;
  effects: AppliedEffect[];
  scoreBreakdown: ScoreBreakdown;
};

export type StoryThread = {
  id: StoryThreadId;
  type: string;
  actorIds: ParticipantId[];
  status: "open" | "resolved";
  progress: number;
  openedAtTick: number;
};

export type ChallengeResult = {
  week: number;
  type: ChallengeType;
  standings: Array<{ participantId: ParticipantId; score: number }>;
  winnerId: ParticipantId;
};

export type BroadcastCut = {
  eventInstanceId: EventInstanceId;
  perspectiveIds: ParticipantId[];
  tone: "neutro" | "engracado" | "triste" | "malicioso" | "conflituoso" | "emocional";
};

export type BroadcastRecord = {
  week: number;
  cuts: BroadcastCut[];
};

export type GameState = {
  schemaVersion: number;
  engineVersion: string;
  catalogVersion: string;
  seasonId: string;
  mode: EventEngineMode;
  revision: number;
  diagnostics: string[];
  rng: { seed: string; state: number[]; counter: number };
  clock: GameClock;
  castOrder: ParticipantId[];
  characters: Record<ParticipantId, CharacterState>;
  relationships: Record<RelationshipKey, RelationshipState>;
  alliances: Record<AllianceId, AllianceState>;
  competition: {
    leaderId: ParticipantId | null;
    nomineeIds: ParticipantId[];
    challengeHistory: ChallengeResult[];
    eliminatedIds: ParticipantId[];
    winnerId: ParticipantId | null;
  };
  house: { eventHistory: EventInstance[]; generatedWindows: string[] };
  narrative: { threads: Record<StoryThreadId, StoryThread> };
  broadcasts: BroadcastRecord[];
};

export type RoleSpec = {
  name: string;
  count?: number;
  distinct?: boolean;
  leader?: boolean;
  nominee?: boolean;
};

export type EventTemplate = {
  id: string;
  revision: number;
  category: EventCategory;
  tags: string[];
  windows: StoryWindow[];
  roles: RoleSpec[];
  cooldown: { templateTicks: number; pairTicks: number };
  baseScore: number;
  title: string;
  description: string;
  effects: Array<
    | { type: "characterDelta"; role: string; field: string; delta: number }
    | {
        type: "relationshipDelta";
        fromRole: string;
        toRole: string;
        field: RelationshipField;
        delta: number;
      }
    | { type: "openThread"; threadType: string; roles: string[] }
  >;
};
