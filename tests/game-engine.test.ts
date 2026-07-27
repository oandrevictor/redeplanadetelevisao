import assert from "node:assert/strict";
import test from "node:test";
import { cast, validateCast } from "../game/content/cast";
import { eventTemplates } from "../game/content/templates/index";
import { checkConstraints } from "../game/engine/constraints";
import { enumerateCandidates } from "../game/engine/enumerate";
import { instantiateEvent } from "../game/engine/instantiate";
import { applyEventEffects } from "../game/engine/mutations";
import { collectInvariantErrors } from "../game/invariants";
import { deserializeSeason, serializeSeason } from "../game/persistence/serialization";
import { reduceGame } from "../game/reducer";
import { createRng, nextRandom } from "../game/rng";
import { selectActiveCast } from "../game/selectors/active-cast";
import { selectAvailableFootage } from "../game/selectors/episode-bank";
import { selectAudienceForecast } from "../game/selectors/audience-forecast";
import { selectFeedEvents } from "../game/selectors/feed";
import { simulateSeasons } from "../game/simulator";
import { createInitialState } from "../game/state";
import type { ChallengeType, GameState } from "../game/types";
import {
  buildEditorialAlerts,
  classifyDuration,
  classifyFocus,
  classifyRhythm,
  classifyVariety,
  firstEmptyProgramZoneIndex,
  insertIntoFirstEmptyProgramZone,
  moveTimelineItem,
  removeEditorialTimelineItem,
  validateEditorCut,
} from "../app/editor-analysis";

test("editor qualitative readings follow the approved boundaries", () => {
  assert.equal(classifyDuration(37.99 * 60).label, "Curta");
  assert.equal(classifyDuration(38 * 60).label, "Adequada");
  assert.equal(classifyDuration(46 * 60).label, "Adequada");
  assert.equal(classifyDuration(46.01 * 60).label, "Longa");

  assert.equal(classifyRhythm([]).label, "Ainda sem leitura");
  assert.equal(classifyRhythm([4, 5]).label, "Acelerado");
  assert.equal(classifyRhythm([5, 7]).label, "Equilibrado");
  assert.equal(classifyRhythm([8]).label, "Lento");

  assert.equal(classifyVariety([]).label, "Ainda sem leitura");
  assert.equal(classifyVariety(["Humor"]).label, "Baixa");
  assert.equal(classifyVariety(["Humor", "Festa"]).label, "Moderada");
  assert.equal(classifyVariety(["Humor", "Festa", "Prova"]).label, "Boa");

  const simultaneousAlerts = buildEditorialAlerts(
    { label: "Longa", state: "high" },
    { label: "Concentrado em Ravi", state: "high" },
    { label: "Moderada", state: "good" },
    { label: "Equilibrado", state: "good" },
  );
  assert.equal(simultaneousAlerts.length, 2);
  assert.match(simultaneousAlerts[0], /Episódio longo/);
  assert.match(simultaneousAlerts[1], /Ravi/);

  const name = (id: string) => ({ a: "Ana", b: "Beto" })[id as "a" | "b"] ?? id;
  assert.equal(classifyFocus([], name).label, "Ainda sem leitura");
  assert.equal(classifyFocus([["a"]], name).label, "Ainda sem leitura");
  assert.equal(classifyFocus([["a"], ["a", "b"], ["b"]], name).label, "Concentrado em Ana");
  assert.equal(classifyFocus([["a"], ["b"]], name).label, "Distribuído");
});

