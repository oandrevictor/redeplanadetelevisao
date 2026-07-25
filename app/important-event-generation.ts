import type {
  ImportantEventBeat,
  ImportantEventChain,
  Participant,
  ParticipantRelationship,
  RecordedEvent,
  WeekEventGeneration,
} from "./event-models.ts";

export const importantEventGenerationConfig = {
  maxImportantEventChainsPerWeek: 1,
} as const;

export const WEEK_ONE_SEED = "rede-plana:season-1:week-1";

type GenerateWeekEventsInput = {
  weekNumber: number;
  seed: string;
  participants: readonly Participant[];
  secondaryEvents: readonly RecordedEvent[];
  relationships?: readonly ParticipantRelationship[];
  maxImportantEventChainsPerWeek?: number;
};

type RumorParticipants = {
  participantA: Participant;
  participantB: Participant;
  participantC: Participant;
};

const rumorLocations = ["Despensa", "Cozinha", "Varanda", "Quarto", "Área externa"] as const;

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicTieBreak(seed: string, role: string, participantId: string) {
  return stableHash(`${seed}:${role}:${participantId}`) / 0xffffffff;
}

function relationshipCompatibility(
  participantId: string,
  selectedParticipantIds: readonly string[],
  relationships: readonly ParticipantRelationship[],
) {
  return selectedParticipantIds.reduce((total, selectedId) => {
    const relationship = relationships.find(({ participantIds }) =>
      participantIds.includes(participantId) && participantIds.includes(selectedId));
    return total + (relationship?.compatibility ?? 0);
  }, 0);
}

function highestRanked(
  candidates: readonly Participant[],
  seed: string,
  role: string,
  score: (participant: Participant) => number,
) {
  return [...candidates].sort((left, right) => {
    const scoreDifference = score(right) - score(left);
    if (scoreDifference !== 0) return scoreDifference;
    return deterministicTieBreak(seed, role, right.id) - deterministicTieBreak(seed, role, left.id);
  })[0];
}

export function selectRumorChainParticipants(
  participants: readonly Participant[],
  seed: string,
  relationships: readonly ParticipantRelationship[] = [],
): RumorParticipants {
  if (participants.length < 3) {
    throw new Error("A Rumor Chain requires at least three participants.");
  }

  const participantC = highestRanked(
    participants,
    seed,
    "rumor-repeater",
    (participant) => participant.personalityTraits.percepcaoSocial + (6 - participant.personalityTraits.lealdade),
  );

  const confrontationCandidates = participants.filter((participant) => participant.id !== participantC.id);
  const participantB = highestRanked(
    confrontationCandidates,
    seed,
    "confrontation",
    (participant) => participant.personalityTraits.impulsividade * 2
      + relationshipCompatibility(participant.id, [participantC.id], relationships),
  );

  const commentCandidates = participants.filter(
    (participant) => participant.id !== participantC.id && participant.id !== participantB.id,
  );
  const participantA = highestRanked(
    commentCandidates,
    seed,
    "private-comment",
    (participant) => relationshipCompatibility(participant.id, [participantB.id, participantC.id], relationships),
  );

  return { participantA, participantB, participantC };
}

function locationFor(seed: string, order: number) {
  return rumorLocations[stableHash(`${seed}:location:${order}`) % rumorLocations.length];
}

