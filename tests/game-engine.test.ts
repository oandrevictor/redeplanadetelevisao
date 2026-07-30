import assert from "node:assert/strict";
import test from "node:test";
import { cast, validateCast } from "../game/content/cast";
import { eventTemplates } from "../game/content/templates/index";
import { AUDIENCE_SCHEDULES } from "../game/audience/catalog";
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
import {
  isRequiredEpisodeFootage,
} from "../game/selectors/event-view";
import { selectAudienceForecast } from "../game/selectors/audience-forecast";
import { selectFeedBatch, selectFeedEvents, selectFeedSource, selectReleasedFeedEvents } from "../game/selectors/feed";
import { isStoryWindowReleased, selectReleasedEvents } from "../game/selectors/released-events";
import { simulateSeasons } from "../game/simulator";
import { createInitialState } from "../game/state";
import type { ChallengeType, EpisodeKind, GameState } from "../game/types";
import {
  buildEditorialAlerts,
  classifyDuration,
  classifyFocus,
  classifyRhythm,
  classifyVariety,
  firstEmptyProgramZoneIndex,
  insertIntoFirstEmptyProgramZone,
  moveTimelineItem,
  reconcileTimelineWithCanonicalHistory,
  removeEditorialTimelineItem,
  selectEditorEpisodeBank,
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

test("non-legacy editor banks and restored timelines remain canonical", () => {
  const canonical = [{ id: "event-canonical", kind: "event" }];
  const legacy = [{ id: "melhores-semana", kind: "event" }];
  assert.strictEqual(
    selectEditorEpisodeBank(canonical, legacy, {
      requiresCanonicalHistory: true,
      dynamicEngine: false,
    }),
    canonical,
    "shadow/clustered broadcasts must not fall back when only one canonical event exists",
  );
  assert.strictEqual(
    selectEditorEpisodeBank(canonical, legacy, {
      requiresCanonicalHistory: false,
      dynamicEngine: false,
    }),
    legacy,
    "the legacy adapter retains its decorative catalog",
  );

  const restored = [
    { id: "intervalo-1", kind: "ad" },
    legacy[0],
    canonical[0],
    { id: "important-chain", kind: "important-event" },
  ];
  const reconciled = reconcileTimelineWithCanonicalHistory(
    restored,
    canonical.map((event) => event.id),
  );
  assert.deepEqual(
    reconciled.map((item) => item.id),
    ["intervalo-1", "event-canonical", "important-chain"],
  );
  assert.strictEqual(
    reconcileTimelineWithCanonicalHistory(reconciled, ["event-canonical"]),
    reconciled,
    "an already-clean timeline should retain its identity",
  );
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

function stateWithArrivalFeed(count: number, seed = `feed-${count}`): GameState {
  const state = command(createInitialState(seed, "dynamic"), { type: "START_SEASON", seed });
  const base = state.house.eventHistory.find((event) => event.window === "arrival");
  assert.ok(base);
  state.house.eventHistory = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(base),
    id: `feed-event-${String(index + 1).padStart(2, "0")}`,
    sequence: index + 1,
    occurredAt: { ...base.occurredAt, tick: index + 1, week: 1 },
    title: `Registro ${index + 1}`,
    sourceEventIds: [],
    sourceThreadIds: [],
  }));
  state.clock.tick = Math.max(state.clock.tick, count + 1);
  return state;
}

