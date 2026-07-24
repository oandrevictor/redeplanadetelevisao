"use client";

import { useCallback } from "react";
import { deserializeSeason, serializeSeason } from "@/game/persistence/serialization";
import type { GameState } from "@/game/types";

const SAVE_KEY = "rede-plana-current-season";

export function useSeasonSave() {
  const load = useCallback((): GameState | null => {
    const value = window.localStorage.getItem(SAVE_KEY);
    if (!value) return null;
    return deserializeSeason(value)?.snapshot ?? null;
  }, []);

  const save = useCallback((state: GameState) => {
    window.localStorage.setItem(SAVE_KEY, serializeSeason(state));
  }, []);

  const clear = useCallback(() => {
    window.localStorage.removeItem(SAVE_KEY);
  }, []);

  return { load, save, clear };
}
