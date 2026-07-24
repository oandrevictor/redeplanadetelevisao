# Rede Plana game domain

This directory owns the deterministic simulation. React owns presentation state only.

## Architectural rules

1. The event log is the objective, append-only history of the house.
2. Broadcast cuts reference frozen event instances and affect only public perception.
3. Only semantic commands enter the pure reducer.
4. Randomness comes exclusively from the serialized seeded RNG.
5. Rendering, selectors, effects, and timers never consume randomness.
6. Official competition changes use dedicated commands.
7. Live event actors must be active; historical footage remains valid after elimination.
8. Template functions/data are catalog content. Resolved facts, actors, effects, and copy are frozen in event instances.
9. Character profiles are immutable; changing conditions and relationships live in `GameState`.
10. Invalid commands return a diagnostic and leave canonical mechanics intact.

The rollout mode is pinned per season: `legacy`, `shadow`, or `dynamic`. The initial UI integration uses shadow mode and does not alter the current playable presentation.

## Full-season manual checklist

- Start a season and reveal the complete arrival feed.
- Select each challenge type in separate runs and complete the premiere edit.
- Open the party feed and complete nomination and elimination broadcasts.
- Confirm the eliminated contestant disappears from current cast UI but remains in historical editing material.
- Advance weeks until three contestants remain.
- Complete the final, select a winner, and start a new season.
- Repeat once in light mode and once in dark mode with reduced-motion enabled.
- Confirm browser refresh does not surface errors or partially reset presentation state.