function markEpisodeAired(state: GameState, kind: EpisodeKind, week = state.clock.week): GameState {
  const next = structuredClone(state);
  next.broadcasts.push({
    week,
    cuts: [],
    audienceForecast: 0,
    episode: {
      id: `aired-${week}-${kind}`,
      week,
      kind,
      schedule: AUDIENCE_SCHEDULES[kind],
      segments: [{
        id: `aired-${week}-${kind}-break`,
        kind: "commercial",
        title: "Intervalo",
        durationSeconds: 60,
        breakNumber: 1,
      }],
    },
  });
  return next;
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

test("feed selector returns zero eligible events", () => {
  assert.deepEqual(selectFeedEvents(stateWithArrivalFeed(0), "arrival", 1), []);
});

for (const count of [1, 4, 5, 12]) {
  test(`feed selector returns all ${count} eligible events without a visual cap`, () => {
    const feed = selectFeedEvents(stateWithArrivalFeed(count), "arrival", 1);
    assert.equal(feed.length, count);
    assert.deepEqual(feed.map((item) => item.title), Array.from({ length: count }, (_, index) => `Registro ${index + 1}`));
  });
}

test("feed selector restores chronological order from event sequence", () => {
  const state = stateWithArrivalFeed(5);
  state.house.eventHistory = [
    state.house.eventHistory[3],
    state.house.eventHistory[0],
    state.house.eventHistory[4],
    state.house.eventHistory[1],
    state.house.eventHistory[2],
  ];
  assert.deepEqual(
    selectFeedEvents(state, "arrival", 1).map((item) => item.id),
    ["feed-event-01", "feed-event-02", "feed-event-03", "feed-event-04", "feed-event-05"],
  );
});

test("feed selector does not duplicate an event id", () => {
  const state = stateWithArrivalFeed(5);
  state.house.eventHistory.splice(3, 0, structuredClone(state.house.eventHistory[2]));
  const feed = selectFeedEvents(state, "arrival", 1);
  assert.equal(feed.length, 5);
  assert.equal(new Set(feed.map((item) => item.id)).size, feed.length);
});

test("feed preserves quantity and order after save and reload", () => {
  const state = stateWithArrivalFeed(12, "feed-persistence");
  const before = selectFeedEvents(state, "arrival", 1);
  const restored = deserializeSeason(serializeSeason(state));
  assert.ok(restored);
  assert.deepEqual(selectFeedEvents(restored.snapshot, "arrival", 1), before);
});

test("dynamic feed uses every generated entry instead of the legacy replacement", () => {
  const dynamicItems = selectFeedEvents(stateWithArrivalFeed(10), "arrival", 1);
  const legacyItems = dynamicItems.slice(0, 4).map((item, index) => ({ ...item, id: `legacy-${index}` }));
  const selected = selectFeedSource(dynamicItems, legacyItems, { dynamicReady: true, mode: "dynamic" });
  assert.deepEqual(selected, dynamicItems);
});

test("legacy feed remains available in legacy mode and as a true dynamic fallback", () => {
  const legacyItems = [
    { id: "legacy-1" },
    { id: "legacy-2" },
    { id: "legacy-3" },
    { id: "legacy-4" },
  ];
  const dynamicItems = [{ id: "dynamic-1" }, { id: "dynamic-2" }];
  assert.deepEqual(
    selectFeedSource(dynamicItems, legacyItems, { dynamicReady: true, mode: "legacy" }),
    legacyItems,
  );
  assert.deepEqual(
    selectFeedSource([], legacyItems, { dynamicReady: true, mode: "dynamic" }),
    legacyItems,
  );
});

test("feed source removes duplicate ids without changing the first occurrence order", () => {
  const items = [{ id: "one" }, { id: "two" }, { id: "one" }, { id: "three" }];
  assert.deepEqual(
    selectFeedSource(items, [], { dynamicReady: true, mode: "dynamic" }).map((item) => item.id),
    ["one", "two", "three"],
  );
});

test("events from future weeks and other windows remain absent", () => {
  const state = stateWithArrivalFeed(5);
  const future = structuredClone(state.house.eventHistory[0]);
  future.id = "future-event";
  future.sequence = 6;
  future.occurredAt.week = 2;
  const otherWindow = structuredClone(state.house.eventHistory[1]);
  otherWindow.id = "party-event";
  otherWindow.sequence = 7;
  otherWindow.window = "party";
  state.house.eventHistory.push(future, otherWindow);
  assert.deepEqual(
    selectFeedEvents(state, "arrival", 1).map((item) => item.id),
    ["feed-event-01", "feed-event-02", "feed-event-03", "feed-event-04", "feed-event-05"],
  );
});

test("future material is absent from the canonical release source, feed, and episode bank", () => {
  const state = stateWithArrivalFeed(1, "future-release");
  const future = structuredClone(state.house.eventHistory[0]);
  future.id = "future-release-event";
  future.sequence = 2;
  future.occurredAt = { ...future.occurredAt, tick: state.clock.tick + 10, week: 2 };
  state.house.eventHistory.push(future);
  assert.ok(!selectReleasedEvents(state).some((event) => event.id === future.id));
  assert.ok(!selectFeedEvents(state, "arrival", 1).some((event) => event.id === future.id));
  assert.ok(!selectAvailableFootage(state, { week: 2, episodeKind: "premiere" })
    .some((event) => event.id === future.id));
});

test("occurred and released material is shared by feed and a compatible episode bank", () => {
  const state = stateWithArrivalFeed(5, "shared-release");
  const feedIds = selectFeedEvents(state, "arrival", 1).map((event) => event.id);
  const bankIds = selectAvailableFootage(state, { week: 1, episodeKind: "premiere" }).map((event) => event.id);
  assert.deepEqual(bankIds, feedIds);
});

test("released material remains unavailable to an incompatible episode type", () => {
  const state = stateWithArrivalFeed(5, "incompatible-release");
  assert.equal(selectAvailableFootage(state, { week: 1, episodeKind: "challenge" }).length, 0);
  assert.equal(selectAvailableFootage(state, { week: 1, episodeKind: "vote" }).length, 0);
  assert.equal(selectAvailableFootage(state, { week: 1, episodeKind: "elimination" }).length, 0);
  assert.equal(selectAvailableFootage(state, { week: 1, episodeKind: "final" }).length, 0);
});

test("results enter the feed only after their episode and never leak into a later editor bank", () => {
  let state = command(createInitialState("released-anchors", "dynamic", "legacy"), {
    type: "START_SEASON",
    seed: "released-anchors",
  });
  state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "atencao" });
  const challengeAnchor = state.house.eventHistory.find((event) => event.templateId === "anchor:challenge-result");
  assert.ok(challengeAnchor);
  assert.equal(selectFeedBatch(state, "postChallenge", 1).length, 0);
  assert.ok(!selectAvailableFootage(state, { week: 1, episodeKind: "premiere" })
    .some((event) => event.id === challengeAnchor.id));
  state = markEpisodeAired(state, "premiere", 1);
  assert.ok(selectFeedBatch(state, "postChallenge", 1)
    .some((event) => event.id === challengeAnchor.id));
  assert.ok(!selectAvailableFootage(state, { week: 1, episodeKind: "challenge" })
    .some((event) => event.id === challengeAnchor.id));
  assert.ok(!selectAvailableFootage(state, { week: 1, episodeKind: "vote" })
    .some((event) => event.id === challengeAnchor.id));

  state = command(state, { type: "START_PARTY" });
  assert.deepEqual(
    selectAvailableFootage(state, { week: 1, episodeKind: "vote" }).map((event) => event.id),
    selectFeedBatch(state, "party", 1).map((event) => event.id),
  );
  state = markEpisodeAired(state, "vote", 1);
  state = command(state, { type: "FORM_NOMINATION" });
  const nominationAnchor = state.house.eventHistory.find((event) => event.templateId === "anchor:nomination-result");
  assert.ok(nominationAnchor);
  assert.ok(!selectAvailableFootage(state, { week: 1, episodeKind: "vote" })
    .some((event) => event.id === nominationAnchor.id));
  assert.ok(selectFeedBatch(state, "nomination", 1)
    .some((event) => event.id === nominationAnchor.id));
  assert.deepEqual(
    selectAvailableFootage(state, { week: 1, episodeKind: "elimination" }).map((event) => event.id),
    selectFeedBatch(state, "nomination", 1).map((event) => event.id),
  );
  assert.ok(!selectAvailableFootage(state, { week: 1, episodeKind: "premiere" })
    .some((event) => event.id === nominationAnchor.id));
});

