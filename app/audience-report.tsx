"use client";

import { useId, useState } from "react";
import { AUDIENCE_CLUSTERS, AUDIENCE_INTERESTS } from "@/game/audience/catalog";
import { castById } from "@/game/content/cast";
import type {
  AudienceClusterDefinition,
  AudienceEpisodeResult,
  AudienceFactorContribution,
  AudienceInterest,
  AudienceVoteResult,
  BroadcastRecord,
  ClusterEpisodeResult,
  EpisodeKind,
  GameState,
  ParticipantFanDelta,
} from "@/game/types";

type AudienceReportProps = {
  state: GameState;
};

type SliceDimension = "age" | "gender" | "region" | "household" | "access_platform" | "interest";

type SliceCategory = {
  key: string;
  label: string;
  group?: string;
  weight: (cluster: AudienceClusterDefinition) => number;
};

type WeightedSliceResult = {
  key: string;
  label: string;
  group?: string;
  basisHouseholds: number;
  startHouseholds: number;
  completionHouseholds: number;
  uniqueReachHouseholds: number;
  digitalReachHouseholds: number;
  satisfaction: number;
  returnIntentBefore: number;
  returnIntentAfter: number;
};

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const compactNumberFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const impactFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});

const episodeKindLabels: Record<EpisodeKind, string> = {
  premiere: "Estreia",
  challenge: "Prova",
  vote: "Votação",
  elimination: "Eliminação",
  final: "Final",
};

const interestLabels: Record<AudienceInterest, string> = {
  strategy: "Estratégia",
  competition: "Competição",
  conflict: "Conflito",
  humor: "Humor",
  relationships: "Relacionamentos",
  vulnerability: "Vulnerabilidade",
  fairness: "Justiça",
  authenticity: "Autenticidade",
  redemption: "Redenção",
  spectacle: "Espetáculo",
  representation: "Representação",
};

const sliceDimensionLabels: Record<SliceDimension, string> = {
  age: "Faixa etária",
  gender: "Composição de gênero",
  region: "Macrorregião",
  household: "Tipo de domicílio",
  access_platform: "Acesso e plataforma",
  interest: "Afinidade de interesse",
};

const sliceCategories: Record<SliceDimension, readonly SliceCategory[]> = {
  age: [
    { key: "16_24", label: "16–24", weight: (cluster) => cluster.demographics.age["16_24"] },
    { key: "25_34", label: "25–34", weight: (cluster) => cluster.demographics.age["25_34"] },
    { key: "35_49", label: "35–49", weight: (cluster) => cluster.demographics.age["35_49"] },
    { key: "50_64", label: "50–64", weight: (cluster) => cluster.demographics.age["50_64"] },
    { key: "65_plus", label: "65+", weight: (cluster) => cluster.demographics.age["65_plus"] },
  ],
  gender: [
    { key: "women", label: "Mulheres", weight: (cluster) => cluster.demographics.gender.women },
    { key: "men", label: "Homens", weight: (cluster) => cluster.demographics.gender.men },
    {
      key: "nonbinary_other",
      label: "Não binário/outras identidades",
      weight: (cluster) => cluster.demographics.gender.nonbinary_other,
    },
    {
      key: "undeclared",
      label: "Não declarado",
      weight: (cluster) => cluster.demographics.gender.undeclared,
    },
  ],
  region: [
    { key: "north", label: "Norte", weight: (cluster) => cluster.demographics.region.north },
    {
      key: "northeast",
      label: "Nordeste",
      weight: (cluster) => cluster.demographics.region.northeast,
    },
    {
      key: "center_west",
      label: "Centro-Oeste",
      weight: (cluster) => cluster.demographics.region.center_west,
    },
    {
      key: "southeast",
      label: "Sudeste",
      weight: (cluster) => cluster.demographics.region.southeast,
    },
    { key: "south", label: "Sul", weight: (cluster) => cluster.demographics.region.south },
  ],
  household: [
    {
      key: "solo_shared",
      label: "Individual ou compartilhado",
      weight: (cluster) => cluster.demographics.household.solo_shared,
    },
    { key: "couple", label: "Casal", weight: (cluster) => cluster.demographics.household.couple },
    {
      key: "with_children",
      label: "Com crianças",
      weight: (cluster) => cluster.demographics.household.with_children,
    },
    {
      key: "multigenerational",
      label: "Multigeracional",
      weight: (cluster) => cluster.demographics.household.multigenerational,
    },
  ],
  access_platform: [
    {
      key: "access_connected",
      label: "Conectado",
      group: "Acesso",
      weight: (cluster) => cluster.demographics.access.connected,
    },
    {
      key: "access_mixed",
      label: "Misto",
      group: "Acesso",
      weight: (cluster) => cluster.demographics.access.mixed,
    },
    {
      key: "access_broadcast_first",
      label: "TV aberta primeiro",
      group: "Acesso",
      weight: (cluster) => cluster.demographics.access.broadcast_first,
    },
    {
      key: "platform_linear",
      label: "TV linear",
      group: "Preferência de plataforma",
      weight: (cluster) => cluster.demographics.platform.linear,
    },
    {
      key: "platform_connected_tv",
      label: "TV conectada",
      group: "Preferência de plataforma",
      weight: (cluster) => cluster.demographics.platform.connected_tv,
    },
    {
      key: "platform_catch_up",
      label: "Catch-up",
      group: "Preferência de plataforma",
      weight: (cluster) => cluster.demographics.platform.catch_up,
    },
    {
      key: "platform_mobile_clips",
      label: "Mobile e clipes",
      group: "Preferência de plataforma",
      weight: (cluster) => cluster.demographics.platform.mobile_clips,
    },
  ],
  interest: AUDIENCE_INTERESTS.map((interest) => ({
    key: interest,
    label: interestLabels[interest],
    weight: (cluster) => cluster.interests[interest],
  })),
};

