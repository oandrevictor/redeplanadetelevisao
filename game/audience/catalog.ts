import type {
  AudienceClusterDefinition,
  AudienceInterest,
  AudienceMarketState,
  BroadcastScheduleContext,
  EpisodeKind,
  ExpandedPanelComposition,
} from "../types";

export const AUDIENCE_TUNING_VERSION = "cohort-v1";

export const AUDIENCE_MARKET: Readonly<AudienceMarketState> = {
  universeHouseholds: 50_000_000,
  householdsPerPoint: 500_000,
  networkTargetPoints: 24,
  panelLabel: "Painel Nacional Ficcional — Rede Plana",
};

export const AUDIENCE_SCHEDULES: Readonly<Record<EpisodeKind, BroadcastScheduleContext>> = {
  premiere: {
    tvOnRate: 0.66,
    leadInStrength: 0.8,
    promotion: 0.95,
    competitionPressure: 0.46,
  },
  challenge: {
    tvOnRate: 0.6,
    leadInStrength: 0.68,
    promotion: 0.64,
    competitionPressure: 0.56,
  },
  vote: {
    tvOnRate: 0.63,
    leadInStrength: 0.72,
    promotion: 0.75,
    competitionPressure: 0.58,
  },
  elimination: {
    tvOnRate: 0.68,
    leadInStrength: 0.82,
    promotion: 0.84,
    competitionPressure: 0.52,
  },
  final: {
    tvOnRate: 0.74,
    leadInStrength: 0.9,
    promotion: 0.98,
    competitionPressure: 0.44,
  },
};

export const AUDIENCE_INTERESTS: readonly AudienceInterest[] = [
  "strategy",
  "competition",
  "conflict",
  "humor",
  "relationships",
  "vulnerability",
  "fairness",
  "authenticity",
  "redemption",
  "spectacle",
  "representation",
];

const age = (
  age16To24: number,
  age25To34: number,
  age35To49: number,
  age50To64: number,
  age65Plus: number,
): ExpandedPanelComposition["age"] => ({
  "16_24": age16To24,
  "25_34": age25To34,
  "35_49": age35To49,
  "50_64": age50To64,
  "65_plus": age65Plus,
});

const gender = (
  women: number,
  men: number,
  nonbinaryOther: number,
  undeclared: number,
): ExpandedPanelComposition["gender"] => ({
  women,
  men,
  nonbinary_other: nonbinaryOther,
  undeclared,
});

const region = (
  north: number,
  northeast: number,
  centerWest: number,
  southeast: number,
  south: number,
): ExpandedPanelComposition["region"] => ({
  north,
  northeast,
  center_west: centerWest,
  southeast,
  south,
});

const urbanity = (
  metro: number,
  interior: number,
  rural: number,
): ExpandedPanelComposition["urbanity"] => ({ metro, interior, rural });

const household = (
  soloShared: number,
  couple: number,
  withChildren: number,
  multigenerational: number,
): ExpandedPanelComposition["household"] => ({
  solo_shared: soloShared,
  couple,
  with_children: withChildren,
  multigenerational,
});

const access = (
  connected: number,
  mixed: number,
  broadcastFirst: number,
): ExpandedPanelComposition["access"] => ({
  connected,
  mixed,
  broadcast_first: broadcastFirst,
});

const platform = (
  linear: number,
  connectedTv: number,
  catchUp: number,
  mobileClips: number,
): ExpandedPanelComposition["platform"] => ({
  linear,
  connected_tv: connectedTv,
  catch_up: catchUp,
  mobile_clips: mobileClips,
});

const socioeconomic = (
  lower: number,
  middle: number,
  upper: number,
): ExpandedPanelComposition["socioeconomic"] => ({ lower, middle, upper });

const regionalAttachment = (
  low: number,
  medium: number,
  high: number,
): ExpandedPanelComposition["regionalAttachment"] => ({ low, medium, high });

const coViewing = (
  solo: number,
  pair: number,
  family: number,
  group: number,
): ExpandedPanelComposition["coViewing"] => ({ solo, pair, family, group });

