# Fair Squares Frontend Redesign Design Doc

## Purpose

This document summarizes the frontend redesign direction for the Fair Squares Noir prototype. It is meant for development planning and for handing off to an implementation agent.

Fair Squares is an **affordable housing protocol**. The app should not look or feel like a generic crypto dashboard, DeFi yield farm, tokenized Treasury app, or luxury real estate crowdfunding site. It should feel like a serious civic-finance investor portal and housing project deal room, with Aztec/privacy proofs supporting trust in the background.

Core principle:

> Affordable housing finance first, protocol mechanics second, token mechanics third.

## Product Positioning

The frontend should communicate that Fair Squares is:

- An affordable housing protocol.
- A capped-return capital layer for real housing projects.
- A civic-finance investor portal.
- A housing project deal room.
- A compliance-aware fund console.
- A transparent protocol layer for private investor actions.

The frontend should avoid feeling like:

- A DeFi yield app.
- A crypto DEX.
- A generic RWA marketplace.
- A DAO toy.
- A speculative token dashboard.
- A marketing landing page inside the app.

## Questions The UI Must Answer

Every major screen should help users answer at least one of these:

- What affordable housing project is being funded?
- What financing gap is Fair Squares closing?
- What affordability covenant is protected?
- What capital is available, deployed, reserved, or impaired?
- What return is capped, and why?
- What do I own as an investor?
- What can I do next?
- What has been privately verified?
- What data is public protocol data versus private investor data?

If a screen does not answer one of these questions, simplify it, move it to Reference, or remove it.

## Lessons From Reference Apps

### Centrifuge

Borrow product-table clarity, not identity.

Useful patterns:

- Product versus portfolio views.
- Big system-level TVL/date stamp.
- Tables with APY/return, TVL/capital, asset type, investor type, minimum investment.
- Expandable rows for detail.

Fair Squares adaptation:

- Use a project/fund table for housing opportunities.
- Columns should include project, location, status, funding gap, Fair Squares tranche, capped return, affordability years, homes enabled, covenant status, investor eligibility, and action.

### Goldfinch

Borrow lifecycle honesty.

Useful patterns:

- Top KPIs.
- Open deal card.
- Closed deal rows with honest statuses: repaid, default, restructuring.

Fair Squares adaptation:

- Show under review, open for funding, funded, in construction, income-producing, delayed, covenant issue, impaired, repaid, exited.
- Trust comes from operational truth, not from only showing positive metrics.

### Superstate

Borrow investor-portal structure.

Useful patterns:

- Portfolio.
- Documents.
- Settings.
- Holdings.
- Transactions.
- Purchase/redeem flows.
- Wallet allowlists.
- Payout/redemption destinations.
- Compliance/account controls.

Fair Squares adaptation:

- Portfolio should be the investor source of truth.
- Include holdings, FSFT, EUR, capped return accrued, rewards, transaction history, statements, KYC, wallet allowlist, and proof attestations.

### Ondo

Borrow portfolio-first entry.

Useful pattern:

- The first user job is understanding holdings, not trading.

Fair Squares adaptation:

- After connecting, the most important screen should answer: what do I own, what is it worth, what is verified, and what can I do next?
- Trade should be secondary.

### RWA.xyz

Borrow dense data only for reference/transparency views.

Useful patterns:

- Market overview.
- Asset tables.
- Issuer/chain breakdowns.
- Event and transaction lists.

Fair Squares adaptation:

- Put dense protocol/debug data in Reference.
- Do not make the main app feel like an explorer.

## Current Frontend Assessment

Current app structure:

- `src/app/page.tsx`
- `src/app/fund/page.tsx`
- `src/app/invest/page.tsx`
- `src/app/portfolio/page.tsx`
- `src/app/governance/page.tsx`
- `src/app/governance/[id]/page.tsx`
- `src/app/dex/page.tsx`
- `src/app/rewards/page.tsx`
- `src/app/kyc/page.tsx`
- `src/app/reference/page.tsx`
- `src/app/explain/page.tsx`

Current shared UI:

