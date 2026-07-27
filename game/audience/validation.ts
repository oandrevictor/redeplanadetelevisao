import { cast } from "../content/cast";
import type {
  AudienceClusterDefinition,
  AudienceEpisodeResult,
  AudienceInterest,
  AudienceState,
  AudienceVoteResult,
  BroadcastEpisode,
  ParticipantId,
} from "../types";
import { AUDIENCE_CLUSTERS } from "./catalog";
import { EPSILON, sum } from "./math";

const EXPECTED_CLUSTER_COUNT = 16;
const EXPECTED_UNIVERSE = 50_000_000;
const EXPECTED_HOUSEHOLDS_PER_POINT = 500_000;
const EXPECTED_NETWORK_TARGET = 24;
const DISTRIBUTION_TOLERANCE = 0.0001;

const interests: readonly AudienceInterest[] = [
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

function finiteInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function distributionErrors(
  label: string,
  values: Record<string, number>,
  errors: string[],
): void {
  for (const [key, value] of Object.entries(values)) {
    if (!finiteInRange(value, 0, 1)) errors.push(`${label}.${key} must be between 0 and 1`);
  }
  const total = sum(Object.values(values));
  if (Math.abs(total - 1) > DISTRIBUTION_TOLERANCE) {
    errors.push(`${label} must total 1 (received ${total})`);
  }
}

export function collectAudienceCatalogErrors(
  definitions: readonly AudienceClusterDefinition[] = AUDIENCE_CLUSTERS,
): string[] {
  const errors: string[] = [];
  if (definitions.length !== EXPECTED_CLUSTER_COUNT) {
    errors.push(`audience catalog must contain ${EXPECTED_CLUSTER_COUNT} clusters`);
  }
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (!definition.id.trim()) errors.push("audience cluster id cannot be empty");
    if (ids.has(definition.id)) errors.push(`duplicate audience cluster id: ${definition.id}`);
    ids.add(definition.id);
    if (!definition.name.trim()) errors.push(`audience cluster ${definition.id} has no name`);
    if (!definition.description.trim()) errors.push(`audience cluster ${definition.id} has no description`);
    if (!finiteInRange(definition.populationShare, 0, 1) || definition.populationShare <= 0) {
      errors.push(`audience cluster ${definition.id} has an invalid population share`);
    }
    for (const interest of interests) {
      if (!finiteInRange(definition.interests[interest], 0, 1)) {
        errors.push(`audience cluster ${definition.id} interest ${interest} must be between 0 and 1`);
      }
    }
    for (const [key, value] of Object.entries(definition.values)) {
      if (!finiteInRange(value, 0, 1)) {
        errors.push(`audience cluster ${definition.id} value ${key} must be between 0 and 1`);
      }
    }
    for (const [key, value] of Object.entries(definition.habits)) {
      if (!finiteInRange(value, 0, 1)) {
        errors.push(`audience cluster ${definition.id} habit ${key} must be between 0 and 1`);
      }
    }
    distributionErrors(`${definition.id}.demographics.age`, definition.demographics.age, errors);
    distributionErrors(`${definition.id}.demographics.gender`, definition.demographics.gender, errors);
    distributionErrors(`${definition.id}.demographics.region`, definition.demographics.region, errors);
    distributionErrors(`${definition.id}.demographics.urbanity`, definition.demographics.urbanity, errors);
    distributionErrors(`${definition.id}.demographics.household`, definition.demographics.household, errors);
    distributionErrors(`${definition.id}.demographics.access`, definition.demographics.access, errors);
    distributionErrors(`${definition.id}.demographics.platform`, definition.demographics.platform, errors);
    distributionErrors(`${definition.id}.demographics.socioeconomic`, definition.demographics.socioeconomic, errors);
    distributionErrors(`${definition.id}.demographics.regionalAttachment`, definition.demographics.regionalAttachment, errors);
    distributionErrors(`${definition.id}.demographics.coViewing`, definition.demographics.coViewing, errors);
  }
  const populationTotal = sum(definitions.map((definition) => definition.populationShare));
  if (Math.abs(populationTotal - 1) > DISTRIBUTION_TOLERANCE) {
    errors.push(`audience cluster population shares must total 1 (received ${populationTotal})`);
  }
  return errors;
}

