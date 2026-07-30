"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cast } from "@/game/content/cast";
import { recordedEvents as extractedRecordedEvents } from "@/game/content/legacy-events";
import {
  introFeed as extractedIntroFeed,
  partyFeed as extractedPartyFeed,
} from "@/game/content/legacy-feed";
import { reduceGame } from "@/game/reducer";
import { selectAvailableFootage } from "@/game/selectors/episode-bank";
import {
  isRequiredEpisodeFootage,
  toEpisodeFootageView,
} from "@/game/selectors/event-view";
import { selectFeedBatch, selectFeedSource } from "@/game/selectors/feed";
import { isStoryWindowReleased, selectReleasedEvents } from "@/game/selectors/released-events";
import { selectLegacyAudienceVoteChoice } from "@/game/selectors/legacy-audience-vote";
import type {
  BroadcastEpisode,
  BroadcastSegment,
  ChallengeType as DomainChallengeType,
  EpisodeKind,
  AudiencePortrayal,
  PersonalityTrait as DomainPersonalityTrait,
  TraitScore as DomainTraitScore,
} from "@/game/types";
import { deriveAudienceSignals } from "@/game/audience/signals";
import { AUDIENCE_SCHEDULES } from "@/game/audience/catalog";
import { GameInspector } from "./game-inspector";
import { AudienceReport } from "./audience-report";
import { useGameEngine } from "./use-game-engine";
import {
  EDITOR_DURATION_CONFIG,
  buildEditorialAlerts,
  classifyDuration,
  classifyFocus,
  classifyRhythm,
  classifyVariety,
  insertIntoFirstEmptyProgramZone,
  moveTimelineItem,
  reconcileTimelineWithCanonicalHistory,
  removeEditorialTimelineItem,
  selectEditorEpisodeBank,
  validateEditorCut,
} from "./editor-analysis";

type ChallengeType = DomainChallengeType;
type PersonalityTrait = DomainPersonalityTrait;
type TraitScore = DomainTraitScore;
import type {
  ImportantEventBeat,
  ImportantEventBeatRole,
  ImportantEventEdit,
} from "./event-models";
import {
  IMPORTANT_EVENT_MAX_DURATION_SECONDS,
  analyzeImportantEventEdit,
  importantEventConstructionLabels,
  validateImportantEventVersion,
} from "./important-event-analysis";
import { generateWeekEvents, WEEK_ONE_SEED } from "./important-event-generation";
type AppView = "mail" | "feed" | "challenge" | "edit" | "audience";
type Theme = "light" | "dark";
type FeedFilter = "all" | "important" | "unseen";
type Phase =
  | "email"
  | "feedIntro"
  | "feedPostChallenge"
  | "challenge"
  | "editPremiere"
  | "livePremiere"
  | "summaryPremiere"
  | "editChallenge"
  | "liveChallenge"
  | "summaryChallenge"
  | "feedParty"
  | "editVote"
  | "liveVote"
  | "summaryVote"
  | "feedNomination"
  | "audienceVote"
  | "feedElimination"
  | "editElimination"
  | "liveElimination"
  | "weekSummary"
  | "editFinal"
  | "liveFinal"
  | "winnerVote"
  | "winnerReveal";

type FeedReleaseStage = "intro" | "postChallenge" | "party" | "nomination" | "elimination";

const FEED_REFRESH_MS = 3500;

function feedReleaseStageForPhase(phase: Phase): FeedReleaseStage {
  if (
    phase === "email"
    || phase === "feedIntro"
    || phase === "challenge"
    || phase === "editPremiere"
    || phase === "livePremiere"
    || phase === "editChallenge"
    || phase === "liveChallenge"
  ) return "intro";
  if (
    phase === "feedPostChallenge"
    || phase === "summaryPremiere"
    || phase === "summaryChallenge"
    || phase === "feedParty"
    || phase === "editVote"
    || phase === "liveVote"
  ) return "party";
  if (
    phase === "summaryVote"
    || phase === "feedNomination"
    || phase === "audienceVote"
    || phase === "editElimination"
    || phase === "liveElimination"
  ) return "nomination";
  return "elimination";
}

type Participant = {
  id: string;
  name: string;
  age: number;
  city: string;
  occupation: string;
  bio: string;
  quote: string;
  traits: Record<ChallengeType, TraitScore>;
  personalityTraits: Record<PersonalityTrait, TraitScore>;
  personalTriggers: string[];
  behavioralTendencies: string[];
  publicPersona: string;
  contradictions: string[];
  strengths: string[];
  weaknesses: string[];
  possibleArcs: string[];
  tags: string[];
  portrait: { x: "0%" | "50%" | "100%"; y: "0%" | "100%" };
};

type RecordedEvent = {
  id: string;
  title: string;
  category: "Convivência" | "Conflito" | "Humor" | "Prova" | "Festa" | "Votação" | "Memória";
  duration: number;
  heat: number;
  description: string;
  actorIds?: string[];
  occurredAtWeek?: number;
  requiredAnchor?: boolean;
};

type CutTone = "neutro" | "engracado" | "triste" | "malicioso" | "conflituoso" | "emocional";

type CutApproach = {
  perspectiveIds: string[];
  tone: CutTone;
};

function episodeKindForPhase(phase: Phase): EpisodeKind {
  if (phase === "editPremiere" || phase === "livePremiere" || phase === "summaryPremiere") {
    return "premiere";
  }
  if (phase === "editChallenge" || phase === "liveChallenge" || phase === "summaryChallenge") {
    return "challenge";
  }
  if (
    phase === "editVote"
    || phase === "liveVote"
    || phase === "summaryVote"
    || phase === "audienceVote"
  ) return "vote";
  if (phase === "editElimination" || phase === "liveElimination" || phase === "weekSummary") {
    return "elimination";
  }
  return "final";
}

function portrayalsForCut(
  participantIds: string[],
  perspectiveIds: string[],
  tone: CutTone,
): Partial<Record<string, AudiencePortrayal[]>> {
  const focused: Record<CutTone, AudiencePortrayal[]> = {
    neutro: ["neutral"],
    engracado: ["sympathetic"],
    triste: ["vulnerable", "sympathetic"],
    malicioso: ["dishonest", "contradictory"],
    conflituoso: ["aggressive"],
    emocional: ["vulnerable", "sympathetic"],
  };
  const background: Record<CutTone, AudiencePortrayal[]> = {
    neutro: ["neutral"],
    engracado: ["neutral"],
    triste: ["defensive"],
    malicioso: ["defensive"],
    conflituoso: ["defensive"],
    emocional: ["neutral"],
  };
  return Object.fromEntries(participantIds.map((id) => [
    id,
    perspectiveIds.includes(id) ? focused[tone] : background[tone],
  ]));
}

type TimelineItem =
  | { id: string; kind: "ad"; title: string; duration: 4 }
  | ({ kind: "event"; approach: CutApproach } & RecordedEvent)
  | {
      id: string;
      kind: "important-event";
      chainId: string;
      title: string;
      duration: number;
      edit: ImportantEventEdit;
    };

type UiSeasonSave = {
  version: 1;
  started: boolean;
  phase: Phase;
  view: AppView;
  windowOpen: boolean;
  challengeType: ChallengeType | null;
  leaderId: string | null;
  activeIds: string[];
  week: number;
  timeline: TimelineItem[];
  eventApproaches: Record<string, CutApproach>;
  importantEventEdits?: Record<string, ImportantEventEdit>;
  feedVisibleCounts?: Record<string, number>;
  liveProgress: number;
  nominees: string[];
  audiencePick: string | null;
  lastEliminatedId: string | null;
  winnerId: string | null;
};

const inlineParticipants: Participant[] = [
  {
    id: "dandara",
    name: "Dandara Moraes",
    age: 27,
    city: "Salvador, BA",
    occupation: "Bartender e performer",
    bio: "Carismática, rápida nas respostas e incapaz de ignorar uma provocação. Quer usar o prêmio para abrir seu próprio bar.",
    quote: "Se a câmera está ligada, eu também estou.",
    traits: { resistencia: 4, sorte: 3, atencao: 5 },
    personalityTraits: {
      carisma: 5,
      estrategia: 3,
      impulsividade: 4,
      lealdade: 4,
      competitividade: 5,
      percepcaoSocial: 4,
      conscienciaDasCameras: 5,
    },
    personalTriggers: ["ser chamada de falsa", "ver um aliado sendo atacado", "sentir que tentam apagar sua presença"],
    behavioralTendencies: ["responde provocações imediatamente", "protege aliados em público", "transforma tensão em performance"],
    publicPersona: "A protagonista magnética que não foge de confronto e sempre entrega uma boa cena.",
    contradictions: ["prega lealdade, mas adora testar alianças", "parece autoconfiante, porém teme ser irrelevante"],
    strengths: ["presença de palco", "leitura rápida do ambiente", "coragem em conflitos"],
    weaknesses: ["dificuldade de recuar", "necessidade de validação", "exposição excessiva de suas intenções"],
    possibleArcs: ["liderança carismática da casa", "ruptura dramática com um aliado", "redenção após perceber que passou do ponto"],
    tags: ["magnética", "competitiva", "leal"],
    portrait: { x: "0%", y: "0%" },
  },
  {
    id: "bento",
    name: "Bento Farias",
    age: 31,
    city: "Campo Grande, MS",
    occupation: "Instrutor de montaria",
    bio: "Parece sereno até entrar numa disputa. Tem força de sobra, mas se perde quando precisa prestar atenção em detalhes.",
    quote: "Devagar também é um jeito de chegar primeiro.",
    traits: { resistencia: 5, sorte: 3, atencao: 2 },
    personalityTraits: {
      carisma: 3,
      estrategia: 2,
      impulsividade: 2,
      lealdade: 5,
      competitividade: 4,
      percepcaoSocial: 2,
      conscienciaDasCameras: 2,
    },
    personalTriggers: ["ser tratado como pouco inteligente", "quebra de palavra", "provocações durante provas"],
    behavioralTendencies: ["evita conflitos até acumular irritação", "cumpre acordos ao pé da letra", "fica mais agressivo em competições"],
    publicPersona: "O gigante tranquilo e confiável que prefere agir a falar.",
    contradictions: ["diz não ligar para estratégia, mas guarda cada traição", "parece paciente, porém odeia perder"],
    strengths: ["resistência", "constância", "lealdade"],
    weaknesses: ["baixa leitura social", "teimosia", "dificuldade com sutilezas"],
    possibleArcs: ["azarão que assume a liderança", "explosão depois de semanas em silêncio", "traição que abala seu código de honra"],
    tags: ["forte", "calmo", "teimoso"],
    portrait: { x: "50%", y: "0%" },
  },
  {
    id: "celina",
    name: "Celina Prado",
    age: 42,
    city: "Belo Horizonte, MG",
    occupation: "Jornalista investigativa",
    bio: "Observa antes de falar e raramente esquece uma frase. Entrou para provar que estratégia também rende entretenimento.",
    quote: "Toda casa tem uma pauta escondida.",
    traits: { resistencia: 2, sorte: 3, atencao: 5 },
    personalityTraits: {
      carisma: 3,
      estrategia: 5,
      impulsividade: 1,
      lealdade: 3,
      competitividade: 4,
      percepcaoSocial: 5,
      conscienciaDasCameras: 4,
    },
    personalTriggers: ["ser subestimada", "contradições evidentes", "perder o controle de uma conversa"],
    behavioralTendencies: ["observa antes de se posicionar", "faz perguntas para expor incoerências", "mantém opções abertas"],
    publicPersona: "A estrategista cerebral que enxerga as engrenagens por trás de cada relação.",
    contradictions: ["valoriza a verdade, mas omite informação quando convém", "quer parecer imparcial, embora seja muito competitiva"],
    strengths: ["memória", "planejamento", "percepção social"],
    weaknesses: ["frieza aparente", "excesso de controle", "dificuldade de criar intimidade"],
    possibleArcs: ["mentora que controla a casa", "queda causada por excesso de confiança", "vínculo afetivo que desmonta sua estratégia"],
    tags: ["analítica", "reservada", "incisiva"],
    portrait: { x: "100%", y: "0%" },
  },
  {
    id: "iago",
    name: "Iago Nunes",
    age: 24,
    city: "Guarulhos, SP",
    occupation: "Entregador por aplicativo",
    bio: "Improvisa, brinca e costuma cair de pé. É ótimo em criar alianças rápidas e péssimo em esconder quando está mentindo.",
    quote: "Se deu ruim, pelo menos virou história.",
    traits: { resistencia: 3, sorte: 5, atencao: 2 },
    personalityTraits: {
      carisma: 4,
      estrategia: 2,
      impulsividade: 5,
      lealdade: 2,
      competitividade: 3,
      percepcaoSocial: 3,
      conscienciaDasCameras: 4,
    },
    personalTriggers: ["ser encurralado", "silêncio constrangedor", "autoridade rígida"],
    behavioralTendencies: ["improvisa saídas", "faz promessas no calor do momento", "usa humor para desviar de cobranças"],
    publicPersona: "O sobrevivente divertido que transforma todo desastre em história.",
    contradictions: ["quer ser querido por todos, mas não sustenta todos os acordos", "parece despreocupado, porém monitora a própria imagem"],
    strengths: ["improviso", "facilidade de conexão", "resiliência"],
    weaknesses: ["indisciplina", "mentiras transparentes", "decisões de curto prazo"],
    possibleArcs: ["alívio cômico que vira peça-chave", "queda provocada por alianças incompatíveis", "amadurecimento após perder um aliado"],
    tags: ["sortudo", "engraçado", "impulsivo"],
    portrait: { x: "0%", y: "100%" },
  },
  {
    id: "jussara",
    name: "Jussara Lima",
    age: 35,
    city: "Recife, PE",
    occupation: "Manicure e comediante",
    bio: "Transforma qualquer silêncio em cena e todo desafeto em piada. Tem uma leitura afiada da casa e do público.",
    quote: "Meu voto é secreto, minha cara não.",
    traits: { resistencia: 2, sorte: 5, atencao: 3 },
    personalityTraits: {
      carisma: 5,
      estrategia: 4,
      impulsividade: 3,
      lealdade: 3,
      competitividade: 3,
      percepcaoSocial: 5,
      conscienciaDasCameras: 5,
    },
    personalTriggers: ["ser ridicularizada sem controlar a piada", "arrogância", "ser excluída de uma conversa"],
    behavioralTendencies: ["lê o clima antes de fazer humor", "espalha verdades em forma de piada", "aproxima grupos rivais"],
    publicPersona: "A comentarista popular da casa, capaz de dizer o que o público está pensando.",
    contradictions: ["usa humor como afeto e como arma", "parece aberta, mas protege cuidadosamente suas vulnerabilidades"],
    strengths: ["carisma", "timing cômico", "leitura das relações"],
    weaknesses: ["fofoca", "dificuldade de falar seriamente", "medo de virar alvo do riso"],
    possibleArcs: ["narradora querida da temporada", "piada que desencadeia um grande conflito", "revelação emocional por trás da comediante"],
    tags: ["hilária", "social", "imprevisível"],
    portrait: { x: "50%", y: "100%" },
  },
  {
    id: "ravi",
    name: "Ravi Barros",
    age: 29,
    city: "Florianópolis, SC",
    occupation: "Instrutor de surfe",
    bio: "Equilibrado e atento ao ambiente, mas demora para confiar. Quando decide competir, não mede esforço.",
    quote: "O segredo é saber qual onda deixar passar.",
    traits: { resistencia: 4, sorte: 2, atencao: 4 },
    personalityTraits: {
      carisma: 3,
      estrategia: 4,
      impulsividade: 1,
      lealdade: 4,
      competitividade: 4,
      percepcaoSocial: 4,
      conscienciaDasCameras: 2,
    },
    personalTriggers: ["pressão para se abrir", "traição de confiança", "caos desnecessário"],
    behavioralTendencies: ["espera antes de tomar partido", "observa padrões silenciosamente", "compete com intensidade sem provocar"],
    publicPersona: "O competidor equilibrado e misterioso que fala pouco, mas percebe muito.",
    contradictions: ["busca paz, mas se realiza na disputa", "quer conexões profundas, embora mantenha todos à distância"],
    strengths: ["autocontrole", "foco", "capacidade de observação"],
    weaknesses: ["isolamento", "lentidão para reagir politicamente", "dificuldade de demonstrar afeto"],
    possibleArcs: ["competidor silencioso que cresce no fim", "romance ou amizade que rompe sua reserva", "eliminação por demorar a escolher um lado"],
    tags: ["focado", "atlético", "cauteloso"],
    portrait: { x: "100%", y: "100%" },
  },
];

const participants: Participant[] = process.env.NEXT_PUBLIC_LEGACY_CONTENT === "inline"
  ? inlineParticipants
  : cast.map(({ challengeTraits, ...profile }) => ({ ...profile, traits: challengeTraits }));