test("editor timeline keeps four movable, non-removable ads and fills program zones", () => {
  const ads = [1, 2, 3, 4].map((number) => ({ id: `ad-${number}`, kind: "ad" }));
  assert.equal(firstEmptyProgramZoneIndex(ads), 0);
  const withFirst = insertIntoFirstEmptyProgramZone(ads, { id: "event-1", kind: "event" });
  assert.deepEqual(withFirst.map((item) => item.id), ["event-1", "ad-1", "ad-2", "ad-3", "ad-4"]);
  const withSecond = insertIntoFirstEmptyProgramZone(withFirst, { id: "event-2", kind: "event" });
  assert.deepEqual(withSecond.map((item) => item.id), ["event-1", "ad-1", "event-2", "ad-2", "ad-3", "ad-4"]);
  assert.equal(removeEditorialTimelineItem(withSecond, "ad-1").filter((item) => item.kind === "ad").length, 4);
  assert.equal(removeEditorialTimelineItem(withSecond, "event-1").some((item) => item.id === "event-1"), false);
  assert.deepEqual(moveTimelineItem(ads, 0, 1).map((item) => item.id), ["ad-2", "ad-1", "ad-3", "ad-4"]);
});

test("editor validation blocks only editorial count and missing required events", () => {
  assert.match(validateEditorCut(1, []) ?? "", /pelo menos dois/);
  assert.match(validateEditorCut(2, [{ id: "required", title: "Resultado da prova", included: false }]) ?? "", /Resultado da prova/);
  assert.equal(validateEditorCut(2, [{ id: "required", title: "Resultado da prova", included: true }]), null);
  assert.equal(classifyDuration(60 * 60).label, "Longa");
  assert.equal(validateEditorCut(2, []), null, "duration outside the recommendation must not block transmission");
});

test("cast content is mechanically complete", () => {
  assert.deepEqual(validateCast(), []);
  assert.equal(eventTemplates.length, 20);
  assert.ok(eventTemplates.some((template) => template.tags.includes("fallback")));
});

test("seeded RNG is reproducible and serialized", () => {
  let left = createRng("same-seed");
  let right = createRng("same-seed");
  const leftValues: number[] = [];
  const rightValues: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    let value: number;
    [value, left] = nextRandom(left);
    leftValues.push(value);
    [value, right] = nextRandom(right);
    rightValues.push(value);
  }
  assert.deepEqual(leftValues, rightValues);
  assert.deepEqual(left, right);
  assert.equal(left.counter, 20);
});

function command(state: GameState, value: Parameters<typeof reduceGame>[1]): GameState {
  const result = reduceGame(state, value);
  assert.equal(result.diagnostic, undefined, result.diagnostic);
  assert.deepEqual(collectInvariantErrors(result.state), []);
  return result.state;
}

function playSeason(seed: string): GameState {
  let state = command(createInitialState(seed), { type: "START_SEASON", seed });
  const challengeTypes: ChallengeType[] = ["resistencia", "sorte", "atencao"];
  let week = 0;
  while (selectActiveCast(state).length > 3) {
    state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: challengeTypes[week % challengeTypes.length] });
    state = command(state, { type: "START_PARTY" });
    state = command(state, { type: "FORM_NOMINATION" });
    state = command(state, { type: "RESOLVE_ELIMINATION", participantId: state.competition.nomineeIds[0] });
    if (selectActiveCast(state).length > 3) state = command(state, { type: "ADVANCE_WEEK" });
    week += 1;
  }
  return command(state, { type: "RESOLVE_FINAL", winnerId: selectActiveCast(state)[0] });
}

test("same seed and commands produce deeply equal seasons", () => {
  assert.deepEqual(playSeason("deterministic"), playSeason("deterministic"));
});

test("100 complete seasons preserve invariants and reach one winner", () => {
  for (let index = 0; index < 100; index += 1) {
    const state = playSeason(`simulation-${index}`);
    assert.deepEqual(collectInvariantErrors(state), [], `seed simulation-${index}`);
    assert.ok(state.competition.winnerId);
    assert.equal(Object.values(state.characters).filter((character) => character.status === "winner").length, 1);
    for (const eliminatedId of state.competition.eliminatedIds) {
      const eliminationWeek = state.competition.eliminatedIds.indexOf(eliminatedId) + 1;
      const laterEvent = state.house.eventHistory.find((event) =>
        event.occurredAt.week > eliminationWeek && event.actorIds.includes(eliminatedId));
      assert.equal(laterEvent, undefined, `${eliminatedId} appears after elimination`);
    }
  }
});

