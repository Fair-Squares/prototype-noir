# Interface review — 11 October 2026

Reviewed against Vercel's [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), the installed frontend-design guidance, and [GOV.UK button guidance](https://design-system.service.gov.uk/components/button/). Preserve Fair Squares' brand, plain-language copy and existing financial mechanics.

## Verification

Local production builds were reviewed visually and with Playwright. Across both applications, 33 page/state scans passed axe WCAG A/AA checks with no detected page overflow; 11 targeted interaction checks passed. Six website routes and seven prototype routes were scanned at 390px and 1280px, with Home also checked at 320px and 1024px. Additional states covered mobile navigation, connected simulated portfolio and project tabs.

Keyboard checks included focus containment, Escape dismissal/focus return, route-change dismissal, disclosure navigation and tab selection/panel association. Calculator checks preserved unaffordable-scenario and invalid-input feedback. Reduced-motion behavior was checked on the website.

Automated checks are not an accessibility certification. Protected Vercel previews were not browser-reviewed; local production builds were. Prototype account selection was in explicit local simulation only; no financial action or live-chain validation was performed. Production and deployment protection settings are unchanged.

## Prototype changes

- Readable metadata/status tokens and button labels; keep canonical core brand colors.
- Fix cascade layers so responsive chip visibility and caption color utilities work, including the connected-account mobile header.
- Bound account/trust popovers to available space; use honest disclosure/region semantics and Escape focus return.
- Visible tab scrolling, unique tab/panel IDs and tabular numeric table cells.
- Underline and darken inline deposit/governance links; increase footer/control touch targets and reserve logo space.

Production build and 47 existing frontend tests passed. An isolated build directory avoided stale generated types from retired routes in the existing local output; temporary TypeScript configuration changes were restored and are not included in this PR. No contracts, API behavior, financial calculations or dependencies changed.
