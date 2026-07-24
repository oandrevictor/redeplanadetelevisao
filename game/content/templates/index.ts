import type { EventTemplate } from "../../types";

type PairOverrides = Omit<EventTemplate, "revision" | "roles" | "cooldown"> & { revision?: number };

const pair = (overrides: PairOverrides): EventTemplate => ({
  revision: 1,
  roles: [{ name: "actor" }, { name: "other", distinct: true }],
  cooldown: { templateTicks: 3, pairTicks: 2 },
  ...overrides,
});

const leaderPair = (
  leaderRole: "actor" | "other",
  overrides: PairOverrides,
): EventTemplate => ({
  ...pair(overrides),
  roles: [
    { name: "actor", leader: leaderRole === "actor" },
    { name: "other", distinct: true, leader: leaderRole === "other" },
  ],
});

const nomineePair = (
  nomineeRole: "actor" | "other",
  overrides: PairOverrides,
): EventTemplate => ({
  ...pair(overrides),
  roles: [
    { name: "actor", nominee: nomineeRole === "actor" },
    { name: "other", distinct: true, nominee: nomineeRole === "other" },
  ],
});

export const eventTemplates: readonly EventTemplate[] = [
  pair({ id: "neutral-check-in", category: "Convivência", tags: ["fallback", "ambient"], windows: ["arrival", "pre_challenge", "leader_reign", "campaign"], baseScore: 20, title: "{actor} procura {other} para conversar", description: "Uma conversa tranquila ajuda os dois a entender melhor o clima da casa.", effects: [{ type: "relationshipDelta", fromRole: "actor", toRole: "other", field: "trust", delta: 2 }] }),
  pair({ id: "shared-household-task", category: "Convivência", tags: ["ambient"], windows: ["arrival", "pre_challenge"], baseScore: 24, title: "{actor} e {other} dividem uma tarefa", description: "A rotina da casa aproxima a dupla por alguns minutos.", effects: [{ type: "relationshipDelta", fromRole: "actor", toRole: "other", field: "affinity", delta: 3 }] }),
  pair({ id: "household-friction", category: "Conflito", tags: ["friction"], windows: ["arrival", "pre_challenge", "leader_reign"], baseScore: 18, title: "A rotina cria atrito entre {actor} e {other}", description: "Uma discordância pequena deixa um incômodo maior do que o esperado.", effects: [{ type: "relationshipDelta", fromRole: "actor", toRole: "other", field: "resentment", delta: 5 }] }),
  pair({ id: "joke-succeeds", category: "Humor", tags: ["humor"], windows: ["arrival", "party", "campaign"], baseScore: 22, title: "A piada de {actor} conquista {other}", description: "O momento leve derruba a tensão e rende risadas sinceras.", effects: [{ type: "relationshipDelta", fromRole: "other", toRole: "actor", field: "affinity", delta: 5 }] }),
  pair({ id: "joke-backfires", category: "Humor", tags: ["humor", "friction"], windows: ["party", "campaign"], baseScore: 17, title: "Uma piada de {actor} atinge {other}", description: "O sorriso desaparece quando a brincadeira toca num ponto sensível.", effects: [{ type: "relationshipDelta", fromRole: "other", toRole: "actor", field: "resentment", delta: 7 }] }),
  pair({ id: "alliance-proposal", category: "Convivência", tags: ["strategy"], windows: ["arrival", "leader_reign", "campaign"], baseScore: 23, title: "{actor} propõe um acordo a {other}", description: "A conversa termina com uma promessa de proteção mútua.", effects: [{ type: "relationshipDelta", fromRole: "actor", toRole: "other", field: "strategicAlignment", delta: 8 }, { type: "openThread", threadType: "alliance", roles: ["actor", "other"] }] }),
  pair({ id: "promise-made", category: "Convivência", tags: ["strategy"], windows: ["leader_reign", "campaign"], baseScore: 20, title: "{actor} dá sua palavra a {other}", description: "Uma promessa direta muda os cálculos para os próximos dias.", effects: [{ type: "relationshipDelta", fromRole: "other", toRole: "actor", field: "trust", delta: 6 }, { type: "openThread", threadType: "promise", roles: ["actor", "other"] }] }),
  pair({ id: "promise-exposed", category: "Conflito", tags: ["callback"], windows: ["campaign", "post_nomination"], baseScore: 15, title: "A promessa de {actor} chega até {other}", description: "Uma informação guardada circula e transforma confiança em suspeita.", effects: [{ type: "relationshipDelta", fromRole: "other", toRole: "actor", field: "trust", delta: -9 }] }),
  leaderPair("actor", { id: "challenge-celebration", category: "Prova", tags: ["challenge"], windows: ["post_challenge"], baseScore: 35, title: "{actor} comemora a prova com {other}", description: "A vitória muda o humor da dupla e chama a atenção da casa.", effects: [{ type: "characterDelta", role: "actor", field: "condition.morale", delta: 8 }] }),
  leaderPair("other", { id: "challenge-resentment", category: "Conflito", tags: ["challenge"], windows: ["post_challenge"], baseScore: 30, title: "{actor} não engole o resultado contra {other}", description: "A derrota continua pesando mesmo depois do fim da prova.", effects: [{ type: "characterDelta", role: "actor", field: "condition.stress", delta: 7 }] }),
  leaderPair("actor", { id: "leader-lobbying", category: "Votação", tags: ["leader"], windows: ["post_challenge", "leader_reign", "campaign"], baseScore: 30, title: "{actor} ouve a aproximação de {other}", description: "A conversa mede riscos, lealdades e o novo poder do líder.", effects: [{ type: "relationshipDelta", fromRole: "actor", toRole: "other", field: "strategicAlignment", delta: 4 }] }),
  pair({ id: "party-unexpected-bond", category: "Festa", tags: ["party", "bond"], windows: ["party"], baseScore: 34, title: "{actor} e {other} se aproximam na festa", description: "Uma conversa inesperada atravessa a madrugada.", effects: [{ type: "relationshipDelta", fromRole: "actor", toRole: "other", field: "affinity", delta: 8 }] }),
  pair({ id: "party-open-mic", revision: 2, category: "Festa", tags: ["party", "risk"], windows: ["party"], baseScore: 32, title: "{actor} questiona o jogo de {other}, e a crítica circula", description: "Durante a festa, {actor} diz a outros participantes que desconfia das alianças de {other}. A conversa é repassada, e {other} descobre.", effects: [{ type: "relationshipDelta", fromRole: "other", toRole: "actor", field: "resentment", delta: 9 }] }),
  pair({ id: "triggered-confrontation", category: "Conflito", tags: ["trigger"], windows: ["party", "campaign", "post_nomination"], baseScore: 26, title: "{actor} confronta {other}", description: "A tensão acumulada vira uma conversa sem espaço para recuo.", effects: [{ type: "relationshipDelta", fromRole: "actor", toRole: "other", field: "rivalry", delta: 8 }] }),
  pair({ id: "mediation", category: "Convivência", tags: ["decompression"], windows: ["party", "campaign", "post_nomination"], baseScore: 18, title: "{actor} tenta mediar o conflito de {other}", description: "A intervenção reduz o tom e abre espaço para uma trégua.", effects: [{ type: "relationshipDelta", fromRole: "other", toRole: "actor", field: "respect", delta: 5 }] }),
  nomineePair("actor", { id: "nominee-confrontation", category: "Votação", tags: ["nominee"], windows: ["post_nomination"], baseScore: 35, title: "{actor} cobra explicações de {other}", description: "A berlinda transforma uma suspeita em cobrança aberta.", effects: [{ type: "relationshipDelta", fromRole: "actor", toRole: "other", field: "trust", delta: -8 }] }),
  nomineePair("other", { id: "nominee-consolation", category: "Convivência", tags: ["nominee"], windows: ["post_nomination"], baseScore: 28, title: "{actor} consola {other}", description: "Um gesto de apoio ganha peso na noite da indicação.", effects: [{ type: "relationshipDelta", fromRole: "other", toRole: "actor", field: "trust", delta: 7 }] }),
  pair({ id: "elimination-grief", category: "Memória", tags: ["aftermath"], windows: ["post_elimination"], baseScore: 32, title: "{actor} sente a ausência ao lado de {other}", description: "A despedida reorganiza afetos e deixa a casa mais silenciosa.", effects: [{ type: "characterDelta", role: "actor", field: "condition.morale", delta: -6 }] }),
  pair({ id: "elimination-relief", category: "Memória", tags: ["aftermath"], windows: ["post_elimination"], baseScore: 24, title: "{actor} admite alívio a {other}", description: "Com o resultado encerrado, uma tensão antiga finalmente diminui.", effects: [{ type: "characterDelta", role: "actor", field: "condition.stress", delta: -6 }] }),
  pair({ id: "power-vacuum", category: "Convivência", tags: ["aftermath", "strategy"], windows: ["post_elimination"], baseScore: 30, title: "{actor} e {other} recalculam o jogo", description: "A saída abre um espaço de poder que ninguém quer deixar vazio.", effects: [{ type: "relationshipDelta", fromRole: "actor", toRole: "other", field: "strategicAlignment", delta: 6 }] }),
] as const;
