import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFavoriteLoss,
  closeAudienceVote,
  collectAudienceResultErrors,
  collectAudienceStateErrors,
  consumePendingAudienceVote,
  selectClusterAudienceForecast,
  selectParticipantAudienceAggregates,
  simulateAudienceEpisode,
} from "../game/audience";
import {
  AUDIENCE_CLUSTERS,
  AUDIENCE_MARKET,
  AUDIENCE_SCHEDULES,
} from "../game/audience/catalog";
import { createInitialAudienceState } from "../game/audience/initial-state";
import { cast } from "../game/content/cast";
import { deserializeSeason, serializeSeason } from "../game/persistence/serialization";
import { reduceGame } from "../game/reducer";
import { createRng } from "../game/rng";
import { createInitialState, SCHEMA_VERSION } from "../game/state";
import type {
  AudienceInterest,
  AudiencePortrayal,
  AudienceState,
  BroadcastEpisode,
  BroadcastSegment,
  CutTone,
  GameState,
  ParticipantId,
} from "../game/types";

const participantIds = cast.map((participant) => participant.id);
const [firstParticipantId, secondParticipantId, thirdParticipantId] = participantIds;

type ContentSegment = Extract<BroadcastSegment, { kind: "content" }>;

function contentSegment(
  id: string,
  options: {
    participantIds?: ParticipantId[];
    perspectiveIds?: ParticipantId[];
    durationSeconds?: number;
    tone?: CutTone;
    signals?: Partial<Record<AudienceInterest, number>>;
    portrayals?: Partial<Record<ParticipantId, AudiencePortrayal[]>>;
    contextCompleteness?: number;
    storylineHook?: number;
    sourceEventId?: string;
  } = {},
): ContentSegment {
  const visibleIds = options.participantIds ?? [firstParticipantId, secondParticipantId];
  return {
    id,
    kind: "content",
    title: `Segmento ${id}`,
    durationSeconds: options.durationSeconds ?? 240,
    sourceEventId: options.sourceEventId ?? `source-${id}`,
    participantIds: visibleIds,
    perspectiveIds: options.perspectiveIds ?? visibleIds,
    tone: options.tone ?? "neutro",
    signals: options.signals ?? {
      authenticity: 0.6,
      relationships: 0.5,
    },
    portrayals: options.portrayals ?? Object.fromEntries(
      visibleIds.map((participantId) => [participantId, ["neutral"]]),
    ),
    contextCompleteness: options.contextCompleteness ?? 0.75,
    storylineHook: options.storylineHook ?? 0.55,
  };
}

function commercialSegment(id: string, breakNumber: number, durationSeconds = 180): BroadcastSegment {
  return {
    id,
    kind: "commercial",
    title: `Intervalo ${breakNumber}`,
    durationSeconds,
    breakNumber,
  };
}

function episode(
  id: string,
  segments: BroadcastSegment[],
  options: Partial<Pick<BroadcastEpisode, "week" | "kind" | "schedule">> = {},
): BroadcastEpisode {
  const kind = options.kind ?? "premiere";
  return {
    id,
    week: options.week ?? 1,
    kind,
    schedule: options.schedule ?? { ...AUDIENCE_SCHEDULES[kind] },
    segments,
  };
}

function initialAudience(): AudienceState {
  return createInitialAudienceState(participantIds, "clustered");
}

function runEpisode(
  audience: AudienceState,
  broadcast: BroadcastEpisode,
  seed = "audience-test",
  rng = createRng(seed),
) {
  return simulateAudienceEpisode({
    audience,
    episode: broadcast,
    rng,
    participantIds,
  });
}

function startedState(seed: string): GameState {
  const result = reduceGame(createInitialState(seed, "dynamic", "clustered"), {
    type: "START_SEASON",
    seed,
  });
  assert.equal(result.diagnostic, undefined);
  return result.state;
}