test("party templates stay in party windows and event ids are stable", () => {
  const state = playSeason("party-window");
  for (const event of state.house.eventHistory) {
    if (event.templateId.startsWith("anchor:")) {
      const expectedWindow =
        event.templateId === "anchor:challenge-result" ? "post_challenge"
          : event.templateId === "anchor:nomination-result" || event.templateId === "anchor:house-ballot"
            ? "post_nomination"
            : event.templateId === "anchor:elimination-result" || event.templateId === "anchor:farewell"
              ? "elimination"
              : "final";
      assert.equal(event.window, expectedWindow);
      continue;
    }
    const template = eventTemplates.find((item) => item.id === event.templateId);
    assert.ok(template);
    assert.ok(template.windows.includes(event.window));
    assert.match(event.id, /^event-season-[a-z0-9]+-\d+-\d+$/);
  }
});

test("invalid commands report diagnostics without changing mechanics", () => {
  const state = createInitialState("invalid");
  const result = reduceGame(state, { type: "RESOLVE_ELIMINATION", participantId: "dandara" });
  assert.ok(result.diagnostic);
  assert.deepEqual(result.state.characters, state.characters);
  assert.deepEqual(result.state.competition, state.competition);
  assert.equal(result.state.diagnostics.length, 1);
});

test("arrival and party queues are generated once and selectors never reroll", () => {
  let state = command(createInitialState("queues", "dynamic"), { type: "START_SEASON", seed: "queues" });
  const arrival = selectFeedEvents(state, "arrival", 1);
  assert.equal(arrival.length, 4);
  const rngAfterArrival = structuredClone(state.rng);
  const repeated = command(state, { type: "ADVANCE_STORY", to: "arrival" });
  assert.deepEqual(selectFeedEvents(repeated, "arrival", 1), arrival);
  assert.deepEqual(repeated.rng, rngAfterArrival);

  state = command(repeated, { type: "CONFIRM_CHALLENGE", challengeType: "atencao" });
  state = command(state, { type: "START_PARTY" });
  const party = selectFeedEvents(state, "party", 1);
  const partyTemplateIds = state.house.eventHistory
    .filter((event) => event.window === "party" && event.occurredAt.week === 1)
    .map((event) => event.templateId);
  assert.equal(party.length, 4);
  assert.equal(new Set(partyTemplateIds).size, partyTemplateIds.length);
  assert.notDeepEqual(party.map((entry) => entry.title), arrival.map((entry) => entry.title));
});

test("story windows do not repeat a template and party gossip does not imply shared microphone audio", () => {
  const gossip = eventTemplates.find((template) => template.id === "party-open-mic");
  assert.ok(gossip);
  assert.equal(gossip.revision, 2);
  assert.doesNotMatch(`${gossip.title} ${gossip.description}`, /microfone/i);
  assert.match(gossip.description, /desconfia das alianças/i);
  assert.match(gossip.description, /conversa é repassada/i);

  for (let index = 0; index < 30; index += 1) {
    let state = command(createInitialState(`party-variety-${index}`, "dynamic"), {
      type: "START_SEASON",
      seed: `party-variety-${index}`,
    });
    state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "sorte" });
    state = command(state, { type: "START_PARTY" });
    const party = selectFeedEvents(state, "party", 1);
    const partyTemplateIds = state.house.eventHistory
      .filter((event) => event.window === "party" && event.occurredAt.week === 1)
      .map((event) => event.templateId);
    assert.equal(party.length, 4);
    assert.equal(
      new Set(partyTemplateIds).size,
      partyTemplateIds.length,
      `party-variety-${index} repeated a party template`,
    );
  }
});

