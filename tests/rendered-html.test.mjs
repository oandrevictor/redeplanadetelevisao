import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  generateWeekEvents,
  importantEventGenerationConfig,
  selectRumorChainParticipants,
} from "../app/important-event-generation.ts";
import { analyzeImportantEventEdit } from "../app/important-event-analysis.ts";

const personalityTraits = (overrides = {}) => ({
  carisma: 3,
  estrategia: 3,
  impulsividade: 2,
  lealdade: 4,
  competitividade: 3,
  percepcaoSocial: 2,
  conscienciaDasCameras: 3,
  ...overrides,
});

const eventGenerationParticipants = [
  { id: "social", name: "Social", personalityTraits: personalityTraits({ percepcaoSocial: 5, lealdade: 1 }) },
  { id: "explosive", name: "Explosive", personalityTraits: personalityTraits({ impulsividade: 5 }) },
  { id: "compatible", name: "Compatible", personalityTraits: personalityTraits() },
  { id: "other", name: "Other", personalityTraits: personalityTraits() },
];

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html", host: "localhost" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Rede Plana game start screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Rede Plana de Televisão<\/title>/i);
  assert.match(html, /PRODUÇÕES PLANA APRESENTA/);
  assert.match(html, /VOCÊ DECIDE O QUE O BRASIL VÊ/);
  assert.match(html, />JOGAR/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});
test("source contains the complete playable season loop", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

  for (const phase of [
    "feedIntro",
    "challenge",
    "editPremiere",
    "livePremiere",
    "feedParty",
    "editVote",
    "audienceVote",
    "editElimination",
    "weekSummary",
    "editFinal",
    "winnerVote",
    "winnerReveal",
  ]) {
    assert.match(page, new RegExp(`"${phase}"`), `missing phase ${phase}`);
  }

  assert.match(page, /Participantes\.pdf/);
  assert.match(page, /Gerenciamento de provas/);
  assert.match(page, /draggable/);
  assert.match(page, /Intervalo \$\{number\}/);
  assert.match(page, /Os personagens estao chegando na casa/);
  assert.match(page, /Ao escolher um corte, voce pode escolher a abordagem/);
  assert.match(page, /Todos os lados/);
  assert.match(page, /Engraçado/);
  assert.match(page, /Conflituoso/);
  assert.match(page, /const FEED_REFRESH_MS = 3500/);
  assert.match(page, /atualização automática ativa/);
  assert.doesNotMatch(page, /Maior potencial|>potencial</i);
  assert.match(page, /Quem deve sair\?/);
  assert.match(page, /Quem deve vencer\?/);
  assert.match(page, /activeParticipants\.length === 3/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.computer-shell \.feed-entry > div:not\(\.feed-line\)/);
  assert.match(css, /transparent 0 7px,\s*rgba\(0, 0, 0, \.07\) 8px,\s*transparent 9px/);
  assert.match(css, /transform:\s*scale\(1\.35\)/);
  assert.match(page, /event-grid-approach/);
  assert.match(page, /data-category=\{event\.category\}/);
  assert.match(page, /arraste ou clique para adicionar/);
  assert.match(page, /ACONTECIMENTO IMPORTANTE/);
  assert.match(page, /Abrir acontecimento/);
  assert.match(page, /Sequência do acontecimento/);
  assert.match(page, /Momentos registrados:/);
  assert.match(page, /openImportantBeats\.map/);
  assert.match(page, /Cause: "Causa"/);
  assert.match(page, /Confrontation: "Confronto"/);
  assert.match(page, /kind: "important"/);
  assert.match(page, /kind: "secondary"/);
  assert.match(css, /\.computer-shell \.event-grid\.event-grid-approach/);
  assert.match(css, /border-left:\s*4px solid var\(--event-accent\)/);
  assert.match(css, /\.computer-shell \.feed-entry\.important-feed-card/);
  assert.match(css, /\.computer-shell \.important-event-window/);
  assert.doesNotMatch(css, /grid-template-columns:\s*58px 0 minmax\(0,\s*1fr\) 26px/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("the player can restart from Week 1 and the development inspector stays hidden by default", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /function restartSeason\(\)/);
  assert.match(page, /engineControls\.resetSeason\(\)/);
  assert.match(page, /window\.localStorage\.removeItem\(UI_SAVE_KEY\)/);
  assert.match(page, /Recomeçar da Semana 1/);
  assert.match(page, /onClick=\{restartSeason\}/);
  assert.match(page, /NEXT_PUBLIC_SHOW_GAME_INSPECTOR === "true"/);
  assert.match(css, /\.restart-game-button/);
  assert.match(css, /\.restart-confirm-dialog/);
});

