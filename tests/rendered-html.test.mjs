import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  generateWeekEvents,
  importantEventGenerationConfig,
  selectRumorChainParticipants,
} from "../app/important-event-generation.ts";
import {
  IMPORTANT_EVENT_MAX_DURATION_SECONDS,
  IMPORTANT_EVENT_MIN_MOMENTS,
  analyzeImportantEventEdit,
  validateImportantEventVersion,
} from "../app/important-event-analysis.ts";

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
  assert.match(page, /Banco de acontecimentos/);
  assert.match(page, /LEITURA EDITORIAL/);
  assert.match(page, /FECHAR CORTE E TRANSMITIR/);
  assert.match(page, /const FEED_REFRESH_MS = 3500/);
  assert.match(page, /Atualização automática ativa/);
  assert.doesNotMatch(page, /Maior potencial|>potencial</i);
  assert.match(page, /CLOSE_AUDIENCE_VOTE/);
  assert.match(page, /CLOSE_FINAL_VOTE/);
  assert.match(page, /Consolidando o painel…/);
  assert.match(page, /Os votos de todas as coortes foram consolidados/);
  assert.match(page, /activeParticipants\.length === 3/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.computer-shell \.feed-entry > div:not\(\.feed-line\)/);
  assert.match(css, /transparent 0 7px,\s*rgba\(0, 0, 0, \.07\) 8px,\s*transparent 9px/);
  assert.match(css, /transform:\s*scale\(1\.35\)/);
  assert.match(page, /data-category=\{event\.category\}/);
  assert.match(page, /\+ ADICIONAR/);
  assert.match(page, /ACONTECIMENTO IMPORTANTE/);
  assert.match(page, /ABRIR ACONTECIMENTO/);
  assert.match(page, /Sequência do acontecimento/);
  assert.match(page, /weekOneImportantEventBeats\.length\} momentos/);
  assert.match(page, /openImportantBeats\.map/);
  assert.match(page, /Cause: "Causa"/);
  assert.match(page, /Confrontation: "Confronto"/);
  assert.match(page, /kind: "important"/);
  assert.match(page, /kind: "secondary"/);
  assert.match(css, /\.computer-shell \.editor-workspace/);
  assert.match(css, /border-left:\s*4px solid var\(--event-accent\)/);
  assert.match(css, /\.computer-shell \.feed-entry\.important-feed-card/);
  assert.match(css, /\.computer-shell \.important-event-window/);
  assert.doesNotMatch(css, /grid-template-columns:\s*58px 0 minmax\(0,\s*1fr\) 26px/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("the camera Feed exposes automatic sync, filters, selection and contextual details", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const feedSource = page.slice(page.indexOf("function renderFeed()"), page.indexOf("function renderChallenge()"));

  assert.match(feedSource, /FEED DAS CÂMERAS/);
  assert.match(feedSource, /SINAL AO VIVO/);
  assert.match(feedSource, /Atualização automática ativa/);
  assert.match(feedSource, /Feed sincronizado/);
  assert.match(feedSource, /próximo registro em/);
  assert.doesNotMatch(feedSource, /Atualizar feed/);
  assert.match(feedSource, /4 de 8 câmeras/);
  assert.match(feedSource, /\["all", "TODOS"/);
  assert.match(feedSource, /\["important", "IMPORTANTES"/);
  assert.match(feedSource, /\["unseen", "NÃO VISTOS"/);
  assert.match(feedSource, /selectFeedItem/);
  assert.match(feedSource, /aria-selected=\{isSelected\}/);
  assert.match(feedSource, /LEITURA DO ACONTECIMENTO/);
  assert.match(feedSource, /POR QUE MERECE ATENÇÃO/);
  assert.match(feedSource, /selectedItem\.kind === "important"/);
  assert.match(feedSource, /ABRIR ACONTECIMENTO/);
  assert.doesNotMatch(feedSource, /CRONOLOGIA|ORDEM CRONOLÓGICA|Sequência do acontecimento/);
  assert.match(feedSource, /Ir para edição do episódio/);
  assert.doesNotMatch(feedSource, /Avançar 2 dias e editar episódio/);
  assert.doesNotMatch(feedSource, /Registro secundário · sem micro-história editável/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 64fr\) minmax\(260px, 36fr\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.computer-shell \.feed-workspace \{\s*grid-template-columns: 1fr;/);
  assert.match(css, /\.computer-shell \.feed-entry\.important-feed-card[\s\S]*?border-left:\s*5px solid #a6382e/);
  assert.match(css, /\.computer-shell \.feed-entry:focus-visible/);
});

test("PLIN can be dismissed and reopens when its message changes", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /dismissedGuideMessage/);
  assert.match(page, /guideVisible = dismissedGuideMessage !== currentGuideMessage/);
  assert.match(page, /aria-label="Fechar assistente"/);
  assert.match(page, /setDismissedGuideMessage\(currentGuideMessage\)/);
  assert.match(css, /\.computer-shell \.guide-close/);
  assert.match(css, /\.computer-shell \.feed-entry \.feed-category,[\s\S]*?color:\s*#fff/);
  assert.match(css, /\.computer-shell \.feed-footer > \.button[\s\S]*?margin-left:\s*12px/);
  assert.match(css, /\.computer-shell \.app-feed \.window-content \{\s*overflow:\s*hidden/);
  assert.match(css, /grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto/);
});

test("Edição uses the approved timeline, bank and persistent cut-state workspace", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const analysis = await readFile(new URL("../app/editor-analysis.ts", import.meta.url), "utf8");
  const editorSource = page.slice(page.indexOf("function renderEditor()"), page.indexOf("function renderMail()"));

  assert.match(analysis, /minMinutes:\s*38/);
  assert.match(analysis, /maxMinutes:\s*46/);
  assert.match(analysis, /commercialBreaks:\s*4/);
  assert.match(analysis, /commercialBreakMinutes:\s*4/);
  assert.match(analysis, /classifyDuration/);
  assert.match(analysis, /classifyRhythm/);
  assert.match(analysis, /classifyVariety/);
  assert.match(analysis, /classifyFocus/);
  assert.match(analysis, /buildEditorialAlerts/);
  assert.match(analysis, /firstEmptyProgramZoneIndex/);
  assert.match(analysis, /item\.kind === "ad" \|\| item\.id !== id/);

  assert.match(editorSource, /editor-workspace/);
  assert.match(editorSource, /timeline-drop-zone/);
  assert.match(editorSource, /timeline-ad-copy/);
  assert.match(editorSource, /item\.kind !== "ad"/);
  assert.match(editorSource, /heading-current-duration/);
  assert.match(editorSource, /FAIXA IDEAL/);
  assert.match(editorSource, /duration-range-scale/);
  assert.match(editorSource, /duration-current-label/);
  assert.match(analysis, /Episódio longo: a duração acima da faixa pode cansar a audiência/);
  assert.match(analysis, /Episódio curto: a duração abaixo da faixa pode afetar a recepção do público/);
  assert.match(editorSource, /important-card-footer/);
  assert.match(editorSource, /event-bank-content/);
  assert.match(editorSource, /<div className="event-grid">[\s\S]*?showImportantFootage[\s\S]*?important-footage-card/);
  assert.doesNotMatch(editorSource, /important-footage-feature/);
  assert.match(editorSource, /event-card-labels/);
  assert.match(editorSource, /<span>\{event\.category\}<\/span>/);
  assert.match(editorSource, /<b>BLOCO \{blockIndex \+ 1\}<\/b>/);
  assert.match(editorSource, /emptyProgramZones\.has\(0\) && dropZone\(0, 0\)/);
  assert.match(editorSource, /item\.kind === "ad" && emptyProgramZones\.has\(followingBlockIndex\)/);
  assert.match(editorSource, /editorialMessages\.map/);
  assert.match(editorSource, /event\.description/);
  assert.match(editorSource, /event-card-participants/);
  assert.match(editorSource, /required-badge/);
  assert.match(editorSource, /OBRIGATÓRIOS/);
  assert.match(editorSource, /locateRequiredEvent/);
  assert.match(editorSource, /Ritmo/);
  assert.match(editorSource, /Variedade/);
  assert.match(editorSource, /Foco/);
  assert.match(editorSource, /FECHAR CORTE E TRANSMITIR/);
  assert.match(editorSource, /const transmissionBlocked = eventCount < 2 \|\| missingRequiredEvents\.length > 0/);
  assert.match(editorSource, /disabled=\{transmissionBlocked\}/);
  assert.match(editorSource, /Inclua pelo menos dois acontecimentos/);
  assert.match(editorSource, /Inclua todos os cortes obrigatórios/);
  assert.match(editorSource, /Pronto para transmitir/);
  assert.match(editorSource, /!importantBlockInTimeline/);
  assert.match(editorSource, /audience-forecast-card/);
  assert.match(editorSource, /PREVISÃO DE AUDIÊNCIA/);
  assert.match(editorSource, /ENQUADRAMENTO DO CORTE/);
  assert.match(editorSource, /Perspectiva/);
  assert.match(editorSource, /RISCO DE FADIGA \/ RETORNO/);
  assert.match(page, /const liveAudience = currentCheckpoint\?\.rating \?\? storedResult\?\.forecast\.expected \?\? predictedAudience/);

  assert.match(css, /grid-template-columns:\s*minmax\(0, 81fr\) minmax\(200px, 19fr\)/);
  assert.match(css, /\.computer-shell \.timeline-track \.timeline-ad[\s\S]*?flex:\s*0 0 68px/);
  assert.match(css, /\.computer-shell \.timeline-track \.timeline-ad[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.timeline-ad-copy b[\s\S]*?font:\s*700 8px/);
  assert.match(css, /\.timeline-ad-copy strong[\s\S]*?font:\s*700 15px/);
  assert.match(css, /\.timeline-ad \.timeline-controls[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.timeline-ad \.timeline-controls button[\s\S]*?height:\s*24px/);
  assert.match(css, /grid-auto-rows:\s*148px/);
  assert.match(css, /\.computer-shell \.important-card-footer > button[\s\S]*?position:\s*static/);
  assert.match(css, /\.computer-shell \.important-card-footer > button[\s\S]*?background:\s*var\(--chrome\)/);
  assert.match(css, /Consolidated Edição layout[\s\S]*?grid-template-rows:\s*175px minmax\(0, 1fr\)/);
  assert.equal((css.match(/Consolidated Edição layout/g) ?? []).length, 1);
  assert.doesNotMatch(css, /Final desktop proportions|Final consistency pass|Mockup-alignment corrections/);
  assert.match(css, /\.computer-shell \.timeline-drop-zone[\s\S]*?flex:\s*1 1 80px[\s\S]*?min-width:\s*72px/);
  assert.match(css, /\.computer-shell \.has-editorial-items \.timeline-drop-zone[\s\S]*?flex:\s*0 0 34px/);
  assert.doesNotMatch(css, /\.has-editorial-items \.timeline-drop-zone\s*\{[^}]*min-width:\s*12px/s);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fill, minmax\(205px, 1fr\)\)/);
  assert.match(css, /\.event-card-labels > span[\s\S]*?flex:\s*0 0 auto[\s\S]*?text-overflow:\s*clip[\s\S]*?white-space:\s*nowrap/);
  assert.doesNotMatch(css, /\.important-footage-card\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.doesNotMatch(css, /\.important-footage-feature/);
  assert.match(css, /\.editor-transmit-area \.button:disabled[\s\S]*?cursor:\s*not-allowed/);
  assert.match(css, /\.computer-shell \.duration-current-label\.is-high[\s\S]*?translateX\(-100%\)/);
  assert.match(css, /\.computer-shell \.app-edit \.window-content \{\s*overflow:\s*hidden/);
  assert.match(css, /\.computer-shell \.event-bank \.event-grid[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.computer-shell \.editor-workspace[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /@media \(min-width: 901px\)[\s\S]*?\.computer-shell:has\(\.app-edit\) \.guide-bubble/);
  assert.match(css, /\.computer-shell:has\(\.app-edit\) \.guide-bubble \{[\s\S]*?right:\s*8px;[\s\S]*?left:\s*auto/);
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
  assert.match(page, /importantCardEdit\.status === "not_edited" \? "EDITAR" : "REABRIR"/);
  assert.match(page, /Editor interno de acontecimento/);
  assert.match(page, /includedImportantBeats\.map/);
  assert.match(page, /excludedImportantBeats\.map/);
  assert.match(page, /toggleImportantBeat/);
  assert.match(page, /moveImportantBeat/);
  assert.match(page, /reorderImportantBeat/);
  assert.match(page, /draggable/);
  assert.match(page, /VERSÃO EXIBIDA/);
  assert.match(page, /NO CORTE/);
  assert.match(page, /FORA DO CORTE/);
  assert.match(page, /Leitura provável do público/);
  assert.match(page, /Favorecido pela edição/);
  assert.match(page, /Prejudicado pela edição/);
  assert.match(page, /LEITURA ATUAL/);
  assert.match(page, /Contexto que não chega ao público/);
  assert.match(page, /MUDOU AGORA/);
  assert.match(page, /Rascunho salvo automaticamente/);
  assert.match(page, /Salvar rascunho e fechar/);
  assert.match(page, /disabled=\{!importantVersionValidation\?\.canSaveToTimeline\}/);
  assert.match(page, /withAutomaticImportantAnalysis/);
  assert.doesNotMatch(page, /Enquadramento Editorial/);
  assert.doesNotMatch(page, /Foco na Reação/);
  assert.doesNotMatch(page, /participantFocusId/);
  assert.doesNotMatch(page, /importantEventFramingOptions/);
  assert.match(page, /kind: "important-event"/);
  assert.match(page, /current\.some\(\(item\) => item\.id === timelineId\)/);
  assert.match(page, /current\.map\(\(item\) => item\.id === timelineId \? timelineItem : item\)/);
  assert.match(page, /selectedBeatIds\.length\} MOMENTOS/);
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
  assert.match(css, /\.computer-shell \.important-version-track/);
  assert.match(css, /@keyframes important-reading-pulse/);
  assert.match(css, /\.important-internal-body[\s\S]*?overflow:\s*auto/);
  assert.match(css, /\.important-editor-story p[\s\S]*?font:\s*14px\/1\.42/);
  assert.match(css, /\.important-version-track[\s\S]*?min-height:\s*104px/);
  assert.match(css, /\.important-edit-beat-list > li[\s\S]*?min-height:\s*126px/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(360px, 400px\)/);
  assert.match(css, /\.important-internal-footer button[\s\S]*?min-width:\s*170px/);
});

test("Important Event timeline validation enforces two moments and the rigid 03:00 limit", () => {
  assert.equal(IMPORTANT_EVENT_MIN_MOMENTS, 2);
  assert.equal(IMPORTANT_EVENT_MAX_DURATION_SECONDS, 180);

  assert.equal(validateImportantEventVersion(0, 0).canSaveToTimeline, false);
  assert.match(validateImportantEventVersion(1, 120).reason, /pelo menos 2 momentos/i);
  assert.equal(validateImportantEventVersion(2, 179).canSaveToTimeline, true);
  assert.equal(validateImportantEventVersion(2, 180).canSaveToTimeline, true);
  assert.equal(validateImportantEventVersion(2, 180).durationState, "limit");
  assert.equal(validateImportantEventVersion(2, 181).canSaveToTimeline, false);
  assert.equal(validateImportantEventVersion(2, 181).exceededSeconds, 1);
  assert.match(validateImportantEventVersion(2, 181).reason, /0:01/);
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