const clusterLabels: Record<string, string> = {
  reality_superfans: "Superfãs de reality",
  prime_time_habitual_viewers: "Público habitual do horário nobre",
  primetime_habitual_viewers: "Público habitual do horário nobre",
  family_co_viewers: "Famílias que assistem juntas",
  strategy_analysts: "Analistas de estratégia",
  competition_fans: "Fãs de competição",
  conflict_seekers: "Público atraído por conflitos",
  humor_and_clip_seekers: "Público de humor e clipes",
  humor_clip_seekers: "Público de humor e clipes",
  human_story_viewers: "Público de histórias humanas",
  relationship_story_viewers: "Público de histórias de relacionamento",
  fairness_and_authenticity_watchdogs: "Observadores de justiça e autenticidade",
  fairness_authenticity_watchdogs: "Observadores de justiça e autenticidade",
  young_mobile_voters: "Jovens votantes mobile",
  urban_trend_followers: "Seguidores de tendências urbanas",
  regional_representation_viewers: "Público de representação regional",
  older_broadcast_loyalists: "Público fiel à TV aberta",
  casual_event_viewers: "Público casual de grandes eventos",
  lapsed_finale_only_viewers: "Público afastado e de finais",
  lapsed_finale_only: "Público afastado e de finais",
};

function normalizeClusterId(clusterId: string) {
  return clusterId
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/^cluster[_-]/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clusterName(clusterId: string) {
  const normalized = normalizeClusterId(clusterId);
  const knownName = clusterLabels[normalized];
  if (knownName) return knownName;
  return normalized
    .split("_")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toLocaleUpperCase("pt-BR")}${word.slice(1)}`)
    .join(" ");
}

function participantName(participantId: string | null) {
  if (!participantId) return "Sem favorito definido";
  return castById[participantId]?.name ?? participantId;
}

function formatHouseholds(value: number) {
  return numberFormatter.format(Math.max(0, Math.round(value)));
}

function formatCompactHouseholds(value: number) {
  return compactNumberFormatter.format(Math.max(0, Math.round(value)));
}

function toPercentage(value: number) {
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function formatPercentage(value: number) {
  return `${decimalFormatter.format(toPercentage(value))}%`;
}

function formatPercentageDelta(before: number, after: number) {
  const delta = toPercentage(after) - toPercentage(before);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${decimalFormatter.format(delta)} p.p.`;
}

function formatHundredScalePercentage(value: number) {
  return `${decimalFormatter.format(value)}%`;
}

function formatHundredScaleDelta(before: number, after: number) {
  const delta = after - before;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${decimalFormatter.format(delta)} p.p.`;
}

function formatPoints(value: number) {
  return `${decimalFormatter.format(value)} pts`;
}

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }
  return [minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function formatHouseholdDelta(value: number) {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${numberFormatter.format(rounded)}`;
}

function formatEpisode(record: BroadcastRecord, result: AudienceEpisodeResult) {
  const kind = record.episode?.kind;
  const kindLabel = kind ? episodeKindLabels[kind] : "Programa";
  return `Semana ${record.week} · ${kindLabel} · ${result.episodeId}`;
}

function retentionFor(cluster: ClusterEpisodeResult) {
  if (cluster.startHouseholds <= 0) return 0;
  return cluster.completionHouseholds / cluster.startHouseholds;
}