test("Week 1 generates one deterministic five-beat Rumor Chain", () => {
  const secondaryEvents = [{
    id: "secondary-1",
    title: "Secondary",
    category: "Convivência",
    duration: 4,
    heat: 50,
    description: "Unchanged secondary event.",
  }];
  const input = {
    weekNumber: 1,
    seed: "week-one-test-seed",
    participants: eventGenerationParticipants,
    secondaryEvents,
    relationships: [
      { participantIds: ["compatible", "social"], compatibility: 4 },
      { participantIds: ["compatible", "explosive"], compatibility: 4 },
    ],
  };

  const first = generateWeekEvents(input);
  const second = generateWeekEvents(input);

  assert.equal(importantEventGenerationConfig.maxImportantEventChainsPerWeek, 1);
  assert.equal(first.importantEventChains.length, 1);
  assert.equal(first.importantEventBeats.length, 5);
  assert.deepEqual(first, second);
  assert.strictEqual(first.secondaryEvents, secondaryEvents);

  const chain = first.importantEventChains[0];
  assert.equal(chain.weekNumber, 1);
  assert.equal(chain.title, "A fofoca sobre a prova");
  assert.equal(chain.status, "scheduled");
  assert.deepEqual(chain.beatIds, first.importantEventBeats.map((beat) => beat.id));
  assert.deepEqual(first.importantEventBeats.map((beat) => beat.order), [1, 2, 3, 4, 5]);
  assert.deepEqual(
    first.importantEventBeats.map((beat) => beat.role),
    ["Cause", "Rumor", "Discovery", "Confrontation", "Reaction"],
  );
  assert.ok(first.importantEventBeats.every((beat) => beat.chainId === chain.id));
  assert.ok(first.importantEventBeats.every((beat) => beat.location.length > 0));
});

test("Rumor Chain participant roles prefer existing traits and compatible relationships", () => {
  const selected = selectRumorChainParticipants(
    eventGenerationParticipants,
    "week-one-test-seed",
    [
      { participantIds: ["compatible", "social"], compatibility: 4 },
      { participantIds: ["compatible", "explosive"], compatibility: 4 },
    ],
  );

  assert.equal(selected.participantC.id, "social");
  assert.equal(selected.participantB.id, "explosive");
  assert.equal(selected.participantA.id, "compatible");
});

