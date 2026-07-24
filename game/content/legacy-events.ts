import type { EventCategory } from "../types";

export type RecordedEvent = {
  id: string;
  title: string;
  category: EventCategory;
  duration: number;
  heat: number;
  description: string;
};

export const recordedEvents: RecordedEvent[] = [
  ["chegadas", "As primeiras chegadas", "Convivência", 6, 63, "Dandara assume a cozinha enquanto Iago tenta escolher a melhor cama."],
  ["mala-trocada", "A mala trocada", "Humor", 4, 71, "Bento abre a mala de Jussara e desfila com um robe de paetês."],
  ["pacto-varanda", "Pacto na varanda", "Convivência", 5, 58, "Celina, Ravi e Dandara combinam proteção para a primeira semana."],
  ["cafe-sem-acucar", "A guerra do café", "Conflito", 7, 82, "Uma discussão sobre açúcar divide a casa antes mesmo do almoço."],
  ["prova-lider", "A primeira Prova do Líder", "Prova", 8, 88, "Os melhores momentos da disputa e a coroação do primeiro líder."],
  ["confessionario", "Confessionário pós-prova", "Convivência", 4, 66, "Vitória e frustração aparecem sem filtro no confessionário."],
  ["festa-neon", "Festa Sinal de Verão", "Festa", 7, 90, "Dança, figurinos fluorescentes e uma aproximação inesperada."],
  ["microfone-aberto", "Microfone aberto", "Conflito", 6, 94, "Um comentário que parecia privado chega à pessoa errada."],
  ["danca-jussara", "O passinho de Jussara", "Humor", 3, 79, "A casa inteira aprende uma coreografia inventada na hora."],
  ["indicacao-lider", "Indicação do líder", "Votação", 5, 85, "O líder justifica sua escolha diante de toda a casa."],
  ["voto-casa", "Votação da casa", "Votação", 7, 92, "Votos abertos, justificativas tensas e o segundo nome da berlinda."],
  ["despedida", "A despedida da semana", "Memória", 6, 87, "A trajetória do eliminado e as reações ao resultado."],
  ["melhores-semana", "Melhores momentos", "Memória", 7, 75, "Uma montagem dos afetos, gafes e conflitos que definiram a semana."],
  ["discursos-final", "Discursos dos finalistas", "Memória", 8, 96, "Cada finalista explica ao Brasil por que merece vencer."],
].map(([id, title, category, duration, heat, description]) => ({
  id: id as string,
  title: title as string,
  category: category as EventCategory,
  duration: duration as number,
  heat: heat as number,
  description: description as string,
}));

export const eventParticipantIds: Record<string, string[]> = {
  chegadas: ["dandara", "iago", "celina"], "mala-trocada": ["bento", "jussara"],
  "pacto-varanda": ["celina", "ravi", "dandara"], "cafe-sem-acucar": ["bento", "jussara"],
  "prova-lider": [], confessionario: [], "festa-neon": ["dandara", "iago", "jussara", "ravi"],
  "microfone-aberto": ["celina", "jussara", "dandara"], "danca-jussara": ["jussara", "iago"],
  "indicacao-lider": [], "voto-casa": [], despedida: [], "melhores-semana": [], "discursos-final": [],
};