function episodeUsingCanonicalEvent(state: GameState, id: string): BroadcastEpisode {
  const source = state.house.eventHistory[0];
  assert.ok(source, "the started season should contain canonical arrival footage");
  return episode(id, [
    contentSegment(`${id}-opening`, {
      sourceEventId: source.id,
      participantIds: [...source.actorIds],
      perspectiveIds: [...source.actorIds],
      signals: { ...source.audienceSignals },
      portrayals: structuredClone(source.observablePortrayals),
    }),
    commercialSegment(`${id}-ad`, 1, 120),
    contentSegment(`${id}-payoff`, {
      sourceEventId: source.id,
      participantIds: [...source.actorIds],
      perspectiveIds: [...source.actorIds],
      signals: { ...source.audienceSignals },
      portrayals: structuredClone(source.observablePortrayals),
      storylineHook: 0.8,
    }),
  ]);
}

function total(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

test("the fictional panel catalog is complete and forecast selection is pure", () => {
  assert.equal(AUDIENCE_CLUSTERS.length, 16);
  assert.ok(Math.abs(AUDIENCE_CLUSTERS.reduce(
    (sum, cluster) => sum + cluster.populationShare,
    0,
  ) - 1) < 1e-10);
  assert.deepEqual(AUDIENCE_MARKET, {
    universeHouseholds: 50_000_000,
    householdsPerPoint: 500_000,
    networkTargetPoints: 24,
    panelLabel: "Painel Nacional Ficcional — Rede Plana",
  });

  for (const cluster of AUDIENCE_CLUSTERS) {
    for (const distribution of Object.values(cluster.demographics)) {
      assert.ok(Math.abs(total(distribution) - 1) < 1e-10, `${cluster.id} demographic distribution`);
    }
  }

  const audience = initialAudience();
  const before = structuredClone(audience);
  const broadcast = episode("forecast-pure", [
    contentSegment("forecast-story"),
    commercialSegment("forecast-ad", 1),
  ]);
  const first = selectClusterAudienceForecast(audience, broadcast);
  const second = selectClusterAudienceForecast(audience, structuredClone(broadcast));

  assert.deepEqual(first, second);
  assert.deepEqual(audience, before);
  assert.ok(first.low <= first.expected && first.expected <= first.high);
  assert.ok(first.expected > 0);
});

test("same pre-state, seed, episode id, and edit produce identical complete results", () => {
  const audience = initialAudience();
  const before = structuredClone(audience);
  const rng = createRng("deep-determinism");
  const broadcast = episode("deterministic-episode", [
    contentSegment("strategy", {
      signals: { strategy: 0.95, fairness: 0.7 },
      portrayals: {
        [firstParticipantId]: ["competent"],
        [secondParticipantId]: ["defensive"],
      },
    }),
    commercialSegment("deterministic-ad", 1),
    contentSegment("reveal", {
      signals: { conflict: 0.8, authenticity: 0.75, spectacle: 0.6 },
      tone: "conflituoso",
      storylineHook: 0.9,
    }),
  ]);

  const left = runEpisode(audience, broadcast, "unused", rng);
  const right = runEpisode(
    structuredClone(audience),
    structuredClone(broadcast),
    "unused",
    structuredClone(rng),
  );

  assert.deepEqual(left, right);
  assert.deepEqual(audience, before, "simulation must not mutate its pre-state");
  assert.equal(left.rng.counter - rng.counter, 18, "one episode, 16 cohort, and one measurement draw");
  assert.equal(left.result.checkpoints.length, broadcast.segments.length);
  assert.equal(left.result.clusterResults.length, 16);
});

test("viewer pools, reach, favorites, shocks, and aggregate reports stay conserved and bounded", () => {
  const audience = initialAudience();
  const broadcast = episode("conservation", [
    contentSegment("competition", {
      durationSeconds: 420,
      signals: { competition: 1, spectacle: 0.85, strategy: 0.6 },
      portrayals: {
        [firstParticipantId]: ["competent"],
        [secondParticipantId]: ["sympathetic"],
      },
    }),
    commercialSegment("conservation-ad-1", 1, 210),
    contentSegment("human-story", {
      durationSeconds: 360,
      signals: { vulnerability: 0.95, relationships: 0.75, redemption: 0.65 },
      portrayals: {
        [firstParticipantId]: ["vulnerable"],
        [secondParticipantId]: ["sympathetic"],
      },
    }),
    commercialSegment("conservation-ad-2", 2, 240),
  ]);
  const simulated = runEpisode(audience, broadcast, "conservation-seed");
  const { result } = simulated;

  assert.deepEqual(collectAudienceStateErrors(simulated.audience, participantIds), []);
  assert.deepEqual(collectAudienceResultErrors(result, simulated.audience), []);
  assert.ok(Math.abs(result.shocks.episode) <= 0.05);
  assert.ok(Math.abs(result.shocks.measurementPoints) <= 0.3);
  assert.ok(Object.values(result.shocks.clusters).every((shock) => Math.abs(shock) <= 0.025));
  assert.ok(result.uniqueReach <= AUDIENCE_MARKET.universeHouseholds);
  assert.ok(result.digitalReach <= AUDIENCE_MARKET.universeHouseholds);
  assert.ok(result.completionRate >= 0 && result.completionRate <= 1);

  const expectedHouseholds = result.forecast.expected * AUDIENCE_MARKET.householdsPerPoint;
  const startingHouseholds = result.clusterResults.reduce(
    (sum, cluster) => sum + cluster.startHouseholds,
    0,
  );
  assert.ok(
    Math.abs(startingHouseholds - expectedHouseholds) / expectedHouseholds <= 0.08,
    "bounded shocks should keep tune-in within roughly ±8% of forecast",
  );

  for (const checkpoint of result.checkpoints) {
    assert.equal(Object.keys(checkpoint.clusterViewers).length, 16);
    const reconciled = total(checkpoint.clusterViewers);
    assert.ok(Math.abs(reconciled - checkpoint.households) <= Math.max(1, checkpoint.households * 1e-9));
  }
  for (const definition of AUDIENCE_CLUSTERS) {
    const cluster = simulated.audience.clusters[definition.id];
    assert.ok(Math.abs(total(cluster.favoriteShares) + cluster.unalignedShare - 1) < 1e-8);
    const clusterResult = result.clusterResults.find((entry) => entry.clusterId === definition.id);
    assert.ok(clusterResult);
    const population = AUDIENCE_MARKET.universeHouseholds * definition.populationShare;
    assert.equal(clusterResult.populationHouseholds, population);
    assert.ok(clusterResult.startHouseholds <= population);
    assert.ok(clusterResult.completionHouseholds <= population);
    assert.ok(clusterResult.uniqueReachHouseholds <= population);
    assert.ok(clusterResult.digitalReachHouseholds <= population);
  }
});

test("interest-heavy edits create meaningful, non-binary cohort divergence", () => {
  const conflict = runEpisode(initialAudience(), episode("cohort-conflict", [
    contentSegment("conflict-only", {
      durationSeconds: 900,
      tone: "conflituoso",
      signals: { conflict: 1, spectacle: 0.82, authenticity: 0.32 },
      contextCompleteness: 0.35,
      storylineHook: 0.92,
      portrayals: {
        [firstParticipantId]: ["aggressive"],
        [secondParticipantId]: ["defensive"],
      },
    }),
  ]), "cohort-divergence");
  const humor = runEpisode(initialAudience(), episode("cohort-humor", [
    contentSegment("humor-only", {
      durationSeconds: 900,
      tone: "engracado",
      signals: { humor: 1, relationships: 0.68, authenticity: 0.7 },
      contextCompleteness: 0.9,
      storylineHook: 0.45,
      portrayals: {
        [firstParticipantId]: ["sympathetic"],
        [secondParticipantId]: ["neutral"],
      },
    }),
  ]), "cohort-divergence");

  const conflictSatisfaction = Object.fromEntries(conflict.result.clusterResults.map(
    (cluster) => [cluster.clusterId, cluster.satisfaction],
  ));
  const humorSatisfaction = Object.fromEntries(humor.result.clusterResults.map(
    (cluster) => [cluster.clusterId, cluster.satisfaction],
  ));
  assert.ok(
    conflictSatisfaction.conflict_seekers > conflictSatisfaction.fairness_authenticity_watchdogs,
    "conflict seekers should tolerate a hot, incomplete edit better than fairness watchdogs",
  );
  assert.ok(
    humorSatisfaction.humor_clip_seekers > conflictSatisfaction.humor_clip_seekers,
    "humor seekers should respond better to a humorous edit than an aggressive one",
  );
  assert.ok(
    new Set(conflict.result.clusterResults.map((cluster) => cluster.returnIntentAfter.toFixed(4))).size > 4,
    "cohorts should retain fractional, divergent outcomes",
  );
});

test("timeline order, tone, and commercial placement change their persisted checkpoints", () => {
  const strongStory = contentSegment("strong-story", {
    durationSeconds: 480,
    tone: "emocional",
    signals: { vulnerability: 0.9, relationships: 0.82, authenticity: 0.78 },
    portrayals: {
      [firstParticipantId]: ["vulnerable", "sympathetic"],
      [secondParticipantId]: ["sympathetic"],
    },
    contextCompleteness: 0.95,
    storylineHook: 0.9,
  });
  const neutralStory = contentSegment("neutral-story", {
    durationSeconds: 480,
    signals: { strategy: 0.48, competition: 0.45 },
    contextCompleteness: 0.65,
    storylineHook: 0.25,
  });
  const ad = commercialSegment("placement-ad", 1, 300);
  const earlyAd = runEpisode(initialAudience(), episode(
    "edit-variant",
    [ad, neutralStory, strongStory],
  ), "edit-variant");
  const lateAd = runEpisode(initialAudience(), episode(
    "edit-variant",
    [neutralStory, strongStory, ad],
  ), "edit-variant");
  const maliciousTone = runEpisode(initialAudience(), episode("edit-variant", [
    { ...neutralStory, tone: "malicioso" },
    strongStory,
    ad,
  ]), "edit-variant");

  assert.deepEqual(earlyAd.result.forecast, lateAd.result.forecast);
  assert.deepEqual(earlyAd.result.shocks, lateAd.result.shocks);
  assert.notDeepEqual(
    earlyAd.result.checkpoints.map((point) => [point.segmentId, point.households]),
    lateAd.result.checkpoints.map((point) => [point.segmentId, point.households]),
  );
  assert.notEqual(earlyAd.result.averageRating, lateAd.result.averageRating);
  assert.notDeepEqual(
    maliciousTone.result.checkpoints.map((point) => point.households),
    lateAd.result.checkpoints.map((point) => point.households),
  );
  assert.ok(
    lateAd.result.checkpoints.find((point) => point.segmentId === "placement-ad")!.deltaHouseholds < 0,
    "the stored commercial checkpoint should show its own churn",
  );
});

test("private house truth and unaired event changes cannot affect public audience state", () => {
  const visible = startedState("public-private-separation");
  const hiddenVariant = structuredClone(visible);
  const relationship = Object.values(hiddenVariant.relationships)[0];
  relationship.trust = Math.max(0, relationship.trust - 20);
  hiddenVariant.characters[thirdParticipantId].condition.stress = 99;
  const unairedEvent = hiddenVariant.house.eventHistory.at(-1);
  assert.ok(unairedEvent);
  unairedEvent.title = "Informação privada que nunca foi ao ar";
  unairedEvent.audienceSignals = { conflict: 1, spectacle: 1 };

  const broadcast = episodeUsingCanonicalEvent(visible, "public-only");
  const baselineResult = reduceGame(visible, { type: "AIR_EPISODE", episode: broadcast });
  const hiddenResult = reduceGame(hiddenVariant, { type: "AIR_EPISODE", episode: broadcast });
  assert.equal(baselineResult.diagnostic, undefined);
  assert.equal(hiddenResult.diagnostic, undefined);
  assert.deepEqual(
    baselineResult.state.broadcasts.at(-1)?.result,
    hiddenResult.state.broadcasts.at(-1)?.result,
  );
  assert.deepEqual(baselineResult.state.audienceModel, hiddenResult.state.audienceModel);
  assert.deepEqual(baselineResult.state.rng, hiddenResult.state.rng);
});

test("fandom grows gradually while negative awareness remains anti-fandom, not attachment", () => {
  let audience = initialAudience();
  let rng = createRng("gradual-fandom");
  const awareness: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    const result = runEpisode(audience, episode(`fandom-${index}`, [
      contentSegment(`fandom-story-${index}`, {
        durationSeconds: 600,
        participantIds: [firstParticipantId, secondParticipantId],
        perspectiveIds: [firstParticipantId, secondParticipantId],
        tone: "emocional",
        signals: {
          vulnerability: 0.82,
          authenticity: 0.8,
          relationships: 0.7,
          humor: 0.35,
        },
        portrayals: {
          [firstParticipantId]: ["sympathetic", "vulnerable", "competent"],
          [secondParticipantId]: ["dishonest", "aggressive"],
        },
        contextCompleteness: 0.9,
        storylineHook: 0.75,
      }),
    ]), "unused", rng);
    audience = result.audience;
    rng = result.rng;
    awareness.push(audience.clusters.reality_superfans.participantFans[firstParticipantId].awareness);
  }

  const cluster = audience.clusters.reality_superfans;
  const fan = cluster.participantFans[firstParticipantId];
  const antiFan = cluster.participantFans[secondParticipantId];
  assert.ok(awareness.every((value, index) => index === 0 || value > awareness[index - 1]));
  assert.ok(awareness.at(-1)! < 100, "fandom should not form instantaneously");
  assert.ok(
    awareness[4] - awareness[3] < awareness[1] - awareness[0],
    "repeat exposure should yield diminishing awareness gains",
  );
  assert.ok(fan.sentiment > 0);
  assert.ok(fan.attachment > 0);
  assert.ok(antiFan.awareness > 0);
  assert.ok(antiFan.sentiment < 0);
  assert.ok(antiFan.attachment < fan.attachment);
  assert.ok(cluster.favoriteShares[firstParticipantId] > cluster.favoriteShares[secondParticipantId]);
});

