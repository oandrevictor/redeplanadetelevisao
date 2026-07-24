import type { CharacterProfile } from "../types";

export const cast: readonly CharacterProfile[] = [
  {
    id: "dandara", name: "Dandara Moraes", age: 27, city: "Salvador, BA", occupation: "Bartender e performer",
    bio: "Carismática, rápida nas respostas e incapaz de ignorar uma provocação. Quer usar o prêmio para abrir seu próprio bar.",
    quote: "Se a câmera está ligada, eu também estou.", publicPersona: "A protagonista magnética que não foge de confronto e sempre entrega uma boa cena.",
    challengeTraits: { resistencia: 4, sorte: 3, atencao: 5 },
    personalityTraits: { carisma: 5, estrategia: 3, impulsividade: 4, lealdade: 4, competitividade: 5, percepcaoSocial: 4, conscienciaDasCameras: 5 },
    personalTriggers: ["ser chamada de falsa", "ver um aliado sendo atacado", "sentir que tentam apagar sua presença"],
    behavioralTendencies: ["responde provocações imediatamente", "protege aliados em público", "transforma tensão em performance"],
    contradictions: ["prega lealdade, mas adora testar alianças", "parece autoconfiante, porém teme ser irrelevante"],
    strengths: ["presença de palco", "leitura rápida do ambiente", "coragem em conflitos"],
    weaknesses: ["dificuldade de recuar", "necessidade de validação", "exposição excessiva de suas intenções"],
    possibleArcs: ["liderança carismática da casa", "ruptura dramática com um aliado", "redenção após perceber que passou do ponto"],
    tags: ["magnética", "competitiva", "leal"], portrait: { x: "0%", y: "0%" },
    triggerKeys: ["called_fake", "ally_attacked"], behaviorKeys: ["retaliates_immediately", "protects_allies"],
    drives: { visibility: 5, belonging: 4, control: 3, fairness: 4, status: 5 },
  },
  {
    id: "bento", name: "Bento Farias", age: 31, city: "Campo Grande, MS", occupation: "Instrutor de montaria",
    bio: "Parece sereno até entrar numa disputa. Tem força de sobra, mas se perde quando precisa prestar atenção em detalhes.",
    quote: "Devagar também é um jeito de chegar primeiro.", publicPersona: "O gigante tranquilo e confiável que prefere agir a falar.",
    challengeTraits: { resistencia: 5, sorte: 3, atencao: 2 },
    personalityTraits: { carisma: 3, estrategia: 2, impulsividade: 2, lealdade: 5, competitividade: 4, percepcaoSocial: 2, conscienciaDasCameras: 2 },
    personalTriggers: ["ser tratado como pouco inteligente", "quebra de palavra", "provocações durante provas"],
    behavioralTendencies: ["evita conflitos até acumular irritação", "cumpre acordos ao pé da letra", "fica mais agressivo em competições"],
    contradictions: ["diz não ligar para estratégia, mas guarda cada traição", "parece paciente, porém odeia perder"],
    strengths: ["resistência", "constância", "lealdade"], weaknesses: ["baixa leitura social", "teimosia", "dificuldade com sutilezas"],
    possibleArcs: ["azarão que assume a liderança", "explosão depois de semanas em silêncio", "traição que abala seu código de honra"],
    tags: ["forte", "calmo", "teimoso"], portrait: { x: "50%", y: "0%" },
    triggerKeys: ["broken_word", "intelligence_questioned"], behaviorKeys: ["stores_resentment", "competes_intensely"],
    drives: { visibility: 2, belonging: 4, control: 3, fairness: 5, status: 3 },
  },
  {
    id: "celina", name: "Celina Prado", age: 42, city: "Belo Horizonte, MG", occupation: "Jornalista investigativa",
    bio: "Observa antes de falar e raramente esquece uma frase. Entrou para provar que estratégia também rende entretenimento.",
    quote: "Toda casa tem uma pauta escondida.", publicPersona: "A estrategista cerebral que enxerga as engrenagens por trás de cada relação.",
    challengeTraits: { resistencia: 2, sorte: 3, atencao: 5 },
    personalityTraits: { carisma: 3, estrategia: 5, impulsividade: 1, lealdade: 3, competitividade: 4, percepcaoSocial: 5, conscienciaDasCameras: 4 },
    personalTriggers: ["ser subestimada", "contradições evidentes", "perder o controle de uma conversa"],
    behavioralTendencies: ["observa antes de se posicionar", "faz perguntas para expor incoerências", "mantém opções abertas"],
    contradictions: ["valoriza a verdade, mas omite informação quando convém", "quer parecer imparcial, embora seja muito competitiva"],
    strengths: ["memória", "planejamento", "percepção social"], weaknesses: ["frieza aparente", "excesso de controle", "dificuldade de criar intimidade"],
    possibleArcs: ["mentora que controla a casa", "queda causada por excesso de confiança", "vínculo afetivo que desmonta sua estratégia"],
    tags: ["analítica", "reservada", "incisiva"], portrait: { x: "100%", y: "0%" },
    triggerKeys: ["caught_contradiction"], behaviorKeys: ["probes_inconsistency", "observes_before_acting"],
    drives: { visibility: 3, belonging: 2, control: 5, fairness: 4, status: 4 },
  },
  {
    id: "iago", name: "Iago Nunes", age: 24, city: "Guarulhos, SP", occupation: "Entregador por aplicativo",
    bio: "Improvisa, brinca e costuma cair de pé. É ótimo em criar alianças rápidas e péssimo em esconder quando está mentindo.",
    quote: "Se deu ruim, pelo menos virou história.", publicPersona: "O sobrevivente divertido que transforma todo desastre em história.",
    challengeTraits: { resistencia: 3, sorte: 5, atencao: 2 },
    personalityTraits: { carisma: 4, estrategia: 2, impulsividade: 5, lealdade: 2, competitividade: 3, percepcaoSocial: 3, conscienciaDasCameras: 4 },
    personalTriggers: ["ser encurralado", "silêncio constrangedor", "autoridade rígida"],
    behavioralTendencies: ["improvisa saídas", "faz promessas no calor do momento", "usa humor para desviar de cobranças"],
    contradictions: ["quer ser querido por todos, mas não sustenta todos os acordos", "parece despreocupado, porém monitora a própria imagem"],
    strengths: ["improviso", "facilidade de conexão", "resiliência"], weaknesses: ["indisciplina", "mentiras transparentes", "decisões de curto prazo"],
    possibleArcs: ["alívio cômico que vira peça-chave", "queda provocada por alianças incompatíveis", "amadurecimento após perder um aliado"],
    tags: ["sortudo", "engraçado", "impulsivo"], portrait: { x: "0%", y: "100%" },
    triggerKeys: ["cornered"], behaviorKeys: ["overpromises", "jokes_under_pressure"],
    drives: { visibility: 4, belonging: 5, control: 1, fairness: 2, status: 3 },
  },
  {
    id: "jussara", name: "Jussara Lima", age: 35, city: "Recife, PE", occupation: "Manicure e comediante",
    bio: "Transforma qualquer silêncio em cena e todo desafeto em piada. Tem uma leitura afiada da casa e do público.",
    quote: "Meu voto é secreto, minha cara não.", publicPersona: "A comentarista popular da casa, capaz de dizer o que o público está pensando.",
    challengeTraits: { resistencia: 2, sorte: 5, atencao: 3 },
    personalityTraits: { carisma: 5, estrategia: 4, impulsividade: 3, lealdade: 3, competitividade: 3, percepcaoSocial: 5, conscienciaDasCameras: 5 },
    personalTriggers: ["ser ridicularizada sem controlar a piada", "arrogância", "ser excluída de uma conversa"],
    behavioralTendencies: ["lê o clima antes de fazer humor", "espalha verdades em forma de piada", "aproxima grupos rivais"],
    contradictions: ["usa humor como afeto e como arma", "parece aberta, mas protege cuidadosamente suas vulnerabilidades"],
    strengths: ["carisma", "timing cômico", "leitura das relações"], weaknesses: ["fofoca", "dificuldade de falar seriamente", "medo de virar alvo do riso"],
    possibleArcs: ["narradora querida da temporada", "piada que desencadeia um grande conflito", "revelação emocional por trás da comediante"],
    tags: ["hilária", "social", "imprevisível"], portrait: { x: "50%", y: "100%" },
    triggerKeys: ["excluded", "arrogance"], behaviorKeys: ["weaponizes_humor", "bridges_groups"],
    drives: { visibility: 5, belonging: 4, control: 3, fairness: 3, status: 4 },
  },
  {
    id: "ravi", name: "Ravi Barros", age: 29, city: "Florianópolis, SC", occupation: "Instrutor de surfe",
    bio: "Equilibrado e atento ao ambiente, mas demora para confiar. Quando decide competir, não mede esforço.",
    quote: "O segredo é saber qual onda deixar passar.", publicPersona: "O competidor equilibrado e misterioso que fala pouco, mas percebe muito.",
    challengeTraits: { resistencia: 4, sorte: 2, atencao: 4 },
    personalityTraits: { carisma: 3, estrategia: 4, impulsividade: 1, lealdade: 4, competitividade: 4, percepcaoSocial: 4, conscienciaDasCameras: 2 },
    personalTriggers: ["pressão para se abrir", "traição de confiança", "caos desnecessário"],
    behavioralTendencies: ["espera antes de tomar partido", "observa padrões silenciosamente", "compete com intensidade sem provocar"],
    contradictions: ["busca paz, mas se realiza na disputa", "quer conexões profundas, embora mantenha todos à distância"],
    strengths: ["autocontrole", "foco", "capacidade de observação"], weaknesses: ["isolamento", "lentidão para reagir politicamente", "dificuldade de demonstrar afeto"],
    possibleArcs: ["competidor silencioso que cresce no fim", "romance ou amizade que rompe sua reserva", "eliminação por demorar a escolher um lado"],
    tags: ["focado", "atlético", "cauteloso"], portrait: { x: "100%", y: "100%" },
    triggerKeys: ["trust_betrayed"], behaviorKeys: ["observes_before_acting", "competes_intensely"],
    drives: { visibility: 2, belonging: 3, control: 4, fairness: 4, status: 3 },
  },
] as const;

export const castById = Object.fromEntries(cast.map((profile) => [profile.id, profile])) as Record<string, CharacterProfile>;

export function validateCast(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const profile of cast) {
    if (ids.has(profile.id)) errors.push(`duplicate participant id: ${profile.id}`);
    ids.add(profile.id);
    if (profile.triggerKeys.length === 0) errors.push(`${profile.id} has no trigger keys`);
    if (profile.behaviorKeys.length === 0) errors.push(`${profile.id} has no behavior keys`);
    if (profile.possibleArcs.length === 0) errors.push(`${profile.id} has no arc seed`);
  }
  return errors;
}