test("episode bank uses unique event instances and preserves frozen historical actors", () => {
  let state = command(createInitialState("footage", "dynamic"), { type: "START_SEASON", seed: "footage" });
  state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "sorte" });
  const premiere = selectAvailableFootage(state, { week: 1, episodeKind: "premiere" });
  assert.ok(premiere.length >= 7);
  assert.equal(new Set(premiere.map((event) => event.id)).size, premiere.length);
  assert.ok(premiere.some((event) => event.templateId === "anchor:challenge-result"));
  const excluded = premiere[0].id;
  assert.ok(!selectAvailableFootage(state, {
    week: 1,
    episodeKind: "premiere",
    excludedInstanceIds: [excluded],
  }).some((event) => event.id === excluded));

  const historicalActor = premiere[0].actorIds[0];
  state.characters[historicalActor].status = "eliminated";
  assert.ok(selectAvailableFootage(state, { week: 1, episodeKind: "premiere" })
    .some((event) => event.actorIds.includes(historicalActor)));
});

test("serialized saves restore the exact event queue and RNG state", () => {
  let state = command(createInitialState("save", "dynamic"), { type: "START_SEASON", seed: "save" });
  state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "resistencia" });
  state = command(state, { type: "START_PARTY" });
  const restored = deserializeSeason(serializeSeason(state));
  assert.ok(restored);
  assert.deepEqual(restored.snapshot, state);
  assert.deepEqual(selectFeedEvents(restored.snapshot, "party", 1), selectFeedEvents(state, "party", 1));
});

test("challenge resolution records full standings and leader-specific reactions", () => {
  let state = command(createInitialState("leadership", "dynamic"), { type: "START_SEASON", seed: "leadership" });
  state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "resistencia" });
  const result = state.competition.challengeHistory[0];
  assert.equal(result.standings.length, selectActiveCast(state).length);
  assert.equal(result.winnerId, state.competition.leaderId);
  assert.deepEqual(
    result.standings,
    [...result.standings].sort((left, right) => right.score - left.score || left.participantId.localeCompare(right.participantId)),
  );

  const reactions = state.house.eventHistory.filter((event) => event.window === "post_challenge");
  const celebration = reactions.find((event) => event.templateId === "challenge-celebration");
  const resentment = reactions.find((event) => event.templateId === "challenge-resentment");
  const lobbying = reactions.find((event) => event.templateId === "leader-lobbying");
  assert.equal(celebration?.roleBindings.actor[0], result.winnerId);
  assert.equal(resentment?.roleBindings.other[0], result.winnerId);
  assert.equal(lobbying?.roleBindings.actor[0], result.winnerId);
});

test("challenge aptitude helps without making one contestant deterministic", () => {
  const wins = new Map<string, number>();
  let winnerTraitTotal = 0;
  for (let index = 0; index < 250; index += 1) {
    let state = command(createInitialState(`aptitude-${index}`, "dynamic"), {
      type: "START_SEASON",
      seed: `aptitude-${index}`,
    });
    state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "atencao" });
    const winnerId = state.competition.leaderId!;
    wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
    winnerTraitTotal += cast.find((profile) => profile.id === winnerId)!.challengeTraits.atencao;
  }
  assert.ok(winnerTraitTotal / 250 > 4);
  assert.ok(wins.size > 1);
  assert.ok(Math.max(...wins.values()) < 250);
});

test("later challenge episodes exclude premiere arrival footage", () => {
  const state = playSeason("weekly-challenge");
  const weekTwo = selectAvailableFootage(state, { week: 2, episodeKind: "challenge" });
  assert.ok(weekTwo.length >= 4);
  assert.ok(weekTwo.every((event) => event.occurredAt.week === 2 && event.window === "post_challenge"));
  assert.ok(weekTwo.some((event) => event.templateId === "anchor:challenge-result"));
});