test("source contains the complete Important Event internal editing workflow", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const models = await readFile(new URL("../app/event-models.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /important-footage-card/);
  assert.match(page, /Editar acontecimento/);
  assert.match(page, /Editor interno de acontecimento/);
  assert.match(page, /editingImportantBeats\.map/);
  assert.match(page, /toggleImportantBeat/);
  assert.match(page, /moveImportantBeat/);
  assert.match(page, /Leitura da edição/);
  assert.match(page, /Favorecido pela edição/);
  assert.match(page, /Prejudicado pela edição/);
  assert.match(page, /Construção detectada/);
  assert.match(page, /Contexto omitido/);
  assert.match(page, /Resumo da versão/);
  assert.match(page, /withAutomaticImportantAnalysis/);
  assert.doesNotMatch(page, /Enquadramento Editorial/);
  assert.doesNotMatch(page, /Foco na Reação/);
  assert.doesNotMatch(page, /participantFocusId/);
  assert.doesNotMatch(page, /importantEventFramingOptions/);
  assert.match(page, /kind: "important-event"/);
  assert.match(page, /current\.some\(\(item\) => item\.id === timelineId\)/);
  assert.match(page, /current\.map\(\(item\) => item\.id === timelineId \? timelineItem : item\)/);
  assert.match(page, /Momentos utilizados:/);
  assert.match(models, /selectedBeatIds: string\[\]/);
  assert.match(models, /excludedBeatIds: string\[\]/);
  assert.match(models, /televisedOrder: string\[\]/);
  assert.match(models, /mainFocusParticipantIds: string\[\]/);
  assert.match(models, /favoredParticipantIds: string\[\]/);
  assert.match(models, /harmedParticipantIds: string\[\]/);
  assert.match(models, /detectedEditorialConstruction: ImportantEventEditorialConstruction/);
  assert.match(models, /missingContextDescription: string/);
  assert.match(models, /versionSummary: string/);
  assert.match(models, /finalDurationSeconds: number/);
  assert.match(css, /\.computer-shell \.important-internal-editor/);
  assert.match(css, /\.computer-shell \.timeline-important-event/);
  assert.match(css, /\.computer-shell \.important-narrative-reading/);
});

test("automatic narrative analysis reacts to omissions and televised order", () => {
  const generated = generateWeekEvents({
    weekNumber: 1,
    seed: "automatic-analysis-seed",
    participants: eventGenerationParticipants,
    secondaryEvents: [],
  });
  const beats = generated.importantEventBeats;
  const participantIdsByRole = Object.fromEntries(beats.map((beat) => [beat.role, beat.participantIds]));
  const allBeatIds = beats.map((beat) => beat.id);

  const complete = analyzeImportantEventEdit({
    beats,
    participants: eventGenerationParticipants,
    selectedBeatIds: allBeatIds,
    televisedOrder: allBeatIds,
  });
  assert.equal(complete.detectedEditorialConstruction, "full_context");
  assert.equal(complete.missingContextDescription, "Nenhum contexto essencial foi omitido.");

  const reactionCutIds = beats
    .filter((beat) => beat.role === "Discovery" || beat.role === "Confrontation")
    .map((beat) => beat.id);
  const reactionCut = analyzeImportantEventEdit({
    beats,
    participants: eventGenerationParticipants,
    selectedBeatIds: reactionCutIds,
    televisedOrder: reactionCutIds,
  });
  const confrontationTargetId = participantIdsByRole.Cause[1];
  const originalCommenterId = participantIdsByRole.Cause[0];
  assert.equal(reactionCut.detectedEditorialConstruction, "reaction_without_context");
  assert.deepEqual(reactionCut.mainFocusParticipantIds, [confrontationTargetId]);
  assert.ok(reactionCut.harmedParticipantIds.includes(confrontationTargetId));
  assert.ok(reactionCut.favoredParticipantIds.includes(originalCommenterId));
  assert.match(reactionCut.missingContextDescription, /comentário inicial/i);
  assert.match(reactionCut.versionSummary, /menos justificativa visível/i);

  const delayedCauseOrder = [allBeatIds[3], allBeatIds[0], allBeatIds[1], allBeatIds[2], allBeatIds[4]];
  const delayedCause = analyzeImportantEventEdit({
    beats,
    participants: eventGenerationParticipants,
    selectedBeatIds: allBeatIds,
    televisedOrder: delayedCauseOrder,
  });
  assert.equal(delayedCause.detectedEditorialConstruction, "reaction_without_context");
  assert.match(delayedCause.missingContextDescription, /somente depois/i);

  const withoutConsequenceIds = allBeatIds.slice(0, -1);
  const withoutConsequence = analyzeImportantEventEdit({
    beats,
    participants: eventGenerationParticipants,
    selectedBeatIds: withoutConsequenceIds,
    televisedOrder: withoutConsequenceIds,
  });
  assert.match(withoutConsequence.missingContextDescription, /reação posterior/i);
  assert.match(withoutConsequence.versionSummary, /menos grave/i);
});
