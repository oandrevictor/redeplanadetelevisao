"use client";

import { useEffect, useMemo, useState } from "react";

type ChallengeType = "resistencia" | "sorte" | "atencao";
type PersonalityTrait =
  | "carisma"
  | "estrategia"
  | "impulsividade"
  | "lealdade"
  | "competitividade"
  | "percepcaoSocial"
  | "conscienciaDasCameras";
type TraitScore = 1 | 2 | 3 | 4 | 5;
type AppView = "mail" | "feed" | "challenge" | "edit";
type Theme = "light" | "dark";
type Phase =
  | "email"
  | "feedIntro"
  | "challenge"
  | "editPremiere"
  | "livePremiere"
  | "summaryPremiere"
  | "feedParty"
  | "editVote"
  | "liveVote"
  | "audienceVote"
  | "editElimination"
  | "liveElimination"
  | "weekSummary"
  | "editFinal"
  | "liveFinal"
  | "winnerVote"
  | "winnerReveal";

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
};

type TimelineItem =
  | { id: string; kind: "ad"; title: string; duration: 4 }
  | ({ kind: "event" } & RecordedEvent);

const participants: Participant[] = [
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

const recordedEvents: RecordedEvent[] = [
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

const adSlots: TimelineItem[] = [1, 2, 3, 4].map((number) => ({
  id: `intervalo-${number}`,
  kind: "ad" as const,
  title: `Intervalo ${number}`,
  duration: 4 as const,
}));

const introFeed = [
  { time: "08:14", camera: "CAM 01 · SALA", title: "Dandara foi a primeira a entrar", body: "Ela já escolheu o sofá e está narrando a própria chegada." },
  { time: "08:26", camera: "CAM 04 · QUARTO", title: "Disputa silenciosa por camas", body: "Iago largou um tênis em cada cama. Celina anotou mentalmente." },
  { time: "09:02", camera: "CAM 07 · COZINHA", title: "Primeiro café, primeira faísca", body: "Bento usou o último filtro. Jussara chamou de crime federal." },
  { time: "09:41", camera: "CAM 03 · VARANDA", title: "Uma aliança começa a tomar forma", body: "Três participantes combinaram trocar informações antes da prova." },
];

const partyFeed = [
  { time: "23:18", camera: "CAM 02 · PISTA", title: "Começou a Festa Sinal de Verão", body: "Luzes fluorescentes, pista molhada e figurinos que desafiam o sinal da TV." },
  { time: "00:07", camera: "CAM 06 · BAR", title: "Uma aproximação inesperada", body: "Duas pessoas que quase não conversavam passaram vinte minutos juntas no bar." },
  { time: "01:12", camera: "CAM 03 · VARANDA", title: "Comentário captado pelo microfone", body: "Uma crítica atravessou a festa e pode mudar os votos da casa." },
  { time: "02:36", camera: "CAM 05 · QUARTO", title: "Jussara encerra a noite com coreografia", body: "Até quem estava brigado apareceu para aprender o passinho." },
];

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

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("email");
  const [view, setView] = useState<AppView>("mail");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [windowOpen, setWindowOpen] = useState(true);
  const [feedCount, setFeedCount] = useState(0);
  const [partyCount, setPartyCount] = useState(0);
  const [challengeType, setChallengeType] = useState<ChallengeType | null>(null);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [activeIds, setActiveIds] = useState(() => participants.map((participant) => participant.id));
  const [week, setWeek] = useState(1);
  const [timeline, setTimeline] = useState<TimelineItem[]>(adSlots);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [sort, setSort] = useState("calor");
  const [editorError, setEditorError] = useState("");
  const [dragged, setDragged] = useState<{ source: "bank" | "timeline"; id: string } | null>(null);
  const [liveProgress, setLiveProgress] = useState(0);
  const [nominees, setNominees] = useState<string[]>([]);
  const [audiencePick, setAudiencePick] = useState<string | null>(null);
  const [lastEliminatedId, setLastEliminatedId] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("rede-plana-theme");
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
  }, []);

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

  const leader = participants.find((participant) => participant.id === leaderId) ?? null;
  const lastEliminated = participants.find((participant) => participant.id === lastEliminatedId) ?? null;
  const winner = participants.find((participant) => participant.id === winnerId) ?? null;

  const isEditPhase = phase === "editPremiere" || phase === "editVote" || phase === "editElimination" || phase === "editFinal";
  const isLivePhase = phase === "livePremiere" || phase === "liveVote" || phase === "liveElimination" || phase === "liveFinal";

  const availableEvents = useMemo(() => {
    const ids =
      phase === "editPremiere"
        ? ["chegadas", "mala-trocada", "pacto-varanda", "cafe-sem-acucar", "prova-lider", "confessionario"]
        : phase === "editVote"
          ? ["festa-neon", "microfone-aberto", "danca-jussara", "pacto-varanda", "indicacao-lider", "voto-casa"]
          : phase === "editElimination"
            ? ["melhores-semana", "microfone-aberto", "indicacao-lider", "voto-casa", "despedida"]
            : ["melhores-semana", "festa-neon", "prova-lider", "discursos-final", "confessionario"];

    const selectedIds = new Set(timeline.filter((item) => item.kind === "event").map((item) => item.id));
    let events = recordedEvents.filter((event) => ids.includes(event.id) && !selectedIds.has(event.id));
    if (category !== "Todos") events = events.filter((event) => event.category === category);
    if (search.trim()) {
      const query = search.toLocaleLowerCase("pt-BR");
      events = events.filter((event) => `${event.title} ${event.description}`.toLocaleLowerCase("pt-BR").includes(query));
    }
    return [...events].sort((a, b) => (sort === "duracao" ? a.duration - b.duration : b.heat - a.heat));
  }, [phase, timeline, category, search, sort]);

  const timelineDuration = timeline.reduce((sum, item) => sum + item.duration, 0);
  const eventCount = timeline.filter((item) => item.kind === "event").length;
  const totalHeat = timeline
    .filter((item): item is TimelineItem & { kind: "event"; heat: number } => item.kind === "event")
    .reduce((sum, item) => sum + item.heat, 0);
  const predictedAudience = Math.round(18 + totalHeat / Math.max(eventCount, 1) / 4 + week * 1.4);

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

  function startEdit(nextPhase: Extract<Phase, "editPremiere" | "editVote" | "editElimination" | "editFinal">) {
    setPhase(nextPhase);
    setView("edit");
    setTimeline(adSlots);
    setSearch("");
    setCategory("Todos");
    setSort("calor");
    setEditorError("");
    setWindowOpen(true);
  }

  function confirmChallenge() {
    if (!challengeType) return;
    const ranked = [...activeParticipants].sort((a, b) => {
      const aScore = a.traits[challengeType] + ((participants.indexOf(a) + week) % 3) * 0.12;
      const bScore = b.traits[challengeType] + ((participants.indexOf(b) + week) % 3) * 0.12;
      return bScore - aScore;
    });
    setLeaderId(ranked[0]?.id ?? activeParticipants[0]?.id ?? null);
    startEdit("editPremiere");
  }

  function addEvent(event: RecordedEvent) {
    setTimeline((current) => [...current, { ...event, kind: "event" }]);
    setEditorError("");
  }

  function removeEvent(id: string) {
    setTimeline((current) => current.filter((item) => item.kind === "ad" || item.id !== id));
  }

  function moveItem(index: number, direction: -1 | 1) {
    setTimeline((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function dropOnTimeline(targetIndex?: number) {
    if (!dragged) return;
    if (dragged.source === "bank") {
      const event = recordedEvents.find((item) => item.id === dragged.id);
      if (!event || timeline.some((item) => item.id === event.id)) return;
      setTimeline((current) => {
        const next = [...current];
        const item: TimelineItem = { ...event, kind: "event" };
        if (typeof targetIndex === "number") next.splice(targetIndex, 0, item);
        else next.push(item);
        return next;
      });
    } else {
      setTimeline((current) => {
        const sourceIndex = current.findIndex((item) => item.id === dragged.id);
        if (sourceIndex < 0) return current;
        const next = [...current];
        const [item] = next.splice(sourceIndex, 1);
        const destination = typeof targetIndex === "number" ? targetIndex : next.length;
        next.splice(destination, 0, item);
        return next;
      });
    }
    setDragged(null);
    setEditorError("");
  }

  function confirmEdit() {
    if (eventCount < 2) {
      setEditorError("Inclua pelo menos dois acontecimentos antes de fechar o corte.");
      return;
    }
    setLiveProgress(0);
    if (phase === "editPremiere") setPhase("livePremiere");
    if (phase === "editVote") setPhase("liveVote");
    if (phase === "editElimination") setPhase("liveElimination");
    if (phase === "editFinal") setPhase("liveFinal");
    setWindowOpen(false);
  }

  function buildNominees() {
    const candidates = activeParticipants.filter((participant) => participant.id !== leaderId);
    const leaderChoice = [...candidates].sort((a, b) => a.traits.atencao - b.traits.atencao)[0];
    const houseChoice = [...candidates]
      .filter((participant) => participant.id !== leaderChoice?.id)
      .sort((a, b) => a.traits.sorte - b.traits.sorte)[0];
    return [leaderChoice?.id, houseChoice?.id].filter(Boolean) as string[];
  }

  function finishLive() {
    if (phase === "livePremiere") {
      setPhase("summaryPremiere");
      return;
    }
    if (phase === "liveVote") {
      const nextNominees = buildNominees();
      setNominees(nextNominees);
      setAudiencePick(null);
      setPhase("audienceVote");
      return;
    }
    if (phase === "liveElimination") {
      if (!audiencePick) return;
      setLastEliminatedId(audiencePick);
      setActiveIds((current) => current.filter((id) => id !== audiencePick));
      setPhase("weekSummary");
      return;
    }
    if (phase === "liveFinal") {
      setAudiencePick(null);
      setPhase("winnerVote");
    }
  }

  useEffect(() => {
    if (!isLivePhase) return;
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
    if (!audiencePick) return;
    startEdit("editElimination");
  }

  function nextWeek() {
    setWeek((current) => current + 1);
    setChallengeType(null);
    setLeaderId(null);
    setNominees([]);
    setAudiencePick(null);
    setFeedCount(4);
    setPartyCount(4);
    setPhase("challenge");
    setView("challenge");
    setWindowOpen(true);
  }

  function voteWinner() {
    if (!audiencePick) return;
    setWinnerId(audiencePick);
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
    if (phase === "email" || phase === "feedIntro" && feedCount < introFeed.length) {
      return "Os personagens estao chegando na casa, abra o feed das cameras para dar uma olhada no que está acontecendo";
    }
    if (phase === "feedIntro" || phase === "challenge") {
      return "O programa estreia hoje a noite com a primeira prova do lider. Qual vai ser a prova?";
    }
    if (phase === "editPremiere") return "Agora é hora de escolher os cortes do programa.";
    if (phase === "summaryPremiere") return "Boa estreia. Volte ao feed: a casa não para quando a transmissão termina.";
    if (phase === "feedParty") return "A festa rendeu. Daqui a dois dias, o episódio termina com a formação da votação.";
    if (phase === "editVote") return "Construa tensão até a indicação do líder e a votação da casa.";
    if (phase === "audienceVote") return "A votação está aberta. Agora o público decide quem deve sair.";
    if (phase === "editElimination") return "Prepare o programa que vai anunciar a eliminação.";
    if (phase === "weekSummary") return activeParticipants.length === 3
      ? "Restam três. A próxima transmissão será a grande final."
      : `Semana ${week} encerrada. A próxima prova já está esperando.`;
    if (phase === "editFinal" || phase === "liveFinal" || phase === "winnerVote") return "É a final. Desta vez, o público escolhe quem vence.";
    if (phase === "winnerReveal") return "Sinal encerrado. Você dirigiu a temporada inteira.";
    return "TRANSMISSÃO EM ANDAMENTO // NÃO DESLIGUE";
  }

  function renderFeed() {
    const isParty = phase === "feedParty" || phase === "editVote" || phase === "liveVote" || phase === "audienceVote" || phase === "editElimination" || phase === "liveElimination" || phase === "weekSummary";
    const items = isParty ? partyFeed : introFeed;
    const count = isParty ? partyCount : feedCount;
    const setCount = isParty ? setPartyCount : setFeedCount;
    return (
      <div className="feed-panel">
        <div className="feed-toolbar">
          <div>
            <span className="eyebrow">SINAL INTERNO · 8 CÂMERAS</span>
            <h2>{isParty ? "Madrugada pós-festa" : "Chegada dos participantes"}</h2>
          </div>
          <div className="live-chip"><i /> AO VIVO</div>
        </div>
        <div className="camera-strip" aria-label="Miniaturas das câmeras">
          {["SALA", "QUARTO", "VARANDA", "COZINHA"].map((camera, index) => (
            <div className={`camera-thumb camera-${index + 1}`} key={camera}>
              <span>CAM {String(index + 1).padStart(2, "0")}</span>
              <b>{camera}</b>
              <div className="camera-silhouette" />
            </div>
          ))}
        </div>
        <div className="feed-log" aria-live="polite">
          {items.slice(0, count).map((item, index) => (
            <article className="feed-entry" key={item.time}>
              <time>{item.time}</time>
              <div className="feed-line" />
              <div>
                <span>{item.camera}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
              <strong>{String(index + 1).padStart(2, "0")}</strong>
            </article>
          ))}
          {count === 0 && (
            <div className="feed-empty">
              <div className="signal-loader" aria-hidden="true"><i /><i /><i /></div>
              <p>Aguardando acontecimentos…</p>
            </div>
          )}
        </div>
        <div className="panel-actions">
          {count < items.length ? (
            <button className="button button-primary" onClick={() => setCount((current) => current + 1)} type="button">
              Atualizar feed <span>+1 evento</span>
            </button>
          ) : isParty ? (
            <button className="button button-primary" onClick={() => startEdit("editVote")} type="button">
              Avançar 2 dias e editar episódio
            </button>
          ) : (
            <button
              className="button button-primary"
              onClick={() => {
                setPhase("challenge");
                setView("challenge");
              }}
              type="button"
            >
              Definir primeira prova do líder
            </button>
          )}
          <span className="status-note">{count}/{items.length} registros recebidos</span>
        </div>
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
        : phase === "editVote" ? "Formação da votação"
          : phase === "editElimination" ? "Noite de eliminação"
            : "Grande final";
    return (
      <div className="editor-panel">
        <div className="editor-heading">
          <div>
            <span className="eyebrow">ILHA DE EDIÇÃO · EP {String(week * 3 - (phase === "editPremiere" ? 2 : phase === "editVote" ? 1 : 0)).padStart(2, "0")}</span>
            <h2>{episodeLabel}</h2>
          </div>
          <div className="runtime">
            <span>DURAÇÃO</span>
            <b>{timelineDuration}:00</b>
            <small>4 intervalos fixos · 16 min</small>
          </div>
        </div>

        <section className="timeline-section">
          <div className="section-label">
            <span>Linha do programa</span>
            <small>Arraste para organizar · setas também movem os blocos</small>
          </div>
          <div
            className="timeline"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropOnTimeline()}
          >
            {timeline.map((item, index) => (
              <article
                className={`timeline-item timeline-${item.kind}`}
                draggable
                key={item.id}
                onDragStart={() => setDragged({ source: "timeline", id: item.id })}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.stopPropagation();
                  dropOnTimeline(index);
                }}
              >
                <div className="timeline-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <span>{item.kind === "ad" ? "COMERCIAL · FIXO" : item.category}</span>
                  <h3>{item.title}</h3>
                  <small>{item.duration} min</small>
                </div>
                <div className="timeline-controls">
                  <button aria-label={`Mover ${item.title} para a esquerda`} disabled={index === 0} onClick={() => moveItem(index, -1)} type="button">←</button>
                  <button aria-label={`Mover ${item.title} para a direita`} disabled={index === timeline.length - 1} onClick={() => moveItem(index, 1)} type="button">→</button>
                  {item.kind === "event" && (
                    <button aria-label={`Remover ${item.title}`} onClick={() => removeEvent(item.id)} type="button">×</button>
                  )}
                </div>
              </article>
            ))}
            {timeline.length === 4 && <p className="timeline-hint">Solte acontecimentos aqui para construir o episódio.</p>}
          </div>
        </section>

        <section className="event-bank">
          <div className="section-label">
            <span>Acontecimentos gravados</span>
            <small>{availableEvents.length} cortes disponíveis</small>
          </div>
          <div className="event-filters">
            <label>
              <span className="sr-only">Buscar acontecimentos</span>
              <input onChange={(event) => setSearch(event.target.value)} placeholder="Buscar corte…" type="search" value={search} />
            </label>
            <label>
              <span className="sr-only">Filtrar por categoria</span>
              <select onChange={(event) => setCategory(event.target.value)} value={category}>
                {["Todos", "Convivência", "Conflito", "Humor", "Prova", "Festa", "Votação", "Memória"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Ordenar acontecimentos</span>
              <select onChange={(event) => setSort(event.target.value)} value={sort}>
                <option value="calor">Maior potencial</option>
                <option value="duracao">Menor duração</option>
              </select>
            </label>
          </div>
          <div className="event-grid">
            {availableEvents.map((event) => (
              <article
                className="event-card"
                draggable
                key={event.id}
                onDragStart={() => setDragged({ source: "bank", id: event.id })}
              >
                <div className="event-card-top">
                  <span>{event.category}</span>
                  <b>{event.duration}′</b>
                </div>
                <h3>{event.title}</h3>
                <p>{event.description}</p>
                <div className="heat-row">
                  <span>potencial</span>
                  <div><i style={{ width: `${event.heat}%` }} /></div>
                  <b>{event.heat}</b>
                </div>
                <button onClick={() => addEvent(event)} type="button">+ Adicionar à timeline</button>
              </article>
            ))}
            {availableEvents.length === 0 && <p className="no-results">Nenhum corte corresponde aos filtros.</p>}
          </div>
        </section>
        <div className="panel-actions sticky-actions">
          <button className="button button-primary" onClick={confirmEdit} type="button">Fechar corte e transmitir</button>
          <span className={editorError ? "editor-error" : "status-note"}>
            {editorError || `${eventCount} acontecimentos · audiência prevista ${predictedAudience} pts`}
          </span>
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

  function renderAppContent() {
    if (view === "mail") return renderMail();
    if (view === "feed") return renderFeed();
    if (view === "challenge") return renderChallenge();
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
    const liveAudience = Math.round(11 + (predictedAudience - 11) * liveProgress / 100);
    return (
      <main className={`broadcast-screen theme-${theme}`}>
        <ThemeSwitch onToggle={toggleTheme} theme={theme} />
        <div className="broadcast-top">
          <div className="on-air"><i /> AO VIVO</div>
          <span>CASA VIGIADA · SEMANA {String(week).padStart(2, "0")}</span>
          <time>21:{String(Math.min(59, 12 + Math.floor(liveProgress / 3))).padStart(2, "0")}</time>
        </div>
        <section className="performance-review">
          <div className="review-copy">
            <span className="eyebrow">LIVE PERFORMANCE REVIEW</span>
            <h1>{phase === "liveFinal" ? "A grande final está no ar" : phase === "liveElimination" ? "O Brasil espera o resultado" : "O programa entrou no ar"}</h1>
            <p>Monitoramento de audiência minuto a minuto.</p>
          </div>
          <div className="audience-number"><b>{liveAudience}</b><span>pontos</span></div>
          <div className="live-chart" aria-label={`Audiência atual: ${liveAudience} pontos`}>
            {Array.from({ length: 24 }).map((_, index) => {
              const reached = index / 23 <= liveProgress / 100;
              const height = 18 + ((index * 17 + week * 11) % 58);
              return <i className={reached ? "reached" : ""} key={index} style={{ height: `${height}%` }} />;
            })}
          </div>
          <div className="review-stats">
            <span><small>PICO</small><b>{liveAudience + 3},2</b></span>
            <span><small>SHARE</small><b>{Math.round(liveAudience * 1.7)}%</b></span>
            <span><small>TENDÊNCIA</small><b className="up">↑ {Math.max(1, Math.round(liveProgress / 18))},4</b></span>
          </div>
          <div className="transmission-progress"><i style={{ width: `${liveProgress}%` }} /></div>
          <p className="transmission-status">{liveProgress < 100 ? "TRANSMISSÃO EM ANDAMENTO" : "ENCERRANDO SINAL…"}</p>
        </section>
        <div className="broadcast-noise" aria-hidden="true" />
      </main>
    );
  }

  if (phase === "summaryPremiere") {
    return (
      <main className={`result-screen theme-${theme}`}>
        <ThemeSwitch onToggle={toggleTheme} theme={theme} />
        <div className="result-window">
          <span className="eyebrow">RELATÓRIO DE EXIBIÇÃO · EPISÓDIO 01</span>
          <h1>Uma estreia acima da meta.</h1>
          <p>O primeiro episódio apresentou o elenco, construiu uma rivalidade e terminou com {leader?.name ?? "um participante"} na liderança.</p>
          <div className="summary-metrics">
            <div><span>AUDIÊNCIA MÉDIA</span><b>{predictedAudience},4</b><small>meta 24,0</small></div>
            <div><span>PICO</span><b>{predictedAudience + 4},1</b><small>durante a prova</small></div>
            <div><span>APROVAÇÃO</span><b>82%</b><small>pesquisa instantânea</small></div>
          </div>
          <div className="leader-callout">
            {leader && <Avatar participant={leader} size="small" />}
            <div><span>PRIMEIRO LÍDER</span><b>{leader?.name}</b></div>
          </div>
          <button
            className="button button-primary"
            onClick={() => {
              setPhase("feedParty");
              setView("feed");
              setWindowOpen(true);
            }}
            type="button"
          >
            Voltar ao computador
          </button>
        </div>
      </main>
    );
  }

  if (phase === "audienceVote" || phase === "winnerVote") {
    const choices = phase === "winnerVote"
      ? activeParticipants
      : participants.filter((participant) => nominees.includes(participant.id));
    return (
      <main className={`vote-screen theme-${theme}`}>
        <ThemeSwitch onToggle={toggleTheme} theme={theme} />
        <div className="vote-brand"><span>CASA</span><b>VIGIADA</b><small>VOTAÇÃO DO PÚBLICO</small></div>
        <section className="vote-box">
          <span className="eyebrow">{phase === "winnerVote" ? "GRANDE FINAL" : `SEMANA ${String(week).padStart(2, "0")} · VOTAÇÃO ABERTA`}</span>
          <h1>{phase === "winnerVote" ? "Quem deve vencer?" : "Quem deve sair?"}</h1>
          <p>{phase === "winnerVote" ? "Escolha o participante que merece levar o prêmio." : "A decisão do público define o próximo corte do programa."}</p>
          <div className={`vote-cards vote-${choices.length}`}>
            {choices.map((participant) => (
              <button
                aria-pressed={audiencePick === participant.id}
                className={audiencePick === participant.id ? "is-selected" : ""}
                key={participant.id}
                onClick={() => setAudiencePick(participant.id)}
                type="button"
              >
                <Avatar participant={participant} size="large" />
                <span>{participant.city}</span>
                <b>{participant.name}</b>
                <small>{participant.occupation}</small>
                <i>{audiencePick === participant.id ? "SELECIONADO ✓" : "VOTAR"}</i>
              </button>
            ))}
          </div>
          <button
            className="button button-primary vote-confirm"
            disabled={!audiencePick}
            onClick={phase === "winnerVote" ? voteWinner : confirmAudienceElimination}
            type="button"
          >
            Confirmar voto
          </button>
        </section>
      </main>
    );
  }

  if (phase === "weekSummary") {
    const finalists = activeParticipants.length === 3;
    return (
      <main className={`result-screen week-result theme-${theme}`}>
        <ThemeSwitch onToggle={toggleTheme} theme={theme} />
        <div className="result-window">
          <span className="eyebrow">ARQUIVO SEMANAL · SEMANA {String(week).padStart(2, "0")}</span>
          <h1>{finalists ? "Temos os três finalistas." : `Semana ${week} encerrada.`}</h1>
          {lastEliminated && (
            <div className="eliminated-callout">
              <Avatar participant={lastEliminated} size="large" eliminated />
              <div>
                <span>ELIMINADO COM {54 + week * 7}% DOS VOTOS</span>
                <b>{lastEliminated.name}</b>
                <p>“{lastEliminated.quote}”</p>
              </div>
            </div>
          )}
          <div className="summary-metrics">
            <div><span>EPISÓDIOS</span><b>03</b><small>exibidos nesta semana</small></div>
            <div><span>MÉDIA</span><b>{predictedAudience + 2},8</b><small>+{week + 2}% vs. anterior</small></div>
            <div><span>NA CASA</span><b>{activeParticipants.length}</b><small>participantes ativos</small></div>
          </div>
          <div className="remaining-strip">
            {activeParticipants.map((participant) => (
              <div key={participant.id}><Avatar participant={participant} size="small" /><span>{participant.name.split(" ")[0]}</span></div>
            ))}
          </div>
          <button className="button button-primary" onClick={finalists ? () => startEdit("editFinal") : nextWeek} type="button">
            {finalists ? "Preparar a grande final" : `Começar semana ${week + 1}`}
          </button>
        </div>
      </main>
    );
  }

  if (phase === "winnerReveal") {
    return (
      <main className={`winner-screen theme-${theme}`}>
        <ThemeSwitch onToggle={toggleTheme} theme={theme} />
        <div className="confetti" aria-hidden="true">{Array.from({ length: 28 }).map((_, index) => <i key={index} />)}</div>
        <div className="winner-copy">
          <span className="eyebrow">CASA VIGIADA · FINAL DA TEMPORADA</span>
          <h1>O Brasil escolheu.</h1>
          {winner && <Avatar participant={winner} size="large" />}
          <p>Com 62% dos votos, o grande vencedor é</p>
          <h2>{winner?.name}</h2>
          <blockquote>“{winner?.quote}”</blockquote>
          <div className="summary-metrics">
            <div><span>SEMANAS</span><b>{week}</b></div>
            <div><span>EPISÓDIOS</span><b>{week * 3 + 1}</b></div>
            <div><span>MAIOR PICO</span><b>{predictedAudience + 9},7</b></div>
          </div>
          <button className="button button-primary" onClick={() => window.location.reload()} type="button">Jogar novamente</button>
        </div>
      </main>
    );
  }

  return (
    <main className={`computer-shell theme-${theme}`}>
      <div className="desktop-wallpaper" aria-hidden="true"><span>RPT</span><b>PRODUÇÃO<br />CASA VIGIADA</b></div>
      <aside className="desktop-icons" aria-label="Aplicativos">
        <AppIcon active={view === "mail"} label="Correio" onClick={() => { setView("mail"); setWindowOpen(true); }} symbol="✉" />
        <AppIcon active={view === "feed"} label="Feed da casa" onClick={openFeed} symbol="▣" />
        <AppIcon active={view === "challenge"} disabled={phase !== "challenge"} label="Provas" onClick={openChallenge} symbol="◎" />
        <AppIcon active={view === "edit"} disabled={!isEditPhase} label="Edição" onClick={() => { if (isEditPhase) { setView("edit"); setWindowOpen(true); } }} symbol="▤" />
      </aside>

      {windowOpen && (
        <section className={`app-window app-${view}`}>
          <header className="window-titlebar">
            <div><span className="window-app-icon">{view === "mail" ? "✉" : view === "feed" ? "▣" : view === "challenge" ? "◎" : "▤"}</span>{view === "mail" ? "Caixa de Entrada — Correio RPT" : "Central de Produção — Casa Vigiada"}</div>
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
            </nav>
          )}
          <div className="window-content">{renderAppContent()}</div>
        </section>
      )}

      <aside className="guide-bubble" aria-live="polite">
        <div className="guide-copy"><span>PLIN // ASSISTENTE DE PRODUÇÃO</span><p>{guideMessage()}</p></div>
        <div className="guide-tail" aria-hidden="true" />
        <div className="plin" aria-label="PLIN, mascote da central de produção">
          <i className="antenna a1" /><i className="antenna a2" />
          <div className="plin-screen"><i /><i /><b /></div>
          <span />
        </div>
      </aside>

      <footer className="taskbar">
        <button className="task-start" type="button"><span>RP</span> INICIAR</button>
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
            <header>
              <div><span className="pdf-icon mini">PDF</span><div><b>Participantes.pdf</b><small>DOSSIÊ CONFIDENCIAL · 6 PÁGINAS</small></div></div>
              <button aria-label="Fechar dossiê" onClick={() => setPdfOpen(false)} type="button">×</button>
            </header>
            <div className="pdf-paper">
              <div className="pdf-heading">
                <span>REDE PLANA DE TELEVISÃO · DIRETORIA DE ELENCO</span>
                <h2>CASA VIGIADA</h2>
                <p>Participantes selecionados // temporada 01</p>
              </div>
              <div className="cast-grid">
                {participants.map((participant, index) => (
                  <article className="cast-card" key={participant.id}>
                    <div className="cast-number">{String(index + 1).padStart(2, "0")}</div>
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
              <div className="pdf-stamp">APROVADO<br />DIRETORIA</div>
            </div>
          </section>
        </div>
      )}
      <div className="crt-overlay" aria-hidden="true" />
    </main>
  );
}