export function assertAudienceCatalog(
  definitions: readonly AudienceClusterDefinition[] = AUDIENCE_CLUSTERS,
): void {
  const errors = collectAudienceCatalogErrors(definitions);
  if (errors.length > 0) throw new Error(`Audience catalog validation failed:\n${errors.join("\n")}`);
}

export function collectBroadcastEpisodeErrors(
  episode: BroadcastEpisode,
  knownParticipantIds: readonly ParticipantId[] = cast.map((profile) => profile.id),
): string[] {
  const errors: string[] = [];
  const knownParticipants = new Set(knownParticipantIds);
  if (!episode.id.trim()) errors.push("broadcast episode id cannot be empty");
  if (!Number.isInteger(episode.week) || episode.week <= 0) errors.push("broadcast episode week must be positive");
  for (const [key, value] of Object.entries(episode.schedule)) {
    if (!finiteInRange(value, 0, 1)) errors.push(`broadcast schedule ${key} must be between 0 and 1`);
  }
  if (episode.schedule.tvOnRate <= 0) errors.push("broadcast schedule tvOnRate must be greater than zero");
  if (episode.segments.length === 0) errors.push("broadcast episode must contain at least one segment");

  const segmentIds = new Set<string>();
  for (const segment of episode.segments) {
    if (!segment.id.trim()) errors.push("broadcast segment id cannot be empty");
    if (segmentIds.has(segment.id)) errors.push(`duplicate broadcast segment id: ${segment.id}`);
    segmentIds.add(segment.id);
    if (!Number.isFinite(segment.durationSeconds) || segment.durationSeconds <= 0) {
      errors.push(`broadcast segment ${segment.id} duration must be positive`);
    }
    if (segment.durationSeconds > 3_600) {
      errors.push(`broadcast segment ${segment.id} duration exceeds one hour`);
    }
    if (segment.kind === "commercial") {
      if (!Number.isInteger(segment.breakNumber) || segment.breakNumber <= 0) {
        errors.push(`commercial segment ${segment.id} must have a positive break number`);
      }
      continue;
    }
    if (!finiteInRange(segment.contextCompleteness, 0, 1)) {
      errors.push(`broadcast segment ${segment.id} contextCompleteness must be between 0 and 1`);
    }
    if (!finiteInRange(segment.storylineHook, 0, 1)) {
      errors.push(`broadcast segment ${segment.id} storylineHook must be between 0 and 1`);
    }
    if (segment.participantIds.length === 0) {
      errors.push(`broadcast segment ${segment.id} has no visible participants`);
    }
    if (new Set(segment.participantIds).size !== segment.participantIds.length) {
      errors.push(`broadcast segment ${segment.id} repeats a participant`);
    }
    for (const participantId of segment.participantIds) {
      if (!knownParticipants.has(participantId)) {
        errors.push(`broadcast segment ${segment.id} references unknown participant ${participantId}`);
      }
    }
    for (const [interest, value] of Object.entries(segment.signals)) {
      if (!interests.includes(interest as AudienceInterest)) {
        errors.push(`broadcast segment ${segment.id} has unknown audience signal ${interest}`);
      } else if (value !== undefined && !finiteInRange(value, 0, 1)) {
        errors.push(`broadcast segment ${segment.id} signal ${interest} must be between 0 and 1`);
      }
    }
    for (const [participantId, portrayals] of Object.entries(segment.portrayals)) {
      if (!segment.participantIds.includes(participantId)) {
        errors.push(`broadcast segment ${segment.id} portrays a participant who is not visible: ${participantId}`);
      }
      if (!portrayals || portrayals.length === 0) {
        errors.push(`broadcast segment ${segment.id} has an empty portrayal for ${participantId}`);
      }
    }
    if (segment.kind === "content") {
      if (!segment.sourceEventId.trim()) errors.push(`content segment ${segment.id} has no source event`);
      for (const participantId of segment.perspectiveIds) {
        if (!segment.participantIds.includes(participantId)) {
          errors.push(`content segment ${segment.id} perspective ${participantId} is not visible`);
        }
      }
      if (
        segment.revealsEliminatedParticipantId
        && !segment.participantIds.includes(segment.revealsEliminatedParticipantId)
      ) {
        errors.push(
          `content segment ${segment.id} reveals an eliminated participant who is not visible`,
        );
      }
      if (segment.revealsEliminatedParticipantId && episode.kind !== "elimination") {
        errors.push(`content segment ${segment.id} contains an elimination reveal outside an elimination episode`);
      }
    } else {
      if (!segment.chainId.trim()) errors.push(`important segment ${segment.id} has no canonical chain`);
      if (segment.sourceBeatIds.length === 0) errors.push(`important segment ${segment.id} has no canonical beats`);
      for (const participantId of [
        ...segment.favoredParticipantIds,
        ...segment.harmedParticipantIds,
      ]) {
        if (!segment.participantIds.includes(participantId)) {
          errors.push(`important segment ${segment.id} editorial subject ${participantId} is not visible`);
        }
      }
    }
  }
  return errors;
}