function seededFavoriteAudience(strongSecondary: boolean): AudienceState {
  const audience = initialAudience();
  audience.publicKnowledge.participantAssociations[
    `${firstParticipantId}>${secondParticipantId}`
  ] = 0.85;
  for (const cluster of Object.values(audience.clusters)) {
    for (const id of participantIds) cluster.favoriteShares[id] = 0;
    cluster.favoriteShares[firstParticipantId] = 0.55;
    cluster.favoriteShares[secondParticipantId] = 0.25;
    cluster.favoriteShares[thirdParticipantId] = 0.1;
    cluster.unalignedShare = 0.1;
    cluster.returnIntent = 0.8;
    cluster.participantFans[firstParticipantId] = {
      awareness: 90,
      sentiment: 75,
      attachment: 84,
      exposureMinutes: 40,
      fatigue: 12,
    };
    cluster.participantFans[secondParticipantId] = {
      awareness: strongSecondary ? 82 : 20,
      sentiment: strongSecondary ? 64 : 0,
      attachment: strongSecondary ? 70 : 0,
      exposureMinutes: strongSecondary ? 34 : 2,
      fatigue: 6,
    };
  }
  return audience;
}

function farewellEpisode(id: string, quality: "strong" | "poor"): BroadcastEpisode {
  return episode(id, [
    contentSegment(`${id}-farewell`, {
      participantIds: [firstParticipantId, secondParticipantId],
      perspectiveIds: [firstParticipantId],
      durationSeconds: 480,
      tone: quality === "strong" ? "emocional" : "malicioso",
      signals: quality === "strong"
        ? { vulnerability: 1, redemption: 0.9, relationships: 0.85 }
        : { conflict: 0.8 },
      portrayals: quality === "strong"
        ? {
            [firstParticipantId]: ["sympathetic", "vulnerable", "justified"],
            [secondParticipantId]: ["sympathetic"],
          }
        : {
            [firstParticipantId]: ["neutral"],
            [secondParticipantId]: ["neutral"],
          },
      contextCompleteness: quality === "strong" ? 1 : 0,
      storylineHook: quality === "strong" ? 0.75 : 0,
    }),
  ], { kind: "elimination" });
}