test("more than four released items remain eligible independent of viewport visibility", () => {
  const state = stateWithArrivalFeed(12, "released-overflow");
  const released = selectReleasedEvents(state, { week: 1 });
  const bank = selectAvailableFootage(state, { week: 1, episodeKind: "premiere" });
  assert.equal(released.length, 12);
  assert.equal(bank.length, 12);
  assert.deepEqual(bank.map((event) => event.id), released.map((event) => event.id));
});

test("released availability persists with stable order and no duplicates", () => {
  const state = stateWithArrivalFeed(12, "released-persistence");
  const restored = deserializeSeason(serializeSeason(state));
  assert.ok(restored);
  const before = selectReleasedEvents(state).map((event) => event.id);
  const after = selectReleasedEvents(restored.snapshot).map((event) => event.id);
  assert.deepEqual(after, before);
  assert.equal(new Set(after).size, after.length);
});

test("legacy editor material remains available only through the compatibility path", () => {
  const canonical = [{ id: "canonical" }];
  const legacy = [{ id: "legacy-1" }, { id: "legacy-2" }];
  assert.deepEqual(
    selectEditorEpisodeBank(canonical, legacy, { requiresCanonicalHistory: false, dynamicEngine: false }),
    legacy,
  );
  assert.deepEqual(
    selectEditorEpisodeBank(canonical, legacy, { requiresCanonicalHistory: true, dynamicEngine: true }),
    canonical,
  );
});