const inlineRecordedEvents: RecordedEvent[] = [
  {
    id: "chegadas",
    title: "As primeiras chegadas",
    category: "Convivência",
    duration: 6,
    heat: 63,
    description: "Dandara assume a cozinha enquanto Iago tenta escolher a melhor cama.",
  },
  {
    id: "mala-trocada",
    title: "A mala trocada",
    category: "Humor",
    duration: 4,
    heat: 71,
    description: "Bento abre a mala de Jussara e desfila com um robe de paetês.",
  },
  {
    id: "pacto-varanda",
    title: "Pacto na varanda",
    category: "Convivência",
    duration: 5,
    heat: 58,
    description: "Celina, Ravi e Dandara combinam proteção para a primeira semana.",
  },
  {
    id: "cafe-sem-acucar",
    title: "A guerra do café",
    category: "Conflito",
    duration: 7,
    heat: 82,
    description: "Uma discussão sobre açúcar divide a casa antes mesmo do almoço.",
  },
  {
    id: "prova-lider",
    title: "A primeira Prova do Líder",
    category: "Prova",
    duration: 8,
    heat: 88,
    description: "Os melhores momentos da disputa e a coroação do primeiro líder.",
  },
  {
    id: "confessionario",
    title: "Confessionário pós-prova",
    category: "Convivência",
    duration: 4,
    heat: 66,
    description: "Vitória e frustração aparecem sem filtro no confessionário.",
  },
  {
    id: "festa-neon",
    title: "Festa Sinal de Verão",
    category: "Festa",
    duration: 7,
    heat: 90,
    description: "Dança, figurinos fluorescentes e uma aproximação inesperada.",
  },
  {
    id: "microfone-aberto",
    title: "Microfone aberto",
    category: "Conflito",
    duration: 6,
    heat: 94,
    description: "Um comentário que parecia privado chega à pessoa errada.",
  },
  {
    id: "danca-jussara",
    title: "O passinho de Jussara",
    category: "Humor",
    duration: 3,
    heat: 79,
    description: "A casa inteira aprende uma coreografia inventada na hora.",
  },
  {
    id: "indicacao-lider",
    title: "Indicação do líder",
    category: "Votação",
    duration: 5,
    heat: 85,
    description: "O líder justifica sua escolha diante de toda a casa.",
  },
  {
    id: "voto-casa",
    title: "Votação da casa",
    category: "Votação",
    duration: 7,
    heat: 92,
    description: "Votos abertos, justificativas tensas e o segundo nome da berlinda.",
  },
  {
    id: "despedida",
    title: "A despedida da semana",
    category: "Memória",
    duration: 6,
    heat: 87,
    description: "A trajetória do eliminado e as reações ao resultado.",
  },
  {
    id: "melhores-semana",
    title: "Melhores momentos",
    category: "Memória",
    duration: 7,
    heat: 75,
    description: "Uma montagem dos afetos, gafes e conflitos que definiram a semana.",
  },
  {
    id: "discursos-final",
    title: "Discursos dos finalistas",
    category: "Memória",
    duration: 8,
    heat: 96,
    description: "Cada finalista explica ao Brasil por que merece vencer.",
  },
];

const recordedEvents: RecordedEvent[] = process.env.NEXT_PUBLIC_LEGACY_CONTENT === "inline"
  ? inlineRecordedEvents
  : extractedRecordedEvents;

const weekOneEventGeneration = generateWeekEvents({
  weekNumber: 1,
  seed: WEEK_ONE_SEED,
  participants,
  secondaryEvents: recordedEvents,
});

const secondaryEvents = weekOneEventGeneration.secondaryEvents;
const weekOneImportantEventChain = weekOneEventGeneration.importantEventChains[0] ?? null;
const weekOneImportantEventBeats = weekOneImportantEventChain
  ? weekOneEventGeneration.importantEventBeats
    .filter((beat) => beat.chainId === weekOneImportantEventChain.id)
    .sort((left, right) => left.order - right.order)
  : [];

const allParticipantIds = participants.map((participant) => participant.id);

const eventParticipantIds: Record<string, string[]> = {
  chegadas: ["dandara", "iago", "celina"],
  "mala-trocada": ["bento", "jussara"],
  "pacto-varanda": ["celina", "ravi", "dandara"],
  "cafe-sem-acucar": ["bento", "jussara"],
  "prova-lider": allParticipantIds,
  confessionario: allParticipantIds,
  "festa-neon": ["dandara", "iago", "jussara", "ravi"],
  "microfone-aberto": ["celina", "jussara", "dandara"],
  "danca-jussara": ["jussara", "iago"],
  "indicacao-lider": allParticipantIds,
  "voto-casa": allParticipantIds,
  despedida: allParticipantIds,
  "melhores-semana": allParticipantIds,
  "discursos-final": allParticipantIds,
};

const adSlots: TimelineItem[] = [1, 2, 3, 4].map((number) => ({
  id: `intervalo-${number}`,
  kind: "ad" as const,
  title: `Intervalo ${number}`,
  duration: 4 as const,
}));

const inlineIntroFeed = [
  { id: "intro-dandara", time: "08:14", camera: "CAM 01 · SALA", title: "Dandara foi a primeira a entrar", body: "Ela já escolheu o sofá e está narrando a própria chegada.", category: "Convivência", participantIds: ["dandara"] },
  { id: "intro-camas", time: "08:26", camera: "CAM 04 · QUARTO", title: "Disputa silenciosa por camas", body: "Iago largou um tênis em cada cama. Celina anotou mentalmente.", category: "Convivência", participantIds: ["iago", "celina"] },
  { id: "intro-cafe", time: "09:02", camera: "CAM 07 · COZINHA", title: "Primeiro café, primeira faísca", body: "Bento usou o último filtro. Jussara chamou de crime federal.", category: "Humor", participantIds: ["bento", "jussara"] },
  { id: "intro-alianca", time: "09:41", camera: "CAM 03 · VARANDA", title: "Uma aliança começa a tomar forma", body: "Três participantes combinaram trocar informações antes da prova.", category: "Estratégia", participantIds: [] },
];

const inlinePartyFeed = [
  { id: "party-abertura", time: "23:18", camera: "CAM 02 · PISTA", title: "Começou a Festa Sinal de Verão", body: "Luzes fluorescentes, pista molhada e figurinos que desafiam o sinal da TV.", category: "Festa", participantIds: [] },
  { id: "party-aproximacao", time: "00:07", camera: "CAM 06 · BAR", title: "Uma aproximação inesperada", body: "Duas pessoas que quase não conversavam passaram vinte minutos juntas no bar.", category: "Relacionamento", participantIds: [] },
  { id: "party-microfone", time: "01:12", camera: "CAM 03 · VARANDA", title: "Comentário captado pelo microfone", body: "Uma crítica atravessou a festa e pode mudar os votos da casa.", category: "Comentário", participantIds: [] },
  { id: "party-coreografia", time: "02:36", camera: "CAM 05 · QUARTO", title: "Jussara encerra a noite com coreografia", body: "Até quem estava brigado apareceu para aprender o passinho.", category: "Festa", participantIds: ["jussara"] },
];

const introFeed = process.env.NEXT_PUBLIC_LEGACY_CONTENT === "inline" ? inlineIntroFeed : extractedIntroFeed;
const partyFeed = process.env.NEXT_PUBLIC_LEGACY_CONTENT === "inline" ? inlinePartyFeed : extractedPartyFeed;

type FeedPresentationItem =
  | { kind: "secondary"; id: string; time: string; camera: string; title: string; body: string; category: string; participantIds: string[] }
  | { kind: "important"; id: string; time: string; camera: string; chainId: string };

function withWeekOneImportantEvent(items: FeedPresentationItem[]): FeedPresentationItem[] {
  if (!weekOneImportantEventChain) return items;
  const importantItem: FeedPresentationItem = {
    kind: "important",
    id: `important-${weekOneImportantEventChain.id}`,
    time: "02:04",
    camera: "ARQUIVO · 5 CÂMERAS",
    chainId: weekOneImportantEventChain.id,
  };
  if (items.some((item) => item.id === importantItem.id)) return items;
  const minutesSincePartyStart = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return ((hours < 12 ? hours + 24 : hours) * 60) + minutes;
  };
  const insertionIndex = items.findIndex(
    (item) => {
      const hours = Number(item.time.split(":")[0]);
      const belongsToPartyNight = hours >= 18 || hours < 6;
      return belongsToPartyNight
        && minutesSincePartyStart(item.time) > minutesSincePartyStart(importantItem.time);
    },
  );
  return insertionIndex === -1
    ? [...items, importantItem]
    : [...items.slice(0, insertionIndex), importantItem, ...items.slice(insertionIndex)];
}

const importantEventRoleLabels: Record<ImportantEventBeatRole, string> = {
  Cause: "Causa",
  Rumor: "Rumor",
  Discovery: "Descoberta",
  Confrontation: "Confronto",
  Reaction: "Reação",
  Consequence: "Consequência",
};