test("favorite loss preserves history, transfers to aired allies, and is softened by secondaries and farewell quality", () => {
  const highSecondaryBefore = seededFavoriteAudience(true);
  const eliminatedHistory = structuredClone(
    highSecondaryBefore.clusters.reality_superfans.participantFans[firstParticipantId],
  );
  const highSecondary = applyFavoriteLoss({
    audience: highSecondaryBefore,
    eliminatedParticipantId: firstParticipantId,
    episode: farewellEpisode("farewell-high", "strong"),
    activeParticipantIds: participantIds.filter((id) => id !== firstParticipantId),
  });
  const lowSecondary = applyFavoriteLoss({
    audience: seededFavoriteAudience(false),
    eliminatedParticipantId: firstParticipantId,
    episode: farewellEpisode("farewell-low-secondary", "strong"),
    activeParticipantIds: participantIds.filter((id) => id !== firstParticipantId),
  });
  const poorFarewell = applyFavoriteLoss({
    audience: seededFavoriteAudience(true),
    eliminatedParticipantId: firstParticipantId,
    episode: farewellEpisode("farewell-poor", "poor"),
    activeParticipantIds: participantIds.filter((id) => id !== firstParticipantId),
  });

  const highCluster = highSecondary.audience.clusters.reality_superfans;
  assert.deepEqual(highCluster.participantFans[firstParticipantId], eliminatedHistory);
  assert.equal(highCluster.favoriteShares[firstParticipantId], 0);
  assert.ok(highCluster.favoriteShares[secondParticipantId] > 0.25);
  assert.ok(highSecondary.impacts.every((impact) => impact.transferredShare > 0));
  assert.ok(
    highSecondary.impacts[0].transferredShare > lowSecondary.impacts[0].transferredShare,
    "an established secondary favorite should accept more transferred affinity",
  );
  assert.ok(
    highSecondary.impacts[0].favoriteLossShock < poorFarewell.impacts[0].favoriteLossShock,
    "a complete, sympathetic farewell should soften loss shock",
  );
  for (const cluster of Object.values(highSecondary.audience.clusters)) {
    assert.ok(Math.abs(total(cluster.favoriteShares) + cluster.unalignedShare - 1) < 1e-8);
  }
});