export function assertBroadcastEpisode(
  episode: BroadcastEpisode,
  knownParticipantIds?: readonly ParticipantId[],
): void {
  const errors = collectBroadcastEpisodeErrors(episode, knownParticipantIds);
  if (errors.length > 0) throw new Error(`Broadcast episode validation failed:\n${errors.join("\n")}`);
}

function voteErrors(vote: AudienceVoteResult, participantIds: Set<string>, errors: string[]): void {
  if (!vote.id.trim()) errors.push("audience vote id cannot be empty");
  if (!vote.lockedAfterEpisodeId.trim()) errors.push(`audience vote ${vote.id} has no locking episode`);
  if (!Number.isInteger(vote.week) || vote.week <= 0) errors.push(`audience vote ${vote.id} has an invalid week`);
  if (vote.participantIds.length < 2) errors.push(`audience vote ${vote.id} needs at least two participants`);
  if (!vote.participantIds.includes(vote.selectedParticipantId)) {
    errors.push(`audience vote ${vote.id} selected a non-candidate`);
  }
  for (const participantId of vote.participantIds) {
    if (!participantIds.has(participantId)) errors.push(`audience vote ${vote.id} references ${participantId}`);
    if (!finiteInRange(vote.shares[participantId] ?? Number.NaN, 0, 1)) {
      errors.push(`audience vote ${vote.id} has an invalid share for ${participantId}`);
    }
  }
  const total = sum(vote.participantIds.map((participantId) => vote.shares[participantId] ?? 0));
  if (Math.abs(total - 1) > DISTRIBUTION_TOLERANCE) {
    errors.push(`audience vote ${vote.id} shares must total 1`);
  }
  if (!Number.isFinite(vote.turnoutHouseholds) || vote.turnoutHouseholds < 0) {
    errors.push(`audience vote ${vote.id} has invalid turnout`);
  }
  const selectedByShare = [...vote.participantIds].sort((left, right) =>
    (vote.shares[right] ?? 0) - (vote.shares[left] ?? 0)
    || left.localeCompare(right))[0];
  if (selectedByShare && vote.selectedParticipantId !== selectedByShare) {
    errors.push(`audience vote ${vote.id} selected participant does not match its shares`);
  }
  for (const definition of AUDIENCE_CLUSTERS) {
    const clusterVote = vote.clusterShares[definition.id];
    if (!clusterVote) {
      errors.push(`audience vote ${vote.id} is missing cluster ${definition.id}`);
      continue;
    }
    const clusterTotal = sum(vote.participantIds.map(
      (participantId) => clusterVote[participantId] ?? 0,
    ));
    if (Math.abs(clusterTotal - 1) > DISTRIBUTION_TOLERANCE) {
      errors.push(`audience vote ${vote.id} cluster ${definition.id} shares must total 1`);
    }
    for (const participantId of vote.participantIds) {
      if (!finiteInRange(clusterVote[participantId] ?? Number.NaN, 0, 1)) {
        errors.push(`audience vote ${vote.id} has invalid ${definition.id} share for ${participantId}`);
      }
    }
  }
}

