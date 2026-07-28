"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Dispatch } from "react";
import type { GameCommand } from "@/game/commands";
import { gameReducer } from "@/game/reducer";
import { createInitialState } from "@/game/state";
import type { AudienceEngineMode, EventEngineMode, GameState } from "@/game/types";
import { useSeasonSave } from "./use-season-save";

type EngineAction = GameCommand | { type: "__RESTORE_SNAPSHOT"; state: GameState };

function engineReducer(state: GameState, action: EngineAction): GameState {
  if (action.type === "__RESTORE_SNAPSHOT") return action.state;
  return gameReducer(state, action);
}

export function useGameEngine(
  seed: string,
  mode: EventEngineMode = "shadow",
  audienceMode: AudienceEngineMode = "clustered",
) {
  const [state, engineDispatch] = useReducer(
    engineReducer,
    { seed, mode, audienceMode },
    ({ seed: initialSeed, mode: initialMode, audienceMode: initialAudienceMode }) =>
      createInitialState(initialSeed, initialMode, initialAudienceMode),
  );
  const { load, save, clear } = useSeasonSave();
  const actionLog = useRef<GameCommand[]>([]);
  const ready = state.revision > 0;

  useEffect(() => {
    const restored = load();
    if (restored) {
      actionLog.current = restored.actionLog;
      engineDispatch({ type: "__RESTORE_SNAPSHOT", state: restored.snapshot });
    } else {
      const generatedSeed = globalThis.crypto?.randomUUID?.() ?? seed;
      const command = { type: "START_SEASON", seed: generatedSeed } as const;
      actionLog.current = [command];
      engineDispatch(command);
    }
  }, [load, seed]);

  useEffect(() => {
    if (ready) save(state, actionLog.current);
  }, [ready, save, state]);

  const dispatch = useCallback<Dispatch<GameCommand>>((command) => {
    actionLog.current.push(structuredClone(command));
    engineDispatch(command);
  }, []);

  const resetSeason = useCallback(() => {
    clear();
  }, [clear]);

  return [state, dispatch, { ready, resetSeason, actionLog }] as const;
}