test("audience votes normalize by cohort and remain immutable once locked", () => {
  const audience = seededFavoriteAudience(true);
  for (const cluster of Object.values(audience.clusters)) {
    cluster.participantFans[secondParticipantId].sentiment = -65;
    cluster.participantFans[secondParticipantId].awareness = 88;
  }
  const closed = closeAudienceVote(audience, {
    kind: "elimination",
    week: 1,
    participantIds: [firstParticipantId, secondParticipantId],
    lockedAfterEpisodeId: "vote-episode-1",
  });
  const locked = structuredClone(closed.result);

  assert.ok(Math.abs(total(closed.result.shares) - 1) < 1e-10);
  for (const shares of Object.values(closed.result.clusterShares)) {
    assert.ok(Math.abs(total(shares) - 1) < 1e-10);
  }
  assert.equal(closed.result.selectedParticipantId, secondParticipantId);
  assert.throws(() => closeAudienceVote(closed.audience, {
    kind: "elimination",
    week: 1,
    participantIds: [firstParticipantId, secondParticipantId],
    lockedAfterEpisodeId: "vote-episode-1",
  }), /already locked/i);

  closed.audience.clusters.reality_superfans.participantFans[secondParticipantId].sentiment = 100;
  assert.deepEqual(closed.audience.pendingVote, locked);
  const consumed = consumePendingAudienceVote(closed.audience, "elimination");
  assert.equal(consumed.audience.pendingVote, null);
  assert.deepEqual(consumed.audience.voteHistory, [locked]);
  assert.throws(() => closeAudienceVote(consumed.audience, {
    kind: "elimination",
    week: 1,
    participantIds: [firstParticipantId, secondParticipantId],
    lockedAfterEpisodeId: "vote-episode-1",
  }), /already been resolved/i);
});