test("nominations store individual relationship-driven ballots and editable motives", () => {
  let state = command(createInitialState("ballots", "dynamic"), { type: "START_SEASON", seed: "ballots" });
  state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "sorte" });
  state = command(state, { type: "FORM_NOMINATION" });
  const nomination = state.competition.nominationHistory[0];
  assert.ok(nomination);
  assert.notEqual(nomination.leaderId, nomination.leaderTargetId);
  assert.notEqual(nomination.leaderId, nomination.houseTargetId);
  assert.equal(new Set(state.competition.nomineeIds).size, 2);
  assert.equal(nomination.ballots.length, selectActiveCast(state).length - 1);
  for (const ballot of nomination.ballots) {
    assert.notEqual(ballot.voterId, ballot.targetId);
    assert.notEqual(ballot.targetId, nomination.leaderId);
    assert.notEqual(ballot.targetId, nomination.leaderTargetId);
    assert.ok(ballot.motiveTags.length > 0);
  }
  assert.equal(
    Object.values(nomination.totals).reduce((sum, total) => sum + total, 0),
    nomination.ballots.length,
  );
  const ballotFootage = selectAvailableFootage(state, { week: 1, episodeKind: "elimination" })
    .filter((event) => event.templateId === "anchor:house-ballot");
  assert.equal(ballotFootage.length, nomination.ballots.length);
});

test("changing a leader relationship changes the nomination target", () => {
  let base = command(createInitialState("relationship-vote", "dynamic"), {
    type: "START_SEASON",
    seed: "relationship-vote",
  });
  base = command(base, { type: "CONFIRM_CHALLENGE", challengeType: "resistencia" });
  const leaderId = base.competition.leaderId!;
  const targets = selectActiveCast(base).filter((id) => id !== leaderId);
  const altered = structuredClone(base);
  for (const id of targets) {
    const relationship = altered.relationships[`${leaderId}>${id}`];
    relationship.trust = 100;
    relationship.affinity = 100;
    relationship.rivalry = 0;
    relationship.resentment = 0;
    altered.characters[id].game.perceivedThreat = 0;
  }
  const forcedTarget = targets.at(-1)!;
  const forcedRelationship = altered.relationships[`${leaderId}>${forcedTarget}`];
  forcedRelationship.trust = 0;
  forcedRelationship.affinity = 0;
  forcedRelationship.rivalry = 100;
  forcedRelationship.resentment = 100;
  altered.characters[forcedTarget].game.perceivedThreat = 100;
  const nominated = command(altered, { type: "FORM_NOMINATION" });
  assert.equal(nominated.competition.nominationHistory[0].leaderTargetId, forcedTarget);
});

test("elimination is immutable, resolves impossible threads, and preserves farewell footage", () => {
  let state = command(createInitialState("aftermath", "dynamic", "shadow"), { type: "START_SEASON", seed: "aftermath" });
  state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "atencao" });
  state = command(state, { type: "FORM_NOMINATION" });
  const eliminatedId = state.competition.nomineeIds[0];
  state.narrative.threads.manual = {
    id: "manual",
    type: "promise",
    actorIds: [eliminatedId, state.competition.nomineeIds[1]],
    status: "open",
    progress: 20,
    openedAtTick: state.clock.tick,
  };
  state = command(state, { type: "RESOLVE_ELIMINATION", participantId: eliminatedId });
  assert.equal(state.characters[eliminatedId].status, "eliminated");
  assert.equal(state.competition.eliminationHistory[0].eliminatedId, eliminatedId);
  assert.equal(state.narrative.threads.manual.status, "resolved");
  const farewellIndex = state.house.eventHistory.findIndex((event) => event.templateId === "anchor:farewell");
  assert.ok(farewellIndex >= 0);
  assert.ok(state.house.eventHistory[farewellIndex].actorIds.includes(eliminatedId));
  assert.ok(state.house.eventHistory.slice(farewellIndex + 1).every((event) => !event.actorIds.includes(eliminatedId)));
  const duplicate = reduceGame(state, { type: "RESOLVE_ELIMINATION", participantId: eliminatedId });
  assert.ok(duplicate.diagnostic);
});