export const AUDIENCE_CLUSTERS: readonly AudienceClusterDefinition[] = [
  {
    id: "reality_superfans",
    name: "Reality superfans",
    populationShare: 0.08,
    description: "Highly informed viewers who follow the season, its characters, and its public conversation closely.",
    demographics: {
      age: age(0.24, 0.3, 0.27, 0.14, 0.05),
      gender: gender(0.55, 0.38, 0.04, 0.03),
      region: region(0.08, 0.27, 0.08, 0.42, 0.15),
      urbanity: urbanity(0.63, 0.29, 0.08),
      household: household(0.29, 0.22, 0.29, 0.2),
      access: access(0.48, 0.42, 0.1),
      platform: platform(0.44, 0.22, 0.14, 0.2),
      socioeconomic: socioeconomic(0.35, 0.5, 0.15),
      regionalAttachment: regionalAttachment(0.25, 0.45, 0.3),
      coViewing: coViewing(0.45, 0.2, 0.2, 0.15),
    },
    interests: {
      strategy: 0.78,
      competition: 0.72,
      conflict: 0.74,
      humor: 0.7,
      relationships: 0.77,
      vulnerability: 0.76,
      fairness: 0.79,
      authenticity: 0.84,
      redemption: 0.75,
      spectacle: 0.8,
      representation: 0.72,
    },
    values: { fairness: 0.8, authenticity: 0.86, representation: 0.74 },
    habits: {
      baseTuneIn: 0.86,
      loyalty: 0.91,
      noveltySeeking: 0.65,
      conflictTolerance: 0.77,
      adTolerance: 0.44,
      zapping: 0.24,
      votingPropensity: 0.88,
      daypartAvailability: 0.82,
    },
  },
  {
    id: "prime_time_habitual_viewers",
    name: "Prime-time habitual viewers",
    populationShare: 0.09,
    description: "Regular linear-TV viewers whose evening routine is a stronger driver than any single storyline.",
    demographics: {
      age: age(0.08, 0.15, 0.31, 0.29, 0.17),
      gender: gender(0.53, 0.43, 0.01, 0.03),
      region: region(0.08, 0.27, 0.08, 0.42, 0.15),
      urbanity: urbanity(0.5, 0.38, 0.12),
      household: household(0.15, 0.28, 0.34, 0.23),
      access: access(0.16, 0.42, 0.42),
      platform: platform(0.74, 0.1, 0.11, 0.05),
      socioeconomic: socioeconomic(0.38, 0.49, 0.13),
      regionalAttachment: regionalAttachment(0.18, 0.44, 0.38),
      coViewing: coViewing(0.18, 0.28, 0.39, 0.15),
    },
    interests: {
      strategy: 0.46,
      competition: 0.61,
      conflict: 0.52,
      humor: 0.62,
      relationships: 0.61,
      vulnerability: 0.59,
      fairness: 0.63,
      authenticity: 0.64,
      redemption: 0.58,
      spectacle: 0.69,
      representation: 0.48,
    },
    values: { fairness: 0.65, authenticity: 0.66, representation: 0.5 },
    habits: {
      baseTuneIn: 0.82,
      loyalty: 0.86,
      noveltySeeking: 0.36,
      conflictTolerance: 0.57,
      adTolerance: 0.69,
      zapping: 0.28,
      votingPropensity: 0.48,
      daypartAvailability: 0.9,
    },
  },
  {
    id: "family_co_viewers",
    name: "Family co-viewers",
    populationShare: 0.07,
    description: "Households watching together that reward accessible humor, emotional clarity, and broad spectacle.",
    demographics: {
      age: age(0.14, 0.21, 0.37, 0.2, 0.08),
      gender: gender(0.51, 0.44, 0.02, 0.03),
      region: region(0.09, 0.29, 0.09, 0.39, 0.14),
      urbanity: urbanity(0.45, 0.41, 0.14),
      household: household(0.03, 0.11, 0.58, 0.28),
      access: access(0.19, 0.49, 0.32),
      platform: platform(0.65, 0.16, 0.14, 0.05),
      socioeconomic: socioeconomic(0.42, 0.48, 0.1),
      regionalAttachment: regionalAttachment(0.15, 0.4, 0.45),
      coViewing: coViewing(0.08, 0.17, 0.62, 0.13),
    },
    interests: {
      strategy: 0.38,
      competition: 0.64,
      conflict: 0.34,
      humor: 0.78,
      relationships: 0.7,
      vulnerability: 0.69,
      fairness: 0.76,
      authenticity: 0.68,
      redemption: 0.73,
      spectacle: 0.81,
      representation: 0.63,
    },
    values: { fairness: 0.8, authenticity: 0.7, representation: 0.66 },
    habits: {
      baseTuneIn: 0.68,
      loyalty: 0.7,
      noveltySeeking: 0.42,
      conflictTolerance: 0.31,
      adTolerance: 0.67,
      zapping: 0.34,
      votingPropensity: 0.35,
      daypartAvailability: 0.8,
    },
  },
  {
    id: "strategy_analysts",
    name: "Strategy analysts",
    populationShare: 0.06,
    description: "Detail-oriented viewers drawn to plans, votes, social maneuvering, and coherent cause and effect.",
    demographics: {
      age: age(0.18, 0.32, 0.31, 0.15, 0.04),
      gender: gender(0.38, 0.54, 0.04, 0.04),
      region: region(0.07, 0.22, 0.09, 0.47, 0.15),
      urbanity: urbanity(0.69, 0.25, 0.06),
      household: household(0.34, 0.3, 0.23, 0.13),
      access: access(0.55, 0.38, 0.07),
      platform: platform(0.41, 0.29, 0.2, 0.1),
      socioeconomic: socioeconomic(0.22, 0.56, 0.22),
      regionalAttachment: regionalAttachment(0.35, 0.48, 0.17),
      coViewing: coViewing(0.48, 0.26, 0.16, 0.1),
    },
    interests: {
      strategy: 0.98,
      competition: 0.76,
      conflict: 0.61,
      humor: 0.42,
      relationships: 0.68,
      vulnerability: 0.39,
      fairness: 0.78,
      authenticity: 0.73,
      redemption: 0.48,
      spectacle: 0.45,
      representation: 0.5,
    },
    values: { fairness: 0.82, authenticity: 0.76, representation: 0.52 },
    habits: {
      baseTuneIn: 0.65,
      loyalty: 0.8,
      noveltySeeking: 0.58,
      conflictTolerance: 0.65,
      adTolerance: 0.31,
      zapping: 0.27,
      votingPropensity: 0.7,
      daypartAvailability: 0.69,
    },
  },
  {
    id: "competition_fans",
    name: "Competition fans",
    populationShare: 0.06,
    description: "Challenge-led viewers who value visible skill, meaningful stakes, and credible competitive outcomes.",
    demographics: {
      age: age(0.2, 0.27, 0.29, 0.18, 0.06),
      gender: gender(0.35, 0.59, 0.02, 0.04),
      region: region(0.09, 0.25, 0.1, 0.4, 0.16),
      urbanity: urbanity(0.52, 0.37, 0.11),
      household: household(0.27, 0.27, 0.31, 0.15),
      access: access(0.37, 0.46, 0.17),
      platform: platform(0.5, 0.25, 0.12, 0.13),
      socioeconomic: socioeconomic(0.35, 0.5, 0.15),
      regionalAttachment: regionalAttachment(0.3, 0.46, 0.24),
      coViewing: coViewing(0.31, 0.26, 0.29, 0.14),
    },
    interests: {
      strategy: 0.66,
      competition: 0.98,
      conflict: 0.52,
      humor: 0.48,
      relationships: 0.36,
      vulnerability: 0.35,
      fairness: 0.79,
      authenticity: 0.62,
      redemption: 0.52,
      spectacle: 0.84,
      representation: 0.44,
    },
    values: { fairness: 0.84, authenticity: 0.66, representation: 0.46 },
    habits: {
      baseTuneIn: 0.6,
      loyalty: 0.66,
      noveltySeeking: 0.59,
      conflictTolerance: 0.57,
      adTolerance: 0.42,
      zapping: 0.42,
      votingPropensity: 0.49,
      daypartAvailability: 0.7,
    },
  },
  {
    id: "conflict_seekers",
    name: "Conflict seekers",
    populationShare: 0.07,
    description: "High-arousal viewers who arrive for confrontation, reversals, and social consequences.",
    demographics: {
      age: age(0.29, 0.3, 0.25, 0.12, 0.04),
      gender: gender(0.49, 0.44, 0.04, 0.03),
      region: region(0.09, 0.28, 0.08, 0.41, 0.14),
      urbanity: urbanity(0.62, 0.3, 0.08),
      household: household(0.36, 0.21, 0.27, 0.16),
      access: access(0.5, 0.4, 0.1),
      platform: platform(0.39, 0.2, 0.12, 0.29),
      socioeconomic: socioeconomic(0.38, 0.49, 0.13),
      regionalAttachment: regionalAttachment(0.42, 0.42, 0.16),
      coViewing: coViewing(0.41, 0.23, 0.19, 0.17),
    },
    interests: {
      strategy: 0.51,
      competition: 0.56,
      conflict: 0.99,
      humor: 0.66,
      relationships: 0.74,
      vulnerability: 0.48,
      fairness: 0.45,
      authenticity: 0.72,
      redemption: 0.58,
      spectacle: 0.82,
      representation: 0.47,
    },
    values: { fairness: 0.48, authenticity: 0.76, representation: 0.5 },
    habits: {
      baseTuneIn: 0.57,
      loyalty: 0.55,
      noveltySeeking: 0.8,
      conflictTolerance: 0.96,
      adTolerance: 0.29,
      zapping: 0.62,
      votingPropensity: 0.7,
      daypartAvailability: 0.66,
    },
  },
  {
    id: "humor_clip_seekers",
    name: "Humor and clip seekers",
    populationShare: 0.07,
    description: "Light viewers who discover moments through jokes and shareable clips before choosing a full episode.",
    demographics: {
      age: age(0.42, 0.32, 0.18, 0.06, 0.02),
      gender: gender(0.47, 0.43, 0.06, 0.04),
      region: region(0.08, 0.26, 0.08, 0.44, 0.14),
      urbanity: urbanity(0.72, 0.23, 0.05),
      household: household(0.45, 0.2, 0.21, 0.14),
      access: access(0.69, 0.27, 0.04),
      platform: platform(0.19, 0.17, 0.16, 0.48),
      socioeconomic: socioeconomic(0.43, 0.45, 0.12),
      regionalAttachment: regionalAttachment(0.48, 0.38, 0.14),
      coViewing: coViewing(0.5, 0.19, 0.16, 0.15),
    },
    interests: {
      strategy: 0.31,
      competition: 0.45,
      conflict: 0.63,
      humor: 0.99,
      relationships: 0.57,
      vulnerability: 0.5,
      fairness: 0.48,
      authenticity: 0.69,
      redemption: 0.54,
      spectacle: 0.74,
      representation: 0.62,
    },
    values: { fairness: 0.5, authenticity: 0.72, representation: 0.66 },
    habits: {
      baseTuneIn: 0.39,
      loyalty: 0.42,
      noveltySeeking: 0.91,
      conflictTolerance: 0.7,
      adTolerance: 0.18,
      zapping: 0.82,
      votingPropensity: 0.55,
      daypartAvailability: 0.58,
    },
  },
  {
    id: "human_story_viewers",
    name: "Human-story viewers",
    populationShare: 0.07,
    description: "Emotion-led viewers who stay for vulnerability, growth, consequences, and earned redemption.",
    demographics: {
      age: age(0.13, 0.23, 0.31, 0.23, 0.1),
      gender: gender(0.63, 0.3, 0.03, 0.04),
      region: region(0.08, 0.28, 0.07, 0.42, 0.15),
      urbanity: urbanity(0.54, 0.35, 0.11),
      household: household(0.2, 0.27, 0.32, 0.21),
      access: access(0.31, 0.48, 0.21),
      platform: platform(0.53, 0.18, 0.2, 0.09),
      socioeconomic: socioeconomic(0.4, 0.48, 0.12),
      regionalAttachment: regionalAttachment(0.18, 0.42, 0.4),
      coViewing: coViewing(0.29, 0.27, 0.32, 0.12),
    },
    interests: {
      strategy: 0.31,
      competition: 0.42,
      conflict: 0.39,
      humor: 0.58,
      relationships: 0.82,
      vulnerability: 0.99,
      fairness: 0.81,
      authenticity: 0.91,
      redemption: 0.94,
      spectacle: 0.48,
      representation: 0.72,
    },
    values: { fairness: 0.84, authenticity: 0.95, representation: 0.75 },
    habits: {
      baseTuneIn: 0.6,
      loyalty: 0.77,
      noveltySeeking: 0.44,
      conflictTolerance: 0.38,
      adTolerance: 0.54,
      zapping: 0.31,
      votingPropensity: 0.57,
      daypartAvailability: 0.73,
    },
  },
  {
    id: "relationship_story_viewers",
    name: "Relationship-story viewers",
    populationShare: 0.05,
    description: "Viewers invested in friendships, rivalries, romances, betrayals, and changing loyalties.",
    demographics: {
      age: age(0.26, 0.31, 0.25, 0.13, 0.05),
      gender: gender(0.61, 0.31, 0.05, 0.03),
      region: region(0.08, 0.27, 0.07, 0.43, 0.15),
      urbanity: urbanity(0.64, 0.29, 0.07),
      household: household(0.34, 0.25, 0.25, 0.16),
      access: access(0.53, 0.39, 0.08),
      platform: platform(0.37, 0.22, 0.2, 0.21),
      socioeconomic: socioeconomic(0.35, 0.51, 0.14),
      regionalAttachment: regionalAttachment(0.25, 0.44, 0.31),
      coViewing: coViewing(0.34, 0.28, 0.25, 0.13),
    },
    interests: {
      strategy: 0.45,
      competition: 0.37,
      conflict: 0.72,
      humor: 0.61,
      relationships: 0.99,
      vulnerability: 0.83,
      fairness: 0.7,
      authenticity: 0.82,
      redemption: 0.78,
      spectacle: 0.5,
      representation: 0.65,
    },
    values: { fairness: 0.73, authenticity: 0.86, representation: 0.68 },
    habits: {
      baseTuneIn: 0.59,
      loyalty: 0.79,
      noveltySeeking: 0.58,
      conflictTolerance: 0.63,
      adTolerance: 0.38,
      zapping: 0.39,
      votingPropensity: 0.62,
      daypartAvailability: 0.68,
    },
  },
  {
    id: "fairness_authenticity_watchdogs",
    name: "Fairness and authenticity watchdogs",
    populationShare: 0.06,
    description: "Critical viewers attentive to manipulation, context, accountability, and whether outcomes feel earned.",
    demographics: {
      age: age(0.15, 0.25, 0.32, 0.21, 0.07),
      gender: gender(0.54, 0.38, 0.04, 0.04),
      region: region(0.07, 0.24, 0.08, 0.46, 0.15),
      urbanity: urbanity(0.66, 0.28, 0.06),
      household: household(0.31, 0.3, 0.24, 0.15),
      access: access(0.5, 0.41, 0.09),
      platform: platform(0.4, 0.24, 0.23, 0.13),
      socioeconomic: socioeconomic(0.28, 0.54, 0.18),
      regionalAttachment: regionalAttachment(0.27, 0.47, 0.26),
      coViewing: coViewing(0.36, 0.28, 0.25, 0.11),
    },
    interests: {
      strategy: 0.68,
      competition: 0.61,
      conflict: 0.45,
      humor: 0.42,
      relationships: 0.59,
      vulnerability: 0.65,
      fairness: 0.99,
      authenticity: 0.99,
      redemption: 0.69,
      spectacle: 0.35,
      representation: 0.81,
    },
    values: { fairness: 0.99, authenticity: 0.99, representation: 0.86 },
    habits: {
      baseTuneIn: 0.55,
      loyalty: 0.69,
      noveltySeeking: 0.45,
      conflictTolerance: 0.46,
      adTolerance: 0.33,
      zapping: 0.4,
      votingPropensity: 0.78,
      daypartAvailability: 0.67,
    },
  },
  {
    id: "young_mobile_voters",
    name: "Young mobile voters",
    populationShare: 0.07,
    description: "Mobile-first viewers with high social awareness and voting activity but irregular linear attendance.",
    demographics: {
      age: age(0.63, 0.28, 0.07, 0.02, 0),
      gender: gender(0.5, 0.38, 0.08, 0.04),
      region: region(0.09, 0.29, 0.08, 0.41, 0.13),
      urbanity: urbanity(0.69, 0.26, 0.05),
      household: household(0.47, 0.13, 0.15, 0.25),
      access: access(0.74, 0.24, 0.02),
      platform: platform(0.14, 0.13, 0.17, 0.56),
      socioeconomic: socioeconomic(0.48, 0.43, 0.09),
      regionalAttachment: regionalAttachment(0.5, 0.36, 0.14),
      coViewing: coViewing(0.55, 0.15, 0.13, 0.17),
    },
    interests: {
      strategy: 0.53,
      competition: 0.55,
      conflict: 0.78,
      humor: 0.86,
      relationships: 0.77,
      vulnerability: 0.69,
      fairness: 0.79,
      authenticity: 0.86,
      redemption: 0.65,
      spectacle: 0.8,
      representation: 0.9,
    },
    values: { fairness: 0.83, authenticity: 0.9, representation: 0.94 },
    habits: {
      baseTuneIn: 0.31,
      loyalty: 0.5,
      noveltySeeking: 0.94,
      conflictTolerance: 0.78,
      adTolerance: 0.12,
      zapping: 0.9,
      votingPropensity: 0.94,
      daypartAvailability: 0.52,
    },
  },
  {
    id: "urban_trend_followers",
    name: "Urban trend followers",
    populationShare: 0.05,
    description: "Socially connected viewers who join when contestants, scenes, or debates become culturally visible.",
    demographics: {
      age: age(0.32, 0.37, 0.22, 0.07, 0.02),
      gender: gender(0.48, 0.41, 0.07, 0.04),
      region: region(0.06, 0.2, 0.07, 0.52, 0.15),
      urbanity: urbanity(0.88, 0.11, 0.01),
      household: household(0.46, 0.28, 0.17, 0.09),
      access: access(0.73, 0.25, 0.02),
      platform: platform(0.2, 0.27, 0.22, 0.31),
      socioeconomic: socioeconomic(0.25, 0.56, 0.19),
      regionalAttachment: regionalAttachment(0.55, 0.35, 0.1),
      coViewing: coViewing(0.48, 0.25, 0.13, 0.14),
    },
    interests: {
      strategy: 0.5,
      competition: 0.46,
      conflict: 0.73,
      humor: 0.78,
      relationships: 0.68,
      vulnerability: 0.61,
      fairness: 0.58,
      authenticity: 0.74,
      redemption: 0.55,
      spectacle: 0.85,
      representation: 0.82,
    },
    values: { fairness: 0.61, authenticity: 0.78, representation: 0.87 },
    habits: {
      baseTuneIn: 0.4,
      loyalty: 0.43,
      noveltySeeking: 0.93,
      conflictTolerance: 0.74,
      adTolerance: 0.17,
      zapping: 0.81,
      votingPropensity: 0.58,
      daypartAvailability: 0.57,
    },
  },
  {
    id: "regional_representation_viewers",
    name: "Regional-representation viewers",
    populationShare: 0.05,
    description: "Viewers whose interest rises when regional identities and underrepresented life experiences are visible.",
    demographics: {
      age: age(0.17, 0.23, 0.29, 0.21, 0.1),
      gender: gender(0.52, 0.41, 0.03, 0.04),
      region: region(0.15, 0.34, 0.14, 0.23, 0.14),
      urbanity: urbanity(0.32, 0.48, 0.2),
      household: household(0.15, 0.22, 0.34, 0.29),
      access: access(0.19, 0.45, 0.36),
      platform: platform(0.57, 0.15, 0.15, 0.13),
      socioeconomic: socioeconomic(0.46, 0.45, 0.09),
      regionalAttachment: regionalAttachment(0.06, 0.24, 0.7),
      coViewing: coViewing(0.27, 0.25, 0.33, 0.15),
    },
    interests: {
      strategy: 0.39,
      competition: 0.57,
      conflict: 0.49,
      humor: 0.71,
      relationships: 0.68,
      vulnerability: 0.7,
      fairness: 0.77,
      authenticity: 0.86,
      redemption: 0.72,
      spectacle: 0.62,
      representation: 0.99,
    },
    values: { fairness: 0.81, authenticity: 0.9, representation: 0.99 },
    habits: {
      baseTuneIn: 0.59,
      loyalty: 0.73,
      noveltySeeking: 0.49,
      conflictTolerance: 0.51,
      adTolerance: 0.57,
      zapping: 0.34,
      votingPropensity: 0.66,
      daypartAvailability: 0.71,
    },
  },
  {
    id: "older_broadcast_loyalists",
    name: "Older broadcast loyalists",
    populationShare: 0.07,
    description: "Linear-first viewers with strong schedule habits, low zapping, and a preference for narrative clarity.",
    demographics: {
      age: age(0.01, 0.04, 0.2, 0.39, 0.36),
      gender: gender(0.55, 0.42, 0.01, 0.02),
      region: region(0.07, 0.27, 0.08, 0.42, 0.16),
      urbanity: urbanity(0.37, 0.45, 0.18),
      household: household(0.13, 0.37, 0.2, 0.3),
      access: access(0.05, 0.24, 0.71),
      platform: platform(0.9, 0.03, 0.06, 0.01),
      socioeconomic: socioeconomic(0.38, 0.47, 0.15),
      regionalAttachment: regionalAttachment(0.12, 0.35, 0.53),
      coViewing: coViewing(0.16, 0.38, 0.38, 0.08),
    },
    interests: {
      strategy: 0.39,
      competition: 0.59,
      conflict: 0.36,
      humor: 0.57,
      relationships: 0.66,
      vulnerability: 0.65,
      fairness: 0.82,
      authenticity: 0.76,
      redemption: 0.78,
      spectacle: 0.65,
      representation: 0.51,
    },
    values: { fairness: 0.87, authenticity: 0.8, representation: 0.54 },
    habits: {
      baseTuneIn: 0.77,
      loyalty: 0.91,
      noveltySeeking: 0.24,
      conflictTolerance: 0.34,
      adTolerance: 0.82,
      zapping: 0.14,
      votingPropensity: 0.31,
      daypartAvailability: 0.95,
    },
  },
  {
    id: "casual_event_viewers",
    name: "Casual event viewers",
    populationShare: 0.05,
    description: "Occasional viewers who respond to promoted competitions, eliminations, and major public moments.",
    demographics: {
      age: age(0.2, 0.25, 0.29, 0.18, 0.08),
      gender: gender(0.47, 0.47, 0.02, 0.04),
      region: region(0.08, 0.25, 0.09, 0.43, 0.15),
      urbanity: urbanity(0.57, 0.34, 0.09),
      household: household(0.29, 0.28, 0.28, 0.15),
      access: access(0.39, 0.45, 0.16),
      platform: platform(0.44, 0.24, 0.18, 0.14),
      socioeconomic: socioeconomic(0.4, 0.47, 0.13),
      regionalAttachment: regionalAttachment(0.36, 0.43, 0.21),
      coViewing: coViewing(0.3, 0.31, 0.27, 0.12),
    },
    interests: {
      strategy: 0.37,
      competition: 0.75,
      conflict: 0.62,
      humor: 0.57,
      relationships: 0.42,
      vulnerability: 0.37,
      fairness: 0.58,
      authenticity: 0.53,
      redemption: 0.47,
      spectacle: 0.94,
      representation: 0.45,
    },
    values: { fairness: 0.61, authenticity: 0.56, representation: 0.48 },
    habits: {
      baseTuneIn: 0.34,
      loyalty: 0.28,
      noveltySeeking: 0.79,
      conflictTolerance: 0.66,
      adTolerance: 0.38,
      zapping: 0.72,
      votingPropensity: 0.28,
      daypartAvailability: 0.6,
    },
  },
  {
    id: "lapsed_finale_only_viewers",
    name: "Lapsed/finale-only viewers",
    populationShare: 0.03,
    description: "Low-habit viewers who return for cultural closure, finales, and unusually large story payoffs.",
    demographics: {
      age: age(0.12, 0.22, 0.31, 0.24, 0.11),
      gender: gender(0.49, 0.45, 0.02, 0.04),
      region: region(0.07, 0.24, 0.08, 0.45, 0.16),
      urbanity: urbanity(0.58, 0.33, 0.09),
      household: household(0.27, 0.31, 0.27, 0.15),
      access: access(0.4, 0.44, 0.16),
      platform: platform(0.38, 0.25, 0.24, 0.13),
      socioeconomic: socioeconomic(0.34, 0.5, 0.16),
      regionalAttachment: regionalAttachment(0.42, 0.39, 0.19),
      coViewing: coViewing(0.38, 0.3, 0.21, 0.11),
    },
    interests: {
      strategy: 0.31,
      competition: 0.48,
      conflict: 0.52,
      humor: 0.49,
      relationships: 0.47,
      vulnerability: 0.42,
      fairness: 0.59,
      authenticity: 0.51,
      redemption: 0.58,
      spectacle: 0.91,
      representation: 0.43,
    },
    values: { fairness: 0.62, authenticity: 0.54, representation: 0.46 },
    habits: {
      baseTuneIn: 0.16,
      loyalty: 0.14,
      noveltySeeking: 0.72,
      conflictTolerance: 0.58,
      adTolerance: 0.31,
      zapping: 0.76,
      votingPropensity: 0.12,
      daypartAvailability: 0.59,
    },
  },
];