test("persisted episodes reject duplicate ids after refresh without reapplying effects", () => {
  const state = startedState("refresh-idempotency");
  const broadcast = episodeUsingCanonicalEvent(state, "refresh-episode");
  const aired = reduceGame(state, { type: "AIR_EPISODE", episode: broadcast });
  assert.equal(aired.diagnostic, undefined);
  const restored = deserializeSeason(serializeSeason(aired.state));
  assert.ok(restored);

  const rngBefore = structuredClone(restored.snapshot.rng);
  const audienceBefore = structuredClone(restored.snapshot.audienceModel);
  const broadcastCount = restored.snapshot.broadcasts.length;
  const duplicate = reduceGame(restored.snapshot, { type: "AIR_EPISODE", episode: broadcast });

  assert.match(duplicate.diagnostic ?? "", /already aired/i);
  assert.deepEqual(duplicate.state.rng, rngBefore);
  assert.deepEqual(duplicate.state.audienceModel, audienceBefore);
  assert.equal(duplicate.state.broadcasts.length, broadcastCount);
});

function legacyPayload(version: 1 | 2): string {
  const state = startedState(`migration-v${version}`);
  state.broadcasts.push({
    week: 1,
    cuts: [],
    audienceForecast: 17,
  });
  const envelope = JSON.parse(serializeSeason(state));
  envelope.schemaVersion = version;
  envelope.snapshot.schemaVersion = version;
  envelope.engineVersion = version === 1 ? "0.1.0" : "0.2.0";
  envelope.catalogVersion = version === 1 ? "0.1.0" : "0.2.0";
  envelope.snapshot.engineVersion = envelope.engineVersion;
  envelope.snapshot.catalogVersion = envelope.catalogVersion;
  delete envelope.snapshot.audienceModel;
  for (const event of envelope.snapshot.house.eventHistory) {
    delete event.audienceSignals;
    delete event.observablePortrayals;
  }
  if (version === 1) {
    delete envelope.snapshot.competition.nominationHistory;
    delete envelope.snapshot.competition.eliminationHistory;
    delete envelope.snapshot.narrative.publicStorylines;
  }
  return JSON.stringify(envelope);
}

