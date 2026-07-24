"use client";

import { useCallback, useEffect, useReducer } from "react";
import type { Dispatch } from "react";
import type { GameCommand } from "@/game/commands";
import { gameReducer } from "@/game/reducer";
import { createInitialState } from "@/game/state";
import type { EventEngineMode, GameState } from "@/game/types";
import { useSeasonSave } from "./use-season-save";

type EngineAction = GameCommand | { type: "__RESTORE_SNAPSHOT"; state: GameState };

function engineReducer(state: GameState, action: EngineAction): GameState {
  if (action.type === "__RESTORE_SNAPSHOT") return action.state;
  return gameReducer(state, action);
}

export function useGameEngine(seed: string, mode: EventEngineMode = "shadow") {
  const [state, engineDispatch] = useReducer(engineReducer, { seed, mode }, ({ seed: initialSeed, mode: initialMode }) =>
    createInitialState(initialSeed, initialMode));
  const { load, save, clear } = useSeasonSave();
  const ready = state.revision > 0;

  useEffect(() => {
    const restored = load();
    if (restored) {
      engineDispatch({ type: "__RESTORE_SNAPSHOT", state: restored });
    } else {
      const generatedSeed = globalThis.crypto?.randomUUID?.() ?? seed;
      engineDispatch({ type: "START_SEASON", seed: generatedSeed });
    }
  }, [load, seed]);

  useEffect(() => {
    if (ready) save(state);
  }, [ready, save, state]);

  const dispatch = useCallback<Dispatch<GameCommand>>((command) => {
    engineDispatch(command);
  }, []);

  const resetSeason = useCallback(() => {
    clear();
  }, [clear]);

  return [state, dispatch, { ready, resetSeason }] as const;
}
