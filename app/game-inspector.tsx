"use client";

import type { MutableRefObject } from "react";
import { inspectCandidates } from "@/game/debug";
import type { GameCommand } from "@/game/commands";
import type { GameState } from "@/game/types";

export function GameInspector({
  state,
  actionLog,
}: {
  state: GameState;
  actionLog: MutableRefObject<GameCommand[]>;
}) {
  if (process.env.NODE_ENV === "production") return null;
  const candidates = inspectCandidates(state);
  const latestEvent = state.house.eventHistory.at(-1);
  const relationships = Object.values(state.relationships)
    .sort((left, right) => right.trust + right.affinity - left.trust - left.affinity)
    .slice(0, 8);

  function exportLog() {
    const blob = new Blob([JSON.stringify(actionLog.current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.seasonId}-actions.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <details className="game-inspector">
      <summary>ENGINE INSPECTOR</summary>
      <div className="inspector-grid">
        <section>
          <h3>Estado</h3>
          <p>Seed: <code>{state.rng.seed}</code></p>
          <p>RNG: {state.rng.counter} · revisão {state.revision}</p>
          <p>Semana {state.clock.week} · {state.clock.window} · tick {state.clock.tick}</p>
          <button onClick={exportLog} type="button">Exportar action log</button>
        </section>
        <section>
          <h3>Relações mais fortes</h3>
          {relationships.map((relationship) => (
            <p key={`${relationship.fromId}>${relationship.toId}`}>
              {relationship.fromId} → {relationship.toId}: confiança {relationship.trust}, afinidade {relationship.affinity}
            </p>
          ))}
        </section>
        <section>
          <h3>Narrativa</h3>
          <p>Alianças: {Object.values(state.alliances).filter((alliance) => alliance.status === "active").length}</p>
          <p>Threads abertas: {Object.values(state.narrative.threads).filter((thread) => thread.status === "open").length}</p>
          <p>Eventos: {state.house.eventHistory.length}</p>
          {latestEvent && <pre>{JSON.stringify({ chosen: latestEvent.templateId, scores: latestEvent.scoreBreakdown, effects: latestEvent.effects }, null, 2)}</pre>}
        </section>
        <section>
          <h3>Candidatos</h3>
          <p>{candidates.filter((candidate) => candidate.accepted).length} aceitos · {candidates.filter((candidate) => !candidate.accepted).length} rejeitados</p>
          <pre>{JSON.stringify(candidates.slice(0, 12), null, 2)}</pre>
        </section>
      </div>
    </details>
  );
}