function buildWeightedSliceResults(
  result: AudienceEpisodeResult,
  dimension: SliceDimension,
): WeightedSliceResult[] {
  const clusterResults = new Map(
    result.clusterResults.map((cluster) => [normalizeClusterId(cluster.clusterId), cluster]),
  );

  return sliceCategories[dimension].map((category) => {
    let basisHouseholds = 0;
    let startHouseholds = 0;
    let completionHouseholds = 0;
    let uniqueReachHouseholds = 0;
    let digitalReachHouseholds = 0;
    let satisfactionMass = 0;
    let satisfactionWeight = 0;
    let returnIntentBeforeMass = 0;
    let returnIntentAfterMass = 0;

    for (const definition of AUDIENCE_CLUSTERS) {
      const cluster = clusterResults.get(normalizeClusterId(definition.id));
      if (!cluster) continue;
      const authoredWeight = Math.max(0, Math.min(1, category.weight(definition)));
      const basisWeight = cluster.populationHouseholds * authoredWeight;
      const viewingWeight = cluster.averageHouseholds * authoredWeight;

      basisHouseholds += basisWeight;
      startHouseholds += cluster.startHouseholds * authoredWeight;
      completionHouseholds += cluster.completionHouseholds * authoredWeight;
      uniqueReachHouseholds += cluster.uniqueReachHouseholds * authoredWeight;
      digitalReachHouseholds += cluster.digitalReachHouseholds * authoredWeight;
      satisfactionMass += cluster.satisfaction * viewingWeight;
      satisfactionWeight += viewingWeight;
      returnIntentBeforeMass += cluster.returnIntentBefore * basisWeight;
      returnIntentAfterMass += cluster.returnIntentAfter * basisWeight;
    }

    return {
      key: category.key,
      label: category.label,
      group: category.group,
      basisHouseholds,
      startHouseholds,
      completionHouseholds,
      uniqueReachHouseholds,
      digitalReachHouseholds,
      satisfaction: satisfactionWeight > 0 ? satisfactionMass / satisfactionWeight : 0,
      returnIntentBefore: basisHouseholds > 0 ? returnIntentBeforeMass / basisHouseholds : 0,
      returnIntentAfter: basisHouseholds > 0 ? returnIntentAfterMass / basisHouseholds : 0,
    };
  });
}

function weightedSliceRetention(slice: WeightedSliceResult) {
  if (slice.startHouseholds <= 0) return 0;
  return slice.completionHouseholds / slice.startHouseholds;
}

function weightedSliceTuneIn(slice: WeightedSliceResult) {
  if (slice.basisHouseholds <= 0) return 0;
  return slice.startHouseholds / slice.basisHouseholds;
}

function checkpointClusterDeltas(
  result: AudienceEpisodeResult,
  selectedSegmentId: string,
) {
  const selectedIndex = result.checkpoints.findIndex(
    (checkpoint) => checkpoint.segmentId === selectedSegmentId,
  );
  if (selectedIndex < 0) return [];
  const selected = result.checkpoints[selectedIndex];
  const previousViewers = selectedIndex > 0
    ? result.checkpoints[selectedIndex - 1].clusterViewers
    : Object.fromEntries(
      result.clusterResults.map((cluster) => [cluster.clusterId, cluster.startHouseholds]),
    );

  return Object.entries(selected.clusterViewers)
    .map(([clusterId, households]) => ({
      clusterId,
      deltaHouseholds: households - (previousViewers[clusterId] ?? 0),
    }))
    .toSorted((left, right) =>
      Math.abs(right.deltaHouseholds) - Math.abs(left.deltaHouseholds)
      || left.clusterId.localeCompare(right.clusterId))
    .slice(0, 3);
}

function factorMagnitude(factor: AudienceFactorContribution) {
  return Math.abs(factor.value);
}

function splitTopFactors(factors: AudienceFactorContribution[]) {
  const positive = factors
    .filter((factor) => factor.direction === "positive")
    .toSorted((left, right) => factorMagnitude(right) - factorMagnitude(left))
    .slice(0, 3);
  const negative = factors
    .filter((factor) => factor.direction === "negative")
    .toSorted((left, right) => factorMagnitude(right) - factorMagnitude(left))
    .slice(0, 3);
  return { positive, negative };
}

function fanDeltaMagnitude(delta: ParticipantFanDelta) {
  return (
    Math.abs(delta.awarenessAfter - delta.awarenessBefore)
    + Math.abs(delta.sentimentAfter - delta.sentimentBefore)
    + Math.abs(delta.attachmentAfter - delta.attachmentBefore)
    + Math.abs(delta.favoriteShareAfter - delta.favoriteShareBefore)
  );
}

function FactorList({
  factors,
  emptyLabel,
}: {
  factors: AudienceFactorContribution[];
  emptyLabel: string;
}) {
  if (factors.length === 0) {
    return <p className="audience-driver-empty">{emptyLabel}</p>;
  }

  return (
    <ol className="audience-driver-list">
      {factors.map((factor, index) => (
        <li
          className={`audience-driver audience-driver-${factor.direction}`}
          key={`${factor.key}-${factor.clusterId ?? "all"}-${factor.segmentId ?? "episode"}-${index}`}
        >
          <span className="audience-driver-label">{factor.label}</span>
          <data className="audience-driver-value" value={factor.value}>
            {impactFormatter.format(factor.value)}
          </data>
          {(factor.clusterId || factor.segmentId) && (
            <small className="audience-driver-context">
              {factor.clusterId ? clusterName(factor.clusterId) : null}
              {factor.clusterId && factor.segmentId ? " · " : null}
              {factor.segmentId ? `Trecho ${factor.segmentId}` : null}
            </small>
          )}
        </li>
      ))}
    </ol>
  );
}

