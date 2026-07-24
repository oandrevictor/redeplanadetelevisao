import type { SeasonSave } from "./serialization";

export function migrateSeason(save: SeasonSave, currentSchemaVersion: number): SeasonSave | null {
  if (save.schemaVersion === currentSchemaVersion) return save;
  // Future migrations are intentionally explicit. Unknown versions fail without
  // rewriting or deleting the original local-storage value.
  return null;
}
