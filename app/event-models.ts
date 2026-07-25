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

export type Participant = {
  id: string;
  name: string;
  age: number;
  city: string;
  occupation: string;
  bio: string;
  quote: string;
  traits: Record<ChallengeType, TraitScore>;
  personalityTraits: Record<PersonalityTrait, TraitScore>;
  personalTriggers: string[];
  behavioralTendencies: string[];
  publicPersona: string;
  contradictions: string[];
  strengths: string[];
  weaknesses: string[];
  possibleArcs: string[];
  tags: string[];
  portrait: { x: "0%" | "50%" | "100%"; y: "0%" | "100%" };
};

export type RecordedEvent = {
  id: string;
  title: string;
  category: "Convivência" | "Conflito" | "Humor" | "Prova" | "Festa" | "Votação" | "Memória";
  duration: number;
  heat: number;
  description: string;
};

export type SecondaryEvent = RecordedEvent;

export type ImportantEventBeatRole = "Cause" | "Rumor" | "Discovery" | "Confrontation" | "Reaction" | "Consequence";

export type ImportantEventPortrayal =
  | "justified"
  | "attacked"
  | "sympathetic"
  | "aggressive"
  | "dishonest"
  | "contradictory"
  | "defensive"
  | "neutral";

export type ImportantEventBeatNarrativeMetadata = {
  participantFocusWeights: Record<string, number>;
  participantPortrayalEffects: Record<string, ImportantEventPortrayal[]>;
  providesContextForBeatIds: string[];
  contradictsBeatIds: string[];
  isCause: boolean;
  isReaction: boolean;
  isExplanation: boolean;
  isConsequence: boolean;
};

export type ImportantEventBeat = Pick<RecordedEvent, "id" | "title" | "description"> & {
  chainId: string;
  order: number;
  role: ImportantEventBeatRole;
  participantIds: string[];
  location: string;
  narrative: ImportantEventBeatNarrativeMetadata;
};

export type ImportantEventChainStatus = "scheduled" | "in_progress" | "completed";

export type ImportantEventEditStatus = "not_edited" | "editing" | "ready";

export type ImportantEventEditorialConstruction =
  | "full_context"
  | "reaction_without_context"
  | "unilateral_version"
  | "speech_comparison"
  | "fragmented_conflict"
  | "balanced_cut";

export type ImportantEventNarrativeAnalysis = {
  mainFocusParticipantIds: string[];
  favoredParticipantIds: string[];
  harmedParticipantIds: string[];
  detectedEditorialConstruction: ImportantEventEditorialConstruction;
  missingContextDescription: string;
  versionSummary: string;
};

export type ImportantEventEdit = {
  chainId: string;
  selectedBeatIds: string[];
  excludedBeatIds: string[];
  televisedOrder: string[];
  mainFocusParticipantIds: string[];
  favoredParticipantIds: string[];
  harmedParticipantIds: string[];
  detectedEditorialConstruction: ImportantEventEditorialConstruction;
  missingContextDescription: string;
  versionSummary: string;
  finalDurationSeconds: number;
  status: ImportantEventEditStatus;
};

export type ImportantEventChain = {
  id: string;
  weekNumber: number;
  title: string;
  participantIds: string[];
  beatIds: string[];
  status: ImportantEventChainStatus;
};

export type ParticipantRelationship = {
  participantIds: readonly [string, string];
  compatibility: number;
};

export type WeekEventGeneration = {
  secondaryEvents: readonly SecondaryEvent[];
  importantEventChains: ImportantEventChain[];
  importantEventBeats: ImportantEventBeat[];
};
