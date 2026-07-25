import type {
  ImportantEventBeat,
  ImportantEventEditorialConstruction,
  ImportantEventNarrativeAnalysis,
  ImportantEventPortrayal,
} from "./event-models.ts";

type NamedParticipant = { id: string; name: string };

type AnalyzeImportantEventEditInput = {
  beats: readonly ImportantEventBeat[];
  participants: readonly NamedParticipant[];
  selectedBeatIds: readonly string[];
  televisedOrder: readonly string[];
};

const portrayalValues: Record<ImportantEventPortrayal, number> = {
  justified: 2,
  attacked: 1.5,
  sympathetic: 2,
  aggressive: -2,
  dishonest: -2,
  contradictory: -1,
  defensive: 0.5,
  neutral: 0,
};

export const importantEventConstructionLabels: Record<ImportantEventEditorialConstruction, string> = {
  full_context: "Contexto Completo",
  reaction_without_context: "Reação sem Contexto",
  unilateral_version: "Versão Unilateral",
  speech_comparison: "Comparação de Falas",
  fragmented_conflict: "Conflito Fragmentado",
  balanced_cut: "Recorte Equilibrado",
};

function displayNames(ids: readonly string[], participants: readonly NamedParticipant[]) {
  const names = ids
    .map((id) => participants.find((participant) => participant.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length < 2) return names[0] ?? "ninguém";
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

function addScore(scores: Map<string, number>, participantId: string, value: number) {
  scores.set(participantId, (scores.get(participantId) ?? 0) + value);
}

function determineMainFocus(focusScores: Map<string, number>, participantCount: number) {
  const ranked = [...focusScores.entries()].sort((left, right) => right[1] - left[1]);
  if (ranked.length === 0 || ranked[0][1] <= 0) return [];
  const topScore = ranked[0][1];
  const closeToTop = ranked.filter(([, score]) => score >= topScore * 0.82);
  if (closeToTop.length >= Math.min(3, participantCount)) return closeToTop.map(([id]) => id);
  if (closeToTop.length >= 2) return closeToTop.slice(0, 2).map(([id]) => id);
  return [ranked[0][0]];
}

function contextDescription(
  missingProviders: readonly ImportantEventBeat[],
  delayedProviders: readonly ImportantEventBeat[],
  omittedConsequences: readonly ImportantEventBeat[],
  participants: readonly NamedParticipant[],
) {
  const missingCause = missingProviders.find((beat) => beat.narrative.isCause);
  const delayedCause = delayedProviders.find((beat) => beat.narrative.isCause);
  const cause = missingCause ?? delayedCause;
  if (cause) {
    const actor = displayNames(cause.participantIds.slice(0, 1), participants);
    const target = displayNames(cause.participantIds.slice(1, 2), participants);
    return missingCause
      ? `O comentário inicial de ${actor} sobre ${target} não aparece nesta versão.`
      : `O comentário inicial de ${actor} sobre ${target} aparece somente depois das reações que provocou.`;
  }

  const missing = missingProviders[0];
  if (missing) return `O momento “${missing.title}”, necessário para compreender a escalada, não aparece nesta versão.`;
  const delayed = delayedProviders[0];
  if (delayed) return `O momento “${delayed.title}” aparece somente depois da situação que ajuda a explicar.`;
  if (omittedConsequences.length > 0) {
    return "A reação posterior ao confronto não aparece, reduzindo a percepção das consequências do acontecimento.";
  }
  return "Nenhum contexto essencial foi omitido.";
}

function editorialConstruction({
  selectedBeats,
  missingProviders,
  delayedProviders,
  mainFocusParticipantIds,
  favoredParticipantIds,
  harmedParticipantIds,
}: {
  selectedBeats: readonly ImportantEventBeat[];
  missingProviders: readonly ImportantEventBeat[];
  delayedProviders: readonly ImportantEventBeat[];
  mainFocusParticipantIds: readonly string[];
  favoredParticipantIds: readonly string[];
  harmedParticipantIds: readonly string[];
}): ImportantEventEditorialConstruction {
  if (selectedBeats.length === 0) return "fragmented_conflict";

  const originalOrder = [...selectedBeats].sort((left, right) => left.order - right.order);
  const isChronological = selectedBeats.every((beat, index) => beat.id === originalOrder[index]?.id);
  const hasCause = selectedBeats.some((beat) => beat.narrative.isCause);
  const hasDevelopment = selectedBeats.some((beat) => beat.role === "Rumor" || beat.role === "Discovery");
  const hasConsequence = selectedBeats.some((beat) => beat.narrative.isConsequence);
  const completeStory = hasCause && hasDevelopment && hasConsequence && isChronological
    && missingProviders.length === 0 && delayedProviders.length === 0;
  if (completeStory) return "full_context";

  const reactionNeedsContext = selectedBeats.some((beat) => beat.narrative.isReaction)
    && [...missingProviders, ...delayedProviders].some((beat) => beat.narrative.isCause);
  if (reactionNeedsContext) return "reaction_without_context";

  const comparesContradictions = selectedBeats.some((beat, index) => {
    const next = selectedBeats[index + 1];
    return next && (beat.narrative.contradictsBeatIds.includes(next.id)
      || next.narrative.contradictsBeatIds.includes(beat.id));
  });
  if (comparesContradictions) return "speech_comparison";

  const disconnected = selectedBeats.length <= 2
    || selectedBeats.some((beat, index) => index > 0 && Math.abs(beat.order - selectedBeats[index - 1].order) > 1);
  if (disconnected) return "fragmented_conflict";

  if (mainFocusParticipantIds.length === 1
    && (favoredParticipantIds.length > 0 || harmedParticipantIds.length > 0)) {
    return "unilateral_version";
  }
  return "balanced_cut";
}

function versionSummary({
  construction,
  selectedBeats,
  mainFocusParticipantIds,
  favoredParticipantIds,
  harmedParticipantIds,
  missingProviders,
  omittedConsequences,
  participants,
}: {
  construction: ImportantEventEditorialConstruction;
  selectedBeats: readonly ImportantEventBeat[];
  mainFocusParticipantIds: readonly string[];
  favoredParticipantIds: readonly string[];
  harmedParticipantIds: readonly string[];
  missingProviders: readonly ImportantEventBeat[];
  omittedConsequences: readonly ImportantEventBeat[];
  participants: readonly NamedParticipant[];
}) {
  if (selectedBeats.length === 0) return "Esta versão ainda não contém momentos para exibição.";
  const focus = mainFocusParticipantIds.length > 0
    ? displayNames(mainFocusParticipantIds, participants)
    : "o conflito como um todo";
  const favored = displayNames(favoredParticipantIds, participants);
  const harmed = displayNames(harmedParticipantIds, participants);
  const withConsequenceEffect = (summary: string) => omittedConsequences.length > 0
    ? `${summary} A reação posterior foi retirada, fazendo o desfecho parecer menos grave.`
    : summary;

  if (construction === "reaction_without_context") {
    const cause = missingProviders.find((beat) => beat.narrative.isCause);
    if (cause) {
      const causeActor = displayNames(cause.participantIds.slice(0, 1), participants);
      return withConsequenceEffect(`Esta montagem concentra a atenção em ${focus}, mas omite o comentário inicial de ${causeActor}; com menos justificativa visível, ${harmed} recebe uma leitura mais desfavorável e ${favored} aparece sob uma luz mais favorável.`);
    }
    return withConsequenceEffect(`Esta montagem concentra a atenção em ${focus} e apresenta uma reação antes do contexto que a explica, alterando a leitura da escalada.`);
  }
  if (construction === "unilateral_version") {
    return withConsequenceEffect(`Esta montagem acompanha principalmente ${focus} e preserva mais contexto favorável a ${favored}, enquanto ${harmed} aparece com menos justificativa.`);
  }
  if (construction === "speech_comparison") {
    return withConsequenceEffect(`Esta montagem aproxima momentos contraditórios e concentra a comparação em ${focus}, permitindo que as diferenças entre falas e ações apareçam diretamente.`);
  }
  if (construction === "fragmented_conflict") {
    return withConsequenceEffect(`Esta montagem reúne apenas partes do acontecimento e destaca ${focus}, sem elementos suficientes para reconstruir toda a escalada.`);
  }
  if (construction === "full_context") {
    return `Esta montagem acompanha ${focus} e preserva causa, escalada, confronto e consequência na ordem em que aconteceram.`;
  }
  return withConsequenceEffect(`Esta montagem distribui a atenção entre ${focus} e mantém contexto relevante dos principais envolvidos sem produzir uma vantagem editorial forte.`);
}

export function analyzeImportantEventEdit({
  beats,
  participants,
  selectedBeatIds,
  televisedOrder,
}: AnalyzeImportantEventEditInput): ImportantEventNarrativeAnalysis {
  const selectedIdSet = new Set(selectedBeatIds);
  const selectedBeats = televisedOrder
    .filter((id) => selectedIdSet.has(id))
    .map((id) => beats.find((beat) => beat.id === id))
    .filter((beat): beat is ImportantEventBeat => Boolean(beat));
  const selectedOrder = new Map(selectedBeats.map((beat, index) => [beat.id, index]));
  const focusScores = new Map<string, number>();
  const portrayalScores = new Map<string, number>();

  selectedBeats.forEach((beat, index) => {
    beat.participantIds.forEach((participantId) => addScore(focusScores, participantId, 1));
    Object.entries(beat.narrative.participantFocusWeights)
      .forEach(([participantId, weight]) => addScore(focusScores, participantId, weight));
    if (index === 0 || index === selectedBeats.length - 1) {
      beat.participantIds.forEach((participantId) => addScore(focusScores, participantId, index === 0 ? 0.75 : 0.6));
    }
    Object.entries(beat.narrative.participantPortrayalEffects).forEach(([participantId, effects]) => {
      effects.forEach((effect) => addScore(portrayalScores, participantId, portrayalValues[effect]));
    });
    if (index === selectedBeats.length - 1 && beat.narrative.isExplanation) {
      beat.participantIds.forEach((participantId) => addScore(portrayalScores, participantId, 1.5));
    }
  });

  const relevantProviders = beats.filter((provider) => selectedBeats.some(
    (selected) => provider.narrative.providesContextForBeatIds.includes(selected.id),
  ));
  const missingProviders = relevantProviders.filter((provider) => !selectedIdSet.has(provider.id));
  const omittedConsequences = beats.filter((beat) => beat.narrative.isConsequence && !selectedIdSet.has(beat.id));
  const delayedProviders = relevantProviders.filter((provider) => {
    const providerIndex = selectedOrder.get(provider.id);
    if (providerIndex === undefined) return false;
    return provider.narrative.providesContextForBeatIds.some((targetId) => {
      const targetIndex = selectedOrder.get(targetId);
      return targetIndex !== undefined && providerIndex > targetIndex;
    });
  });

  const delayedCause = delayedProviders.find((beat) => beat.narrative.isCause);
  const missingCause = missingProviders.find((beat) => beat.narrative.isCause);
  if (missingCause) {
    const causeActorId = missingCause.participantIds[0];
    const causeTargetId = missingCause.participantIds[1];
    const unsupportedReaction = selectedBeats.some((beat) => beat.narrative.isReaction
      && beat.participantIds.includes(causeTargetId));
    if (unsupportedReaction) {
      addScore(portrayalScores, causeActorId, 3);
      addScore(portrayalScores, causeTargetId, -4);
    }
  }
  if (delayedCause) {
    const firstReaction = selectedBeats.find((beat) => beat.narrative.isReaction);
    firstReaction?.participantIds.forEach((participantId) => addScore(portrayalScores, participantId, -0.75));
    addScore(portrayalScores, delayedCause.participantIds[0], 1);
  }

  const mainFocusParticipantIds = determineMainFocus(focusScores, participants.length);
  const favoredParticipantIds = [...portrayalScores.entries()]
    .filter(([, score]) => score >= 2)
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id);
  const harmedParticipantIds = [...portrayalScores.entries()]
    .filter(([, score]) => score <= -1.5)
    .sort((left, right) => left[1] - right[1])
    .map(([id]) => id);
  const detectedEditorialConstruction = editorialConstruction({
    selectedBeats,
    missingProviders,
    delayedProviders,
    mainFocusParticipantIds,
    favoredParticipantIds,
    harmedParticipantIds,
  });

  return {
    mainFocusParticipantIds,
    favoredParticipantIds,
    harmedParticipantIds,
    detectedEditorialConstruction,
    missingContextDescription: contextDescription(missingProviders, delayedProviders, omittedConsequences, participants),
    versionSummary: versionSummary({
      construction: detectedEditorialConstruction,
      selectedBeats,
      mainFocusParticipantIds,
      favoredParticipantIds,
      harmedParticipantIds,
      missingProviders,
      omittedConsequences,
      participants,
    }),
  };
}