function voteStatusLabel(
  mode: GameState["audienceModel"]["mode"],
  isPending: boolean,
) {
  if (mode === "shadow") {
    return isPending ? "Projeção travada · modo sombra" : "Projeção arquivada · modo sombra";
  }
  if (mode === "legacy") return "Referência do modelo legado";
  return isPending ? "Voto fechado e travado" : "Voto resolvido";
}

function voteOutcomeLabel(
  vote: AudienceVoteResult,
  mode: GameState["audienceModel"]["mode"],
) {
  const projected = mode === "shadow";
  if (vote.kind === "final") {
    return projected ? "Seria vencedor(a)" : "Vencedor(a) do voto";
  }
  return projected ? "Seria eliminado(a)" : "Escolha para eliminação";
}

function AudienceVotePanel({
  audience,
  titleId,
}: {
  audience: GameState["audienceModel"];
  titleId: string;
}) {
  const vote = audience.pendingVote ?? audience.voteHistory.at(-1);
  const isPending = Boolean(vote && audience.pendingVote?.id === vote.id);

  return (
    <section className="audience-vote" aria-labelledby={`${titleId}-vote`}>
      <div className="audience-section-heading">
        <div>
          <h3 id={`${titleId}-vote`}>Voto da audiência</h3>
          <p>
            Resultado atual, calculado somente com fandom público, reconhecimento e propensão de voto
            das coortes.
          </p>
        </div>
      </div>
      {vote ? (
        <>
          <div className="audience-vote-summary">
            <div>
              <strong>
                Semana {vote.week} · {vote.kind === "final" ? "Final" : "Eliminação"}
              </strong>
              <span>{voteStatusLabel(audience.mode, isPending)}</span>
            </div>
            <dl>
              <div>
                <dt>Participação estimada</dt>
                <dd>{formatHouseholds(vote.turnoutHouseholds)} domicílios</dd>
              </div>
              <div>
                <dt>Travado após</dt>
                <dd>{vote.lockedAfterEpisodeId}</dd>
              </div>
            </dl>
          </div>
          <div className="audience-table-scroll" tabIndex={0}>
            <table className="audience-table audience-vote-table">
              <caption>
                {isPending ? "Voto atual travado" : "Último voto resolvido"} · percentuais persistidos
              </caption>
              <thead>
                <tr>
                  <th scope="col">Participante</th>
                  <th scope="col">Fatia do voto</th>
                  <th scope="col">Domicílios participantes</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {vote.participantIds
                  .toSorted((left, right) =>
                    (vote.shares[right] ?? 0) - (vote.shares[left] ?? 0)
                    || left.localeCompare(right))
                  .map((participantId) => {
                    const share = vote.shares[participantId] ?? 0;
                    const selected = participantId === vote.selectedParticipantId;
                    return (
                      <tr className={selected ? "audience-vote-selected" : undefined} key={participantId}>
                        <th scope="row">{participantName(participantId)}</th>
                        <td>{formatPercentage(share)}</td>
                        <td>{formatHouseholds(vote.turnoutHouseholds * share)}</td>
                        <td>{selected ? voteOutcomeLabel(vote, audience.mode) : "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="audience-derived-note">
            {audience.mode === "shadow"
              ? "Projeção não autoritativa: o modo sombra registra este resultado sem controlar a eliminação ou a final."
              : "O resultado é imutável após o fechamento e não muda com a edição posterior da eliminação."}
          </p>
        </>
      ) : (
        <p className="audience-section-empty">
          Nenhum voto de audiência foi fechado nesta temporada.
        </p>
      )}
    </section>
  );
}

export function AudienceReport({ state }: AudienceReportProps) {
  const titleId = useId();
  const historySelectId = useId();
  const sliceSelectId = useId();
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [sliceDimension, setSliceDimension] = useState<SliceDimension>("age");
  const [selectedCheckpointId, setSelectedCheckpointId] = useState("");
  const reports = state.broadcasts.filter(
    (record): record is BroadcastRecord & { result: AudienceEpisodeResult } => Boolean(record.result),
  );
  const latestReport = reports.at(-1);
  const selectedReport = selectedEpisodeId
    ? reports.find((record) => record.result.episodeId === selectedEpisodeId) ?? latestReport
    : latestReport;
  const market = state.audienceModel?.market;

  if (!selectedReport) {
    const hasLegacyBroadcasts = state.broadcasts.length > 0;
    return (
      <section className="audience-report audience-report-empty" aria-labelledby={titleId}>
        <header className="audience-report-header">
          <p className="audience-report-kicker">Pesquisa &amp; Audiência</p>
          <h2 id={titleId}>Leitura da transmissão</h2>
        </header>
        <div className="audience-empty-state">
          <h3>{hasLegacyBroadcasts ? "Sem detalhamento por público" : "Aguardando a primeira transmissão"}</h3>
          <p>
            {hasLegacyBroadcasts
              ? "As transmissões deste histórico foram registradas no modelo legado e não possuem checkpoints ou coortes reconstruídos."
              : "A previsão e a medição aparecerão aqui quando um episódio for ao ar."}
          </p>
        </div>
        {(state.audienceModel.pendingVote || state.audienceModel.voteHistory.length > 0) && (
          <AudienceVotePanel audience={state.audienceModel} titleId={titleId} />
        )}
        <p className="audience-panel-disclosure">
          Painel de pesquisa inteiramente ficcional. Os números não representam pessoas, emissoras ou
          medições reais.
        </p>
      </section>
    );
  }

  const result = selectedReport.result;
  const currentLatestReport = latestReport ?? selectedReport;
  const { positive, negative } = splitTopFactors(result.factorContributions);
  const maxCheckpointRating = Math.max(
    1,
    result.peakRating,
    ...result.checkpoints.map((checkpoint) => checkpoint.rating),
  );
  const sortedFanDeltas = result.participantFanDeltas.toSorted(
    (left, right) => fanDeltaMagnitude(right) - fanDeltaMagnitude(left),
  );
  const history = reports.toReversed().slice(1);
  const weightedSlices = buildWeightedSliceResults(result, sliceDimension);
  const selectedCheckpoint =
    result.checkpoints.find((checkpoint) => checkpoint.segmentId === selectedCheckpointId)
    ?? result.checkpoints.at(-1);
  const selectedCheckpointCohorts = selectedCheckpoint
    ? checkpointClusterDeltas(result, selectedCheckpoint.segmentId)
    : [];

  return (
    <section className="audience-report" aria-labelledby={titleId}>
      <header className="audience-report-header">
        <div className="audience-report-heading">
          <p className="audience-report-kicker">Pesquisa &amp; Audiência</p>
          <h2 id={titleId}>Leitura da transmissão</h2>
          <p className="audience-report-episode">{formatEpisode(selectedReport, result)}</p>
        </div>
        <div className="audience-history-control">
          <label htmlFor={historySelectId}>Relatório</label>
          <select
            id={historySelectId}
            onChange={(event) => setSelectedEpisodeId(event.target.value)}
            value={selectedEpisodeId}
          >
            <option value="">
              Mais recente · {formatEpisode(currentLatestReport, currentLatestReport.result)}
            </option>
            {history.map((record) => (
              <option key={record.result.episodeId} value={record.result.episodeId}>
                {formatEpisode(record, record.result)}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="audience-headlines" aria-labelledby={`${titleId}-headlines`}>
        <h3 id={`${titleId}-headlines`}>Resultado consolidado</h3>
        <dl className="audience-metric-grid">
          <div className="audience-metric audience-metric-forecast">
            <dt>Previsão</dt>
            <dd>
              {formatPoints(result.forecast.low)}–{formatPoints(result.forecast.high)}
              <small>esperado {formatPoints(result.forecast.expected)}</small>
            </dd>
          </div>
          <div className="audience-metric">
            <dt>Média</dt>
            <dd>{formatPoints(result.averageRating)}</dd>
          </div>
          <div className="audience-metric">
            <dt>Pico</dt>
            <dd>{formatPoints(result.peakRating)}</dd>
          </div>
          <div className="audience-metric">
            <dt>Share</dt>
            <dd>{formatPercentage(result.share)}</dd>
          </div>
          <div className="audience-metric">
            <dt>Alcance único</dt>
            <dd title={`${formatHouseholds(result.uniqueReach)} domicílios`}>
              {formatCompactHouseholds(result.uniqueReach)}
            </dd>
          </div>
          <div className="audience-metric">
            <dt>Alcance digital</dt>
            <dd title={`${formatHouseholds(result.digitalReach)} domicílios`}>
              {formatCompactHouseholds(result.digitalReach)}
            </dd>
          </div>
          <div className="audience-metric">
            <dt>TV conectada</dt>
            <dd title={`${formatHouseholds(result.platformReach.connected_tv)} domicílios`}>
              {formatCompactHouseholds(result.platformReach.connected_tv)}
            </dd>
          </div>
          <div className="audience-metric">
            <dt>Catch-up</dt>
            <dd title={`${formatHouseholds(result.platformReach.catch_up)} domicílios`}>
              {formatCompactHouseholds(result.platformReach.catch_up)}
            </dd>
          </div>
          <div className="audience-metric">
            <dt>Mobile / clips</dt>
            <dd title={`${formatHouseholds(result.platformReach.mobile_clips)} domicílios`}>
              {formatCompactHouseholds(result.platformReach.mobile_clips)}
            </dd>
          </div>
          <div className="audience-metric">
            <dt>Conclusão</dt>
            <dd>{formatPercentage(result.completionRate)}</dd>
          </div>
        </dl>
      </section>

      <section className="audience-checkpoints" aria-labelledby={`${titleId}-checkpoints`}>
        <div className="audience-section-heading">
          <div>
            <h3 id={`${titleId}-checkpoints`}>Curva real da transmissão</h3>
            <p>Cada ponto corresponde ao resultado persistido após um trecho da edição.</p>
          </div>
        </div>

        {result.checkpoints.length > 0 ? (
          <>
            <figure className="audience-curve">
              <figcaption>
                Audiência linear por checkpoint, em pontos. Pico de {formatPoints(result.peakRating)}.
              </figcaption>
              <ol className="audience-curve-points">
                {result.checkpoints.map((checkpoint) => (
                  <li className="audience-curve-point" key={checkpoint.segmentId}>
                    <button
                      aria-label={`Abrir detalhes de ${checkpoint.label}, trecho ${checkpoint.segmentId}, ${formatPoints(checkpoint.rating)}`}
                      aria-controls={`${titleId}-checkpoint-detail`}
                      aria-pressed={selectedCheckpoint?.segmentId === checkpoint.segmentId}
                      className="audience-curve-select"
                      onClick={() => setSelectedCheckpointId(checkpoint.segmentId)}
                      title={`Abrir causas do trecho ${checkpoint.segmentId}`}
                      type="button"
                    >
                      <meter
                        aria-label={`${checkpoint.label}: ${formatPoints(checkpoint.rating)}`}
                        className="audience-curve-meter"
                        max={maxCheckpointRating}
                        min={0}
                        value={Math.max(0, checkpoint.rating)}
                      >
                        {formatPoints(checkpoint.rating)}
                      </meter>
                      <span className="audience-curve-value">{formatPoints(checkpoint.rating)}</span>
                      <span className="audience-curve-label">{checkpoint.label}</span>
                      <time className="audience-curve-time" dateTime={`PT${Math.max(0, checkpoint.elapsedSeconds)}S`}>
                        {formatElapsed(checkpoint.elapsedSeconds)}
                      </time>
                    </button>
                  </li>
                ))}
              </ol>
            </figure>

            {selectedCheckpoint && (
              <section
                aria-labelledby={`${titleId}-checkpoint-detail-heading`}
                className="audience-checkpoint-detail"
                id={`${titleId}-checkpoint-detail`}
              >
                <header>
                  <div>
                    <p>Trecho selecionado</p>
                    <h4 id={`${titleId}-checkpoint-detail-heading`}>{selectedCheckpoint.label}</h4>
                  </div>
                  <code>{selectedCheckpoint.segmentId}</code>
                </header>
                <div className="audience-checkpoint-detail-grid">
                  <section aria-labelledby={`${titleId}-checkpoint-factors`}>
                    <h5 id={`${titleId}-checkpoint-factors`}>Causas persistidas do trecho</h5>
                    <FactorList
                      emptyLabel="Este checkpoint não registrou fatores dominantes."
                      factors={selectedCheckpoint.topFactors}
                    />
                  </section>
                  <section aria-labelledby={`${titleId}-checkpoint-cohorts`}>
                    <h5 id={`${titleId}-checkpoint-cohorts`}>Coortes mais afetadas</h5>
                    <p>
                      Variação desde o ponto anterior; no primeiro trecho, a referência é a sintonia
                      inicial.
                    </p>
                    {selectedCheckpointCohorts.length > 0 ? (
                      <ol className="audience-checkpoint-cohort-list">
                        {selectedCheckpointCohorts.map((cluster) => (
                          <li key={cluster.clusterId}>
                            <span>{clusterName(cluster.clusterId)}</span>
                            <data value={cluster.deltaHouseholds}>
                              {formatHouseholdDelta(cluster.deltaHouseholds)}
                            </data>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="audience-driver-empty">Sem variações de coorte registradas.</p>
                    )}
                  </section>
                </div>
              </section>
            )}

            <div className="audience-table-scroll" tabIndex={0}>
              <table className="audience-table audience-checkpoint-table">
                <caption>Valores exatos da curva de audiência</caption>
                <thead>
                  <tr>
                    <th scope="col">Trecho</th>
                    <th scope="col">Tempo</th>
                    <th scope="col">Domicílios ao vivo</th>
                    <th scope="col">Pontos</th>
                    <th scope="col">Share</th>
                    <th scope="col">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {result.checkpoints.map((checkpoint) => (
                    <tr key={checkpoint.segmentId}>
                      <th scope="row">
                        {checkpoint.label}
                        <small>
                          <code>{checkpoint.segmentId}</code>
                        </small>
                      </th>
                      <td>{formatElapsed(checkpoint.elapsedSeconds)}</td>
                      <td>{formatHouseholds(checkpoint.households)}</td>
                      <td>{decimalFormatter.format(checkpoint.rating)}</td>
                      <td>{formatPercentage(checkpoint.share)}</td>
                      <td
                        className={
                          checkpoint.deltaHouseholds > 0
                            ? "audience-delta-positive"
                            : checkpoint.deltaHouseholds < 0
                              ? "audience-delta-negative"
                              : "audience-delta-neutral"
                        }
                      >
                        {formatHouseholdDelta(checkpoint.deltaHouseholds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="audience-section-empty">Esta medição não contém checkpoints de transmissão.</p>
        )}
      </section>

      <section className="audience-cohorts" aria-labelledby={`${titleId}-cohorts`}>
        <div className="audience-section-heading">
          <div>
            <h3 id={`${titleId}-cohorts`}>Retenção por coorte</h3>
            <p>Conclusão, reentrada, plataformas, engajamento e favorito principal de cada grupo.</p>
          </div>
        </div>
        {result.clusterResults.length > 0 ? (
          <div className="audience-table-scroll" tabIndex={0}>
            <table className="audience-table audience-cohort-table">
              <caption>Desempenho dos grupos do painel ficcional</caption>
              <thead>
                <tr>
                  <th scope="col">Coorte</th>
                  <th scope="col">Início</th>
                  <th scope="col">Retenção</th>
                  <th scope="col">Primeiro contato</th>
                  <th scope="col">Reentradas</th>
                  <th scope="col">Alcance digital</th>
                  <th scope="col">Engajamento</th>
                  <th scope="col">Intenção de retorno</th>
                  <th scope="col">Favorito</th>
                </tr>
              </thead>
              <tbody>
                {result.clusterResults.map((cluster) => (
                  <tr key={cluster.clusterId}>
                    <th scope="row">
                      {clusterName(cluster.clusterId)}
                      <small>{formatHouseholds(cluster.populationHouseholds)} domicílios no universo</small>
                    </th>
                    <td>{formatHouseholds(cluster.startHouseholds)}</td>
                    <td>{formatPercentage(retentionFor(cluster))}</td>
                    <td>{formatHouseholds(cluster.firstTimeReachHouseholds)}</td>
                    <td>{formatHouseholds(cluster.reentryHouseholds)}</td>
                    <td>{formatHouseholds(cluster.digitalReachHouseholds)}</td>
                    <td>
                      <span>Voto {formatPercentage(cluster.engagement.vote)}</span>
                      <small>
                        Discussão {formatPercentage(cluster.engagement.discuss)}
                        {" · "}seguir {formatPercentage(cluster.engagement.follow)}
                      </small>
                    </td>
                    <td>
                      <span
                        aria-label={`de ${formatPercentage(cluster.returnIntentBefore)} para ${formatPercentage(cluster.returnIntentAfter)}`}
                        className="audience-return-transition"
                      >
                        {formatPercentage(cluster.returnIntentBefore)}
                        <span aria-hidden="true"> → </span>
                        {formatPercentage(cluster.returnIntentAfter)}
                      </span>
                      <small>
                        {formatPercentageDelta(cluster.returnIntentBefore, cluster.returnIntentAfter)}
                      </small>
                    </td>
                    <td>{participantName(cluster.favoriteParticipantId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="audience-section-empty">Esta medição não contém resultados por coorte.</p>
        )}
      </section>

      <section className="audience-slices" aria-labelledby={`${titleId}-slices`}>
        <div className="audience-section-heading audience-slice-heading">
          <div>
            <h3 id={`${titleId}-slices`}>Recortes ponderados derivados</h3>
            <p>
              Distribuição dos resultados persistidos de cada coorte pela composição ficcional
              declarada no painel.
            </p>
          </div>
          <div className="audience-slice-control">
            <label htmlFor={sliceSelectId}>Exibir recorte</label>
            <select
              id={sliceSelectId}
              onChange={(event) => setSliceDimension(event.target.value as SliceDimension)}
              value={sliceDimension}
            >
              {(Object.keys(sliceDimensionLabels) as SliceDimension[]).map((dimension) => (
                <option key={dimension} value={dimension}>
                  {sliceDimensionLabels[dimension]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {weightedSlices.length > 0 ? (
          <>
            <div className="audience-table-scroll" tabIndex={0}>
              <table className="audience-table audience-slice-table">
                <caption>
                  {sliceDimensionLabels[sliceDimension]} · estimativa ponderada, sem microdados
                  individuais
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Recorte</th>
                    <th scope="col">Base ponderada</th>
                    <th scope="col">Sintonia / base</th>
                    <th scope="col">Retenção</th>
                    <th scope="col">Alcance único</th>
                    <th scope="col">Alcance digital</th>
                    <th scope="col">Satisfação</th>
                    <th scope="col">Intenção de retorno</th>
                  </tr>
                </thead>
                <tbody>
                  {weightedSlices.map((slice) => (
                    <tr key={slice.key}>
                      <th scope="row">
                        {slice.label}
                        <small>
                          {slice.group ? `${slice.group} · ` : null}
                          estimativa ponderada
                        </small>
                      </th>
                      <td>{formatHouseholds(slice.basisHouseholds)}</td>
                      <td>
                        {formatPercentage(weightedSliceTuneIn(slice))}
                        <small>{formatHouseholds(slice.startHouseholds)} ao vivo</small>
                      </td>
                      <td>{formatPercentage(weightedSliceRetention(slice))}</td>
                      <td>{formatHouseholds(slice.uniqueReachHouseholds)}</td>
                      <td>{formatHouseholds(slice.digitalReachHouseholds)}</td>
                      <td>{formatPercentage(slice.satisfaction)}</td>
                      <td>
                        <span
                          aria-label={`de ${formatPercentage(slice.returnIntentBefore)} para ${formatPercentage(slice.returnIntentAfter)}`}
                          className="audience-return-transition"
                        >
                          {formatPercentage(slice.returnIntentBefore)}
                          <span aria-hidden="true"> → </span>
                          {formatPercentage(slice.returnIntentAfter)}
                        </span>
                        <small>
                          {formatPercentageDelta(slice.returnIntentBefore, slice.returnIntentAfter)}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="audience-derived-note">
              {sliceDimension === "interest"
                ? "Lente de afinidade sobreposta: uma coorte pode contribuir para vários interesses, portanto as bases desta tabela não são grupos exclusivos e não devem ser somadas."
                : "Estimativa derivada: o desempenho medido da coorte é ponderado pela sua composição declarada. O modelo não cria nem atribui comportamento a indivíduos dentro da coorte."}
            </p>
          </>
        ) : (
          <p className="audience-section-empty">Este relatório não contém coortes para ponderação.</p>
        )}
      </section>

      <AudienceVotePanel audience={state.audienceModel} titleId={titleId} />

      <section className="audience-fandom" aria-labelledby={`${titleId}-fandom`}>
        <div className="audience-section-heading">
          <div>
            <h3 id={`${titleId}-fandom`}>Movimentos de fandom</h3>
            <p>Variações provocadas somente pelo que foi exibido neste episódio.</p>
          </div>
        </div>
        {sortedFanDeltas.length > 0 ? (
          <div className="audience-table-scroll" tabIndex={0}>
            <table className="audience-table audience-fandom-table">
              <caption>Mudança agregada de percepção dos participantes</caption>
              <thead>
                <tr>
                  <th scope="col">Participante</th>
                  <th scope="col">Reconhecimento</th>
                  <th scope="col">Sentimento</th>
                  <th scope="col">Apego</th>
                  <th scope="col">Fatia de favoritos</th>
                </tr>
              </thead>
              <tbody>
                {sortedFanDeltas.map((delta) => (
                  <tr key={delta.participantId}>
                    <th scope="row">{participantName(delta.participantId)}</th>
                    <td>
                      {formatHundredScalePercentage(delta.awarenessAfter)}
                      <small>
                        {formatHundredScaleDelta(delta.awarenessBefore, delta.awarenessAfter)}
                      </small>
                    </td>
                    <td>
                      {decimalFormatter.format(delta.sentimentAfter)}
                      <small>
                        {impactFormatter.format(delta.sentimentAfter - delta.sentimentBefore)}
                      </small>
                    </td>
                    <td>
                      {formatHundredScalePercentage(delta.attachmentAfter)}
                      <small>
                        {formatHundredScaleDelta(delta.attachmentBefore, delta.attachmentAfter)}
                      </small>
                    </td>
                    <td>
                      {formatPercentage(delta.favoriteShareAfter)}
                      <small>
                        {formatPercentageDelta(delta.favoriteShareBefore, delta.favoriteShareAfter)}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="audience-section-empty">Nenhuma mudança de fandom foi registrada.</p>
        )}
      </section>

      <section className="audience-drivers" aria-labelledby={`${titleId}-drivers`}>
        <div className="audience-section-heading">
          <div>
            <h3 id={`${titleId}-drivers`}>Principais causas</h3>
            <p>Os três sinais que mais ajudaram e mais prejudicaram o resultado.</p>
          </div>
        </div>
        <div className="audience-driver-columns">
          <section className="audience-driver-group" aria-labelledby={`${titleId}-positive-drivers`}>
            <h4 id={`${titleId}-positive-drivers`}>Impulsos positivos</h4>
            <FactorList factors={positive} emptyLabel="Nenhum impulso positivo registrado." />
          </section>
          <section className="audience-driver-group" aria-labelledby={`${titleId}-negative-drivers`}>
            <h4 id={`${titleId}-negative-drivers`}>Pressões negativas</h4>
            <FactorList factors={negative} emptyLabel="Nenhuma pressão negativa registrada." />
          </section>
        </div>
      </section>

      <footer className="audience-panel-note">
        <h3>Sobre o painel</h3>
        <p>
          <strong>{market?.panelLabel ?? "Painel Nacional Ficcional"}</strong> — simulação inteiramente
          ficcional com {formatHouseholds(market?.universeHouseholds ?? 50_000_000)} domicílios
          mensuráveis. Um ponto equivale a{" "}
          {formatHouseholds(market?.householdsPerPoint ?? 500_000)} domicílios; a meta da emissora é{" "}
          {formatPoints(market?.networkTargetPoints ?? 24)}.
        </p>
        <p>
          Os grupos são composições simuladas para testar edição, retenção e fandom. Eles não
          representam medição real nem atribuem preferências automáticas a identidades demográficas.
        </p>
      </footer>
    </section>
  );
}