const DISTRIBUTION_KEYS: readonly (keyof ExpandedPanelComposition)[] = [
  "age",
  "gender",
  "region",
  "urbanity",
  "household",
  "access",
  "platform",
];

const HABIT_KEYS = [
  "baseTuneIn",
  "loyalty",
  "noveltySeeking",
  "conflictTolerance",
  "adTolerance",
  "zapping",
  "votingPropensity",
  "daypartAvailability",
] as const;

const VALUE_KEYS = ["fairness", "authenticity", "representation"] as const;
const EPISODE_KINDS: readonly EpisodeKind[] = ["premiere", "challenge", "vote", "elimination", "final"];
const EPSILON = 1e-9;

function validateUnitValue(errors: string[], label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(`${label} must be a finite number between 0 and 1`);
  }
}

function validateDistribution(
  errors: string[],
  label: string,
  values: Record<string, number>,
): void {
  let total = 0;
  for (const [key, value] of Object.entries(values)) {
    validateUnitValue(errors, `${label}.${key}`, value);
    total += value;
  }
  if (Math.abs(total - 1) > EPSILON) {
    errors.push(`${label} must total 1 (received ${total})`);
  }
}

export function validateAudienceCatalog(
  catalog: readonly AudienceClusterDefinition[] = AUDIENCE_CLUSTERS,
): string[] {
  const errors: string[] = [];
  if (catalog.length !== 16) {
    errors.push(`audience catalog must contain exactly 16 clusters (received ${catalog.length})`);
  }

  const ids = new Set<string>();
  let populationTotal = 0;
  for (const cluster of catalog) {
    if (!cluster.id.trim()) errors.push("audience cluster id must not be empty");
    if (ids.has(cluster.id)) errors.push(`duplicate audience cluster id: ${cluster.id}`);
    ids.add(cluster.id);
    if (!cluster.name.trim()) errors.push(`${cluster.id || "<unknown>"} must have a name`);
    if (!cluster.description.trim()) errors.push(`${cluster.id || "<unknown>"} must have a description`);

    validateUnitValue(errors, `${cluster.id}.populationShare`, cluster.populationShare);
    if (cluster.populationShare === 0) errors.push(`${cluster.id}.populationShare must be greater than 0`);
    populationTotal += cluster.populationShare;

    for (const key of DISTRIBUTION_KEYS) {
      validateDistribution(
        errors,
        `${cluster.id}.demographics.${key}`,
        cluster.demographics[key] as Record<string, number>,
      );
    }
    for (const key of AUDIENCE_INTERESTS) {
      validateUnitValue(errors, `${cluster.id}.interests.${key}`, cluster.interests[key]);
    }
    for (const key of VALUE_KEYS) {
      validateUnitValue(errors, `${cluster.id}.values.${key}`, cluster.values[key]);
    }
    for (const key of HABIT_KEYS) {
      validateUnitValue(errors, `${cluster.id}.habits.${key}`, cluster.habits[key]);
    }
  }

  if (Math.abs(populationTotal - 1) > EPSILON) {
    errors.push(`audience population shares must total 1 (received ${populationTotal})`);
  }
  return errors;
}