test("the third elimination transitions all survivors to finalists", () => {
  const state = (() => {
    let current = command(createInitialState("final-transition", "dynamic", "shadow"), {
      type: "START_SEASON",
      seed: "final-transition",
    });
    let week = 0;
    while (selectActiveCast(current).length > 3) {
      current = command(current, { type: "CONFIRM_CHALLENGE", challengeType: ["resistencia", "sorte", "atencao"][week % 3] as ChallengeType });
      current = command(current, { type: "FORM_NOMINATION" });
      current = command(current, { type: "RESOLVE_ELIMINATION", participantId: current.competition.nomineeIds[0] });
      if (selectActiveCast(current).length > 3) current = command(current, { type: "ADVANCE_WEEK" });
      week += 1;
    }
    return current;
  })();
  assert.equal(state.clock.window, "final");
  assert.equal(Object.values(state.characters).filter((character) => character.status === "finalist").length, 3);
});

test("editorial framing changes public opinion without mutating house truth", () => {
  const state = command(createInitialState("editorial", "dynamic"), { type: "START_SEASON", seed: "editorial" });
  const event = state.house.eventHistory[0];
  const relationshipsBefore = structuredClone(state.relationships);
  const emotional = command(state, {
    type: "BROADCAST_EPISODE",
    cuts: [{ eventInstanceId: event.id, perspectiveIds: [event.actorIds[0]], tone: "emocional" }],
  });
  const malicious = command(state, {
    type: "BROADCAST_EPISODE",
    cuts: [{ eventInstanceId: event.id, perspectiveIds: [event.actorIds[0]], tone: "malicioso" }],
  });
  assert.notDeepEqual(emotional.characters[event.actorIds[0]].audience, malicious.characters[event.actorIds[0]].audience);
  assert.deepEqual(emotional.relationships, relationshipsBefore);
  assert.deepEqual(malicious.relationships, relationshipsBefore);
  assert.ok(Object.values(emotional.characters).every((character) =>
    Object.values(character.audience).every((value) => value >= 0 && value <= 100)));
  assert.notEqual(
    emotional.broadcasts[0].audienceForecast,
    undefined,
  );
});

test("repeated editorial exposure has diminishing returns", () => {
  let state = command(createInitialState("diminishing", "dynamic"), { type: "START_SEASON", seed: "diminishing" });
  const event = state.house.eventHistory[0];
  const cut = { eventInstanceId: event.id, perspectiveIds: [event.actorIds[0]], tone: "emocional" } as const;
  const initialSupport = state.characters[event.actorIds[0]].audience.support;
  state = command(state, { type: "BROADCAST_EPISODE", cuts: [cut] });
  const firstGain = state.characters[event.actorIds[0]].audience.support - initialSupport;
  const afterFirst = state.characters[event.actorIds[0]].audience.support;
  state = command(state, { type: "BROADCAST_EPISODE", cuts: [cut] });
  const secondGain = state.characters[event.actorIds[0]].audience.support - afterFirst;
  assert.ok(secondGain < firstGain);
  assert.ok(selectAudienceForecast(state, [cut]).points >= 10);
});

test("versioned saves preserve action logs and migrate schema version one", () => {
  const state = command(createInitialState("migration", "dynamic"), { type: "START_SEASON", seed: "migration" });
  const actionLog = [{ type: "START_SEASON", seed: "migration" }] as const;
  const saved = deserializeSeason(serializeSeason(state, [...actionLog]));
  assert.deepEqual(saved?.actionLog, actionLog);

  const legacy = JSON.parse(serializeSeason(state, [...actionLog]));
  legacy.schemaVersion = 1;
  legacy.snapshot.schemaVersion = 1;
  legacy.engineVersion = "0.1.0";
  legacy.catalogVersion = "0.1.0";
  legacy.snapshot.engineVersion = "0.1.0";
  legacy.snapshot.catalogVersion = "0.1.0";
  delete legacy.snapshot.competition.nominationHistory;
  delete legacy.snapshot.competition.eliminationHistory;
  delete legacy.snapshot.narrative.publicStorylines;
  const migrated = deserializeSeason(JSON.stringify(legacy));
  assert.equal(migrated?.schemaVersion, 3);
  assert.deepEqual(migrated?.snapshot.competition.nominationHistory, []);
  assert.deepEqual(migrated?.snapshot.narrative.publicStorylines, {});
});

