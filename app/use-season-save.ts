"use client";

import { useCallback } from "react";
import { deserializeSeason, serializeSeason } from "@/game/persistence/serialization";
import type { SeasonSave } from "@/game/persistence/serialization";
import type { GameCommand } from "@/game/commands";
import type { GameState } from "@/game/types";

const SAVE_KEY = "rede-plana-current-season";
const FAILED_SAVE_BACKUP_KEY = "rede-plana-unmigrated-season";

export function useSeasonSave() {
  const load = useCallback((): SeasonSave | null => {
    const value = window.localStorage.getItem(SAVE_KEY);
    if (!value) return null;
    const restored = deserializeSeason(value);
    if (!restored && !window.localStorage.getItem(FAILED_SAVE_BACKUP_KEY)) {
      window.localStorage.setItem(FAILED_SAVE_BACKUP_KEY, value);
    }
    return restored;
  }, []);

  const save = useCallback((state: GameState, actionLog: GameCommand[]) => {
    window.localStorage.setItem(SAVE_KEY, serializeSeason(state, actionLog));
  }, []);

  const clear = useCallback(() => {
    window.localStorage.removeItem(SAVE_KEY);
  }, []);

  return { load, save, clear };
}
