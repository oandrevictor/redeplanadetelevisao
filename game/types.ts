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
export type AudienceEngineMode = "legacy" | "shadow" | "clustered";
export type AudienceInterest =
  | "strategy"
  | "competition"
  | "conflict"
  | "humor"
  | "relationships"
  | "vulnerability"
  | "fairness"
  | "authenticity"
  | "redemption"
  | "spectacle"
  | "representation";
export type AudienceValue = "fairness" | "authenticity" | "representation";
export type AudienceAgeBand = "16_24" | "25_34" | "35_49" | "50_64" | "65_plus";
export type AudienceGender = "women" | "men" | "nonbinary_other" | "undeclared";
export type AudienceRegion = "north" | "northeast" | "center_west" | "southeast" | "south";
export type AudienceUrbanity = "metro" | "interior" | "rural";
export type AudienceHousehold = "solo_shared" | "couple" | "with_children" | "multigenerational";
export type AudienceAccessProfile = "connected" | "mixed" | "broadcast_first";
export type AudiencePlatform = "linear" | "connected_tv" | "catch_up" | "mobile_clips";
export type AudienceSocioeconomic = "lower" | "middle" | "upper";
export type AudienceRegionalAttachment = "low" | "medium" | "high";
export type AudienceCoViewing = "solo" | "pair" | "family" | "group";
export type EpisodeKind = "premiere" | "challenge" | "vote" | "elimination" | "final";
export type CutTone = "neutro" | "engracado" | "triste" | "malicioso" | "conflituoso" | "emocional";
export type AudiencePortrayal =
  | "sympathetic"
  | "aggressive"
  | "competent"
  | "vulnerable"
  | "dishonest"
  | "justified"
  | "contradictory"
  | "defensive"
  | "neutral";

export type ExpandedPanelComposition = {
  age: Record<AudienceAgeBand, number>;
  gender: Record<AudienceGender, number>;
  region: Record<AudienceRegion, number>;
  urbanity: Record<AudienceUrbanity, number>;
  household: Record<AudienceHousehold, number>;
  access: Record<AudienceAccessProfile, number>;
  platform: Record<AudiencePlatform, number>;
  socioeconomic: Record<AudienceSocioeconomic, number>;
  regionalAttachment: Record<AudienceRegionalAttachment, number>;
  coViewing: Record<AudienceCoViewing, number>;
};

export type ViewingHabitProfile = {
  baseTuneIn: number;
  loyalty: number;
  noveltySeeking: number;
  conflictTolerance: number;
  adTolerance: number;
  zapping: number;
  votingPropensity: number;
  daypartAvailability: number;
};

export type AudienceClusterDefinition = {
  id: string;
  name: string;
  populationShare: number;
  description: string;
  demographics: ExpandedPanelComposition;
  interests: Record<AudienceInterest, number>;
  values: Record<AudienceValue, number>;
  habits: ViewingHabitProfile;
};

export type ParticipantAudienceProfile = {
  psychographicTags: Partial<Record<AudienceInterest | AudienceValue, number>>;
  publicIdentityTags: string[];
  representationTags: string[];
};
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
  audienceProfile: ParticipantAudienceProfile;
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

export type ParticipantFanState = {
  awareness: number;
  sentiment: number;
  attachment: number;
  exposureMinutes: number;
  fatigue: number;
};

export type AudienceClusterState = {
  clusterId: string;
  habit: number;
  returnIntent: number;
  participantFans: Record<ParticipantId, ParticipantFanState>;
  favoriteShares: Record<ParticipantId, number>;
  unalignedShare: number;
  interestFatigue: Record<AudienceInterest, number>;
  lastEpisodeId: string | null;
  favoriteLossShock: number;
};

export type PublicAudienceKnowledge = {
  storylines: Record<string, number>;
  participantAssociations: Record<string, number>;
};

export type AudienceVoteResult = {
  id: string;
  kind: "elimination" | "final";
  week: number;
  participantIds: ParticipantId[];
  shares: Record<ParticipantId, number>;
  turnoutHouseholds: number;
  clusterShares: Record<string, Record<ParticipantId, number>>;
  selectedParticipantId: ParticipantId;
  lockedAfterEpisodeId: string;
};

export type AudienceMarketState = {
  universeHouseholds: number;
  householdsPerPoint: number;
  networkTargetPoints: number;
  panelLabel: string;
};