export function validateAudienceMarket(market: AudienceMarketState = AUDIENCE_MARKET): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(market.universeHouseholds) || market.universeHouseholds <= 0) {
    errors.push("audience market universeHouseholds must be a positive finite number");
  }
  if (!Number.isFinite(market.householdsPerPoint) || market.householdsPerPoint <= 0) {
    errors.push("audience market householdsPerPoint must be a positive finite number");
  }
  if (!Number.isFinite(market.networkTargetPoints) || market.networkTargetPoints <= 0) {
    errors.push("audience market networkTargetPoints must be a positive finite number");
  }
  if (!market.panelLabel.trim()) errors.push("audience market panelLabel must not be empty");
  if (
    Number.isFinite(market.universeHouseholds) &&
    Number.isFinite(market.householdsPerPoint) &&
    Number.isFinite(market.networkTargetPoints) &&
    market.networkTargetPoints * market.householdsPerPoint > market.universeHouseholds
  ) {
    errors.push("audience market network target cannot exceed the measurable universe");
  }
  return errors;
}

export function validateAudienceSchedules(
  schedules: Readonly<Record<EpisodeKind, BroadcastScheduleContext>> = AUDIENCE_SCHEDULES,
): string[] {
  const errors: string[] = [];
  for (const kind of EPISODE_KINDS) {
    const schedule = schedules[kind];
    if (!schedule) {
      errors.push(`missing audience schedule for ${kind}`);
      continue;
    }
    validateUnitValue(errors, `${kind}.tvOnRate`, schedule.tvOnRate);
    validateUnitValue(errors, `${kind}.leadInStrength`, schedule.leadInStrength);
    validateUnitValue(errors, `${kind}.promotion`, schedule.promotion);
    validateUnitValue(errors, `${kind}.competitionPressure`, schedule.competitionPressure);
  }
  return errors;
}

export function assertValidAudienceCatalog(
  catalog: readonly AudienceClusterDefinition[] = AUDIENCE_CLUSTERS,
): void {
  const errors = [
    ...validateAudienceCatalog(catalog),
    ...validateAudienceMarket(),
    ...validateAudienceSchedules(),
  ];
  if (errors.length > 0) {
    throw new Error(`Invalid audience catalog:\n${errors.join("\n")}`);
  }
}
