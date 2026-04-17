# Fair Squares Noir: Simulation Bug and UX Issue List

Date: 2026-04-16
Scope: frontend simulation UX + reliability pass

## Critical

1. Trade orderbook hard-fails with generic message
- Symptom: Trade page shows `Failed to fetch DEX orderbook` and appears broken.
- Root cause:
  - GET `/api/dex/orders` can return non-OK when live env is unavailable or mode flags are mismatched.
  - Frontend error handling in `fetchDexOrderbook` masked server detail with a generic error.
- Files:
  - `frontend/src/lib/contracts.ts`
  - `frontend/src/app/api/dex/orders/route.ts`
  - `frontend/src/lib/aztecLive.ts`
  - `frontend/src/app/dex/page.tsx`

## High

2. Fund page looked unfinished during data loading/failure
- Symptom: empty/skeleton visuals with little context, perceived as broken.
- Cause: no intentional demo fallback and no supporting content block.
- File: `frontend/src/app/fund/page.tsx`

3. Rewards page looked sparse and placeholder-heavy
- Symptom: metric strip often sparse; little immediate guidance.
- Cause: strict minimal layout without meaningful fallback content.
- File: `frontend/src/app/rewards/page.tsx`

4. Account page had disconnected dead-end
- Symptom: mostly a connect-wallet placeholder with limited simulation value.
- Cause: no seeded disconnected preview state.
- File: `frontend/src/app/portfolio/page.tsx`

## Medium

5. Error transparency across API client wrappers was weak
- Symptom: user-facing errors lacked actionable reason.
- Cause: multiple `fetch*` wrappers threw generic errors.
- File: `frontend/src/lib/contracts.ts`

6. Simulation mode semantics were confusing for local demo runs
- Symptom: routes could reject with `simulation is Vercel-only` when users expected local simulation.
- Cause: conservative simulation gate behavior.
- File: `frontend/src/lib/aztecLive.ts`

## Fixed in this pass

- Added seeded demo data layer for Fund, Trade, Rewards, and Account preview.
- Added explicit demo-mode banners (no silent fallback).
- Added clearer API error propagation from route responses.
- Added Trade retry affordance and disabled manage actions when disconnected.
- Simplified simulation mode gating: if live mode is off, simulation mode is on.
