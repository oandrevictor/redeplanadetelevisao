import assert from "node:assert/strict";
import test from "node:test";
import { validateCast } from "../game/content/cast";
import { eventTemplates } from "../game/content/templates/index";
import { collectInvariantErrors } from "../game/invariants";
import { deserializeSeason, serializeSeason } from "../game/persistence/serialization";
import { reduceGame } from "../game/reducer";
import { createRng, nextRandom } from "../game/rng";
import { selectActiveCast } from "../game/selectors/active-cast";
import { selectAvailableFootage } from "../game/selectors/episode-bank";
import { selectFeedEvents } from "../game/selectors/feed";
import { createInitialState } from "../game/state";
import type { ChallengeType, GameState } from "../game/types";

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
      assert.equal(event.window, "post_challenge");
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
  assert.equal(party.length, 4);
  assert.notDeepEqual(party.map((entry) => entry.title), arrival.map((entry) => entry.title));
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