export function collectAudienceStateErrors(
  state: AudienceState,
  participantIds: readonly ParticipantId[] = cast.map((profile) => profile.id),
  definitions: readonly AudienceClusterDefinition[] = AUDIENCE_CLUSTERS,
): string[] {
  const errors = collectAudienceCatalogErrors(definitions);
  const participants = new Set(participantIds);
  if (state.market.universeHouseholds !== EXPECTED_UNIVERSE) {
    errors.push(`fictional panel universe must be ${EXPECTED_UNIVERSE}`);
  }
  if (state.market.householdsPerPoint !== EXPECTED_HOUSEHOLDS_PER_POINT) {
    errors.push(`fictional panel point size must be ${EXPECTED_HOUSEHOLDS_PER_POINT}`);
  }
  if (state.market.networkTargetPoints !== EXPECTED_NETWORK_TARGET) {
    errors.push(`network target must remain ${EXPECTED_NETWORK_TARGET} points`);
  }
  if (!state.market.panelLabel.trim()) errors.push("fictional panel must have a label");
  if (!state.tuningVersion.trim()) errors.push("audience tuningVersion cannot be empty");

  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  for (const definition of definitions) {
    if (!state.clusters[definition.id]) errors.push(`audience state is missing cluster ${definition.id}`);
  }
  for (const [clusterId, cluster] of Object.entries(state.clusters)) {
    if (!definitionsById.has(clusterId)) errors.push(`audience state contains unknown cluster ${clusterId}`);
    if (cluster.clusterId !== clusterId) errors.push(`audience cluster state key mismatch: ${clusterId}`);
    for (const [label, value] of [
      ["habit", cluster.habit],
      ["returnIntent", cluster.returnIntent],
      ["favoriteLossShock", cluster.favoriteLossShock],
      ["unalignedShare", cluster.unalignedShare],
    ] as const) {
      if (!finiteInRange(value, 0, 1)) errors.push(`${clusterId}.${label} must be between 0 and 1`);
    }
    for (const participantId of participantIds) {
      const fan = cluster.participantFans[participantId];
      if (!fan) {
        errors.push(`${clusterId} is missing fan state for ${participantId}`);
        continue;
      }
      if (!finiteInRange(fan.awareness, 0, 100)) errors.push(`${clusterId}.${participantId}.awareness is invalid`);
      if (!finiteInRange(fan.sentiment, -100, 100)) errors.push(`${clusterId}.${participantId}.sentiment is invalid`);
      if (!finiteInRange(fan.attachment, 0, 100)) errors.push(`${clusterId}.${participantId}.attachment is invalid`);
      if (!Number.isFinite(fan.exposureMinutes) || fan.exposureMinutes < 0) {
        errors.push(`${clusterId}.${participantId}.exposureMinutes is invalid`);
      }
      if (!finiteInRange(fan.fatigue, 0, 100)) errors.push(`${clusterId}.${participantId}.fatigue is invalid`);
      if (!finiteInRange(cluster.favoriteShares[participantId] ?? Number.NaN, 0, 1)) {
        errors.push(`${clusterId}.${participantId}.favoriteShare is invalid`);
      }
    }
    for (const participantId of Object.keys(cluster.participantFans)) {
      if (!participants.has(participantId)) errors.push(`${clusterId} has fan state for unknown ${participantId}`);
    }
    const favoriteTotal = sum(participantIds.map((id) => cluster.favoriteShares[id] ?? 0));
    if (Math.abs(favoriteTotal + cluster.unalignedShare - 1) > DISTRIBUTION_TOLERANCE) {
      errors.push(`${clusterId} favorite shares plus unaligned share must total 1`);
    }
    for (const interest of interests) {
      if (!finiteInRange(cluster.interestFatigue[interest] ?? Number.NaN, 0, 1)) {
        errors.push(`${clusterId}.${interest} interest fatigue is invalid`);
      }
    }
  }
  if (state.pendingVote) voteErrors(state.pendingVote, participants, errors);
  if (
    state.pendingVote
    && state.pendingVote.turnoutHouseholds > state.market.universeHouseholds + 1
  ) {
    errors.push(`pending audience vote ${state.pendingVote.id} turnout exceeds the universe`);
  }
  const voteIds = new Set<string>();
  for (const vote of state.voteHistory) {
    if (voteIds.has(vote.id)) errors.push(`audience vote history repeats ${vote.id}`);
    voteIds.add(vote.id);
    voteErrors(vote, participants, errors);
    if (vote.turnoutHouseholds > state.market.universeHouseholds + 1) {
      errors.push(`audience vote ${vote.id} turnout exceeds the universe`);
    }
  }
  if (state.pendingVote && voteIds.has(state.pendingVote.id)) {
    errors.push(`pending audience vote ${state.pendingVote.id} is already in history`);
  }
  return errors;
}