- `src/components/SimplePage.tsx`
- `src/components/Sidebar.tsx`
- `src/components/HeaderWalletButton.tsx`
- `src/components/ProposalCard.tsx`
- `src/components/InvestForm.tsx`
- `src/components/KYCFlow.tsx`
- `src/components/SimulationModeBadge.tsx`

The current frontend is clean but too generic. Many pages follow the same structure:

1. Hero.
2. Metric row.
3. Action panel.

This is consistent, but it makes Fund, Invest, Portfolio, Governance, Rewards, KYC, and Trade feel too similar. The redesign should keep discipline, but each route should have a domain-specific layout.

Likely unused or replaceable components, to confirm with `rg` before deleting:

- `src/components/FundStats.tsx`
- `src/components/PrivateBalance.tsx`
- `src/components/SimulationBanner.tsx`
- `src/components/WalletConnect.tsx`
- `src/components/InfoTooltip.tsx`, if only used by deleted components.

## Target Information Architecture

### 1. Overview

Purpose: system command center.

Show:

- Fund NAV.
- Available capital.
- Deployed capital.
- Homes enabled.
- Active projects.
- Covenant health.
- Proof/data health.
- Recent protocol events.
- Primary next action.

This replaces the current prototype-index feeling of the home page.

### 2. Projects

Purpose: housing project deal room.

Show a table/card hybrid with:

- Project name.
- Location.
- Status.
- Funding gap.
- Fair Squares tranche.
- Capped return.
- Affordability years.
- Homes enabled.
- Covenant status.
- Investor eligibility.
- Minimum ticket.
- Action.

This can evolve from the current Fund route or become its own Projects route.

### 3. Project Detail

Purpose: investment memo for one housing project.

Tabs:

- Overview.
- Capital Stack.
- Affordability Covenant.
- Reports.
- Governance.
- Proofs.

Show:

- Project summary.
- Sources and uses.
- Gap being closed.
- Senior lenders or partners.
- Fair Squares capital position.
- Expected capped return.
- Rent discount or affordability formula.
- Covenant status.
- Reporting status.
- Risk flags.
- Related governance proposals.
- Proof/event log.

### 4. Portfolio

Purpose: investor source of truth.

Show:

- Total investor value.
- FSFT balance.
- EUR balance.
- Deposited capital.
- Capped return accrued.
- Claimable rewards.
- Transaction history.
- Holdings by project.
- Statements/documents.
- KYC and investor role status.
- Wallet allowlist status.
- Proof attestations.
- Available actions.

Portfolio should be more central than Trade.

### 5. Invest

Purpose: guided deposit workflow.

Use a stepper:

1. Connect.
2. KYC / investor role.
3. Fund wallet.
4. Amount.
5. Review quote.
6. Submit.
7. Confirmation.

Show a quote panel:

- Deposit amount.
- FSFT issued.
- NAV/share.
- Capped return terms.
- Fees if any.
- Liquidity/secondary market note.
- Proof/compliance status.

Mark faucet/test tooling clearly as simulation-only.

### 6. Governance

Purpose: investment committee board.

Proposal cards should feel like memos, not DAO cards.

Show:

- Proposal purpose.
- Project affected.
- Requested amount.
- Homes enabled.
- Covenant impact.
- Risk flags.
- Documents attached.
- Voting window.
- Quorum/threshold.
- Execution status.
- User eligibility to vote.

### 7. Trade

Purpose: guarded secondary liquidity.

Do not make this route feel like the center of the product.

Show:

- NAV reference price.
- Allowed price band.
- Liquidity warning.
- Buy/sell ticket.
- User orders.
- Recent matches.
- Transfer eligibility state.
- KYC/proof requirements.

Trade should be calm, constrained, and tied to fund NAV.

### 8. KYC / Settings

Purpose: investor readiness.

Show:

- zkPassport verification.
- Investor role.
- Wallet allowlist.
- Private holder proof.
- Voting eligibility.
- Reward eligibility.
- Payout/redemption preferences.
- Admin/security placeholders if useful.

### 9. Reference

Purpose: dense protocol transparency/debugging.

Show:

- Chain parameters.
- Contract addresses.
- Verifier keys.
- Simulation/live mode.
- Data freshness.
- Event history.
- Token/protocol formulas.

Dense explorer-style data belongs here, not on Overview.