test("headless simulator completes without deadlocks or invariant failures", () => {
  const report = simulateSeasons(40);
  assert.equal(report.completed, 40);
  assert.equal(report.deadlocks, 0);
  assert.equal(report.invariantFailures, 0);
  assert.ok(report.commandLatencyP95Ms < 25);
  assert.ok(Object.keys(report.templateFrequency).length > 10);
  assert.ok(Object.keys(report.leadershipDistribution).length > 1);
});

test("callbacks require and resolve a real earlier story thread", () => {
  const state = createInitialState("callback", "dynamic");
  state.clock.window = "campaign";
  state.narrative.threads.promise = {
    id: "promise",
    type: "promise",
    actorIds: ["dandara", "bento"],
    status: "open",
    progress: 0,
    openedAtTick: 0,
  };
  const candidate = enumerateCandidates(state, eventTemplates).find((item) =>
    item.template.id === "promise-exposed"
    && item.actorIds[0] === "dandara"
    && item.actorIds[1] === "bento");
  assert.ok(candidate);
  assert.equal(checkConstraints(state, candidate).accepted, true);
  const event = instantiateEvent(state, candidate);
  assert.deepEqual(event.sourceThreadIds, ["promise"]);
  applyEventEffects(state, event.effects);
  assert.equal(state.narrative.threads.promise.status, "resolved");

  delete state.narrative.threads.promise;
  assert.equal(checkConstraints(state, candidate).accepted, false);
});

test("action logs replay canonical mechanics exactly", () => {
  const seed = "replay";
  const actionLog = [
    { type: "START_SEASON", seed },
    { type: "CONFIRM_CHALLENGE", challengeType: "sorte" },
    { type: "START_PARTY" },
    { type: "FORM_NOMINATION" },
  ] as const;
  const replay = () => {
    let state = createInitialState(seed, "dynamic");
    for (const replayCommand of actionLog) state = command(state, replayCommand);
    return state;
  };
  assert.deepEqual(replay(), replay());
});

test("future save versions fail safely and normal saves stay compact", () => {
  const state = playSeason("save-size");
  const started = performance.now();
  const serialized = serializeSeason(state, [{ type: "START_SEASON", seed: "save-size" }]);
  const elapsed = performance.now() - started;
  assert.ok(new TextEncoder().encode(serialized).byteLength < 5_000_000);
  assert.ok(elapsed < 100);

  const future = JSON.parse(serialized);
  future.schemaVersion = 999;
  future.snapshot.schemaVersion = 999;
  const before = JSON.stringify(future);
  assert.equal(deserializeSeason(before), null);
  assert.equal(JSON.stringify(future), before);
});

test("final editor receives speeches and retrospective footage", () => {
  const state = (() => {
    let current = command(createInitialState("final-footage", "dynamic", "shadow"), {
      type: "START_SEASON",
      seed: "final-footage",
    });
    let week = 0;
    while (selectActiveCast(current).length > 3) {
      current = command(current, {
        type: "CONFIRM_CHALLENGE",
        challengeType: ["resistencia", "sorte", "atencao"][week % 3] as ChallengeType,
      });
      current = command(current, { type: "FORM_NOMINATION" });
      current = command(current, {
        type: "RESOLVE_ELIMINATION",
        participantId: current.competition.nomineeIds[0],
      });
      if (selectActiveCast(current).length > 3) current = command(current, { type: "ADVANCE_WEEK" });
      week += 1;
    }
    return current;
  })();
  const footage = selectAvailableFootage(state, { week: state.clock.week, episodeKind: "final" });
  assert.equal(footage.filter((event) => event.templateId === "anchor:finalist-speech").length, 3);
  assert.ok(footage.some((event) => event.templateId === "anchor:season-retrospective"));
});