export type AudienceState = {
  mode: AudienceEngineMode;
  tuningVersion: string;
  market: AudienceMarketState;
  clusters: Record<string, AudienceClusterState>;
  publicKnowledge: PublicAudienceKnowledge;
  pendingVote: AudienceVoteResult | null;
  voteHistory: AudienceVoteResult[];
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
  | { type: "advanceThread"; threadId: StoryThreadId; delta: number; resolve: boolean }
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
  audienceSignals: Partial<Record<AudienceInterest, number>>;
  observablePortrayals: Partial<Record<ParticipantId, AudiencePortrayal[]>>;
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

export type NominationBallot = {
  voterId: ParticipantId;
  targetId: ParticipantId;
  motiveTags: string[];
  relationship: Pick<
    RelationshipState,
    "affinity" | "trust" | "respect" | "rivalry" | "resentment" | "strategicAlignment"
  >;
  score: number;
};

export type NominationResult = {
  week: number;
  leaderId: ParticipantId;
  leaderTargetId: ParticipantId;
  ballots: NominationBallot[];
  totals: Record<ParticipantId, number>;
  houseTargetId: ParticipantId;
  tieBreakingDecision: string | null;
};

export type EliminationResult = {
  week: number;
  eliminatedId: ParticipantId;
  nomineeIds: ParticipantId[];
  resolvedAtTick: number;
};

export type BroadcastCut = {
  eventInstanceId: EventInstanceId;
  perspectiveIds: readonly ParticipantId[];
  tone: CutTone;
};

export type BroadcastScheduleContext = {
  tvOnRate: number;
  leadInStrength: number;
  promotion: number;
  competitionPressure: number;
};

export type ContentSegment = {
  id: string;
  kind: "content";
  title: string;
  durationSeconds: number;
  sourceEventId: EventInstanceId;
  participantIds: ParticipantId[];
  perspectiveIds: ParticipantId[];
  tone: CutTone;
  signals: Partial<Record<AudienceInterest, number>>;
  portrayals: Partial<Record<ParticipantId, AudiencePortrayal[]>>;
  contextCompleteness: number;
  storylineHook: number;
  revealsEliminatedParticipantId?: ParticipantId;
};

export type ImportantEventSegment = {
  id: string;
  kind: "important_event";
  title: string;
  durationSeconds: number;
  chainId: string;
  sourceBeatIds: string[];
  participantIds: ParticipantId[];
  favoredParticipantIds: ParticipantId[];
  harmedParticipantIds: ParticipantId[];
  signals: Partial<Record<AudienceInterest, number>>;
  portrayals: Partial<Record<ParticipantId, AudiencePortrayal[]>>;
  contextCompleteness: number;
  storylineHook: number;
};

export type CommercialBreakSegment = {
  id: string;
  kind: "commercial";
  title: string;
  durationSeconds: number;
  breakNumber: number;
};

export type BroadcastSegment = ContentSegment | ImportantEventSegment | CommercialBreakSegment;

export type BroadcastEpisode = {
  id: string;
  week: number;
  kind: EpisodeKind;
  schedule: BroadcastScheduleContext;
  segments: BroadcastSegment[];
};

export type AudienceFactorContribution = {
  key: string;
  label: string;
  value: number;
  direction: "positive" | "negative" | "neutral";
  clusterId?: string;
  segmentId?: string;
};

export type AudienceCheckpoint = {
  segmentId: string;
  label: string;
  elapsedSeconds: number;
  households: number;
  rating: number;
  share: number;
  deltaHouseholds: number;
  clusterViewers: Record<string, number>;
  topFactors: AudienceFactorContribution[];
};

export type ClusterEpisodeResult = {
  clusterId: string;
  populationHouseholds: number;
  startHouseholds: number;
  averageHouseholds: number;
  completionHouseholds: number;
  uniqueReachHouseholds: number;
  firstTimeReachHouseholds: number;
  reentryHouseholds: number;
  digitalReachHouseholds: number;
  platformReachHouseholds: Record<AudiencePlatform, number>;
  engagement: {
    vote: number;
    discuss: number;
    follow: number;
  };
  satisfaction: number;
  returnIntentBefore: number;
  returnIntentAfter: number;
  favoriteParticipantId: ParticipantId | null;
};

export type ParticipantFanDelta = {
  participantId: ParticipantId;
  awarenessBefore: number;
  awarenessAfter: number;
  sentimentBefore: number;
  sentimentAfter: number;
  attachmentBefore: number;
  attachmentAfter: number;
  favoriteShareBefore: number;
  favoriteShareAfter: number;
};

export type AudienceShockRecord = {
  episode: number;
  measurementPoints: number;
  clusters: Record<string, number>;
};

export type AudienceEpisodeResult = {
  episodeId: string;
  forecast: { low: number; expected: number; high: number };
  averageRating: number;
  peakRating: number;
  share: number;
  uniqueReach: number;
  digitalReach: number;
  platformReach: Record<AudiencePlatform, number>;
  completionRate: number;
  checkpoints: AudienceCheckpoint[];
  clusterResults: ClusterEpisodeResult[];
  participantFanDeltas: ParticipantFanDelta[];
  nextEpisodeIntent: Record<string, number>;
  factorContributions: AudienceFactorContribution[];
  shocks: AudienceShockRecord;
};

export type BroadcastRecord = {
  week: number;
  cuts: BroadcastCut[];
  audienceForecast: number;
  detailLevel?: "legacy" | "clustered";
  episode?: BroadcastEpisode;
  result?: AudienceEpisodeResult;
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
    nominationHistory: NominationResult[];
    eliminationHistory: EliminationResult[];
    eliminatedIds: ParticipantId[];
    winnerId: ParticipantId | null;
  };
  house: { eventHistory: EventInstance[]; generatedWindows: string[] };
  narrative: {
    threads: Record<StoryThreadId, StoryThread>;
    publicStorylines: Record<string, number>;
  };
  audienceModel: AudienceState;
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
  audienceSignals?: Partial<Record<AudienceInterest, number>>;
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