## Trust And Proof Rail

Add a persistent Trust/Proof Rail. This should make privacy visible as assurance, not mystery.

Desktop placement:

- Right rail, top bar extension, or compact persistent panel.

Mobile placement:

- Collapsible strip below the header.

Suggested statuses:

- Wallet connected.
- zkPassport verified.
- Investor role active.
- Wallet allowlisted.
- Private holder proof attested.
- Voting eligibility ready.
- Reward eligibility ready.
- Verifier keys configured.
- Data fresh as of timestamp.

Use plain labels and short chips. Avoid cryptographic explanations in the main flow.

## Design System Direction

Use the existing stack:

- Next.js 15 App Router.
- React 19.
- Tailwind CSS v4.
- `globals.css` with `@theme`.
- Current Fair Squares brand colors.
- Plus Jakarta Sans.

Do not add shadcn, lucide, or other dependencies unless the implementation agent documents a clear reason.

### CSS Tokens

Keep brand colors but standardize semantic usage in `globals.css`:

- `--color-primary`: anthracite.
- `--color-accent`: teal.
- `--color-alert`: magenta.
- `--color-success`: verified/healthy/covenant OK.
- `--color-warning`: pending/delayed.
- `--color-danger`: breach/impaired/error.
- `--color-bg`: app background.
- `--color-surface`: card/surface background.
- `--color-surface-muted`: muted panel background.
- `--color-border`: default border.
- `--color-border-strong`: emphasized border.
- `--color-text-1`: primary text.
- `--color-text-2`: secondary text.
- `--color-text-3`: muted text.

### Typography

Keep the type scale tight and app-like.

Create reusable classes:

- `.text-kpi`
- `.text-heading`
- `.text-label`
- `.text-body`
- `.text-caption`
- `.text-mono`

Avoid repeating one-off combinations like `text-xs uppercase tracking-wide`. Make labels reusable.

### Radius

Standardize:

- Surfaces/cards: `0.5rem`.
- Buttons/inputs/chips: `0.375rem` or `0.5rem`.
- Pills: `999px`, only for status chips.

Avoid random `rounded-xl` and `rounded-2xl`.

### Spacing

Standardize:

- Page vertical rhythm: `space-y-6`.
- Section padding: `p-5` or `p-6`.
- Table row padding: one consistent scale.
- Card gap: one consistent scale per layout.

### Buttons

Create standard button variants:

- Primary.
- Secondary.
- Ghost.
- Danger.
- Disabled.
- Loading.

All buttons should share height, focus state, disabled state, and typography.

### Status Chips

Create standard chip variants:

- Active.
- Pending.
- Ready.
- Blocked.
- Delayed.
- Impaired.
- Completed.
- Breached.
- Simulation.
- Verified.

Use these across Projects, Governance, KYC, Trade, and Reference.

## Component Plan

Create a small reusable UI layer, likely in `src/components/ui/`:

- `PageHeader`
- `Section`
- `KpiGrid`
- `KpiCard`
- `DataTable`
- `StatusChip`
- `RiskChip`
- `ProofChip`
- `ProofRail`
- `Tabs`
- `Stepper`
- `FormField`
- `Alert`
- `EmptyState`
- `LoadingSkeleton`
- `ActionBar`
- `Timeline`
- `DocumentList`

Create domain components, likely in `src/components/domain/` or grouped by feature:

- `ProjectTable`
- `ProjectCard`
- `ProjectDetailTabs`
- `CapitalStackCard`
- `AffordabilityCovenantPanel`
- `InvestorHoldingsTable`
- `TransactionHistory`
- `GovernanceMemoCard`
- `TradeTicket`
- `EligibilityChecklist`
- `InvestorReadinessPanel`

After migration, remove or refactor `SimplePage.tsx`. Do not keep old generic primitives and new UI primitives doing the same job.

## Route-Level Development Plan

### Phase 1: Design System Foundation

- Audit component usage with `rg`.
- Add semantic CSS tokens in `globals.css`.
- Create reusable UI primitives.
- Standardize buttons, status chips, surfaces, labels, alerts, skeletons, and forms.
- Confirm unused components before deleting.

Validation:

- App builds.
- Existing routes still render.
- No duplicated primitive systems.