test("schema v1 and v2 saves migrate deterministically to v3 without invented traces", () => {
  for (const version of [1, 2] as const) {
    const payload = legacyPayload(version);
    const first = deserializeSeason(payload);
    const second = deserializeSeason(payload);
    assert.ok(first, `v${version} should migrate`);
    assert.ok(second);
    assert.equal(first.schemaVersion, SCHEMA_VERSION);
    assert.equal(first.snapshot.schemaVersion, SCHEMA_VERSION);
    assert.equal(first.snapshot.broadcasts.at(-1)?.detailLevel, "legacy");
    assert.equal(first.snapshot.broadcasts.at(-1)?.result, undefined);
    assert.equal(Object.keys(first.snapshot.audienceModel.clusters).length, 16);
    assert.deepEqual(first.snapshot.audienceModel, second.snapshot.audienceModel);
    assert.deepEqual(collectAudienceStateErrors(first.snapshot.audienceModel, participantIds), []);
    assert.ok(first.snapshot.house.eventHistory.every(
      (event) => event.audienceSignals && event.observablePortrayals,
    ));
  }
});

test("broadcast calculation stays lightweight and a report-rich local save stays below 5 MB", () => {
  const broadcast = episode("performance", [
    contentSegment("performance-a", {
      durationSeconds: 420,
      signals: { competition: 0.85, strategy: 0.7, spectacle: 0.6 },
    }),
    commercialSegment("performance-ad-1", 1, 180),
    contentSegment("performance-b", {
      durationSeconds: 480,
      signals: { conflict: 0.7, relationships: 0.65, authenticity: 0.72 },
      tone: "conflituoso",
    }),
    commercialSegment("performance-ad-2", 2, 180),
    contentSegment("performance-c", {
      durationSeconds: 360,
      signals: { humor: 0.75, redemption: 0.65, vulnerability: 0.55 },
      tone: "engracado",
    }),
  ]);
  runEpisode(initialAudience(), broadcast, "warmup");
  const timings: number[] = [];
  for (let index = 0; index < 30; index += 1) {
    const startedAt = performance.now();
    runEpisode(initialAudience(), broadcast, `performance-${index}`);
    timings.push(performance.now() - startedAt);
  }
  timings.sort((left, right) => left - right);
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
  assert.ok(p95 < 50, `audience calculation p95 was ${p95.toFixed(2)} ms`);

  let state = startedState("audience-save-size");
  for (let index = 0; index < 12; index += 1) {
    const aired = reduceGame(state, {
      type: "AIR_EPISODE",
      episode: episodeUsingCanonicalEvent(state, `saved-audience-${index}`),
    });
    assert.equal(aired.diagnostic, undefined);
    state = aired.state;
  }
  const bytes = new TextEncoder().encode(serializeSeason(state)).byteLength;
  assert.ok(bytes < 5_000_000, `serialized season was ${(bytes / 1_000_000).toFixed(2)} MB`);

  const aggregates = selectParticipantAudienceAggregates(state.audienceModel, participantIds);
  assert.ok(Object.values(aggregates).every((aggregate) =>
    aggregate.awareness >= 0
    && aggregate.awareness <= 100
    && aggregate.sentiment >= -100
    && aggregate.sentiment <= 100));
});
