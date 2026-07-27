export type LegacyFeedEntry = {
  id: string;
  time: string;
  camera: string;
  title: string;
  body: string;
  category: string;
  participantIds: string[];
};

export const introFeed: LegacyFeedEntry[] = [
  { id: "intro-dandara", time: "08:14", camera: "CAM 01 · SALA", title: "Dandara foi a primeira a entrar", body: "Ela já escolheu o sofá e está narrando a própria chegada.", category: "Convivência", participantIds: ["dandara"] },
  { id: "intro-camas", time: "08:26", camera: "CAM 04 · QUARTO", title: "Disputa silenciosa por camas", body: "Iago largou um tênis em cada cama. Celina anotou mentalmente.", category: "Convivência", participantIds: ["iago", "celina"] },
  { id: "intro-cafe", time: "09:02", camera: "CAM 07 · COZINHA", title: "Primeiro café, primeira faísca", body: "Bento usou o último filtro. Jussara chamou de crime federal.", category: "Humor", participantIds: ["bento", "jussara"] },
  { id: "intro-alianca", time: "09:41", camera: "CAM 03 · VARANDA", title: "Uma aliança começa a tomar forma", body: "Três participantes combinaram trocar informações antes da prova.", category: "Estratégia", participantIds: [] },
];

export const partyFeed: LegacyFeedEntry[] = [
  { id: "party-abertura", time: "23:18", camera: "CAM 02 · PISTA", title: "Começou a Festa Sinal de Verão", body: "Luzes fluorescentes, pista molhada e figurinos que desafiam o sinal da TV.", category: "Festa", participantIds: [] },
  { id: "party-aproximacao", time: "00:07", camera: "CAM 06 · BAR", title: "Uma aproximação inesperada", body: "Duas pessoas que quase não conversavam passaram vinte minutos juntas no bar.", category: "Relacionamento", participantIds: [] },
  { id: "party-microfone", time: "01:12", camera: "CAM 03 · VARANDA", title: "Comentário captado pelo microfone", body: "Uma crítica atravessou a festa e pode mudar os votos da casa.", category: "Comentário", participantIds: [] },
  { id: "party-coreografia", time: "02:36", camera: "CAM 05 · QUARTO", title: "Jussara encerra a noite com coreografia", body: "Até quem estava brigado apareceu para aprender o passinho.", category: "Festa", participantIds: ["jussara"] },
];