function participantNames(participantIds: readonly string[]) {
  const names = participantIds
    .map((id) => participants.find((participant) => participant.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

function importantEventSummary(includeReaction: boolean) {
  const beats = includeReaction ? weekOneImportantEventBeats : weekOneImportantEventBeats.slice(0, 4);
  return beats.map((beat) => beat.description).join(" ");
}

const importantEventFeedSummary = "Um comentário sobre a prova se espalha pela casa, provoca desconforto e divide o grupo.";

function importantEventPrimaryLocations() {
  const primaryLocations = [weekOneImportantEventBeats[0]?.location, weekOneImportantEventBeats[3]?.location]
    .filter((location): location is string => Boolean(location));
  return [...new Set(primaryLocations)].join(" e ");
}

const importantEventStatusLabels = {
  not_edited: "Não editado",
  editing: "Edição em andamento",
  ready: "Pronto para o programa",
} as const;

const importantBeatDurationSeconds: Record<ImportantEventBeatRole, number> = {
  Cause: 50,
  Rumor: 45,
  Discovery: 40,
  Confrontation: 70,
  Reaction: 55,
  Consequence: 55,
};

function importantEditDuration(selectedBeatIds: readonly string[]) {
  return weekOneImportantEventBeats
    .filter((beat) => selectedBeatIds.includes(beat.id))
    .reduce((total, beat) => total + importantBeatDurationSeconds[beat.role], 0);
}

function createDefaultImportantEdit(chainId: string): ImportantEventEdit {
  const selectedBeatIds = weekOneImportantEventBeats.map((beat) => beat.id);
  const analysis = analyzeImportantEventEdit({
    beats: weekOneImportantEventBeats,
    participants,
    selectedBeatIds,
    televisedOrder: selectedBeatIds,
  });
  return {
    chainId,
    selectedBeatIds,
    excludedBeatIds: [],
    televisedOrder: [...selectedBeatIds],
    ...analysis,
    finalDurationSeconds: importantEditDuration(selectedBeatIds),
    status: "not_edited",
  };
}

function withAutomaticImportantAnalysis(edit: ImportantEventEdit): ImportantEventEdit {
  const selectedBeatIds = edit.selectedBeatIds.filter((id) => weekOneImportantEventBeats.some((beat) => beat.id === id));
  const televisedOrder = [
    ...edit.televisedOrder.filter((id) => selectedBeatIds.includes(id)),
    ...selectedBeatIds.filter((id) => !edit.televisedOrder.includes(id)),
  ];
  const excludedBeatIds = weekOneImportantEventBeats
    .map((beat) => beat.id)
    .filter((id) => !selectedBeatIds.includes(id));
  const analysis = analyzeImportantEventEdit({
    beats: weekOneImportantEventBeats,
    participants,
    selectedBeatIds,
    televisedOrder,
  });
  return {
    ...edit,
    selectedBeatIds,
    excludedBeatIds,
    televisedOrder,
    ...analysis,
    finalDurationSeconds: importantEditDuration(selectedBeatIds),
  };
}

function formatClockDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function importantMainFocusLabel(participantIds: readonly string[]) {
  if (participantIds.length === 0) return "Sem foco claro";
  if (participantIds.length === 1) return participantNames(participantIds);
  if (participantIds.length === 2) return `Dividido entre ${participantNames(participantIds)}`;
  return `Foco no conjunto: ${participantNames(participantIds)}`;
}

function importantAnalysisSignature(edit: ImportantEventEdit) {
  return JSON.stringify({
    focus: edit.mainFocusParticipantIds,
    favored: edit.favoredParticipantIds,
    harmed: edit.harmedParticipantIds,
    construction: edit.detectedEditorialConstruction,
    missingContext: edit.missingContextDescription,
    summary: edit.versionSummary,
  });
}

const UI_SAVE_KEY = "rede-plana-ui-season";

function Avatar({
  participant,
  size = "medium",
  eliminated = false,
}: {
  participant: Participant;
  size?: "small" | "medium" | "large";
  eliminated?: boolean;
}) {
  return (
    <div
      className={`avatar avatar-${size}${eliminated ? " avatar-eliminated" : ""}`}
      role="img"
      aria-label={`Retrato de ${participant.name}`}
      style={{
        backgroundImage: "url('/participantes-casting.png')",
        backgroundPosition: `${participant.portrait.x} ${participant.portrait.y}`,
      }}
    />
  );
}

function AppIcon({
  symbol,
  label,
  onClick,
  active,
  disabled = false,
}: {
  symbol: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button className={`desktop-icon${active ? " is-active" : ""}`} disabled={disabled} onClick={onClick} type="button">
      <span className="desktop-icon-art" aria-hidden="true">{symbol}</span>
      <span>{label}</span>
    </button>
  );
}

function ThemeSwitch({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === "dark";

  return (
    <button
      aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      aria-pressed={dark}
      className="theme-switch"
      onClick={onToggle}
      type="button"
    >
      <span aria-hidden="true">{dark ? "☀" : "◐"}</span>
      <b>{dark ? "CLARO" : "ESCURO"}</b>
    </button>
  );
}

function NarrativeParticipantValue({
  participantIds,
  emptyLabel,
  focus = false,
}: {
  participantIds: readonly string[];
  emptyLabel: string;
  focus?: boolean;
}) {
  const selectedParticipants = participantIds
    .map((id) => participants.find((participant) => participant.id === id))
    .filter((participant): participant is Participant => Boolean(participant));

  return (
    <div className="narrative-participant-value">
      {selectedParticipants.length > 0 && (
        <div aria-hidden="true">
          {selectedParticipants.map((participant) => <Avatar key={participant.id} participant={participant} size="small" />)}
        </div>
      )}
      <b>{selectedParticipants.length === 0
        ? emptyLabel
        : focus
          ? importantMainFocusLabel(participantIds)
          : participantNames(participantIds)}</b>
    </div>
  );
}

function RestartGameControl({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button className="restart-game-button" onClick={() => setConfirming(true)} type="button">
        <span aria-hidden="true">↻</span> RECOMEÇAR
      </button>
      {confirming && (
        <div className="restart-confirm-backdrop" role="presentation">
          <section aria-labelledby="restart-game-title" aria-modal="true" className="restart-confirm-dialog" role="dialog">
            <span className="restart-confirm-icon" aria-hidden="true">!</span>
            <h2 id="restart-game-title">Recomeçar temporada?</h2>
            <p>Todo o progresso salvo será apagado. O jogo voltará ao início da Semana 1.</p>
            <div className="restart-confirm-actions">
              <button className="button" onClick={() => setConfirming(false)} type="button">Cancelar</button>
              <button className="button button-primary" onClick={onConfirm} type="button">Recomeçar da Semana 1</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default function Home() {
  const engineMode = process.env.NEXT_PUBLIC_EVENT_ENGINE_MODE === "legacy" ? "legacy" : "dynamic";
  const audienceMode = process.env.NEXT_PUBLIC_AUDIENCE_ENGINE_MODE === "legacy"
    ? "legacy"
    : process.env.NEXT_PUBLIC_AUDIENCE_ENGINE_MODE === "shadow"
      ? "shadow"
      : "clustered";
  const [shadowGameState, dispatchGame, engineControls] = useGameEngine(
    "rede-plana-dynamic-v1",
    engineMode,
    audienceMode,
  );
  const [theme, setTheme] = useState<Theme>("light");
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("email");
  const [view, setView] = useState<AppView>("mail");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [openImportantChainId, setOpenImportantChainId] = useState<string | null>(null);
  const [windowOpen, setWindowOpen] = useState(true);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [selectedFeedItemId, setSelectedFeedItemId] = useState<string | null>(null);
  const [seenFeedItemIds, setSeenFeedItemIds] = useState<Set<string>>(() => new Set());
  const [dismissedGuideMessage, setDismissedGuideMessage] = useState<string | null>(null);
  const [challengeType, setChallengeType] = useState<ChallengeType | null>(null);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [activeIds, setActiveIds] = useState(() => participants.map((participant) => participant.id));
  const [week, setWeek] = useState(1);
  const [timeline, setTimeline] = useState<TimelineItem[]>(adSlots);
  const [eventApproaches, setEventApproaches] = useState<Record<string, CutApproach>>({});
  const [importantEventEdits, setImportantEventEdits] = useState<Record<string, ImportantEventEdit>>({});
  const [feedVisibleCounts, setFeedVisibleCounts] = useState<Record<string, number>>({});
  const [feedSecondsRemaining, setFeedSecondsRemaining] = useState(Math.ceil(FEED_REFRESH_MS / 1000));
  const [editingImportantChainId, setEditingImportantChainId] = useState<string | null>(null);
  const [importantEditError, setImportantEditError] = useState("");
  const [draggedImportantBeatId, setDraggedImportantBeatId] = useState<string | null>(null);
  const [importantReadingChange, setImportantReadingChange] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [sort, setSort] = useState("gravacao");
  const [editorError, setEditorError] = useState("");
  const [dragged, setDragged] = useState<{ source: "bank" | "timeline"; id: string } | null>(null);
  const [highlightedEditorItemId, setHighlightedEditorItemId] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState(0);
  const [nominees, setNominees] = useState<string[]>([]);
  const [audiencePick, setAudiencePick] = useState<string | null>(null);
  const [lastEliminatedId, setLastEliminatedId] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const uiSaveReady = useRef(false);
  const restartingSeason = useRef(false);
  const importantReadingChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(UI_SAVE_KEY);
    if (!raw) {
      uiSaveReady.current = true;
      return;
    }
    let saved: UiSeasonSave | null = null;
    try {
      const parsed = JSON.parse(raw) as UiSeasonSave;
      if (parsed.version === 1 && Array.isArray(parsed.activeIds) && Array.isArray(parsed.timeline)) saved = parsed;
    } catch {
      saved = null;
    }
    const frame = window.requestAnimationFrame(() => {
      if (saved) {
        setStarted(saved.started);
        setPhase(saved.phase);
        setView(saved.view);
        setWindowOpen(saved.windowOpen);
        setChallengeType(saved.challengeType);
        setLeaderId(saved.leaderId);
        setActiveIds(saved.activeIds);
        setWeek(saved.week);
        setTimeline(saved.timeline);
        setEventApproaches(saved.eventApproaches);
        setImportantEventEdits(saved.importantEventEdits ?? {});
        setFeedVisibleCounts(saved.feedVisibleCounts ?? {});
        setLiveProgress(saved.liveProgress);
        setNominees(saved.nominees);
        setAudiencePick(saved.audiencePick);
        setLastEliminatedId(saved.lastEliminatedId);
        setWinnerId(saved.winnerId);
      }
      uiSaveReady.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!uiSaveReady.current || restartingSeason.current) return;
    const saved: UiSeasonSave = {
      version: 1,
      started,
      phase,
      view,
      windowOpen,
      challengeType,
      leaderId,
      activeIds,
      week,
      timeline,
      eventApproaches,
      importantEventEdits,
      feedVisibleCounts,
      liveProgress,
      nominees,
      audiencePick,
      lastEliminatedId,
      winnerId,
    };
    window.localStorage.setItem(UI_SAVE_KEY, JSON.stringify(saved));
  }, [
    activeIds,
    audiencePick,
    challengeType,
    eventApproaches,
    feedVisibleCounts,
    importantEventEdits,
    lastEliminatedId,
    leaderId,
    liveProgress,
    nominees,
    phase,
    started,
    timeline,
    view,
    week,
    windowOpen,
    winnerId,
  ]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("rede-plana-theme");
    if (savedTheme !== "dark" && savedTheme !== "light") return;
    const frame = window.requestAnimationFrame(() => setTheme(savedTheme));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!openImportantChainId && !editingImportantChainId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editingImportantChainId) setEditingImportantChainId(null);
      else setOpenImportantChainId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editingImportantChainId, openImportantChainId]);

  useEffect(() => () => {
    if (importantReadingChangeTimer.current) clearTimeout(importantReadingChangeTimer.current);
  }, []);

  useEffect(() => {
    if (!startMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStartMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [startMenuOpen]);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      window.localStorage.setItem("rede-plana-theme", next);
      return next;
    });
  }

  const activeParticipants = useMemo(
    () => participants.filter((participant) => activeIds.includes(participant.id)),
    [activeIds],
  );
  const involvedIdsFor = useCallback((event: RecordedEvent) => {
    if (event.actorIds?.length) return event.actorIds;
    const configuredIds = eventParticipantIds[event.id] ?? allParticipantIds;
    const activeInvolvedIds = configuredIds.filter((id) => activeIds.includes(id));
    return activeInvolvedIds.length > 0 ? activeInvolvedIds : activeIds;
  }, [activeIds]);

  const leader = participants.find((participant) => participant.id === leaderId) ?? null;
  const lastEliminated = participants.find((participant) => participant.id === lastEliminatedId) ?? null;
  const winner = participants.find((participant) => participant.id === winnerId) ?? null;
  const pendingAudienceVote = shadowGameState.audienceModel.pendingVote;
  const latestEliminationVote = [...shadowGameState.audienceModel.voteHistory]
    .reverse()
    .find((vote) => vote.kind === "elimination" && vote.week === week);
  const latestFinalVote = [...shadowGameState.audienceModel.voteHistory]
    .reverse()
    .find((vote) => vote.kind === "final");
  const legacyEliminationChoice = selectLegacyAudienceVoteChoice(
    shadowGameState,
    "elimination",
    shadowGameState.competition.nomineeIds,
  );
  const legacyFinalChoice = selectLegacyAudienceVoteChoice(
    shadowGameState,
    "final",
    activeIds,
  );
  const audienceBroadcasts = shadowGameState.broadcasts.filter((broadcast) => Boolean(broadcast.result));
  const latestAudienceBroadcast = audienceBroadcasts.at(-1) ?? null;
  const latestAudienceResult = latestAudienceBroadcast?.result ?? null;
  const currentWeekAudienceBroadcasts = audienceBroadcasts.filter((broadcast) => broadcast.week === week);
  const seasonPeakRating = audienceBroadcasts.reduce(
    (peak, broadcast) => Math.max(peak, broadcast.result?.peakRating ?? 0),
    0,
  );
  const latestChallengeResult = [...shadowGameState.competition.challengeHistory]
    .reverse()
    .find((result) => result.week === week) ?? null;
  const challengeRunnerUp = latestChallengeResult?.standings[1]
    ? participants.find((participant) => participant.id === latestChallengeResult.standings[1].participantId) ?? null
    : null;
  const openImportantChain = weekOneEventGeneration.importantEventChains
    .find((chain) => chain.id === openImportantChainId) ?? null;
  const openImportantBeats = openImportantChain
    ? weekOneEventGeneration.importantEventBeats
      .filter((beat) => beat.chainId === openImportantChain.id)
      .sort((left, right) => left.order - right.order)
    : [];
  const openImportantParticipants = openImportantChain
    ? participants.filter((participant) => openImportantChain.participantIds.includes(participant.id))
    : [];
  const editingImportantChain = weekOneEventGeneration.importantEventChains
    .find((chain) => chain.id === editingImportantChainId) ?? null;
  const editingImportantEdit = editingImportantChain
    ? importantEventEdits[editingImportantChain.id] ?? null
    : null;
  const includedImportantBeats = editingImportantEdit
    ? editingImportantEdit.televisedOrder
      .map((id) => weekOneImportantEventBeats.find((beat) => beat.id === id))
      .filter((beat): beat is ImportantEventBeat => Boolean(beat))
    : [];
  const excludedImportantBeats = editingImportantEdit
    ? weekOneImportantEventBeats.filter((beat) => !editingImportantEdit.selectedBeatIds.includes(beat.id))
    : [];
  const importantVersionValidation = editingImportantEdit
    ? validateImportantEventVersion(
      editingImportantEdit.selectedBeatIds.length,
      editingImportantEdit.finalDurationSeconds,
    )
    : null;
  const editingImportantParticipants = editingImportantChain
    ? editingImportantChain.participantIds
      .map((id) => participants.find((participant) => participant.id === id))
      .filter((participant): participant is Participant => Boolean(participant))
    : [];

  const isEditPhase = phase === "editPremiere" || phase === "editChallenge" || phase === "editVote" || phase === "editElimination" || phase === "editFinal";
  const isLivePhase = phase === "livePremiere" || phase === "liveChallenge" || phase === "liveVote" || phase === "liveElimination" || phase === "liveFinal";
  const importantEventReleased = isStoryWindowReleased(shadowGameState, "party", 1);
  const releasedCanonicalEvents = useMemo(
    () => selectReleasedEvents(shadowGameState),
    [shadowGameState],
  );
  const canonicalEventById = useMemo(
    () => new Map(releasedCanonicalEvents.map((event) => [event.id, event])),
    [releasedCanonicalEvents],
  );
  const feedReleaseStage = feedReleaseStageForPhase(phase);
  const feedStageKey = `${week}:${feedReleaseStage}`;
  const allFeedItems = useMemo(() => {
    const dynamicItems = selectFeedBatch(shadowGameState, feedReleaseStage, week);
    const legacyItems = feedReleaseStage === "party"
      || feedReleaseStage === "nomination"
      || feedReleaseStage === "elimination"
      ? partyFeed
      : introFeed;
    const sourceItems = selectFeedSource(dynamicItems, legacyItems, {
      dynamicReady: engineControls.ready,
      mode: shadowGameState.mode,
      dynamicAuthoritative: true,
    });
    const secondaryItems: FeedPresentationItem[] = sourceItems.map((item) => ({ kind: "secondary", ...item }));
    return week === 1
      && importantEventReleased
      && feedReleaseStage === "party"
      ? withWeekOneImportantEvent(secondaryItems)
      : secondaryItems;
  }, [
    engineControls.ready,
    feedReleaseStage,
    importantEventReleased,
    shadowGameState,
    week,
  ]);
  const visibleFeedCount = Math.min(
    allFeedItems.length,
    feedVisibleCounts[feedStageKey] ?? 0,
  );
  const feedSynchronized = visibleFeedCount >= allFeedItems.length;
  const hasAiredCurrentChallengeEpisode = shadowGameState.broadcasts.some((broadcast) =>
    broadcast.week === week
    && (!broadcast.episode || broadcast.episode.kind === (week === 1 ? "premiere" : "challenge")));

  useEffect(() => {
    if (!engineControls.ready || !uiSaveReady.current || phase !== "feedPostChallenge") return;
    const frame = window.requestAnimationFrame(() => {
      if (hasAiredCurrentChallengeEpisode) {
        dispatchGame({ type: "START_PARTY" });
        setPhase("feedParty");
        setView("feed");
        setWindowOpen(true);
        return;
      }
      setPhase(week === 1 ? "editPremiere" : "editChallenge");
      setView("edit");
      setWindowOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dispatchGame, engineControls.ready, hasAiredCurrentChallengeEpisode, phase, week]);

  useEffect(() => {
    if (view !== "feed" || !windowOpen || feedSynchronized) return;
    const revealStartedAt = Date.now();
    const countdown = window.setInterval(() => {
      const elapsedInCycle = (Date.now() - revealStartedAt) % FEED_REFRESH_MS;
      const remainingMs = Math.max(0, FEED_REFRESH_MS - elapsedInCycle);
      setFeedSecondsRemaining(Math.max(1, Math.ceil(remainingMs / 1000)));
    }, 250);
    const reveal = window.setInterval(() => {
      setFeedVisibleCounts((current) => {
        const currentCount = current[feedStageKey] ?? 0;
        if (currentCount >= allFeedItems.length) return current;
        return { ...current, [feedStageKey]: currentCount + 1 };
      });
    }, FEED_REFRESH_MS);
    return () => {
      window.clearInterval(countdown);
      window.clearInterval(reveal);
    };
  }, [
    allFeedItems.length,
    feedStageKey,
    feedSynchronized,
    view,
    windowOpen,
  ]);

  useEffect(() => {
    if (
      !engineControls.ready
      || !uiSaveReady.current
    ) return;
    const releasedTimeline = importantEventReleased
      ? timeline
      : timeline.filter((item) => item.kind !== "important-event");
    const reconciled = shadowGameState.audienceModel.mode === "legacy"
      ? releasedTimeline
      : reconcileTimelineWithCanonicalHistory(releasedTimeline, canonicalEventById.keys());
    if (reconciled === timeline) return;
    const frame = window.requestAnimationFrame(() => {
      setTimeline(reconciled);
      if (isEditPhase) {
        setEditorError("Um bloco antigo sem gravação canônica foi removido. Escolha outro acontecimento do banco.");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    canonicalEventById,
    engineControls.ready,
    importantEventReleased,
    isEditPhase,
    shadowGameState.audienceModel.mode,
    timeline,
  ]);

  const episodeBankEvents = useMemo(() => {
    const episodeKind =
      phase === "editPremiere" ? "premiere"
        : phase === "editChallenge" ? "challenge"
        : phase === "editVote" ? "vote"
          : phase === "editElimination" ? "elimination"
            : "final";
    const selectedIds = new Set(timeline.filter((item) => item.kind === "event").map((item) => item.id));
    const dynamicEvents = selectAvailableFootage(shadowGameState, {
      week,
      episodeKind,
      excludedInstanceIds: selectedIds,
    }).map((event) => toEpisodeFootageView(event, episodeKind));
    const ids =
      phase === "editPremiere"
        ? ["chegadas", "mala-trocada", "pacto-varanda", "cafe-sem-acucar", "prova-lider", "confessionario"]
        : phase === "editChallenge"
          ? ["prova-lider", "confessionario", "pacto-varanda", "melhores-semana"]
        : phase === "editVote"
          ? ["festa-neon", "microfone-aberto", "danca-jussara", "pacto-varanda", "indicacao-lider", "voto-casa"]
          : phase === "editElimination"
            ? ["melhores-semana", "microfone-aberto", "indicacao-lider", "voto-casa", "despedida"]
            : ["melhores-semana", "festa-neon", "prova-lider", "discursos-final", "confessionario"];

    const dynamicEpisode = phase === "editPremiere" || phase === "editChallenge" || phase === "editVote" || phase === "editElimination" || phase === "editFinal";
    const legacyEvents = secondaryEvents.filter(
      (event) => ids.includes(event.id) && !selectedIds.has(event.id),
    );
    return selectEditorEpisodeBank<RecordedEvent>(dynamicEvents, legacyEvents, {
      requiresCanonicalHistory: shadowGameState.audienceModel.mode !== "legacy",
      dynamicEngine: dynamicEpisode && shadowGameState.mode === "dynamic",
    });
  }, [phase, timeline, shadowGameState, week]);

  const availableEvents = useMemo(() => {
    let events = episodeBankEvents;
    if (category !== "Todos") events = events.filter((event) => event.category === category);
    if (search.trim()) {
      const query = search.toLocaleLowerCase("pt-BR");
      events = events.filter((event) => `${event.title} ${event.description}`.toLocaleLowerCase("pt-BR").includes(query));
    }
    return sort === "duracao" ? [...events].sort((a, b) => a.duration - b.duration) : events;
  }, [episodeBankEvents, category, search, sort]);

  const timelineDurationSeconds = timeline.reduce(
    (sum, item) => sum + (item.kind === "important-event" ? item.edit.finalDurationSeconds : item.duration * 60),
    0,
  );
  const eventCount = timeline.filter((item) => item.kind === "event" || item.kind === "important-event").length;
  const selectedEventIds = new Set(timeline.filter((item) => item.kind === "event").map((item) => item.id));
  const isRequiredForCurrentEdit = (event: Pick<RecordedEvent, "id" | "requiredAnchor">) => {
    const canonicalEvent = canonicalEventById.get(event.id);
    return canonicalEvent
      ? isRequiredEpisodeFootage(canonicalEvent, episodeKindForPhase(phase))
      : Boolean(event.requiredAnchor);
  };
  const requiredEventCatalog = [...timeline.filter((item): item is TimelineItem & { kind: "event" } => item.kind === "event"), ...episodeBankEvents]
    .filter(isRequiredForCurrentEdit)
    .filter((event, index, events) => events.findIndex((candidate) => candidate.id === event.id) === index)
    .map((event) => ({ id: event.id, title: event.title, included: selectedEventIds.has(event.id) }));
  const missingRequiredEvents = requiredEventCatalog.filter((event) => !event.included);
  const durationReading = classifyDuration(timelineDurationSeconds);
  const rhythmReading = classifyRhythm(timeline
    .filter((item) => item.kind !== "ad")
    .map((item) => item.kind === "important-event" ? item.edit.finalDurationSeconds / 60 : item.duration));
  const varietyReading = classifyVariety(timeline
    .filter((item): item is TimelineItem & { kind: "event" } => item.kind === "event")
    .map((item) => item.category));
  const focusReading = classifyFocus(timeline
    .filter((item) => item.kind !== "ad")
    .map((item) => item.kind === "event"
      ? participantIdsForEditorEvent(item)
      : [...new Set(weekOneImportantEventBeats
        .filter((beat) => item.edit.selectedBeatIds.includes(beat.id))
        .flatMap((beat) => beat.participantIds))]),
  (id) => participants.find((participant) => participant.id === id)?.name.split(" ")[0] ?? id);
  const editorialAlerts = buildEditorialAlerts(durationReading, focusReading, varietyReading, rhythmReading);
  const plannedEpisode = useMemo<BroadcastEpisode>(() => {
    const kind = episodeKindForPhase(phase);
    const segments = timeline.map<BroadcastSegment>((item, index) => {
      if (item.kind === "ad") {
        return {
          id: item.id,
          kind: "commercial",
          title: item.title,
          durationSeconds: item.duration * 60,
          breakNumber: Number.parseInt(item.id.replace(/\D+/g, ""), 10) || index + 1,
        };
      }
      if (item.kind === "important-event") {
        const selectedBeatIds = item.edit.televisedOrder.filter((id) => item.edit.selectedBeatIds.includes(id));
        const selectedBeats = weekOneImportantEventBeats.filter((beat) => selectedBeatIds.includes(beat.id));
        const participantIds = [...new Set(selectedBeats.flatMap((beat) => beat.participantIds))];
        const contextCompleteness = item.edit.detectedEditorialConstruction === "full_context" ? 1
          : item.edit.detectedEditorialConstruction === "balanced_cut" ? 0.86
            : item.edit.detectedEditorialConstruction === "speech_comparison" ? 0.72
              : item.edit.detectedEditorialConstruction === "unilateral_version" ? 0.55
                : item.edit.detectedEditorialConstruction === "fragmented_conflict" ? 0.42
                  : 0.32;
        const portrayals: Partial<Record<string, AudiencePortrayal[]>> = {};
        for (const id of participantIds) portrayals[id] = ["neutral"];
        for (const id of item.edit.favoredParticipantIds) portrayals[id] = ["sympathetic", "justified"];
        for (const id of item.edit.harmedParticipantIds) portrayals[id] = ["aggressive", "contradictory"];
        return {
          id: item.id,
          kind: "important_event",
          title: item.title,
          durationSeconds: item.edit.finalDurationSeconds,
          chainId: item.chainId,
          sourceBeatIds: selectedBeatIds,
          participantIds,
          favoredParticipantIds: [...item.edit.favoredParticipantIds],
          harmedParticipantIds: [...item.edit.harmedParticipantIds],
          signals: {
            conflict: 0.9,
            relationships: 0.72,
            authenticity: contextCompleteness,
            fairness: item.edit.detectedEditorialConstruction === "full_context" ? 0.86 : 0.45,
            vulnerability: 0.65,
          },
          portrayals,
          contextCompleteness,
          storylineHook: 0.9,
        };
      }
      const canonicalEvent = canonicalEventById.get(item.id);
      const participantIds = involvedIdsFor(item);
      return {
        id: item.id,
        kind: "content",
        title: item.title,
        durationSeconds: item.duration * 60,
        sourceEventId: item.id,
        participantIds,
        perspectiveIds: [...item.approach.perspectiveIds],
        tone: item.approach.tone,
        signals: canonicalEvent?.audienceSignals ?? deriveAudienceSignals(item.category),
        portrayals: portrayalsForCut(participantIds, item.approach.perspectiveIds, item.approach.tone),
        contextCompleteness: item.approach.perspectiveIds.length < participantIds.length ? 0.58 : 0.82,
        storylineHook: Math.max(0.2, Math.min(1, item.heat / 100)),
        revealsEliminatedParticipantId: kind === "elimination"
          && canonicalEvent?.templateId === "anchor:elimination-result"
          ? canonicalEvent.roleBindings.eliminated?.[0]
          : undefined,
      };
    });
    return {
      id: `${shadowGameState.seasonId}:w${week}:${kind}`,
      week,
      kind,
      schedule: { ...AUDIENCE_SCHEDULES[kind] },
      segments,
    };
  }, [canonicalEventById, involvedIdsFor, phase, shadowGameState.seasonId, timeline, week]);
  const plannedCuts = useMemo(() => {
    const knownEventIds = new Set(shadowGameState.house.eventHistory.map((event) => event.id));
    return timeline
      .filter((item): item is TimelineItem & { kind: "event" } => item.kind === "event" && knownEventIds.has(item.id))
      .map((item) => ({
        eventInstanceId: item.id,
        perspectiveIds: item.approach.perspectiveIds,
        tone: item.approach.tone,
      }));
  }, [shadowGameState.house.eventHistory, timeline]);
  function begin() {
    setStarted(true);
    setPhase("email");
    setView("mail");
    setWindowOpen(true);
  }

  function openFeed() {
    if (phase === "email") setPhase("feedIntro");
    setView("feed");
    setWindowOpen(true);
  }

  function openChallenge() {
    if (phase !== "challenge") return;
    setView("challenge");
    setWindowOpen(true);
  }

  function startEdit(nextPhase: Extract<Phase, "editPremiere" | "editChallenge" | "editVote" | "editElimination" | "editFinal">) {
    setPhase(nextPhase);
    setView("edit");
    setTimeline(adSlots);
    setEventApproaches({});
    setSearch("");
    setCategory("Todos");
    setSort("gravacao");
    setEditorError("");
    setWindowOpen(true);
  }

  function restartFromStartMenu() {
    const confirmed = window.confirm(
      "Reiniciar a temporada? Todo o progresso salvo do jogo atual será apagado.",
    );
    if (!confirmed) return;
    restartSeason();
  }

  function confirmChallenge() {
    if (!challengeType) return;
    const command = { type: "SELECT_CHALLENGE", challengeType } as const;
    const canonicalResult = reduceGame(shadowGameState, command);
    if (canonicalResult.diagnostic) return;
    dispatchGame(command);
    startEdit(week === 1 ? "editPremiere" : "editChallenge");
  }

  function openNextEpisodeFeed() {
    if (phase === "summaryVote") {
      setPhase("feedNomination");
      setView("feed");
      setWindowOpen(true);
      return;
    }
    dispatchGame({ type: "START_PARTY" });
    setPhase("feedParty");
    setView("feed");
    setWindowOpen(true);
  }

  function participantIdsForEditorEvent(event: RecordedEvent) {
    const configuredIds = event.actorIds?.length ? event.actorIds : eventParticipantIds[event.id] ?? [];
    return configuredIds.filter((id) => activeIds.includes(id));
  }

  function neutralApproachFor(event: RecordedEvent): CutApproach {
    return { perspectiveIds: involvedIdsFor(event), tone: "neutro" };
  }

  function openImportantEventEditor(chainId: string) {
    setImportantEventEdits((current) => {
      const existing = withAutomaticImportantAnalysis(current[chainId] ?? createDefaultImportantEdit(chainId));
      return {
        ...current,
        [chainId]: { ...existing, status: "editing" },
      };
    });
    setImportantEditError("");
    setImportantReadingChange("");
    setEditingImportantChainId(chainId);
  }

  function announceImportantReadingChange(message: string) {
    if (importantReadingChangeTimer.current) clearTimeout(importantReadingChangeTimer.current);
    setImportantReadingChange(message);
    importantReadingChangeTimer.current = setTimeout(() => {
      setImportantReadingChange("");
      importantReadingChangeTimer.current = null;
    }, 2000);
  }

  function updateImportantEventEdit(
    chainId: string,
    update: (current: ImportantEventEdit) => ImportantEventEdit,
    changeLabel?: string,
  ) {
    const existing = withAutomaticImportantAnalysis(
      importantEventEdits[chainId] ?? createDefaultImportantEdit(chainId),
    );
    const next = withAutomaticImportantAnalysis(update(existing));
    setImportantEventEdits((current) => ({
      ...current,
      [chainId]: { ...next, status: "editing" },
    }));
    if (changeLabel && importantAnalysisSignature(existing) !== importantAnalysisSignature(next)) {
      announceImportantReadingChange(`${changeLabel} ${next.versionSummary}`);
    }
    setImportantEditError("");
  }

  function toggleImportantBeat(chainId: string, beatId: string) {
    const beat = weekOneImportantEventBeats.find((item) => item.id === beatId);
    const wasIncluded = importantEventEdits[chainId]?.selectedBeatIds.includes(beatId) ?? true;
    updateImportantEventEdit(chainId, (current) => {
      const included = current.selectedBeatIds.includes(beatId);
      const selectedBeatIds = included
        ? current.selectedBeatIds.filter((id) => id !== beatId)
        : [...current.selectedBeatIds, beatId];
      const televisedOrder = included
        ? current.televisedOrder.filter((id) => id !== beatId)
        : [...current.televisedOrder, beatId];
      const excludedBeatIds = weekOneImportantEventBeats
        .map((beat) => beat.id)
        .filter((id) => !selectedBeatIds.includes(id));
      return { ...current, selectedBeatIds, excludedBeatIds, televisedOrder };
    }, beat ? `${wasIncluded ? "Retirado" : "Incluído"}: “${beat.title}”.` : "A seleção mudou.");
  }

  function restartSeason() {
    restartingSeason.current = true;
    window.localStorage.removeItem(UI_SAVE_KEY);
    engineControls.resetSeason();
    window.location.replace(window.location.pathname);
  }

  function moveImportantBeat(chainId: string, beatId: string, direction: -1 | 1) {
    updateImportantEventEdit(chainId, (current) => {
      const index = current.televisedOrder.indexOf(beatId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.televisedOrder.length) return current;
      const televisedOrder = [...current.televisedOrder];
      [televisedOrder[index], televisedOrder[nextIndex]] = [televisedOrder[nextIndex], televisedOrder[index]];
      return { ...current, televisedOrder };
    }, "A ordem exibida mudou.");
  }

  function reorderImportantBeat(chainId: string, sourceBeatId: string, targetBeatId: string) {
    if (sourceBeatId === targetBeatId) return;
    updateImportantEventEdit(chainId, (current) => {
      const televisedOrder = current.televisedOrder.filter((id) => id !== sourceBeatId);
      const targetIndex = televisedOrder.indexOf(targetBeatId);
      if (targetIndex < 0) return current;
      televisedOrder.splice(targetIndex, 0, sourceBeatId);
      return { ...current, televisedOrder };
    }, "A ordem exibida mudou.");
  }

  function closeImportantDraft() {
    setDraggedImportantBeatId(null);
    setImportantReadingChange("");
    setImportantEditError("");
    setEditingImportantChainId(null);
  }

  function confirmImportantEventEdit() {
    if (!editingImportantChain || !editingImportantEdit) return;
    const validation = validateImportantEventVersion(
      editingImportantEdit.selectedBeatIds.length,
      editingImportantEdit.finalDurationSeconds,
    );
    if (!validation.canSaveToTimeline) {
      setImportantEditError(validation.reason);
      return;
    }

    const readyEdit: ImportantEventEdit = {
      ...withAutomaticImportantAnalysis(editingImportantEdit),
      status: "ready",
    };
    const timelineId = `important-cut-${editingImportantChain.id}`;
    const timelineItem: TimelineItem = {
      id: timelineId,
      kind: "important-event",
      chainId: editingImportantChain.id,
      title: editingImportantChain.title,
      duration: readyEdit.finalDurationSeconds / 60,
      edit: readyEdit,
    };

    setImportantEventEdits((current) => ({ ...current, [editingImportantChain.id]: readyEdit }));
    setTimeline((current) => current.some((item) => item.id === timelineId)
      ? current.map((item) => item.id === timelineId ? timelineItem : item)
      : insertIntoFirstEmptyProgramZone(current, timelineItem));
    setHighlightedEditorItemId(timelineId);
    setEditingImportantChainId(null);
    setImportantEditError("");
    setEditorError("");
  }

  function addEvent(event: RecordedEvent) {
    const item: TimelineItem = { ...event, kind: "event", approach: neutralApproachFor(event) };
    setTimeline((current) => insertIntoFirstEmptyProgramZone(current, item));
    setHighlightedEditorItemId(event.id);
    setEditorError("");
  }

  function removeEvent(id: string) {
    setTimeline((current) => removeEditorialTimelineItem(current, id));
    setHighlightedEditorItemId(null);
    setEditorError("");
  }

  function moveItem(index: number, direction: -1 | 1) {
    setTimeline((current) => moveTimelineItem(current, index, direction));
  }

  function updateEventApproach(id: string, update: Partial<CutApproach>) {
    const existingItem = timeline.find(
      (item): item is Extract<TimelineItem, { kind: "event" }> => item.kind === "event" && item.id === id,
    );
    setTimeline((current) => current.map((item) => {
      if (item.kind !== "event" || item.id !== id) return item;
      const approach = { ...item.approach, ...update };
      return { ...item, approach };
    }));
    setEventApproaches((current) => ({
      ...current,
      [id]: {
        perspectiveIds: update.perspectiveIds
          ?? existingItem?.approach.perspectiveIds
          ?? [],
        tone: update.tone
          ?? existingItem?.approach.tone
          ?? "neutro",
      },
    }));
    setEditorError("");
  }

  function dropOnTimeline(targetIndex?: number) {
    if (!dragged) return;
    if (dragged.source === "bank") {
      const event = episodeBankEvents.find((item) => item.id === dragged.id);
      if (!event || timeline.some((item) => item.id === event.id)) return;
      setTimeline((current) => {
        const next = [...current];
        const item: TimelineItem = { ...event, kind: "event", approach: neutralApproachFor(event) };
        if (typeof targetIndex === "number") next.splice(targetIndex, 0, item);
        else return insertIntoFirstEmptyProgramZone(next, item);
        return next;
      });
      setHighlightedEditorItemId(event.id);
    } else {
      setTimeline((current) => {
        const sourceIndex = current.findIndex((item) => item.id === dragged.id);
        if (sourceIndex < 0) return current;
        const next = [...current];
        const [item] = next.splice(sourceIndex, 1);
        const rawDestination = typeof targetIndex === "number" ? targetIndex : next.length;
        const destination = sourceIndex < rawDestination ? rawDestination - 1 : rawDestination;
        next.splice(destination, 0, item);
        return next;
      });
    }
    setDragged(null);
    setEditorError("");
  }

  function confirmEdit() {
    const validationError = validateEditorCut(eventCount, requiredEventCatalog);
    if (validationError) {
      setEditorError(validationError);
      return;
    }
    const hasProgramContent = plannedEpisode.segments.some((segment) => segment.kind !== "commercial");
    if (hasProgramContent) {
      if (shadowGameState.audienceModel.mode === "legacy") {
        if (plannedCuts.length > 0) {
          const command = { type: "BROADCAST_EPISODE", cuts: plannedCuts } as const;
          const canonicalResult = reduceGame(shadowGameState, command);
          if (canonicalResult.diagnostic) {
            setEditorError(canonicalResult.diagnostic);
            return;
          }
          dispatchGame(command);
        }
      } else {
        const command = { type: "AIR_EPISODE", episode: plannedEpisode } as const;
        const canonicalResult = reduceGame(shadowGameState, command);
        if (canonicalResult.diagnostic) {
          setEditorError(canonicalResult.diagnostic);
          return;
        }
        dispatchGame(command);
      }
    }
    setLiveProgress(0);
    if (phase === "editPremiere") setPhase("livePremiere");
    if (phase === "editChallenge") setPhase("liveChallenge");
    if (phase === "editVote") setPhase("liveVote");
    if (phase === "editElimination") setPhase("liveElimination");
    if (phase === "editFinal") setPhase("liveFinal");
    setWindowOpen(false);
  }

  function locateRequiredEvent(id: string) {
    setSearch("");
    setCategory("Todos");
    setSort("gravacao");
    setHighlightedEditorItemId(id);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const card = document.getElementById(`editor-bank-${id}`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      card?.focus({ preventScroll: true });
    }));
  }

  function prepareVoteEdit() {
    startEdit("editVote");
  }

  function openAudienceVoteAndEditElimination() {
    setAudiencePick(null);
    startEdit("editElimination");
  }

  function showAudienceWorkflow(
    nextPhase: Extract<
      Phase,
      "summaryPremiere" | "summaryChallenge" | "summaryVote" | "audienceVote" | "weekSummary" | "winnerVote"
    >,
  ) {
    setPhase(nextPhase);
    setView("audience");
    setWindowOpen(true);
  }

  function finishLive() {
    if (phase === "livePremiere") {
      if (challengeType && !shadowGameState.competition.challengeHistory.some((result) => result.week === week)) {
        const command = { type: "CONFIRM_CHALLENGE", challengeType } as const;
        const canonicalResult = reduceGame(shadowGameState, command);
        if (canonicalResult.diagnostic) return;
        dispatchGame(command);
        setLeaderId(canonicalResult.state.competition.leaderId);
      }
      showAudienceWorkflow("summaryPremiere");
      return;
    }
    if (phase === "liveChallenge") {
      if (challengeType && !shadowGameState.competition.challengeHistory.some((result) => result.week === week)) {
        const command = { type: "CONFIRM_CHALLENGE", challengeType } as const;
        const canonicalResult = reduceGame(shadowGameState, command);
        if (canonicalResult.diagnostic) return;
        dispatchGame(command);
        setLeaderId(canonicalResult.state.competition.leaderId);
      }
      showAudienceWorkflow("summaryChallenge");
      return;
    }
    if (phase === "liveVote") {
      const command = { type: "FORM_NOMINATION" } as const;
      const canonicalResult = reduceGame(shadowGameState, command);
      if (!canonicalResult.diagnostic) {
        dispatchGame(command);
        setNominees(canonicalResult.state.competition.nomineeIds);
      }
      showAudienceWorkflow("summaryVote");
      return;
    }
    if (phase === "liveElimination") {
      const closeCommand = { type: "CLOSE_AUDIENCE_VOTE" } as const;
      const closedVote = reduceGame(shadowGameState, closeCommand);
      if (closedVote.diagnostic) return;
      const eliminatedId = closedVote.state.audienceModel.pendingVote?.kind === "elimination"
        ? closedVote.state.audienceModel.pendingVote.selectedParticipantId
        : closedVote.state.competition.nomineeIds.find(
          (participantId) => closedVote.state.characters[participantId]?.flags.audienceResult === true,
        ) ?? null;
      if (!eliminatedId) return;
      const resolveCommand = closedVote.state.audienceModel.mode === "legacy"
        ? { type: "RESOLVE_ELIMINATION", participantId: eliminatedId } as const
        : { type: "RESOLVE_ELIMINATION" } as const;
      const resolvedElimination = reduceGame(closedVote.state, resolveCommand);
      if (resolvedElimination.diagnostic) return;
      dispatchGame(closeCommand);
      dispatchGame(resolveCommand);
      setAudiencePick(eliminatedId);
      setLastEliminatedId(eliminatedId);
      setActiveIds((current) => current.filter((id) => id !== eliminatedId));
      showAudienceWorkflow("weekSummary");
      return;
    }
    if (phase === "liveFinal") {
      dispatchGame({ type: "CLOSE_FINAL_VOTE" });
      showAudienceWorkflow("winnerVote");
    }
  }

  useEffect(() => {
    if (!isLivePhase) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => setLiveProgress(100));
      return () => window.cancelAnimationFrame(frame);
    }
    const interval = window.setInterval(() => {
      setLiveProgress((current) => Math.min(100, current + 4));
    }, 120);
    return () => window.clearInterval(interval);
  }, [isLivePhase, phase]);

  useEffect(() => {
    if (!isLivePhase || liveProgress < 100) return;
    const timeout = window.setTimeout(() => finishLive(), 900);
    return () => window.clearTimeout(timeout);
    // finishLive intentionally reads the current phase and selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLivePhase, liveProgress, phase]);

  function confirmAudienceElimination() {
    if (
      shadowGameState.audienceModel.mode === "clustered"
      && (!pendingAudienceVote || pendingAudienceVote.kind !== "elimination")
    ) return;
    if (shadowGameState.audienceModel.mode !== "clustered" && !audiencePick && !legacyEliminationChoice) return;
    const eliminatedId = shadowGameState.audienceModel.mode === "clustered"
      && pendingAudienceVote?.kind === "elimination"
      ? pendingAudienceVote.selectedParticipantId
      : audiencePick ?? legacyEliminationChoice;
    if (!eliminatedId) return;
    const command = shadowGameState.audienceModel.mode === "clustered"
      ? { type: "RESOLVE_ELIMINATION" } as const
      : { type: "RESOLVE_ELIMINATION", participantId: eliminatedId } as const;
    const canonicalResult = reduceGame(shadowGameState, command);
    if (canonicalResult.diagnostic) return;
    dispatchGame(command);
    setLastEliminatedId(eliminatedId);
    setActiveIds((current) => current.filter((id) => id !== eliminatedId));
    setPhase("feedElimination");
    setView("feed");
    setWindowOpen(true);
  }

  function nextWeek() {
    dispatchGame({ type: "ADVANCE_WEEK" });
    setWeek((current) => current + 1);
    setChallengeType(null);
    setLeaderId(null);
    setNominees([]);
    setAudiencePick(null);
    setPhase("feedIntro");
    setView("feed");
    setWindowOpen(true);
  }

  function voteWinner() {
    const selectedWinnerId = shadowGameState.audienceModel.mode === "clustered"
      ? pendingAudienceVote?.kind === "final" ? pendingAudienceVote.selectedParticipantId : null
      : legacyFinalChoice;
    if (!selectedWinnerId) return;
    dispatchGame(
      shadowGameState.audienceModel.mode === "clustered"
        ? { type: "RESOLVE_FINAL" }
        : { type: "RESOLVE_FINAL", winnerId: selectedWinnerId },
    );
    setWinnerId(selectedWinnerId);
    setPhase("winnerReveal");
  }

  function challengeStanding(participant: Participant) {
    if (!challengeType) return "neutro";
    const value = participant.traits[challengeType];
    if (value >= 4) return "vantagem";
    if (value <= 2) return "desvantagem";
    return "neutro";
  }

  function guideMessage() {
    if (isEditPhase) {
      if (missingRequiredEvents.length > 0) {
        return `Ainda falta incluir ${missingRequiredEvents.length === 1 ? "o obrigatório" : "os obrigatórios"}: ${missingRequiredEvents.map((event) => event.title).join(", ")}.`;
      }
      if (editorialAlerts.length > 0) return editorialAlerts.join(" ");
      return "O corte está dentro da faixa recomendada e sem pendências obrigatórias.";
    }
    if (phase === "email") {
      return "Os personagens estao chegando na casa, abra o feed das cameras para dar uma olhada no que está acontecendo";
    }
    if (phase === "feedIntro" || phase === "challenge") {
      return week === 1
        ? "O programa estreia hoje a noite com a primeira prova do lider. Qual vai ser a prova?"
        : `A semana ${week} começou. Confira os novos acontecimentos antes de definir a prova do líder.`;
    }
    if (phase === "summaryPremiere") return "Boa estreia. Volte ao feed: a casa não para quando a transmissão termina.";
    if (phase === "summaryChallenge") return "A nova liderança está definida. Volte ao feed para acompanhar as consequências.";
    if (phase === "summaryVote") return "A berlinda está formada. Confira a audiência antes de voltar ao feed e abrir a votação do público.";
    if (phase === "feedParty") return "A festa rendeu. Daqui a dois dias, o episódio termina com a formação da votação.";
    if (phase === "feedNomination") return "A casa votou. Confira a formação da berlinda antes de abrir a votação do público.";
    if (phase === "audienceVote") return "A votação está aberta. Agora o público decide quem deve sair.";
    if (phase === "feedElimination") return "O resultado foi confirmado. Veja a eliminação no feed antes de montar o programa.";
    if (phase === "weekSummary") return activeParticipants.length === 3
      ? "Restam três. A próxima transmissão será a grande final."
      : `Semana ${week} encerrada. A próxima prova já está esperando.`;
    if (phase === "liveFinal" || phase === "winnerVote") return "É a final. Desta vez, o público escolhe quem vence.";
    if (phase === "winnerReveal") return "Sinal encerrado. Você dirigiu a temporada inteira.";
    return "TRANSMISSÃO EM ANDAMENTO // NÃO DESLIGUE";
  }

  function renderFeed() {
    const receivedItems = allFeedItems.slice(0, visibleFeedCount);
    const importantCount = receivedItems.filter((item) => item.kind === "important").length;
    const unseenCount = receivedItems.filter((item) => !seenFeedItemIds.has(item.id)).length;
    const filteredItems = receivedItems.filter((item) => {
      if (feedFilter === "important") return item.kind === "important";
      if (feedFilter === "unseen") return !seenFeedItemIds.has(item.id);
      return true;
    });
    const selectedItem = filteredItems.find((item) => item.id === selectedFeedItemId)
      ?? filteredItems.find((item) => item.kind === "important")
      ?? filteredItems[0]
      ?? receivedItems[0]
      ?? null;
    const selectedImportantChain = selectedItem?.kind === "important"
      ? weekOneEventGeneration.importantEventChains.find((chain) => chain.id === selectedItem.chainId) ?? null
      : null;
    const selectedParticipants = selectedItem?.kind === "secondary"
      ? selectedItem.participantIds
        .map((id) => participants.find((participant) => participant.id === id))
        .filter((participant): participant is Participant => Boolean(participant))
      : selectedImportantChain?.participantIds
        .map((id) => participants.find((participant) => participant.id === id))
        .filter((participant): participant is Participant => Boolean(participant)) ?? [];

    function selectFeedItem(itemId: string) {
      setSelectedFeedItemId(itemId);
      setSeenFeedItemIds((current) => {
        if (current.has(itemId)) return current;
        const next = new Set(current);
        next.add(itemId);
        return next;
      });
    }

    return (
      <div className="feed-panel">
        <header className="feed-toolbar">
          <div className="feed-heading">
            <h2>FEED DAS CÂMERAS</h2>
            <span>{feedReleaseStage === "party"
              ? "Repercussão da prova e madrugada pós-festa"
              : feedReleaseStage === "nomination"
                ? "Votação da casa e formação da berlinda"
                : feedReleaseStage === "elimination"
                  ? "Resultado da eliminação e despedida"
                  : week === 1 ? "Chegada dos participantes" : `Início da semana ${week}`}</span>
          </div>
          <div className="live-chip"><i /> SINAL AO VIVO</div>
          <div className={`feed-header-status${feedSynchronized ? " is-synced" : ""}`} role="status">
            <b>{feedSynchronized ? "Feed sincronizado" : "Atualização automática ativa"}</b>
          </div>
          {feedReleaseStage === "party" && <div className="feed-deadline">CORTE FECHA EM 2 DIAS</div>}
        </header>

        <section className="camera-band" aria-labelledby="camera-band-title">
          <h3 className="sr-only" id="camera-band-title">Câmeras em destaque</h3>
          <div className="camera-strip">
            {["SALA", "QUARTO", "VARANDA", "COZINHA"].map((camera, index) => (
              <div className={`camera-thumb camera-${index + 1}`} key={camera}>
                <span>CAM {String(index + 1).padStart(2, "0")}</span>
                <b>{camera}</b>
                <div className="camera-silhouette" />
              </div>
            ))}
          </div>
          <p><b>4 de 8 câmeras</b><span>em destaque</span></p>
        </section>

        <div className="feed-workspace">
          <section className="feed-list-panel" aria-labelledby="feed-list-title">
            <h3 className="sr-only" id="feed-list-title">Registros recebidos</h3>
            <div className="feed-filters" aria-label="Filtrar registros" role="group">
              {([
                ["all", "TODOS", receivedItems.length],
                ["important", "IMPORTANTES", importantCount],
                ["unseen", "NÃO VISTOS", unseenCount],
              ] as const).map(([value, label, filterCount]) => (
                <button
                  aria-pressed={feedFilter === value}
                  className={feedFilter === value ? "is-active" : ""}
                  key={value}
                  onClick={() => setFeedFilter(value)}
                  type="button"
                >
                  {label} <b>{String(filterCount).padStart(2, "0")}</b>
                </button>
              ))}
            </div>
            <div className="feed-log" aria-live="polite" aria-label="Feed de registros" role="listbox">
              {filteredItems.map((item) => {
                const isSelected = selectedFeedItemId === item.id;
                const isNew = !seenFeedItemIds.has(item.id);
                const entryNumber = receivedItems.findIndex((candidate) => candidate.id === item.id) + 1;
                if (item.kind === "important") {
                  const chain = weekOneEventGeneration.importantEventChains.find((candidate) => candidate.id === item.chainId);
                  if (!chain) return null;
                  const chainParticipants = chain.participantIds
                    .map((id) => participants.find((participant) => participant.id === id))
                    .filter((participant): participant is Participant => Boolean(participant));
                  return (
                    <article
                      aria-label={`Acontecimento importante: ${chain.title}`}
                      aria-selected={isSelected}
                      className={`feed-entry important-feed-card${isSelected ? " is-selected" : ""}${isNew ? " is-new" : ""}`}
                      key={item.id}
                      onClick={() => selectFeedItem(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectFeedItem(item.id);
                        }
                      }}
                      role="option"
                      tabIndex={0}
                    >
                      <div className="feed-entry-meta"><time>{item.time}</time><span>{item.camera}</span></div>
                      <div className="feed-entry-portraits" aria-label={`Participantes: ${participantNames(chain.participantIds)}`}>
                        {chainParticipants.map((participant) => <Avatar key={participant.id} participant={participant} size="small" />)}
                      </div>
                      <div className="important-feed-card-content">
                        <span className="important-event-badge"><b aria-hidden="true">!</b> ACONTECIMENTO IMPORTANTE</span>
                        <h3>{chain.title}</h3>
                        <p>{importantEventFeedSummary}</p>
                        <div className="important-card-facts">
                          <span>{chain.participantIds.length} participantes</span>
                          <span>{weekOneImportantEventBeats.length} momentos</span>
                          <span>{importantEventPrimaryLocations().split(" e ").length} locais</span>
                        </div>
                      </div>
                      {isNew && <span className="new-feed-badge">NOVO</span>}
                      <strong>{String(entryNumber).padStart(2, "0")}</strong>
                    </article>
                  );
                }

                const itemParticipants = item.participantIds
                  .map((id) => participants.find((participant) => participant.id === id))
                  .filter((participant): participant is Participant => Boolean(participant));
                return (
                  <article
                    aria-selected={isSelected}
                    className={`feed-entry${isSelected ? " is-selected" : ""}${isNew ? " is-new" : ""}`}
                    data-category={item.category}
                    key={item.id}
                    onClick={() => selectFeedItem(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectFeedItem(item.id);
                      }
                    }}
                    role="option"
                    tabIndex={0}
                  >
                    <div className="feed-entry-meta"><time>{item.time}</time><span>{item.camera}</span></div>
                    {itemParticipants.length > 0 && (
                      <div className="feed-entry-portraits" aria-label={`Participantes: ${participantNames(item.participantIds)}`}>
                        {itemParticipants.map((participant) => <Avatar key={participant.id} participant={participant} size="small" />)}
                      </div>
                    )}
                    <div className="feed-entry-copy">
                      <span className="feed-category">{item.category}</span>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>
                    {isNew && <span className="new-feed-badge">NOVO</span>}
                    <strong>{String(entryNumber).padStart(2, "0")}</strong>
                  </article>
                );
              })}
              {receivedItems.length === 0 && (
                <div className="feed-empty">
                  <div className="signal-loader" aria-hidden="true"><i /><i /><i /></div>
                  <p>Aguardando acontecimentos…</p>
                </div>
              )}
              {receivedItems.length > 0 && filteredItems.length === 0 && (
                <div className="feed-filter-empty">Nenhum registro neste filtro.</div>
              )}
            </div>
          </section>

          <aside className="feed-context-panel" aria-live="polite">
            <header>LEITURA DO ACONTECIMENTO</header>
            {!selectedItem ? (
              <div className="feed-context-empty">
                <b>Nenhum registro recebido</b>
                <p>Os detalhes aparecerão aqui assim que a central captar o primeiro acontecimento.</p>
              </div>
            ) : selectedItem.kind === "important" && selectedImportantChain ? (
              <div className="feed-context-content important-context">
                <span className="important-event-badge"><b aria-hidden="true">!</b> ACONTECIMENTO IMPORTANTE</span>
                <h3>{selectedImportantChain.title}</h3>
                <div className="context-participants" aria-label={`Participantes: ${participantNames(selectedImportantChain.participantIds)}`}>
                  {selectedParticipants.map((participant) => (
                    <div key={participant.id}>
                      <Avatar participant={participant} size="small" />
                      <b>{participant.name.split(" ")[0]}</b>
                    </div>
                  ))}
                </div>
                <p>{importantEventFeedSummary}</p>
                <div className="context-facts">
                  <span>{selectedImportantChain.participantIds.length} participantes</span>
                  <span>{weekOneImportantEventBeats.length} momentos</span>
                  <span>{importantEventPrimaryLocations().split(" e ").length} locais</span>
                </div>
                <section className="context-attention">
                  <h4>POR QUE MERECE ATENÇÃO</h4>
                  <p>Pode mudar alianças e influenciar a votação da casa.</p>
                </section>
                <button className="button button-primary context-primary-action" onClick={() => setOpenImportantChainId(selectedImportantChain.id)} type="button">
                  ABRIR ACONTECIMENTO <span aria-hidden="true">▶</span>
                </button>
              </div>
            ) : selectedItem.kind === "secondary" ? (
              <div className="feed-context-content secondary-context">
                <span className="feed-category">{selectedItem.category}</span>
                <h3>{selectedItem.title}</h3>
                <small>{selectedItem.time} · {selectedItem.camera}</small>
                {selectedParticipants.length > 0 && (
                  <div className="context-participants" aria-label={`Participantes: ${participantNames(selectedItem.participantIds)}`}>
                    {selectedParticipants.map((participant) => (
                      <div key={participant.id}>
                        <Avatar participant={participant} size="small" />
                        <b>{participant.name.split(" ")[0]}</b>
                      </div>
                    ))}
                  </div>
                )}
                <p>{selectedItem.body}</p>
              </div>
            ) : null}
          </aside>
        </div>

        <footer className="feed-footer">
          <span className={`status-note feed-auto-status${feedSynchronized ? " is-synced" : ""}`}>
            {visibleFeedCount}/{allFeedItems.length} registros recebidos · {feedSynchronized
              ? "Feed sincronizado"
              : `próximo registro em 00:${String(feedSecondsRemaining).padStart(2, "0")}`}
          </span>
          {feedReleaseStage === "party" ? (
            <button className="button button-primary" disabled={!feedSynchronized} onClick={prepareVoteEdit} type="button">
              Ir para edição do episódio
            </button>
          ) : phase === "feedNomination" ? (
            <button className="button button-primary" disabled={!feedSynchronized} onClick={openAudienceVoteAndEditElimination} type="button">
              Abrir votação e editar episódio de eliminação
            </button>
          ) : phase === "feedElimination" ? (
            <button className="button button-primary" disabled={!feedSynchronized} onClick={() => startEdit("editElimination")} type="button">
              Ir para edição da eliminação
            </button>
          ) : (
            <button
              className="button button-primary"
              disabled={!feedSynchronized}
              onClick={() => {
                setPhase("challenge");
                setView("challenge");
              }}
              type="button"
            >
              {week === 1 ? "Definir primeira prova do líder" : "Definir prova do líder"}
            </button>
          )}
        </footer>
      </div>
    );
  }

  function renderChallenge() {
    const labels: Record<ChallengeType, { title: string; description: string; icon: string }> = {
      resistencia: { title: "Resistência", description: "Longa duração, equilíbrio e preparo físico.", icon: "∞" },
      sorte: { title: "Sorte", description: "Escolhas cegas, risco e resultados imprevisíveis.", icon: "✦" },
      atencao: { title: "Atenção", description: "Memória, detalhes visuais e reflexos rápidos.", icon: "◎" },
    };
    return (
      <div className="challenge-panel">
        <div className="challenge-heading">
          <div>
            <span className="eyebrow">SEMANA {String(week).padStart(2, "0")} · PROGRAMAÇÃO</span>
            <h2>Gerenciamento de provas</h2>
            <p>Escolha o formato. O sistema cruza as aptidões conhecidas do elenco.</p>
          </div>
          <div className="date-card"><span>HOJE</span><b>{7 + week * 3} JUN</b><small>21:45</small></div>
        </div>
        <div className="challenge-types">
          {(Object.keys(labels) as ChallengeType[]).map((type) => (
            <button
              aria-pressed={challengeType === type}
              className={`challenge-type${challengeType === type ? " is-selected" : ""}`}
              key={type}
              onClick={() => setChallengeType(type)}
              type="button"
            >
              <span>{labels[type].icon}</span>
              <b>{labels[type].title}</b>
              <small>{labels[type].description}</small>
            </button>
          ))}
        </div>
        <div className="cast-grid challenge-cast">
          {activeParticipants.map((participant) => {
            const standing = challengeStanding(participant);
            return (
              <article className="cast-card compact" key={participant.id}>
                <Avatar participant={participant} />
                <div className="cast-card-copy">
                  <span className={`standing standing-${standing}`}>{challengeType ? standing : "aguardando"}</span>
                  <h3>{participant.name}</h3>
                  <p>{participant.occupation}</p>
                  <div className="trait-meter" aria-label={`Aptidão de ${participant.name}`}>
                    <i style={{ width: `${(challengeType ? participant.traits[challengeType] : 3) * 20}%` }} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="panel-actions">
          <button className="button button-primary" disabled={!challengeType} onClick={confirmChallenge} type="button">
            Confirmar prova {challengeType ? `de ${labels[challengeType].title}` : ""}
          </button>
          <span className="status-note">A previsão indica tendência, não resultado garantido.</span>
        </div>
      </div>
    );
  }

  function renderEditor() {
    const episodeLabel =
      phase === "editPremiere" ? "Estreia"
        : phase === "editChallenge" ? `Prova do líder · Semana ${week}`
        : phase === "editVote" ? "Formação da votação"
          : phase === "editElimination" ? "Noite de eliminação"
            : "Grande final";
    const importantEdit = weekOneImportantEventChain
      ? importantEventEdits[weekOneImportantEventChain.id] ?? null
      : null;
    const importantCardEdit = weekOneImportantEventChain
      ? importantEdit ?? createDefaultImportantEdit(weekOneImportantEventChain.id)
      : null;
    const importantBlockInTimeline = weekOneImportantEventChain
      ? timeline.some((item) => item.kind === "important-event" && item.chainId === weekOneImportantEventChain.id)
      : false;
    const showImportantFootage = week === 1
      && importantEventReleased
      && phase === "editVote"
      && !importantBlockInTimeline
      && Boolean(weekOneImportantEventChain && importantCardEdit);
    const transmissionBlocked = eventCount < 2 || missingRequiredEvents.length > 0;
    const transmissionStatus = eventCount < 2
      ? "Inclua pelo menos dois acontecimentos."
      : missingRequiredEvents.length > 0
        ? "Inclua todos os cortes obrigatórios."
        : "Pronto para transmitir.";
    const episodeNumber = String(week * 3 - (phase === "editPremiere" || phase === "editChallenge" ? 2 : phase === "editVote" ? 1 : 0)).padStart(2, "0");
    const timelineDurationMinutes = timelineDurationSeconds / 60;
    const durationMarkerPercent = Math.max(0, Math.min(100,
      (timelineDurationMinutes - EDITOR_DURATION_CONFIG.minMinutes)
      / (EDITOR_DURATION_CONFIG.maxMinutes - EDITOR_DURATION_CONFIG.minMinutes) * 100));
    const editorialMessages = editorialAlerts.length > 0
      ? editorialAlerts
      : ["A montagem está equilibrada para transmissão."];
    const emptyProgramZones = new Set<number>();
    let currentProgramZone = 0;
    let currentZoneHasEvent = false;
    for (const item of timeline) {
      if (item.kind === "ad") {
        if (!currentZoneHasEvent) emptyProgramZones.add(currentProgramZone);
        currentProgramZone += 1;
        currentZoneHasEvent = false;
      } else {
        currentZoneHasEvent = true;
      }
    }
    if (!currentZoneHasEvent) emptyProgramZones.add(currentProgramZone);
    const dropZone = (blockIndex: number, targetIndex: number) => (
      <button
        aria-label={`Bloco ${blockIndex + 1}: soltar acontecimento aqui`}
        className={`timeline-drop-zone${dragged ? " is-active" : ""}`}
        key={`drop-block-${blockIndex}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.stopPropagation();
          dropOnTimeline(targetIndex);
        }}
        type="button"
      >
        <b>BLOCO {blockIndex + 1}</b>
        <span aria-hidden="true">+</span>
        <small>SOLTE AQUI</small>
      </button>
    );

    return (
      <div className="editor-panel">
        <div className="editor-heading">
          <div>
            <span className="eyebrow">ILHA DE EDIÇÃO · EP {episodeNumber}</span>
            <h2>{episodeLabel}</h2>
          </div>
          <div className="editor-heading-rule">
            <div className="heading-current-duration">
              <span>DURAÇÃO</span>
              <b>{formatClockDuration(timelineDurationSeconds)}</b>
            </div>
            <div className="heading-duration-range">
              <span>FAIXA IDEAL {EDITOR_DURATION_CONFIG.minMinutes}–{EDITOR_DURATION_CONFIG.maxMinutes} MIN</span>
              <div className="duration-range-scale" aria-label={`Duração atual: ${formatClockDuration(timelineDurationSeconds)}. Faixa ideal de ${EDITOR_DURATION_CONFIG.minMinutes} a ${EDITOR_DURATION_CONFIG.maxMinutes} minutos.`}>
                <b>{EDITOR_DURATION_CONFIG.minMinutes}</b>
                <div>
                  <i />
                  <em style={{ left: `${durationMarkerPercent}%` }} />
                  <small className={`duration-current-label is-${durationReading.state}`} style={{ left: `${durationMarkerPercent}%` }}>{formatClockDuration(timelineDurationSeconds)}</small>
                </div>
                <b>{EDITOR_DURATION_CONFIG.maxMinutes}</b>
              </div>
            </div>
          </div>
        </div>

        <div className="editor-workspace">
          <div className="editor-main-column">
            <section className="timeline-section" aria-labelledby="timeline-title">
              <div className="section-label">
                <span id="timeline-title">Linha do programa</span>
                <small>Arraste os blocos ou use as setas para reorganizar</small>
              </div>
              <div className="timeline-scroll">
                <div className={`timeline-track${eventCount > 0 ? " has-editorial-items" : ""}`}>
                  {emptyProgramZones.has(0) && dropZone(0, 0)}
                  {timeline.flatMap((item, index) => {
                    const isDragging = dragged?.source === "timeline" && dragged.id === item.id;
                    const isRequiredItem = item.kind === "event" && isRequiredForCurrentEdit(item);
                    const followingBlockIndex = timeline.slice(0, index + 1).filter((candidate) => candidate.kind === "ad").length;
                    return [
                      <article
                        aria-grabbed={isDragging}
                        className={`timeline-item timeline-${item.kind}${isDragging ? " is-dragging" : ""}${highlightedEditorItemId === item.id ? " is-new" : ""}`}
                        draggable
                        key={item.id}
                        onDragEnd={() => setDragged(null)}
                        onDragStart={() => setDragged({ source: "timeline", id: item.id })}
                        tabIndex={0}
                      >
                        {item.kind === "ad" ? (
                          <div className="timeline-ad-copy">
                            <span className="timeline-drag-handle" aria-label={`Arrastar ${item.title}`}>⠿</span>
                            <b>INTERVALO</b>
                            <strong>{item.title.replace("Intervalo ", "")}</strong>
                            <small>{item.duration} MIN</small>
                          </div>
                        ) : (
                          <>
                            <div className="timeline-item-heading">
                              <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
                              <span className="timeline-kind-label">{item.kind === "important-event" ? "ACONTECIMENTO IMPORTANTE" : isRequiredItem ? `${item.category} · OBRIGATÓRIO` : item.category}</span>
                              <span className="timeline-drag-handle" aria-label={`Arrastar ${item.title}`}>⠿</span>
                            </div>
                            <h3>{item.title}</h3>
                            <div className="timeline-item-meta">
                              <b>{item.kind === "important-event" ? formatClockDuration(item.edit.finalDurationSeconds) : `${item.duration} min`}</b>
                              {item.kind === "important-event" && <span>{item.edit.selectedBeatIds.length} MOMENTOS · {importantEventStatusLabels[item.edit.status]}</span>}
                            </div>
                            {item.kind === "event" && (() => {
                              const eventParticipants = participantIdsForEditorEvent(item);
                              const focusValue = item.approach.perspectiveIds.length === 1
                                ? item.approach.perspectiveIds[0]
                                : "all";
                              return (
                                <fieldset className="approach-editor">
                                  <legend>ENQUADRAMENTO DO CORTE</legend>
                                  <label>
                                    <span>Leitura</span>
                                    <select
                                      aria-label={`Tom de ${item.title}`}
                                      onChange={(event) => updateEventApproach(item.id, { tone: event.target.value as CutTone })}
                                      value={item.approach.tone}
                                    >
                                      <option value="neutro">Neutra</option>
                                      <option value="engracado">Engraçada</option>
                                      <option value="emocional">Emocional</option>
                                      <option value="triste">Triste</option>
                                      <option value="conflituoso">Conflituosa</option>
                                      <option value="malicioso">Maliciosa</option>
                                    </select>
                                  </label>
                                  <label>
                                    <span>Perspectiva</span>
                                    <select
                                      aria-label={`Perspectiva de ${item.title}`}
                                      onChange={(event) => updateEventApproach(item.id, {
                                        perspectiveIds: event.target.value === "all" ? eventParticipants : [event.target.value],
                                      })}
                                      value={focusValue}
                                    >
                                      <option value="all">Todos os envolvidos</option>
                                      {eventParticipants.map((participantId) => (
                                        <option key={participantId} value={participantId}>
                                          {participants.find((participant) => participant.id === participantId)?.name ?? participantId}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </fieldset>
                              );
                            })()}
                          </>
                        )}
                        <div className="timeline-controls">
                          <button aria-label={`Mover ${item.title} para a esquerda`} disabled={index === 0} onClick={() => moveItem(index, -1)} type="button">←</button>
                          <button aria-label={`Mover ${item.title} para a direita`} disabled={index === timeline.length - 1} onClick={() => moveItem(index, 1)} type="button">→</button>
                          {item.kind === "important-event" && <button aria-label={`Editar ${item.title}`} onClick={() => openImportantEventEditor(item.chainId)} type="button">EDITAR</button>}
                          {item.kind !== "ad" && <button aria-label={`Remover ${item.title}`} onClick={() => removeEvent(item.id)} type="button">×</button>}
                        </div>
                      </article>,
                      item.kind === "ad" && emptyProgramZones.has(followingBlockIndex)
                        ? dropZone(followingBlockIndex, index + 1)
                        : null,
                    ];
                  })}
                </div>
              </div>
            </section>

            <section className="event-bank" aria-labelledby="event-bank-title">
              <div className="event-bank-toolbar">
                <div className="section-label"><span id="event-bank-title">Banco de acontecimentos</span></div>
                <label><span className="sr-only">Buscar acontecimentos</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Buscar…" type="search" value={search} /></label>
                <label><span className="sr-only">Filtrar por categoria</span><select onChange={(event) => setCategory(event.target.value)} value={category}>{["Todos", "Convivência", "Conflito", "Humor", "Prova", "Festa", "Votação", "Memória"].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label><span className="sr-only">Ordenar acontecimentos</span><select onChange={(event) => setSort(event.target.value)} value={sort}><option value="gravacao">Ordem de gravação</option><option value="duracao">Menor duração</option></select></label>
                <b>{availableEvents.length + (showImportantFootage ? 1 : 0)} DISPONÍVEIS</b>
              </div>
              <div className="event-bank-content">
                <div className="event-grid">
                  {showImportantFootage && weekOneImportantEventChain && importantCardEdit && (
                    <article className="event-card important-footage-card">
                      <div className="important-footage-heading">
                        <span className="important-event-badge"><b aria-hidden="true">!</b> ACONTECIMENTO IMPORTANTE</span>
                        <i>{importantCardEdit.status === "ready" ? "Editado" : importantEventStatusLabels[importantCardEdit.status]}</i>
                      </div>
                      <h3>{weekOneImportantEventChain.title}</h3>
                      <p>{weekOneImportantEventBeats.length} momentos · {formatClockDuration(importantCardEdit.finalDurationSeconds)}</p>
                      <div className="important-card-footer">
                        <div className="event-card-participants">{weekOneImportantEventChain.participantIds.map((id) => { const participant = participants.find((candidate) => candidate.id === id); return participant ? <Avatar key={participant.id} participant={participant} size="small" /> : null; })}</div>
                        <button onClick={() => openImportantEventEditor(weekOneImportantEventChain.id)} type="button">{importantCardEdit.status === "not_edited" ? "EDITAR" : "REABRIR"}</button>
                      </div>
                    </article>
                  )}
                  {availableEvents.map((event) => {
                  const eventParticipants = participantIdsForEditorEvent(event)
                    .map((id) => participants.find((participant) => participant.id === id))
                    .filter((participant): participant is Participant => Boolean(participant));
                  const isDragging = dragged?.source === "bank" && dragged.id === event.id;
                  const isRequiredEvent = isRequiredForCurrentEdit(event);
                  return (
                    <article
                      aria-grabbed={isDragging}
                      className={`event-card${isRequiredEvent ? " is-required" : ""}${isDragging ? " is-dragging" : ""}${highlightedEditorItemId === event.id ? " is-located" : ""}`}
                      data-category={event.category}
                      draggable
                      id={`editor-bank-${event.id}`}
                      key={event.id}
                      onDragEnd={() => setDragged(null)}
                      onDragStart={() => setDragged({ source: "bank", id: event.id })}
                      tabIndex={-1}
                    >
                      <div className="event-card-top">
                        <div className="event-card-labels"><span>{event.category}</span>{isRequiredEvent && <em className="required-badge">OBRIGATÓRIO</em>}</div>
                        <b>{event.duration} min</b>
                      </div>
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>
                      <div className="event-card-footer">
                        <div className="event-card-participants" aria-label={eventParticipants.length ? `Participantes: ${eventParticipants.map((participant) => participant.name).join(", ")}` : "Sem participantes associados"}>{eventParticipants.map((participant) => <Avatar key={participant.id} participant={participant} size="small" />)}</div>
                        <button aria-label={`Adicionar ${event.title} à linha do programa`} onClick={() => addEvent(event)} type="button">+ ADICIONAR</button>
                      </div>
                    </article>
                  );
                  })}
                  {availableEvents.length === 0 && <p className="no-results">Nenhum corte corresponde aos filtros.</p>}
                </div>
              </div>
            </section>
          </div>

          <aside className="editor-state-panel" aria-label="Estado do corte">
            <header><span>ESTADO DO CORTE</span></header>
            <section className={`cut-duration-state state-card is-${durationReading.state}`}>
              <span>DURAÇÃO</span>
              <strong>{formatClockDuration(timelineDurationSeconds)}</strong>
              <p className={`reading-state is-${durationReading.state}`}>
                {durationReading.label === "Adequada" ? "Dentro da faixa ideal" : durationReading.label === "Curta" ? "Abaixo da faixa ideal" : "Acima da faixa ideal"}
              </p>
            </section>
            <section className={`required-state state-card${missingRequiredEvents.length > 0 ? " has-missing" : " is-complete"}`}>
              <div className="state-section-title"><span>OBRIGATÓRIOS</span><b>{requiredEventCatalog.length - missingRequiredEvents.length}/{requiredEventCatalog.length}</b></div>
              {requiredEventCatalog.length === 0 ? <p>Nenhum acontecimento obrigatório neste episódio.</p> : (
                <ul>{requiredEventCatalog.map((event) => <li className={event.included ? "is-included" : "is-missing"} key={event.id}><span aria-hidden="true">{event.included ? "✓" : "!"}</span><b>{event.title}</b>{!event.included && <button onClick={() => locateRequiredEvent(event.id)} type="button">LOCALIZAR</button>}</li>)}</ul>
              )}
              {missingRequiredEvents.length > 0 && <p>Sem os obrigatórios, não é possível fechar o corte e transmitir.</p>}
            </section>
            <section className="editorial-reading state-card">
              <div className="state-section-title"><span>LEITURA EDITORIAL</span></div>
              <dl>
                <div><dt><i className={`reading-dot is-${rhythmReading.state}`} />Ritmo</dt><dd>{rhythmReading.label}</dd></div>
                <div><dt><i className={`reading-dot is-${focusReading.state}`} />Foco</dt><dd className={`is-${focusReading.state}`}>{focusReading.label}</dd></div>
                <div><dt><i className={`reading-dot is-${varietyReading.state}`} />Variedade</dt><dd>{varietyReading.label}</dd></div>
                <div><dt><i className={`reading-dot is-${durationReading.state}`} />Duração</dt><dd>{durationReading.label}</dd></div>
              </dl>
              <div className="editorial-notes">
                {editorialMessages.map((message) => <p className="editorial-note" key={message}><span aria-hidden="true">▧</span>{message}</p>)}
              </div>
            </section>
            <section className="cut-counts"><div><span>▦</span><b>{eventCount} acontecimentos</b></div><div><span>◷</span><b>{timeline.filter((item) => item.kind === "ad").length} intervalos</b></div></section>
            <div className="editor-transmit-area">
              <button className="button button-primary" disabled={transmissionBlocked} onClick={confirmEdit} type="button">FECHAR CORTE E TRANSMITIR</button>
              <span aria-live="polite" className={editorError ? "editor-error" : "status-note"}>{editorError || transmissionStatus}</span>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  function renderMail() {
    return (
      <div className="mail-app">
        <div className="mail-actions">
          <button type="button">RESPONDER</button>
          <button type="button">ENCAMINHAR</button>
          <button type="button">IMPRIMIR</button>
          <button type="button">EXCLUIR</button>
        </div>
        <div className="mail-meta">
          <span>DE:</span><b>diretoria@redeplana.com.br</b>
          <span>PARA:</span><b>voce@redeplana.com.br</b>
          <span>ASSUNTO:</span><b>Seu primeiro dia</b>
          <span>STATUS:</span><em>PRIORIDADE ALTA</em>
        </div>
        <div className="mail-copy">
          <p>Parabéns, você finalmente conseguiu! Seu pai te contratou na empresa dele e voce vai começar hoje dirigindo e produzindo o programa ‘Casa Vigiada’. Em anexo está um arquivo com os participantes. Boa sorte</p>
          <small>— DIRETORIA DE PROGRAMAÇÃO<br />REDE PLANA DE TELEVISÃO</small>
        </div>
        <div className="attachment-label">1 ANEXO RECEBIDO</div>
        <button className="pdf-attachment" onClick={() => setPdfOpen(true)} type="button">
          <span className="pdf-icon">PDF</span>
          <span><b>Participantes.pdf</b><small>3,2 MB · arquivo verificado</small></span>
          <strong>ABRIR ↗</strong>
        </button>
      </div>
    );
  }

  function renderAudienceWorkflow() {
    if (phase === "summaryPremiere" || phase === "summaryChallenge" || phase === "summaryVote") {
      const premiere = phase === "summaryPremiere";
      const voteSummary = phase === "summaryVote";
      const result = latestAudienceResult;
      const metTarget = (result?.averageRating ?? 0)
        >= shadowGameState.audienceModel.market.networkTargetPoints;
      return (
        <section className="audience-workflow audience-workflow-summary" aria-labelledby="audience-workflow-title">
          <header className="audience-workflow-heading">
            <div>
              <span>
                RELATÓRIO DE EXIBIÇÃO · EPISÓDIO {String(voteSummary ? week * 3 - 1 : week * 3 - 2).padStart(2, "0")}
              </span>
              <h2 id="audience-workflow-title">
                {voteSummary
                  ? `Berlinda da semana ${week} formada`
                  : premiere
                  ? metTarget ? "Estreia acima da meta" : "A estreia encontrou seu público"
                  : `Liderança da semana ${week} definida`}
              </h2>
              <p>
                {voteSummary
                  ? `${nominees.map((id) => participantById[id]?.name).filter(Boolean).join(" e ")} disputam a permanência do público.`
                  : premiere
                  ? `O elenco foi apresentado e ${leader?.name ?? "um participante"} encerrou a noite na liderança.`
                  : `${leader?.name ?? "Um participante"} venceu a prova${challengeRunnerUp ? `, com ${challengeRunnerUp.name} na segunda colocação` : ""}.`}
              </p>
            </div>
            <div className="audience-workflow-highlight">
              <small>MÉDIA</small>
              <b>{(result?.averageRating ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b>
              <span>pontos</span>
            </div>
          </header>
          <footer className="audience-workflow-footer">
            <p>O relatório completo desta transmissão está disponível abaixo.</p>
            <button
              className="button button-primary"
              onClick={openNextEpisodeFeed}
              type="button"
            >
              Voltar ao feed
            </button>
          </footer>
        </section>
      );
    }

    if (phase === "audienceVote" || phase === "winnerVote") {
      const isFinalVote = phase === "winnerVote";
      const choices = isFinalVote
        ? activeParticipants
        : participants.filter((participant) => nominees.includes(participant.id));
      const resolvedVote = pendingAudienceVote?.kind === (isFinalVote ? "final" : "elimination")
        ? pendingAudienceVote
        : null;
      const authoritativeChoiceId = shadowGameState.audienceModel.mode === "clustered"
        ? resolvedVote?.selectedParticipantId ?? null
        : isFinalVote
          ? legacyFinalChoice
          : audiencePick ?? legacyEliminationChoice;
      const voteReady = Boolean(authoritativeChoiceId);
      return (
        <section className="audience-workflow audience-workflow-vote" aria-labelledby="audience-workflow-title">
          <header className="audience-workflow-heading">
            <div>
              <span>{isFinalVote ? "GRANDE FINAL" : `SEMANA ${String(week).padStart(2, "0")} · VOTAÇÃO ENCERRADA`}</span>
              <h2 id="audience-workflow-title">
                {voteReady ? "Resultado consolidado" : "Consolidando o painel…"}
              </h2>
              <p>
                {shadowGameState.audienceModel.mode === "shadow"
                  ? "A projeção das 16 coortes foi registrada para calibração; o resultado oficial segue o modo de compatibilidade."
                  : "A votação automática considerou participação, conhecimento, rejeição e proteção aos favoritos de cada coorte."}
              </p>
            </div>
            <div className="audience-workflow-status">
              <i aria-hidden="true" />
              <span>{voteReady ? "RESULTADO BLOQUEADO" : "PROCESSANDO"}</span>
            </div>
          </header>
          <div className={`audience-workflow-candidates candidates-${choices.length}`}>
            {choices.map((participant) => {
              const selected = authoritativeChoiceId === participant.id;
              return (
                <article className={selected ? "is-selected" : ""} key={participant.id}>
                  <Avatar participant={participant} size="small" />
                  <div>
                    <span>{participant.city}</span>
                    <b>{participant.name}</b>
                    <small>
                      {resolvedVote
                        ? `${Math.round((resolvedVote.shares[participant.id] ?? 0) * 1000) / 10}% dos votos`
                        : "Resultado de compatibilidade"}
                    </small>
                  </div>
                  <em>{selected ? isFinalVote ? "VENCEDOR" : "MAIOR REJEIÇÃO" : "AMOSTRA"}</em>
                </article>
              );
            })}
          </div>
          <footer className="audience-workflow-footer">
            <p>Os detalhes de turnout, coortes e fandom permanecem no relatório abaixo.</p>
            <button
              className="button button-primary"
              disabled={!voteReady}
              onClick={isFinalVote ? voteWinner : confirmAudienceElimination}
              type="button"
            >
              {isFinalVote ? "Revelar vencedor" : "Preparar programa de eliminação"}
            </button>
          </footer>
        </section>
      );
    }

    if (phase === "weekSummary") {
      const finalists = activeParticipants.length === 3;
      return (
        <section className="audience-workflow audience-workflow-week" aria-labelledby="audience-workflow-title">
          <header className="audience-workflow-heading">
            <div>
              <span>ARQUIVO SEMANAL · SEMANA {String(week).padStart(2, "0")}</span>
              <h2 id="audience-workflow-title">
                {finalists ? "Os três finalistas estão definidos" : `Semana ${week} encerrada`}
              </h2>
              <p>
                {lastEliminated
                  ? `${lastEliminated.name} deixou a casa. O histórico de seus fãs foi preservado para os impactos do próximo episódio.`
                  : "A transmissão foi arquivada e os dados da semana estão consolidados."}
              </p>
            </div>
            <div className="audience-workflow-highlight">
              <small>NA CASA</small>
              <b>{activeParticipants.length}</b>
              <span>participantes</span>
            </div>
          </header>
          {lastEliminated && (
            <div className="audience-workflow-eliminated">
              <Avatar participant={lastEliminated} size="small" eliminated />
              <div>
                <span>ELIMINADO</span>
                <b>{lastEliminated.name}</b>
                <small>
                  {shadowGameState.audienceModel.mode === "clustered" && latestEliminationVote
                    ? `${Math.round((latestEliminationVote.shares[lastEliminated.id] ?? 0) * 1000) / 10}% dos votos`
                    : "Resultado oficial encerrado"}
                </small>
              </div>
            </div>
          )}
          <footer className="audience-workflow-footer">
            <p>{currentWeekAudienceBroadcasts.length} transmissões medidas nesta semana.</p>
            <button
              className="button button-primary"
              onClick={finalists ? () => startEdit("editFinal") : nextWeek}
              type="button"
            >
              {finalists ? "Preparar a grande final" : `Começar semana ${week + 1}`}
            </button>
          </footer>
        </section>
      );
    }

    return null;
  }

  function renderAppContent() {
    if (view === "mail") return renderMail();
    if (view === "feed") return renderFeed();
    if (view === "challenge") return renderChallenge();
    if (view === "audience") {
      return (
        <div className="audience-app-content">
          {renderAudienceWorkflow()}
          <AudienceReport state={shadowGameState} />
        </div>
      );
    }
    return renderEditor();
  }

  if (!started) {
    return (
      <main className={`boot-screen theme-${theme}`}>
        <ThemeSwitch onToggle={toggleTheme} theme={theme} />
        <div className="signal-bars" aria-hidden="true"><i /><i /><i /></div>
        <div className="boot-grid" aria-hidden="true" />
        <div className="boot-copy">
          <span className="boot-kicker">PRODUÇÕES PLANA APRESENTA</span>
          <h1><span>REDE</span><strong>PLANA</strong></h1>
          <div className="boot-subtitle">VOCÊ DECIDE O QUE O BRASIL VÊ</div>
          <button className="start-button" onClick={begin} type="button">
            JOGAR <span aria-hidden="true">▶</span>
          </button>
          <p>SISTEMA INTERNO DE PRODUÇÃO · VERSÃO 1.0</p>
        </div>
        <div className="boot-footer"><span>RPT // CANAL 03</span><span>SEMANA 01 · SINAL PRONTO</span></div>
      </main>
    );
  }

  if (isLivePhase) {
    const storedResult = latestAudienceResult;
    const checkpoints = storedResult?.checkpoints ?? [];
    const totalElapsedSeconds = checkpoints.at(-1)?.elapsedSeconds
      ?? latestAudienceBroadcast?.episode?.segments.reduce((sum, segment) => sum + segment.durationSeconds, 0)
      ?? 1;
    const revealElapsedSeconds = totalElapsedSeconds * liveProgress / 100;
    const revealedCheckpoints = checkpoints.filter(
      (checkpoint) => checkpoint.elapsedSeconds <= revealElapsedSeconds || liveProgress >= 100,
    );
    const currentCheckpoint = revealedCheckpoints.at(-1) ?? null;
    const previousCheckpoint = revealedCheckpoints.at(-2) ?? null;
    const liveAudience = currentCheckpoint?.rating
      ?? storedResult?.forecast.expected
      ?? shadowGameState.audienceModel.market.networkTargetPoints;
    const revealedPeak = revealedCheckpoints.reduce(
      (peak, checkpoint) => Math.max(peak, checkpoint.rating),
      liveAudience,
    );
    const liveShare = currentCheckpoint?.share ?? 0;
    const trend = currentCheckpoint && previousCheckpoint
      ? currentCheckpoint.rating - previousCheckpoint.rating
      : 0;
    const chartCeiling = Math.max(
      shadowGameState.audienceModel.market.networkTargetPoints,
      revealedPeak,
      1,
    );
    return (
      <main className={`broadcast-screen theme-${theme}`}>
        <ThemeSwitch onToggle={toggleTheme} theme={theme} />
        <RestartGameControl onConfirm={restartSeason} />
        <div className="broadcast-top">
          <div className="on-air"><i /> AO VIVO</div>
          <span>CASA VIGIADA · SEMANA {String(week).padStart(2, "0")}</span>
          <time>21:{String(Math.min(59, 12 + Math.floor(liveProgress / 3))).padStart(2, "0")}</time>
        </div>
        <section className="performance-review">
          <div className="review-copy">
            <span className="eyebrow">LIVE PERFORMANCE REVIEW</span>
            <h1>{phase === "liveFinal" ? "A grande final está no ar" : phase === "liveElimination" ? "O Brasil espera o resultado" : phase === "liveChallenge" ? "A disputa pela liderança está no ar" : "O programa entrou no ar"}</h1>
            <p>
              {currentCheckpoint
                ? `Trecho no ar: ${currentCheckpoint.label}.`
                : "Aguardando o primeiro checkpoint medido."}
            </p>
          </div>
          <div className="audience-number">
            <b>{liveAudience.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b>
            <span>pontos</span>
          </div>
          <div
            className="live-chart"
            aria-label={`Audiência atual: ${liveAudience.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pontos`}
          >
            {(checkpoints.length > 0 ? checkpoints : [{
              segmentId: "awaiting-measurement",
              rating: shadowGameState.audienceModel.market.networkTargetPoints,
              elapsedSeconds: 0,
              label: "Aguardando medição",
            }]).map((checkpoint) => {
              const reached = revealedCheckpoints.some((revealed) => revealed.segmentId === checkpoint.segmentId);
              const height = reached ? Math.max(8, Math.min(100, checkpoint.rating / chartCeiling * 100)) : 8;
              return (
                <i
                  className={reached ? "reached" : ""}
                  key={checkpoint.segmentId}
                  style={{ height: `${height}%` }}
                  title={reached
                    ? `${checkpoint.label}: ${checkpoint.rating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pontos`
                    : "Checkpoint ainda não revelado"}
                />
              );
            })}
          </div>
          <div className="review-stats">
            <span><small>PICO REVELADO</small><b>{revealedPeak.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b></span>
            <span><small>SHARE</small><b>{(liveShare * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b></span>
            <span>
              <small>TENDÊNCIA</small>
              <b className={trend >= 0 ? "up" : ""}>
                {trend > 0 ? "↑ " : trend < 0 ? "↓ " : "→ "}
                {Math.abs(trend).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              </b>
            </span>
          </div>
          <div className="transmission-progress"><i style={{ width: `${liveProgress}%` }} /></div>
          <p className="transmission-status">{liveProgress < 100 ? "TRANSMISSÃO EM ANDAMENTO" : "ENCERRANDO SINAL…"}</p>
        </section>
        <div className="broadcast-noise" aria-hidden="true" />
      </main>
    );
  }

  if (phase === "winnerReveal") {
    return (
      <main className={`winner-screen theme-${theme}`}>
        <ThemeSwitch onToggle={toggleTheme} theme={theme} />
        <RestartGameControl onConfirm={restartSeason} />
        <div className="confetti" aria-hidden="true">{Array.from({ length: 28 }).map((_, index) => <i key={index} />)}</div>
        <div className="winner-copy">
          <span className="eyebrow">CASA VIGIADA · FINAL DA TEMPORADA</span>
          <h1>O Brasil escolheu.</h1>
          {winner && <Avatar participant={winner} size="large" />}
          <p>
            Com{" "}
            {winner && shadowGameState.audienceModel.mode === "clustered" && latestFinalVote
              ? Math.round((latestFinalVote.shares[winner.id] ?? 0) * 1000) / 10
              : "—"}% dos votos, o grande vencedor é
          </p>
          <h2>{winner?.name}</h2>
          <blockquote>“{winner?.quote}”</blockquote>
          <div className="summary-metrics">
            <div><span>SEMANAS</span><b>{week}</b></div>
            <div><span>EPISÓDIOS</span><b>{audienceBroadcasts.length}</b></div>
            <div><span>MAIOR PICO</span><b>{seasonPeakRating.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b></div>
          </div>
          <button
            className="button button-primary"
            onClick={restartSeason}
            type="button"
          >
            Jogar novamente
          </button>
        </div>
      </main>
    );
  }

  const currentGuideMessage = guideMessage();
  const guideVisible = dismissedGuideMessage !== currentGuideMessage;

  return (
    <main className={`computer-shell theme-${theme}`} data-shadow-revision={shadowGameState.revision}>
      <RestartGameControl onConfirm={restartSeason} />
      <div className="desktop-wallpaper" aria-hidden="true"><span>RPT</span><b>PRODUÇÃO<br />CASA VIGIADA</b></div>
      <aside className="desktop-icons" aria-label="Aplicativos">
        <AppIcon active={view === "mail"} label="Correio" onClick={() => { setView("mail"); setWindowOpen(true); }} symbol="✉" />
        <AppIcon active={view === "feed"} label="Feed da casa" onClick={openFeed} symbol="▣" />
        <AppIcon active={view === "challenge"} disabled={phase !== "challenge"} label="Provas" onClick={openChallenge} symbol="◎" />
        <AppIcon active={view === "edit"} disabled={!isEditPhase} label="Edição" onClick={() => { if (isEditPhase) { setView("edit"); setWindowOpen(true); } }} symbol="▤" />
        <AppIcon active={view === "audience"} label="Pesquisa & Audiência" onClick={() => { setView("audience"); setWindowOpen(true); }} symbol="▥" />
      </aside>

      {windowOpen && (
        <section className={`app-window app-${view}`}>
          <header className="window-titlebar">
            <div><span className="window-app-icon">{view === "mail" ? "✉" : view === "feed" ? "▣" : view === "challenge" ? "◎" : view === "audience" ? "▥" : "▤"}</span>{view === "mail" ? "Caixa de Entrada — Correio RPT" : view === "audience" ? "Pesquisa & Audiência — Painel Ficcional RPT" : "Central de Produção — Casa Vigiada"}</div>
            <div className="window-buttons">
              <button aria-label="Minimizar janela" onClick={() => setWindowOpen(false)} type="button">—</button>
              <button aria-label="Maximizar janela" type="button">□</button>
              <button aria-label="Fechar janela" onClick={() => setWindowOpen(false)} type="button">×</button>
            </div>
          </header>
          {view !== "mail" && (
            <nav className="app-tabs" aria-label="Áreas da central de produção">
              <button aria-selected={view === "feed"} onClick={openFeed} role="tab" type="button">Feed</button>
              <button aria-selected={view === "challenge"} disabled={phase !== "challenge"} onClick={openChallenge} role="tab" type="button">Gerenciamento de provas</button>
              <button aria-selected={view === "edit"} disabled={!isEditPhase} onClick={() => setView("edit")} role="tab" type="button">Edição</button>
              <button aria-selected={view === "audience"} onClick={() => setView("audience")} role="tab" type="button">Pesquisa & Audiência</button>
            </nav>
          )}
          <div className="window-content">{renderAppContent()}</div>
        </section>
      )}

      {guideVisible && (
        <aside className="guide-bubble" aria-live="polite">
          <div className="guide-copy">
            <button
              aria-label="Fechar assistente"
              className="guide-close"
              onClick={() => setDismissedGuideMessage(currentGuideMessage)}
              type="button"
            >
              ×
            </button>
            <span>PLIN // ASSISTENTE DE PRODUÇÃO</span>
            <p>{currentGuideMessage}</p>
          </div>
          <div className="guide-tail" aria-hidden="true" />
          <div className="plin" aria-label="PLIN, mascote da central de produção">
            <i className="antenna a1" /><i className="antenna a2" />
            <div className="plin-screen"><i /><i /><b /></div>
            <span />
          </div>
        </aside>
      )}

      {startMenuOpen && (
        <section aria-label="Menu Iniciar" className="start-menu" id="start-menu" role="menu">
          <header><span>RP</span><b>REDE PLANA</b></header>
          <button
            onClick={() => {
              setWindowOpen(true);
              setStartMenuOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            <span aria-hidden="true">▣</span>
            <span><b>Continuar produção</b><small>Voltar à central do programa</small></span>
          </button>
          <button className="start-menu-reset" onClick={restartFromStartMenu} role="menuitem" type="button">
            <span aria-hidden="true">↻</span>
            <span><b>Reiniciar temporada</b><small>Apagar o progresso e começar de novo</small></span>
          </button>
        </section>
      )}

      <footer className="taskbar">
        <button
          aria-controls="start-menu"
          aria-expanded={startMenuOpen}
          aria-haspopup="menu"
          className={`task-start${startMenuOpen ? " is-active" : ""}`}
          onClick={() => setStartMenuOpen((current) => !current)}
          type="button"
        >
          <span>RP</span> INICIAR
        </button>
        <div className="task-running">
          <button onClick={() => setWindowOpen(true)} type="button">{view === "mail" ? "✉ Correio" : "▣ Central de Produção"}</button>
        </div>
        <div className="task-status">
          <ThemeSwitch onToggle={toggleTheme} theme={theme} />
          <button aria-label={soundOn ? "Desativar som" : "Ativar som"} onClick={() => setSoundOn((current) => !current)} type="button">{soundOn ? "▰" : "▱"}</button>
          <span>SEM {String(week).padStart(2, "0")}</span>
          <time>08:16</time>
        </div>
      </footer>

      {pdfOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-label="Participantes do programa" aria-modal="true" className="pdf-window" role="dialog">
            <header className="pdf-titlebar">
              <div className="pdf-title">
                <span className="pdf-title-icon" aria-hidden="true">▤</span>
                <b>Participantes.pdf — Visualizador de documentos RPT</b>
              </div>
              <div className="pdf-window-buttons" aria-label="Controles da janela">
                <button aria-label="Minimizar" disabled type="button">—</button>
                <button aria-label="Maximizar" disabled type="button">□</button>
                <button aria-label="Fechar dossiê" onClick={() => setPdfOpen(false)} type="button">×</button>
              </div>
            </header>
            <div className="pdf-toolbar">
              <nav aria-label="Menu do visualizador">
                <span><u>A</u>rquivo</span>
                <span><u>E</u>ditar</span>
                <span>E<u>x</u>ibir</span>
                <span><u>A</u>juda</span>
              </nav>
              <div className="pdf-toolbar-status">
                <span>PÁGINA 1 / 6</span>
                <span>100%</span>
              </div>
            </div>
            <div className="pdf-paper">
              <div className="pdf-heading">
                <span>REDE PLANA DE TELEVISÃO · DIRETORIA DE ELENCO · DOCUMENTO INTERNO</span>
                <h2>CASA VIGIADA</h2>
                <p>FICHA DE ELENCO · TEMPORADA 01</p>
              </div>
              <div className="cast-grid">
                {participants.map((participant, index) => (
                  <article className="cast-card" key={participant.id}>
                    <div className="cast-number">REG {String(index + 1).padStart(2, "0")}</div>
                    <Avatar participant={participant} />
                    <div className="cast-card-copy">
                      <span>{participant.age} ANOS · {participant.city}</span>
                      <h3>{participant.name}</h3>
                      <b>{participant.occupation}</b>
                      <p>{participant.bio}</p>
                      <div className="tag-row">{participant.tags.map((tag) => <i key={tag}>{tag}</i>)}</div>
                      <div className="trait-row">
                        <small>RES {participant.traits.resistencia}</small>
                        <small>SOR {participant.traits.sorte}</small>
                        <small>ATE {participant.traits.atencao}</small>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="pdf-stamp">USO INTERNO<br />RPT · 01</div>
            </div>
            <footer className="pdf-statusbar">
              <span>Documento verificado</span>
              <span>3,2 MB</span>
              <span>Pronto</span>
            </footer>
          </section>
        </div>
      )}
      {process.env.NEXT_PUBLIC_SHOW_GAME_INSPECTOR === "true" && (
        <GameInspector actionLog={engineControls.actionLog} state={shadowGameState} />
      )}
      {editingImportantChain && editingImportantEdit && (
        <div className="modal-backdrop important-editor-backdrop" role="presentation">
          <section
            aria-label={`Editor interno: ${editingImportantChain.title}`}
            aria-modal="true"
            className="important-internal-editor"
            role="dialog"
          >
            <header className="important-event-titlebar">
              <div>
                <span aria-hidden="true">!</span>
                <b>Editor interno de acontecimento</b>
              </div>
              <button aria-label="Salvar rascunho e fechar editor interno" onClick={closeImportantDraft} type="button">×</button>
            </header>

            <div className="important-internal-body">
              <section className="important-editor-overview">
                <div className="important-editor-story">
                  <div>
                    <span className="important-event-badge"><b aria-hidden="true">!</b> ACONTECIMENTO IMPORTANTE</span>
                    <h2>{editingImportantChain.title}</h2>
                    <p>{importantEventSummary(true)}</p>
                  </div>
                  <div className="important-editor-story-cast" aria-label="Participantes do acontecimento">
                    {editingImportantParticipants.map((participant) => (
                      <div key={participant.id}>
                        <Avatar participant={participant} size="small" />
                        <span>{participant.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`important-duration-panel is-${importantVersionValidation?.durationState ?? "available"}`}>
                  <div>
                    <span>DURAÇÃO DO CORTE</span>
                    <b>{formatClockDuration(editingImportantEdit.finalDurationSeconds)}</b>
                  </div>
                  <div className="important-duration-limit"><span>LIMITE RÍGIDO</span><b>03:00</b></div>
                  <div className="important-duration-meter" aria-label={`Duração atual ${formatClockDuration(editingImportantEdit.finalDurationSeconds)} de 03:00`}>
                    <i style={{ width: `${Math.min(100, editingImportantEdit.finalDurationSeconds / IMPORTANT_EVENT_MAX_DURATION_SECONDS * 100)}%` }} />
                  </div>
                  <p>
                    {importantVersionValidation?.durationState === "exceeded"
                      ? `Excedido em ${formatClockDuration(importantVersionValidation.exceededSeconds)}`
                      : importantVersionValidation?.durationState === "limit"
                        ? "No limite permitido"
                        : `${formatClockDuration(importantVersionValidation?.remainingSeconds ?? 0)} livres`}
                    <span>mínimo de 2 momentos</span>
                  </p>
                </div>
              </section>

              <section className="important-version-strip" aria-labelledby="important-version-title">
                <div className="important-version-heading">
                  <div><small>VERSÃO EXIBIDA</small><h3 id="important-version-title">Ordem que irá ao ar</h3></div>
                  <span>Arraste os momentos para reorganizar</span>
                </div>
                <ol className="important-version-track">
                  {includedImportantBeats.length === 0 && <li className="important-version-empty">Inclua momentos para montar a versão exibida.</li>}
                  {includedImportantBeats.map((beat, index) => (
                    <li
                      className={draggedImportantBeatId === beat.id ? "is-dragging" : ""}
                      draggable
                      key={beat.id}
                      onDragEnd={() => setDraggedImportantBeatId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={() => setDraggedImportantBeatId(beat.id)}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedImportantBeatId) reorderImportantBeat(editingImportantChain.id, draggedImportantBeatId, beat.id);
                        setDraggedImportantBeatId(null);
                      }}
                    >
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <div><span>{importantEventRoleLabels[beat.role]}</span><strong>{beat.title}</strong></div>
                      <small>{formatClockDuration(importantBeatDurationSeconds[beat.role])}</small>
                    </li>
                  ))}
                </ol>
              </section>

              <div className="important-editor-layout">
                <section className="important-moment-editor" aria-labelledby="moment-editor-title">
                  <div className="important-editor-section-heading">
                    <div><small>MONTAGEM INTERNA</small><h3 id="moment-editor-title">Momentos do acontecimento</h3></div>
                    <span>{editingImportantEdit.selectedBeatIds.length} de {weekOneImportantEventBeats.length} incluídos</span>
                  </div>
                  <p className="important-editor-instruction">O material original continua preservado. Esta montagem altera apenas o que o público verá.</p>
                  <section className="important-cut-group is-in-cut" aria-labelledby="included-moments-title">
                    <header><h4 id="included-moments-title">NO CORTE <span>• {includedImportantBeats.length}</span></h4><small>Arraste para reorganizar</small></header>
                    <ol className="important-edit-beat-list">
                      {includedImportantBeats.length === 0 && <li className="important-beat-empty">Nenhum momento incluído no corte.</li>}
                      {includedImportantBeats.map((beat, televisedIndex) => (
                        <li
                          className={draggedImportantBeatId === beat.id ? "is-included is-dragging" : "is-included"}
                          draggable
                          key={beat.id}
                          onDragEnd={() => setDraggedImportantBeatId(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDragStart={() => setDraggedImportantBeatId(beat.id)}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (draggedImportantBeatId) reorderImportantBeat(editingImportantChain.id, draggedImportantBeatId, beat.id);
                            setDraggedImportantBeatId(null);
                          }}
                        >
                          <div className="important-edit-beat-index">
                            <b>{String(televisedIndex + 1).padStart(2, "0")}</b>
                            <small>ORIGINAL {String(beat.order).padStart(2, "0")}</small>
                          </div>
                          <div className="important-edit-beat-copy">
                            <span>{importantEventRoleLabels[beat.role]} · {formatClockDuration(importantBeatDurationSeconds[beat.role])}</span>
                            <h4>{beat.title}</h4>
                            <p>{beat.description}</p>
                            <small><b>{participantNames(beat.participantIds)}</b><i>·</i>{beat.location}</small>
                          </div>
                          <div className="important-edit-beat-actions">
                            <button
                              className="is-remove"
                              onClick={() => toggleImportantBeat(editingImportantChain.id, beat.id)}
                              type="button"
                            >
                              Retirar
                            </button>
                            <div>
                              <button
                                aria-label={`Mover ${beat.title} para cima`}
                                disabled={televisedIndex === 0}
                                onClick={() => moveImportantBeat(editingImportantChain.id, beat.id, -1)}
                                type="button"
                              >←</button>
                              <button
                                aria-label={`Mover ${beat.title} para baixo`}
                                disabled={televisedIndex === includedImportantBeats.length - 1}
                                onClick={() => moveImportantBeat(editingImportantChain.id, beat.id, 1)}
                                type="button"
                              >→</button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                  <section className="important-cut-group is-out-cut" aria-labelledby="excluded-moments-title">
                    <header><h4 id="excluded-moments-title">FORA DO CORTE <span>• {excludedImportantBeats.length}</span></h4><small>Material preservado</small></header>
                    <ul className="important-excluded-list">
                      {excludedImportantBeats.length === 0 && <li className="important-beat-empty">Todos os momentos estão no corte.</li>}
                      {excludedImportantBeats.map((beat) => (
                        <li key={beat.id}>
                          <div><span>{importantEventRoleLabels[beat.role]}</span><strong>{beat.title}</strong><small>{beat.location} · {formatClockDuration(importantBeatDurationSeconds[beat.role])}</small></div>
                          <button onClick={() => toggleImportantBeat(editingImportantChain.id, beat.id)} type="button">+ Incluir</button>
                        </li>
                      ))}
                    </ul>
                  </section>
                </section>

                <aside className="important-editor-settings">
                  <section className="important-narrative-reading" aria-live="polite">
                    <div className="important-editor-section-heading">
                      <div><small>ANÁLISE AUTOMÁTICA</small><h3>Leitura provável do público</h3></div>
                      <span className="is-live">● AO VIVO</span>
                    </div>
                    <article className="important-current-reading">
                      <span>LEITURA ATUAL</span>
                      <strong>{importantEventConstructionLabels[editingImportantEdit.detectedEditorialConstruction]}</strong>
                      <p>{editingImportantEdit.versionSummary}</p>
                    </article>
                    <div className="narrative-reading-grid">
                      <article>
                        <span>Foco principal</span>
                        <NarrativeParticipantValue
                          emptyLabel="Sem foco claro"
                          focus
                          participantIds={editingImportantEdit.mainFocusParticipantIds}
                        />
                      </article>
                      <article>
                        <span>Favorecido pela edição</span>
                        <NarrativeParticipantValue
                          emptyLabel="Ninguém"
                          participantIds={editingImportantEdit.favoredParticipantIds}
                        />
                      </article>
                      <article>
                        <span>Prejudicado pela edição</span>
                        <NarrativeParticipantValue
                          emptyLabel="Ninguém"
                          participantIds={editingImportantEdit.harmedParticipantIds}
                        />
                      </article>
                      <article className="narrative-reading-wide narrative-reading-context">
                        <span>Contexto que não chega ao público</span>
                        <p>{editingImportantEdit.missingContextDescription}</p>
                      </article>
                    </div>
                    {importantReadingChange && (
                      <article className="important-reading-change">
                        <b>MUDOU AGORA</b>
                        <p>{importantReadingChange}</p>
                      </article>
                    )}
                  </section>
                </aside>
              </div>
            </div>

            <footer className="important-internal-footer">
              <span className="important-autosave-note">✓ Rascunho salvo automaticamente</span>
              <span className={importantEditError || !importantVersionValidation?.canSaveToTimeline ? "editor-error" : "status-note"}>
                {importantEditError || importantVersionValidation?.reason || `${editingImportantEdit.selectedBeatIds.length} momentos · ${formatClockDuration(editingImportantEdit.finalDurationSeconds)}`}
              </span>
              <div>
                <button onClick={closeImportantDraft} type="button">Salvar rascunho e fechar</button>
                <button
                  className="button button-primary"
                  disabled={!importantVersionValidation?.canSaveToTimeline}
                  onClick={confirmImportantEventEdit}
                  title={importantVersionValidation?.reason || "Salvar versão na timeline"}
                  type="button"
                >Salvar versão na timeline</button>
              </div>
            </footer>
          </section>
        </div>
      )}
      {openImportantChain && (
        <div className="modal-backdrop important-event-backdrop" role="presentation">
          <section
            aria-label={`Acontecimento importante: ${openImportantChain.title}`}
            aria-modal="true"
            className="important-event-window"
            role="dialog"
          >
            <header className="important-event-titlebar">
              <div>
                <span aria-hidden="true">!</span>
                <b>Arquivo de acontecimento importante</b>
              </div>
              <button aria-label="Fechar acontecimento" onClick={() => setOpenImportantChainId(null)} type="button">×</button>
            </header>
            <div className="important-event-detail">
              <div className="important-event-story-heading">
                <span className="important-event-badge"><b aria-hidden="true">!</b> ACONTECIMENTO IMPORTANTE</span>
                <h2>{openImportantChain.title}</h2>
                <p>{importantEventSummary(true)}</p>
              </div>

              <section className="important-event-participants" aria-labelledby="important-participants-title">
                <div className="important-detail-section-title">
                  <span>01</span>
                  <div><small>ENVOLVIDOS</small><h3 id="important-participants-title">Participantes</h3></div>
                </div>
                <div className="important-participant-list">
                  {openImportantParticipants.map((participant) => (
                    <div key={participant.id}>
                      <Avatar participant={participant} size="medium" />
                      <b>{participant.name}</b>
                    </div>
                  ))}
                </div>
              </section>

              <section className="important-event-sequence" aria-labelledby="important-sequence-title">
                <div className="important-detail-section-title">
                  <span>02</span>
                  <div><small>ORDEM CRONOLÓGICA</small><h3 id="important-sequence-title">Sequência do acontecimento</h3></div>
                </div>
                <ol>
                  {openImportantBeats.map((beat) => (
                    <li key={beat.id}>
                      <div className="important-beat-order" aria-hidden="true">{String(beat.order).padStart(2, "0")}</div>
                      <div className="important-beat-copy">
                        <span>{importantEventRoleLabels[beat.role]}</span>
                        <h4>{beat.title}</h4>
                        <p>{beat.description}</p>
                        <small>
                          <b>Participantes:</b> {participantNames(beat.participantIds)}
                          <i aria-hidden="true">·</i>
                          <b>Local:</b> {beat.location}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            <footer>
              <span>{openImportantBeats.length} momentos registrados · Semana {String(openImportantChain.weekNumber).padStart(2, "0")}</span>
              <button onClick={() => setOpenImportantChainId(null)} type="button">Fechar</button>
            </footer>
          </section>
        </div>
      )}
      <div className="crt-overlay" aria-hidden="true" />
    </main>
  );
}
