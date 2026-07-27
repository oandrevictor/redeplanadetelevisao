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
  const latestAudienceRecord = (state.broadcasts ?? [])
    .filter((record) => record.detailLevel === "clustered" && record.result)
    .at(-1);
  const latestAudienceResult = latestAudienceRecord?.result;
  const pendingAudienceVote = state.audienceModel?.pendingVote ?? null;
  const audienceConservation = (latestAudienceResult?.clusterResults ?? []).map((cluster) => {
    const clusterState = state.audienceModel?.clusters?.[cluster.clusterId];
    const favoriteShareTotal = Object.values(clusterState?.favoriteShares ?? {})
      .reduce((total, share) => total + (Number.isFinite(share) ? share : 0), 0);
    const unalignedShare = clusterState?.unalignedShare ?? 0;
    const checkpointViewers = (latestAudienceResult?.checkpoints ?? [])
      .map((checkpoint) => checkpoint.clusterViewers?.[cluster.clusterId] ?? 0);
    const peakLiveHouseholds = checkpointViewers.length > 0 ? Math.max(...checkpointViewers) : 0;
    const conservedFavoriteShare = favoriteShareTotal + unalignedShare;
    const boundedHouseholdValues = [
      cluster.startHouseholds,
      cluster.averageHouseholds,
      cluster.completionHouseholds,
      cluster.uniqueReachHouseholds,
      cluster.digitalReachHouseholds,
      ...checkpointViewers,
    ];

    return {
      clusterId: cluster.clusterId,
      populationHouseholds: cluster.populationHouseholds,
      startHouseholds: cluster.startHouseholds,
      completionHouseholds: cluster.completionHouseholds,
      uniqueReachHouseholds: cluster.uniqueReachHouseholds,
      digitalReachHouseholds: cluster.digitalReachHouseholds,
      peakLiveHouseholds,
      populationHeadroomAtPeak: cluster.populationHouseholds - peakLiveHouseholds,
      householdPoolsWithinPopulation: boundedHouseholdValues.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= cluster.populationHouseholds + 1,
      ),
      favoriteShareTotal,
      unalignedShare,
      favoriteShareConservation: conservedFavoriteShare,
      favoriteSharesConserved: Math.abs(conservedFavoriteShare - 1) < 0.000001,
    };
  });
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

  function exportAudienceReport() {
    if (!latestAudienceRecord || !latestAudienceResult) return;
    const payload = {
      schemaVersion: state.schemaVersion,
      seasonId: state.seasonId,
      engine: {
        mode: state.audienceModel?.mode ?? "legacy",
        tuningVersion: state.audienceModel?.tuningVersion ?? null,
      },
      market: state.audienceModel?.market ?? null,
      broadcast: {
        week: latestAudienceRecord.week,
        detailLevel: latestAudienceRecord.detailLevel,
        episode: latestAudienceRecord.episode ?? null,
      },
      result: latestAudienceResult,
      conservation: audienceConservation,
      pendingVote: pendingAudienceVote,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeEpisodeId = latestAudienceResult.episodeId.replace(/[^a-z0-9_-]+/gi, "-");
    anchor.href = url;
    anchor.download = `${state.seasonId}-${safeEpisodeId}-audience.json`;
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
        <section>
          <h3>Audiência (dados brutos)</h3>
          <p>
            Modo: {state.audienceModel?.mode ?? "indisponível"} · tuning{" "}
            <code>{state.audienceModel?.tuningVersion ?? "indisponível"}</code>
          </p>
          {latestAudienceResult ? (
            <>
              <p>Último relatório clustered: <code>{latestAudienceResult.episodeId}</code></p>
              <button onClick={exportAudienceReport} type="button">
                Exportar relatório de audiência JSON
              </button>
              <details>
                <summary>Choques persistidos</summary>
                <pre aria-label="Choques aleatórios persistidos do último relatório" tabIndex={0}>
                  {JSON.stringify(latestAudienceResult.shocks ?? null, null, 2)}
                </pre>
              </details>
              <details>
                <summary>Contribuições de fatores</summary>
                <pre aria-label="Contribuições de fatores do último relatório" tabIndex={0}>
                  {JSON.stringify(latestAudienceResult.factorContributions ?? [], null, 2)}
                </pre>
              </details>
              <details>
                <summary>Conservação por coorte</summary>
                <pre aria-label="Reconciliação de população e favoritos por coorte" tabIndex={0}>
                  {JSON.stringify(audienceConservation, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <>
              <p>Nenhum relatório clustered persistido.</p>
              <button disabled type="button">Exportar relatório de audiência JSON</button>
            </>
          )}
          <details>
            <summary>Voto pendente</summary>
            {pendingAudienceVote ? (
              <pre aria-label="Dados brutos do voto de audiência pendente" tabIndex={0}>
                {JSON.stringify(pendingAudienceVote, null, 2)}
              </pre>
            ) : (
              <p>Nenhum voto de audiência pendente.</p>
            )}
          </details>
        </section>
      </div>
    </details>
  );
}