export function assertAudienceState(
  state: AudienceState,
  participantIds?: readonly ParticipantId[],
  definitions?: readonly AudienceClusterDefinition[],
): void {
  const errors = collectAudienceStateErrors(state, participantIds, definitions);
  if (errors.length > 0) throw new Error(`Audience state validation failed:\n${errors.join("\n")}`);
}

export function collectAudienceResultErrors(
  result: AudienceEpisodeResult,
  state: AudienceState,
  definitions: readonly AudienceClusterDefinition[] = AUDIENCE_CLUSTERS,
): string[] {
  const errors: string[] = [];
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
  if (!result.episodeId.trim()) errors.push("audience result episode id cannot be empty");
  if (!(result.forecast.low <= result.forecast.expected && result.forecast.expected <= result.forecast.high)) {
    errors.push("audience forecast bounds are not ordered");
  }
  const maximumRating = state.market.universeHouseholds / state.market.householdsPerPoint + 0.3;
  for (const [label, value, maximum] of [
    ["averageRating", result.averageRating, maximumRating],
    ["peakRating", result.peakRating, maximumRating],
    ["share", result.share, 1],
    ["uniqueReach", result.uniqueReach, state.market.universeHouseholds],
    ["digitalReach", result.digitalReach, state.market.universeHouseholds],
    ["completionRate", result.completionRate, 1],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > maximum + 1) {
      errors.push(`audience result ${label} is invalid`);
    }
  }
  if (result.shocks.episode < -0.05 - EPSILON || result.shocks.episode > 0.05 + EPSILON) {
    errors.push("episode shock exceeds its ±5% bound");
  }
  if (Math.abs(result.shocks.measurementPoints) > 0.3 + EPSILON) {
    errors.push("measurement shock exceeds its ±0.3 point bound");
  }
  const expectedClusterIds = new Set(definitions.map((definition) => definition.id));
  if (Object.keys(result.shocks.clusters).length !== definitions.length) {
    errors.push("audience result must persist one shock for every cluster");
  }
  for (const [clusterId, shock] of Object.entries(result.shocks.clusters)) {
    if (!expectedClusterIds.has(clusterId)) {
      errors.push(`audience result has a shock for unknown cluster ${clusterId}`);
    }
    if (shock < -0.025 - EPSILON || shock > 0.025 + EPSILON) {
      errors.push(`cluster shock ${clusterId} exceeds its ±2.5% bound`);
    }
  }
  for (const clusterId of expectedClusterIds) {
    if (!(clusterId in result.shocks.clusters)) {
      errors.push(`audience result is missing shock for ${clusterId}`);
    }
  }
  if (result.checkpoints.length === 0) errors.push("audience result has no checkpoints");
  let previousElapsed = 0;
  for (const checkpoint of result.checkpoints) {
    if (checkpoint.elapsedSeconds <= previousElapsed) errors.push(`checkpoint ${checkpoint.segmentId} is out of order`);
    previousElapsed = checkpoint.elapsedSeconds;
    const clusterTotal = sum(Object.values(checkpoint.clusterViewers));
    if (Math.abs(clusterTotal - checkpoint.households) > Math.max(1, checkpoint.households * 1e-8)) {
      errors.push(`checkpoint ${checkpoint.segmentId} cluster viewers do not reconcile`);
    }
    if (!finiteInRange(checkpoint.share, 0, 1)) {
      errors.push(`checkpoint ${checkpoint.segmentId} share is invalid`);
    }
    if (!finiteInRange(checkpoint.rating, 0, maximumRating + 1)) {
      errors.push(`checkpoint ${checkpoint.segmentId} rating is invalid`);
    }
    for (const [clusterId, households] of Object.entries(checkpoint.clusterViewers)) {
      const definition = definitionById.get(clusterId);
      if (!definition) {
        errors.push(`checkpoint ${checkpoint.segmentId} references unknown cluster ${clusterId}`);
        continue;
      }
      const population = state.market.universeHouseholds * definition.populationShare;
      if (!finiteInRange(households, 0, population + 1)) {
        errors.push(`checkpoint ${checkpoint.segmentId} exceeds population for ${clusterId}`);
      }
    }
  }
  if (result.clusterResults.length !== definitions.length) {
    errors.push(`audience result must contain exactly ${definitions.length} cluster results`);
  }
  const resultClusterIds = new Set<string>();
  for (const clusterResult of result.clusterResults) {
    if (resultClusterIds.has(clusterResult.clusterId)) {
      errors.push(`audience result repeats cluster ${clusterResult.clusterId}`);
    }
    resultClusterIds.add(clusterResult.clusterId);
    const definition = definitionById.get(clusterResult.clusterId);
    if (!definition) {
      errors.push(`audience result references unknown cluster ${clusterResult.clusterId}`);
      continue;
    }
    const population = state.market.universeHouseholds * definition.populationShare;
    for (const [label, value] of [
      ["start", clusterResult.startHouseholds],
      ["average", clusterResult.averageHouseholds],
      ["completion", clusterResult.completionHouseholds],
      ["unique reach", clusterResult.uniqueReachHouseholds],
      ["first-time reach", clusterResult.firstTimeReachHouseholds],
      ["re-entry", clusterResult.reentryHouseholds],
      ["digital reach", clusterResult.digitalReachHouseholds],
    ] as const) {
      if (!finiteInRange(value, 0, population + 1)) {
        errors.push(`${clusterResult.clusterId} ${label} exceeds its population`);
      }
    }
    if (!finiteInRange(clusterResult.satisfaction, 0, 1)) {
      errors.push(`${clusterResult.clusterId} satisfaction is invalid`);
    }
    if (
      !finiteInRange(clusterResult.returnIntentBefore, 0, 1)
      || !finiteInRange(clusterResult.returnIntentAfter, 0, 1)
    ) {
      errors.push(`${clusterResult.clusterId} return intent is invalid`);
    }
    for (const [platform, households] of Object.entries(clusterResult.platformReachHouseholds)) {
      if (!finiteInRange(households, 0, population + 1)) {
        errors.push(`${clusterResult.clusterId} ${platform} reach exceeds its population`);
      }
    }
    const clusterDigitalPlatformReach =
      clusterResult.platformReachHouseholds.connected_tv
      + clusterResult.platformReachHouseholds.catch_up
      + clusterResult.platformReachHouseholds.mobile_clips;
    if (Math.abs(clusterDigitalPlatformReach - clusterResult.digitalReachHouseholds)
      > Math.max(1, clusterResult.digitalReachHouseholds * 1e-8)) {
      errors.push(`${clusterResult.clusterId} digital platform reach does not reconcile`);
    }
    if (Math.abs(clusterResult.platformReachHouseholds.linear - clusterResult.uniqueReachHouseholds)
      > Math.max(1, clusterResult.uniqueReachHouseholds * 1e-8)) {
      errors.push(`${clusterResult.clusterId} linear reach does not reconcile`);
    }
    for (const [engagement, value] of Object.entries(clusterResult.engagement)) {
      if (!finiteInRange(value, 0, 1)) {
        errors.push(`${clusterResult.clusterId} ${engagement} engagement is invalid`);
      }
    }
  }
  for (const clusterId of expectedClusterIds) {
    if (!resultClusterIds.has(clusterId)) {
      errors.push(`audience result is missing cluster ${clusterId}`);
    }
    if (!finiteInRange(result.nextEpisodeIntent[clusterId] ?? Number.NaN, 0, 1)) {
      errors.push(`audience result next intent is invalid for ${clusterId}`);
    }
  }
  for (const clusterId of Object.keys(result.nextEpisodeIntent)) {
    if (!expectedClusterIds.has(clusterId)) {
      errors.push(`audience result next intent references unknown cluster ${clusterId}`);
    }
  }

  const knownParticipantIds = new Set(
    Object.keys(Object.values(state.clusters)[0]?.participantFans ?? {}),
  );
  const fanDeltaIds = new Set<string>();
  for (const delta of result.participantFanDeltas) {
    if (!knownParticipantIds.has(delta.participantId)) {
      errors.push(`audience fan delta references unknown participant ${delta.participantId}`);
    }
    if (fanDeltaIds.has(delta.participantId)) {
      errors.push(`audience result repeats fan delta for ${delta.participantId}`);
    }
    fanDeltaIds.add(delta.participantId);
    for (const [label, value] of [
      ["awarenessBefore", delta.awarenessBefore],
      ["awarenessAfter", delta.awarenessAfter],
      ["attachmentBefore", delta.attachmentBefore],
      ["attachmentAfter", delta.attachmentAfter],
    ] as const) {
      if (!finiteInRange(value, 0, 100)) {
        errors.push(`audience fan delta ${delta.participantId}.${label} is invalid`);
      }
    }
    for (const [label, value] of [
      ["favoriteShareBefore", delta.favoriteShareBefore],
      ["favoriteShareAfter", delta.favoriteShareAfter],
    ] as const) {
      if (!finiteInRange(value, 0, 1)) {
        errors.push(`audience fan delta ${delta.participantId}.${label} is invalid`);
      }
    }
    for (const [label, value] of [
      ["sentimentBefore", delta.sentimentBefore],
      ["sentimentAfter", delta.sentimentAfter],
    ] as const) {
      if (!finiteInRange(value, -100, 100)) {
        errors.push(`audience fan delta ${delta.participantId}.${label} is invalid`);
      }
    }
  }
  for (const participantId of knownParticipantIds) {
    if (!fanDeltaIds.has(participantId)) {
      errors.push(`audience result is missing fan delta for ${participantId}`);
    }
  }

  const clusterUniqueReach = sum(result.clusterResults.map((cluster) => cluster.uniqueReachHouseholds));
  const clusterDigitalReach = sum(result.clusterResults.map((cluster) => cluster.digitalReachHouseholds));
  const clusterStarts = sum(result.clusterResults.map((cluster) => cluster.startHouseholds));
  const clusterCompletions = sum(result.clusterResults.map((cluster) => cluster.completionHouseholds));
  const reconciliationTolerance = (value: number) => Math.max(1, Math.abs(value) * 1e-8);
  if (Math.abs(clusterUniqueReach - result.uniqueReach) > reconciliationTolerance(result.uniqueReach)) {
    errors.push("audience result unique reach does not reconcile with clusters");
  }
  if (Math.abs(clusterDigitalReach - result.digitalReach) > reconciliationTolerance(result.digitalReach)) {
    errors.push("audience result digital reach does not reconcile with clusters");
  }
  for (const platform of ["linear", "connected_tv", "catch_up", "mobile_clips"] as const) {
    const clusterPlatformReach = sum(
      result.clusterResults.map((cluster) => cluster.platformReachHouseholds[platform]),
    );
    if (Math.abs(clusterPlatformReach - result.platformReach[platform])
      > reconciliationTolerance(result.platformReach[platform])) {
      errors.push(`audience result ${platform} reach does not reconcile with clusters`);
    }
  }
  const reconciledCompletion = clusterStarts > 0 ? clusterCompletions / clusterStarts : 0;
  if (Math.abs(reconciledCompletion - result.completionRate) > 1e-8) {
    errors.push("audience result completion rate does not reconcile with clusters");
  }
  for (const factor of result.factorContributions) {
    if (!Number.isFinite(factor.value)) errors.push(`audience factor ${factor.key} is not finite`);
  }
  return errors;
}

export function assertAudienceResult(
  result: AudienceEpisodeResult,
  state: AudienceState,
  definitions?: readonly AudienceClusterDefinition[],
): void {
  const errors = collectAudienceResultErrors(result, state, definitions);
  if (errors.length > 0) throw new Error(`Audience result validation failed:\n${errors.join("\n")}`);
}