test("important-event availability follows the canonical party window release", () => {
  let state = command(createInitialState("important-release", "dynamic", "legacy"), {
    type: "START_SEASON",
    seed: "important-release",
  });
  assert.equal(isStoryWindowReleased(state, "party", 1), false);
  state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "sorte" });
  assert.equal(isStoryWindowReleased(state, "party", 1), false);
  state = command(state, { type: "START_PARTY" });
  assert.equal(isStoryWindowReleased(state, "party", 1), true);
});

test("episode filters consume the same released chronology for every episode kind", () => {
  const state = playSeason("released-episode-filters");
  const allowed = {
    premiere: new Set(["arrival"]),
    challenge: new Set(["pre_challenge"]),
    vote: new Set(["post_challenge", "party", "campaign"]),
    elimination: new Set(["post_nomination"]),
    final: new Set(["final"]),
  } as const;
  for (const [episodeKind, windows] of Object.entries(allowed)) {
    const footage = selectAvailableFootage(state, {
      week: episodeKind === "premiere" ? 1 : state.clock.week,
      episodeKind: episodeKind as keyof typeof allowed,
    });
    assert.ok(footage.every((event) => windows.has(event.window as never)));
    assert.deepEqual(
      footage.map((event) => event.sequence),
      [...footage].map((event) => event.sequence).sort((left, right) => left - right),
    );
  }
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
  assert.equal(premiere.length, selectFeedBatch(state, "intro", 1).length);
  assert.equal(new Set(premiere.map((event) => event.id)).size, premiere.length);
  assert.ok(premiere.every((event) => event.window === "arrival"));
  assert.ok(!premiere.some((event) => event.templateId === "anchor:challenge-result"));
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

test("editor requirements are episode-scoped and house voting stays consolidated", () => {
  let state = command(
    createInitialState("episode-requirements", "dynamic", "legacy"),
    { type: "START_SEASON", seed: "episode-requirements" },
  );
  state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "sorte" });
  state = command(state, { type: "FORM_NOMINATION" });

  const challenge = state.house.eventHistory.find(
    (event) => event.templateId === "anchor:challenge-result",
  );
  const nomination = state.house.eventHistory.find(
    (event) => event.templateId === "anchor:nomination-result",
  );
  assert.ok(challenge);
  assert.ok(nomination);
  assert.equal(state.house.eventHistory.filter(
    (event) => event.templateId === "anchor:house-ballot",
  ).length, 0);

  const eliminationResult = { ...nomination, templateId: "anchor:elimination-result" };
  const farewell = { ...nomination, templateId: "anchor:farewell" };
  const finalistSpeech = { ...nomination, templateId: "anchor:finalist-speech" };
  const retrospective = { ...nomination, templateId: "anchor:season-retrospective" };

  assert.equal(isRequiredEpisodeFootage(challenge, "premiere"), false);
  assert.equal(isRequiredEpisodeFootage(challenge, "challenge"), false);
  assert.equal(isRequiredEpisodeFootage(nomination, "vote"), false);
  assert.equal(isRequiredEpisodeFootage(nomination, "elimination"), false);
  assert.equal(isRequiredEpisodeFootage(eliminationResult, "elimination"), false);
  assert.equal(isRequiredEpisodeFootage(farewell, "elimination"), false);
  assert.equal(isRequiredEpisodeFootage(finalistSpeech, "final"), true);
  assert.equal(isRequiredEpisodeFootage(retrospective, "final"), true);
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

test("later challenge editors receive exactly the new pre-challenge feed batch", () => {
  const state = playSeason("weekly-challenge");
  const weekTwo = selectAvailableFootage(state, { week: 2, episodeKind: "challenge" });
  const weekTwoFeed = selectFeedBatch(state, "intro", 2);
  assert.deepEqual(weekTwo.map((event) => event.id), weekTwoFeed.map((event) => event.id));
  assert.ok(weekTwo.every((event) => event.occurredAt.week === 2 && event.window === "pre_challenge"));
  assert.ok(!weekTwo.some((event) => event.templateId === "anchor:challenge-result"));
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
  const nominationFootage = selectAvailableFootage(state, { week: 1, episodeKind: "elimination" })
    .filter((event) => event.templateId === "anchor:nomination-result");
  assert.equal(nominationFootage.length, 0);
});

test("nomination and elimination footage are released only after their canonical moments", () => {
  let state = command(
    createInitialState("chronological-release", "dynamic", "legacy"),
    { type: "START_SEASON", seed: "chronological-release" },
  );
  state = command(state, { type: "CONFIRM_CHALLENGE", challengeType: "atencao" });
  state = command(state, { type: "START_PARTY" });

  assert.equal(state.competition.nomineeIds.length, 0);
  assert.ok(!selectReleasedFeedEvents(state).some((event) => state.house.eventHistory.some(
    (instance) => instance.id === event.eventInstanceId && instance.templateId === "anchor:nomination-result",
  )));
  assert.ok(selectAvailableFootage(state, { week: 1, episodeKind: "vote" })
    .every((event) => event.window === "party" || event.window === "campaign"));

  state = markEpisodeAired(state, "vote", 1);
  state = command(state, { type: "FORM_NOMINATION" });
  const nominationCards = selectReleasedFeedEvents(state)
    .filter((event) => state.house.eventHistory.some(
      (instance) => instance.id === event.eventInstanceId && instance.templateId === "anchor:nomination-result",
    ));
  assert.equal(nominationCards.length, 1);
  assert.equal(state.house.eventHistory.filter(
    (event) => event.templateId === "anchor:house-ballot",
  ).length, 0);
  assert.ok(!selectAvailableFootage(state, { week: 1, episodeKind: "vote" })
    .some((event) => event.window === "post_nomination"));
  assert.deepEqual(
    selectAvailableFootage(state, { week: 1, episodeKind: "elimination" }).map((event) => event.id),
    selectFeedBatch(state, "nomination", 1).map((event) => event.id),
  );

  state = command(state, { type: "CLOSE_AUDIENCE_VOTE" });
  assert.ok(!selectReleasedFeedEvents(state).some(
    (event) => event.eventInstanceId && state.house.eventHistory.find(
      (instance) => instance.id === event.eventInstanceId && instance.templateId === "anchor:elimination-result",
    ),
  ));
  state = command(state, { type: "RESOLVE_ELIMINATION" });
  assert.equal(state.house.eventHistory.filter(
    (event) => event.templateId === "anchor:elimination-result",
  ).length, 1);
  const eliminationBank = selectAvailableFootage(state, { week: 1, episodeKind: "elimination" });
  assert.ok(eliminationBank.every((event) => event.window === "post_nomination"));
  assert.ok(!eliminationBank.some((event) => event.templateId === "anchor:elimination-result"));
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