function buildRumorChain(
  weekNumber: number,
  seed: string,
  selected: RumorParticipants,
): { chain: ImportantEventChain; beats: ImportantEventBeat[] } {
  const { participantA, participantB, participantC } = selected;
  const chainId = `important-week-${weekNumber}-rumor`;
  const beatId = (order: number) => `${chainId}-beat-${String(order).padStart(2, "0")}`;
  const reactionParticipant = highestRanked(
    [participantA, participantB, participantC],
    seed,
    "reaction",
    (participant) => participant.personalityTraits.carisma + participant.personalityTraits.conscienciaDasCameras,
  );
  const reactionDescription = reactionParticipant.id === participantA.id
    ? `${participantA.name} se afasta do grupo para esfriar a cabeça depois da discussão.`
    : reactionParticipant.id === participantB.id
      ? `${participantB.name} encerra a conversa e procura aliados depois da discussão.`
      : `${participantC.name} admite que repetiu o comentário e tenta explicar sua participação.`;

  const beatInput: Array<Omit<ImportantEventBeat, "id" | "chainId" | "order">> = [
    {
      role: "Cause",
      title: "Um comentário em particular",
      description: `${participantA.name} faz um comentário reservado sobre ${participantB.name}.`,
      participantIds: [participantA.id, participantB.id],
      location: locationFor(seed, 1),
      narrative: {
        participantFocusWeights: { [participantA.id]: 2, [participantB.id]: 1 },
        participantPortrayalEffects: {
          [participantA.id]: ["dishonest"],
          [participantB.id]: ["attacked", "sympathetic"],
        },
        providesContextForBeatIds: [beatId(2), beatId(3), beatId(4), beatId(5)],
        contradictsBeatIds: [beatId(4)],
        isCause: true,
        isReaction: false,
        isExplanation: false,
        isConsequence: false,
      },
    },
    {
      role: "Rumor",
      title: "O comentário circula",
      description: `${participantC.name} repete o comentário feito por ${participantA.name}.`,
      participantIds: [participantC.id, participantA.id],
      location: locationFor(seed, 2),
      narrative: {
        participantFocusWeights: { [participantC.id]: 2, [participantA.id]: 0.75 },
        participantPortrayalEffects: {
          [participantC.id]: ["dishonest"],
          [participantA.id]: ["contradictory"],
        },
        providesContextForBeatIds: [beatId(3), beatId(4)],
        contradictsBeatIds: [],
        isCause: false,
        isReaction: false,
        isExplanation: false,
        isConsequence: false,
      },
    },
    {
      role: "Discovery",
      title: "A descoberta",
      description: `${participantB.name} descobre o que foi dito.`,
      participantIds: [participantB.id, participantC.id],
      location: locationFor(seed, 3),
      narrative: {
        participantFocusWeights: { [participantB.id]: 2, [participantC.id]: 0.5 },
        participantPortrayalEffects: {
          [participantB.id]: ["attacked", "sympathetic"],
          [participantC.id]: ["defensive"],
        },
        providesContextForBeatIds: [beatId(4)],
        contradictsBeatIds: [],
        isCause: false,
        isReaction: true,
        isExplanation: false,
        isConsequence: false,
      },
    },
    {
      role: "Confrontation",
      title: "O confronto",
      description: `${participantB.name} confronta ${participantA.name} sobre o comentário.`,
      participantIds: [participantB.id, participantA.id],
      location: locationFor(seed, 4),
      narrative: {
        participantFocusWeights: { [participantB.id]: 2, [participantA.id]: 1.5 },
        participantPortrayalEffects: {
          [participantB.id]: ["aggressive", "defensive"],
          [participantA.id]: ["attacked", "defensive"],
        },
        providesContextForBeatIds: [beatId(5)],
        contradictsBeatIds: [beatId(1)],
        isCause: false,
        isReaction: true,
        isExplanation: false,
        isConsequence: false,
      },
    },
    {
      role: "Reaction",
      title: "Depois do confronto",
      description: reactionDescription,
      participantIds: [reactionParticipant.id],
      location: locationFor(seed, 5),
      narrative: {
        participantFocusWeights: { [reactionParticipant.id]: 2.5 },
        participantPortrayalEffects: {
          [reactionParticipant.id]: ["sympathetic", "defensive"],
        },
        providesContextForBeatIds: [],
        contradictsBeatIds: [],
        isCause: false,
        isReaction: true,
        isExplanation: reactionParticipant.id === participantC.id,
        isConsequence: true,
      },
    },
  ];

  const beats = beatInput.map((beat, index): ImportantEventBeat => ({
    ...beat,
    id: beatId(index + 1),
    chainId,
    order: index + 1,
  }));

  const chain: ImportantEventChain = {
    id: chainId,
    weekNumber,
    title: "A fofoca sobre a prova",
    participantIds: [participantA.id, participantB.id, participantC.id],
    beatIds: beats.map((beat) => beat.id),
    status: "scheduled",
  };

  return { chain, beats };
}

export function generateWeekEvents({
  weekNumber,
  seed,
  participants,
  secondaryEvents,
  relationships = [],
  maxImportantEventChainsPerWeek = importantEventGenerationConfig.maxImportantEventChainsPerWeek,
}: GenerateWeekEventsInput): WeekEventGeneration {
  const importantEventChains: ImportantEventChain[] = [];
  const importantEventBeats: ImportantEventBeat[] = [];

  if (weekNumber === 1 && maxImportantEventChainsPerWeek > 0) {
    const selected = selectRumorChainParticipants(participants, seed, relationships);
    const rumorChain = buildRumorChain(weekNumber, seed, selected);
    importantEventChains.push(rumorChain.chain);
    importantEventBeats.push(...rumorChain.beats);
  }

  return {
    secondaryEvents,
    importantEventChains: importantEventChains.slice(0, maxImportantEventChainsPerWeek),
    importantEventBeats,
  };
}
