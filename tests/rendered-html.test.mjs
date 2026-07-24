import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
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
  assert.match(css, /\.computer-shell \.event-grid\.event-grid-approach/);
  assert.match(css, /border-left:\s*4px solid var\(--event-accent\)/);
  assert.doesNotMatch(css, /grid-template-columns:\s*58px 0 minmax\(0,\s*1fr\) 26px/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
