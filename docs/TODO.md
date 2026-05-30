# TODO / Backlog

Deferred work, captured so it isn't lost. Not in priority order within a section.

## Frontend

- [ ] **Mobile responsiveness pass.** The app-shell redesign added a mobile
      top bar + slide-over drawer + tab scroll strip, but the redesigned pages
      have not had a dedicated mobile audit. Go through every route on a phone
      viewport: KPI grids should reflow without text overflow, DataTables should
      degrade to cards or horizontal scroll, the Invest stepper + quote panel
      and the `/fund/[id]` tabbed memo should be comfortable on narrow screens,
      touch targets ≥44px, and modals/drawers should respect safe-area insets.
      (Noted 2026-05-30 — do later, not now.)
- [ ] Promote the pure proposal-lifecycle helpers in
      `frontend/src/components/governance/governanceStatus.ts` (`displayStatus`,
      `votingWindowFor`, `quorumFor`, `proposalLabel`) into a shared module
      (e.g. `frontend/src/lib/proposalLifecycle.ts`). They are now cross-imported
      by the overview, projects, and `/fund/[id]` features — a shared home is
      tidier than importing from another feature folder.

## Local dev / bootstrap

- [ ] Faster bootstrap, final lever: the ~85s on-chain phase is dominated by
      ~26 separate `aztec-wallet` CLI invocations (each spawns a fresh node +
      PXE, ~2.5s client overhead beyond the 1s inclusion). Batch deploys + wiring
      into one long-lived TS process (concurrent independent sends packing into
      a few blocks) to push total bootstrap under a minute.
- [ ] Demo headroom: the FSFT seed funds a proposal equal to total deposits, so
      `Available capital` is €0 after seeding. Optionally fund a proposal smaller
      than total deposits so the Overview shows a non-zero "Ready to deploy"
      state and demonstrates the available → committed flow.