### Phase 2: Shell And Navigation

- Update sidebar labels to match target IA.
- Replace prototype-first framing with protocol/investor-portal framing.
- Add Trust/Proof Rail.
- Make simulation/live mode visible but not dominant.
- Keep mobile route strip, but make it match the new IA.

Validation:

- Desktop and mobile navigation are clear.
- User can distinguish public fund data from private investor data.

### Phase 3: Overview And Projects

- Redesign home as Overview command center.
- Redesign Fund/Projects around project table and lifecycle statuses.
- Add project exposure and covenant health.
- Centralize demo project data if required.

Validation:

- User can identify what Fair Squares funds and the status of each project.

### Phase 4: Portfolio And Invest

- Redesign Portfolio as the investor portal.
- Redesign Invest as a guided flow with quote review.
- Mark faucet/test tooling clearly as simulation-only.

Validation:

- User can answer: what do I own, what is it worth, what can I do next?

### Phase 5: Governance, Trade, KYC, Reference

- Redesign Governance as investment memo workflow.
- Redesign Trade as restrained secondary liquidity.
- Redesign KYC as investor readiness/settings.
- Move dense protocol/debug information to Reference.

Validation:

- Governance no longer feels like generic DAO voting.
- Trade no longer feels like the center of the product.
- Reference contains dense technical data.

### Phase 6: Cleanup And Verification

- Delete confirmed unused components.
- Remove one-off Tailwind patterns replaced by primitives.
- Run typecheck/build.
- Test desktop and mobile with screenshots.
- Check text fit, empty states, loading states, and error states.

Suggested commands:

```bash
rg --files frontend/src
rg "ComponentName|className|export function" frontend/src
npm run typecheck
npm run build
```

## Data Guidance

Use existing data APIs first:

- `fetchFundStats`
- `fetchProperties`
- `fetchPortfolio`
- `fetchKYCProfile`
- `fetchGovernanceEligibility`
- `fetchProposals`
- `fetchDexOrderbook`
- `fetchRewardsOverview`
- `fetchRewardsStats`

If extra mock data is needed, centralize it in:

- `src/lib/demoData.ts`, or
- a new `src/lib/designDemoData.ts`.

Do not scatter mock project data across pages.

## Copy Guidelines

Use plain finance/housing language:

- Funding gap.
- Affordable homes enabled.
- Affordability covenant.
- Capped return.
- Capital stack.
- Reporting status.
- Investor eligibility.
- Private proof.
- Data freshness.

Avoid crypto-first language unless needed for a specific action:

- Do not lead with FSFT mechanics.
- Do not lead with Aztec/Noir.
- Do not overuse "protocol" where "fund" or "project" is clearer.
- Do not make rewards sound like speculative yield.

Recommended hierarchy:

1. Housing project outcome.
2. Financing structure.
3. Investor position.
4. Protocol proof/status.
5. Token mechanics.

## Accessibility And Responsiveness

Requirements:

- Clear focus states for all interactive controls.
- Minimum touch targets on mobile.
- Tables degrade to cards or horizontal scroll on mobile.
- Status does not rely on color alone.
- Long addresses truncate safely.
- KPI text does not overflow.
- Buttons do not resize unpredictably in loading states.
- Empty states explain the next action.

## What To Delete Or Avoid

Delete after confirming with `rg`:

- Unused components.
- Old primitives replaced by the new design system.
- Dead prototype-only UI that is no longer routed.

Avoid:

- Decorative crypto gradients.
- Giant marketing hero sections inside the app.
- UI cards nested inside other cards.
- One-off Tailwind class combinations everywhere.
- Repeated hero/metric/action panel pages.
- Trade-first product framing.
- Hidden or vague lifecycle statuses.
- Token-first copy.

## Success Criteria

The redesign is successful if a user can answer these questions in under 30 seconds:

- What is Fair Squares funding?
- How much capital is available and deployed?
- Which housing project needs capital and why?
- What affordability commitment is protected?
- What do I own?
- What can I do next?
- What has been privately verified?
- What is public protocol data versus private investor data?

The app should feel calm, trustworthy, dense enough for serious work, and specific to affordable housing finance.
