export const meta = {
  name: 'fs-aztec-ecosystem-learnings',
  description: 'Sweep aztec-examples, noir, noir-examples, awesome-noir/aztec, gregoswap and demo-wallet for patterns Fair Squares can adopt; adversarially verify each against the existing FS contracts before recommending',
  phases: [
    { title: 'Explore', detail: '8 explorers, one per subsystem and external source cluster' },
    { title: 'Verify', detail: 'adversarially check each learning is real and novel vs current FS code' },
    { title: 'Synthesize', detail: 'prioritized report grouped by FS subsystem' },
    { title: 'Critique', detail: 'completeness pass: uncovered sources and over-claims' },
  ],
}

const REPORT_PATH = '/home/ilhan/.openclaw/workspace/fair-squares-noir/docs/AZTEC_ECOSYSTEM_LEARNINGS.md'

const FS_CONTEXT = [
  '## Fair Squares (FS) - the project these learnings are FOR',
  'Private-by-default, dual-mode affordable-housing finance protocol on Aztec (aztec-nr v4.3.0).',
  'Repo root: /home/ilhan/.openclaw/workspace/fair-squares-noir. Contracts under contracts/.',
  '5 core V2 contracts + a deposit_note lib + vendored AIP-20 Token/NFT (contracts/vendor/aztec-standards):',
  '- contracts/housing_fund/src/main.nr (1875 L): public deposit_records + private deposit_private -> DepositNote;',
  '  FIFO small-depositor floor (SMALL_POOL_BPS 30%); rent via keeper record_rent (monthly = ROR*acquisition_value/10000/12)',
  '  with an affordability covenant rent ceiling; claim_rent/_private + reinvest_rent/_private; claim_distribution_private;',
  '  FSFT minter; property-deed NFT mint on execution; NAV = total_deposits; valuation oracle = future.',
  '- contracts/governance/src/main.nr (456 L): public create_proposal (proposer intentionally public/accountable);',
  '  cast_vote_private (ONLY aggregate yes/no public; vote_claims = owner-siloed SingleUseClaim nullifier double-vote guard);',
  '  set_proposal_covenant (rent_ceiling_bps, lock_years, target_group); finalize/execute guards.',
  '- contracts/protocol_rewards/src/main.nr (548 L): emission schedule (8M pool / 120 epochs / 13-12-11-10... bps),',
  '  checkpoint, set_user_epoch_weights (40/40/20 split; reads balance_of_public = M14); public claim +',
  '  user_claimable/user_total_claimed/user_last_claimed_epoch PUBLIC maps (M13); claim_reward_private -> RewardClaimNote.',
  '- contracts/fsft_dex/src/main.nr (630 L): ANONYMOUS order book keyed by seq + owner_tag = poseidon2([secret_owner_key, seq])',
  '  (no address in the book); place_order/match/cancel_order/claim; proceeds settle to private PartialUintNote;',
  '  can_trade (KYC); token escrow + authwit; risk-policy guards.',
  '- contracts/kyc_verifier/src/main.nr (247 L): public verified/investor_role maps + is_verified/is_investor views',
  '  (M15 transparency path); hinted KycCredentialNote (private attest path); revocations keyed by credential COMMITMENT',
  '  (hash), NOT address; verified_count = safe aggregate.',
  '- Notes: deposit_note/src/lib.nr DepositNote; kyc_verifier/src/credential_note.nr KycCredentialNote;',
  '  protocol_rewards/src/reward_claim_note.nr RewardClaimNote; fsft_dex/src/order_owner_note.nr OrderOwnerNote.',
  '',
  '## KNOWN, DOCUMENTED posture - do NOT propose these as new (deliberate or already tracked).',
  'DO look for the STATED remediations, and for anything genuinely beyond them:',
  '- M12 credential-commitment linkage (accepted): deposit_private/cast_vote_private/place_order publish a CONSTANT',
  '  poseidon2([owner,nonce]) handle for revocation -> clusterable (owner/nonce stay private). Stated fixes:',
  '  private revocation via migrating KYCVerifier.revocations to DelayedPublicMutable, OR a per-action-domain salt',
  '  poseidon2([owner,nonce,action_domain]) with per-domain revocation registration.',
  '- M13 protocol_rewards per-user PUBLIC reward maps. Stated fix: move per-user accounting onto private RewardClaimNote path.',
  '- M14 set_user_epoch_weights reads PUBLIC FSFT balance (balance_of_public). Stated fix: attest FSFT eligibility privately',
  '  via a HintedNote ownership proof (mirroring cast_vote_private).',
  '- M15 public KYC maps/views on the PUBLIC path (everyday PRIVATE path already attests a hinted note). Transparency-mode-only.',
  '- M16 (FRONTEND, frontend/src/lib/serverWallet.ts): ONE shared server-side EmbeddedWallet/PXE holds ALL test-account keys;',
  '  routes pick the acting account from request params; "address matches accountIndex" is NOT auth -> no cryptographic',
  '  requester->account binding. Stated fix: per-session challenge-signature auth, ideally one PXE/key set per session.',
  '- reinvest_rent_private is STILL SINGLE-NOTE (claims only the caller FIRST deposit note); claim_rent_private and',
  '  claim_distribution_private ALREADY enumerate all the caller deposit notes. A uniform multi-note follow-up is wanted.',
  '- E2E constraint: a fresh ephemeral PXE cannot rediscover a note minted by another process PXE (note discovery/tagging).',
  '- defi_vault is intentionally DORMANT (zero yield). Do not propose "make idle capital earn yield".',
  '- Standing rules: Poseidon2 by default; never silently swallow errors / use fallback values; use the aztec CLI not bare nargo.',
].join('\n')

const TOOLS_HINT = [
  '## Tools - you start with NONE loaded. Load via ToolSearch first, then call them.',
  '- Aztec MCP (corpus synced to v4.3.0): ToolSearch',
  '  "select:mcp__aztec__aztec_list_examples,mcp__aztec__aztec_read_example,mcp__aztec__aztec_search_code,mcp__aztec__aztec_read_file,mcp__aztec__aztec_search_docs"',
  '  Read whole example contracts by name (e.g. aztec_read_example "amm_contract"); regex code search across',
  '  aztec-packages + aztec-examples; read specific files. Docs may be MISSING for v4.3.0, so PREFER read_example /',
  '  search_code / read_file; only if you must use aztec_search_docs and it reports version-mismatch, pass allowVersionMismatch:true.',
  '- Noir MCP (no version gate): ToolSearch',
  '  "select:mcp__noir__noir_list_examples,mcp__noir__noir_read_example,mcp__noir__noir_search_code,mcp__noir__noir_search_stdlib,mcp__noir__noir_list_libraries,mcp__noir__noir_read_file"',
  '  Noir language, stdlib, examples, and COMMUNITY LIBRARIES (noir-bignum, zk-kit.noir, poseidon, sparse_array, noir_sort,',
  '  noir_bigcurve, noir_string_search, noir_json_parser). noir_list_libraries shows them; reading one may trigger an on-demand clone.',
  '- WebFetch (ToolSearch "select:WebFetch") for community indexes:',
  '  awesome-noir  -> https://github.com/noir-lang/awesome-noir',
  '  awesome-aztec -> https://github.com/AztecProtocol/awesome-aztec',
  '- Read / Grep / Glob to inspect the LOCAL FS repo to set "novel" honestly before claiming something is new.',
  '',
  'GROUNDING RULE: every learning MUST cite a source you ACTUALLY opened (example name + file/path, lib name, or URL) in',
  'notesRead. If a source yields nothing genuinely useful for FS, return FEWER or ZERO learnings - do NOT pad. Quality over count.',
  'Be concrete: name the exact FS file to change and what the external pattern would let us do there.',
].join('\n')

const OUTPUT_RULES = [
  '## Output',
  'Return up to 8 of your STRONGEST, most FS-relevant learnings (fewer is fine). For each:',
  '- title: short imperative ("Use DelayedPublicMutable for private revocation reads")',
  '- source: the external thing you read (example/lib/repo + file or symbol)',
  '- pattern: what that external code actually DOES (concrete, 1-3 sentences; reference the real symbol/fn)',
  '- fsApplicability: what we would change in FS and WHY it helps (tie to a known limit M12-M16 / reinvest-multinote / etc.)',
  '- fsTarget: the exact FS file (e.g. contracts/fsft_dex/src/main.nr)',
  '- category: one of privacy | dex | governance | notes | kyc | rewards | math | library | auth | testing | gas | tooling',
  '- effort: small | medium | large',
  '- impact: high | medium | low',
  '- novel: your honest best guess that FS does NOT already do this (verifiers will double-check)',
  'Also fill notesRead with the concrete sources you opened.',
].join('\n')

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    learnings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          source: { type: 'string' },
          pattern: { type: 'string' },
          fsApplicability: { type: 'string' },
          fsTarget: { type: 'string' },
          category: { type: 'string' },
          effort: { type: 'string', enum: ['small', 'medium', 'large'] },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          novel: { type: 'boolean' },
        },
        required: ['title', 'source', 'pattern', 'fsApplicability', 'fsTarget', 'category', 'effort', 'impact', 'novel'],
      },
    },
    notesRead: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'learnings', 'notesRead'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keep: { type: 'boolean' },
    status: { type: 'string', enum: ['novel-applicable', 'partial', 'already-done', 'deliberate-tradeoff', 'not-real', 'not-applicable'] },
    reason: { type: 'string' },
    fsEvidence: { type: 'string' },
    correctedClaim: { type: 'string' },
    recommendation: { type: 'string' },
  },
  required: ['keep', 'status', 'reason', 'fsEvidence', 'recommendation'],
}

const EXPLORERS = [
  {
    key: 'dex',
    label: 'explore:dex/orderbook/escrow',
    brief: [
      'FOCUS: secondary-market / DEX patterns for contracts/fsft_dex/src/main.nr (+ order_owner_note.nr).',
      'READ (aztec MCP read_example/search_code): orderbook_contract, amm_contract, uniswap_contract, escrow_contract, claim_contract;',
      'also explore the gregoswap repo via aztec_search_code/read_file (a cloned Aztec token-swap app).',
      'HUNT FOR: how reference DEXs keep orders/identity unlinkable; partial-fill / order matching; PartialUintNote / UintNote',
      'settlement of proceeds; authwit-based token escrow; cancellation + nullifier hygiene; fee handling; slippage/price guards.',
      'Map to: the anonymous owner_tag = poseidon2([secret_owner_key, seq]) scheme, the M12 constant-handle linkage on place_order,',
      'single vs partial fills, escrow + authwit, can_trade KYC gating. Is there a cleaner unlinkable-order or note-based-revocation',
      'pattern than what FS does?',
    ].join('\n'),
  },
  {
    key: 'governance',
    label: 'explore:voting/governance',
    brief: [
      'FOCUS: private governance for contracts/governance/src/main.nr.',
      'READ: private_voting_contract, claim_contract (SingleUseClaim), auth_contract, card_game_contract.',
      'HUNT FOR: private tally techniques (aggregate-only), double-vote nullifier guards, vote weight by a PRIVATE balance/holding,',
      'delegation, quorum + time-window handling, and condition/covenant-bound execution. Map to: cast_vote_private (aggregate-only',
      'yes/no), vote_claims SingleUseClaim guard, set_proposal_covenant terms, finalize/execute guards. Anything that would let FS',
      'weight votes by private FSFT/deposit holdings without a public read, or harden the lifecycle?',
    ].join('\n'),
  },
  {
    key: 'notes',
    label: 'explore:notes/nullifiers/partial-notes',
    brief: [
      'FOCUS: note design across FS notes (deposit_note/src/lib.nr, kyc_verifier/src/credential_note.nr,',
      'protocol_rewards/src/reward_claim_note.nr, fsft_dex/src/order_owner_note.nr) + multi-note enumeration + cross-PXE discovery.',
      'READ: custom-note (aztec-examples) and custom_note, note_getter_contract, pending_note_hashes_contract,',
      'note_hash_and_nullifier_contract, sender_for_tags_test_contract; and search aztec-nr for UintNote / PartialUintNote / value_note,',
      'note delivery + tagging.',
      'HUNT FOR: encryption/delivery best practice, efficient nullifier derivation, PARTIAL NOTES for settlement, note',
      'discovery/TAGGING (sender_for_tags) that could fix the FS e2e "fresh PXE cannot rediscover another process note" constraint,',
      'and clean patterns for enumerating MANY notes (FS reinvest_rent_private is still single-note while claim paths loop).',
    ].join('\n'),
  },
  {
    key: 'kyc',
    label: 'explore:kyc/access/DelayedPublicMutable',
    brief: [
      'FOCUS: KYC / credential / access-control for contracts/kyc_verifier/src/main.nr (+ credential_note.nr).',
      'READ: token_blacklist_contract, auth_registry_contract, public_immutable_contract, updatable_contract; and search aztec-nr for',
      'DelayedPublicMutable / SharedMutable / PublicImmutable.',
      'HUNT FOR: how blacklist/registry contracts do membership/eligibility checks; the DelayedPublicMutable / SharedMutable pattern',
      'for a list that is PUBLICLY WRITTEN but PRIVATELY READABLE (the stated M12/M15 remediation for moving revocations off the',
      'public path); credential issuance/expiry/maturity. Map to: public verified/investor maps (M15), revocation-keyed-by-commitment,',
      'hinted KycCredentialNote, and the M12 private-revocation goal.',
    ].join('\n'),
  },
  {
    key: 'funding',
    label: 'explore:funding/claims/rewards/epochs',
    brief: [
      'FOCUS: deposits, claims, rewards & recurring epochs for contracts/housing_fund/src/main.nr and',
      'contracts/protocol_rewards/src/main.nr.',
      'READ: crowdfunding_contract, claim_contract, app_subscription_contract, lending_contract.',
      'HUNT FOR: PRIVATE claim accounting that avoids per-user PUBLIC maps (M13 remediation), private eligibility proofs (M14),',
      'recurring/epoch payment patterns (FS rent epochs), crowdfund deposit/refund mechanics & FIFO, and one-time/single-use claim',
      'issuance (maps to FS single-use guards). Map to: deposits + rent + claim_distribution_private (multi-note), and',
      'protocol_rewards emission curve + M13 public per-user maps + M14 public balance read + RewardClaimNote.',
    ].join('\n'),
  },
  {
    key: 'math',
    label: 'explore:noir-lang/stdlib/math',
    brief: [
      'FOCUS: Noir language + stdlib correctness/efficiency for FS financial math.',
      'USE Noir MCP (noir_search_stdlib, noir_search_code, noir_read_file) + noir language docs.',
      'HUNT FOR: overflow-safe integer arithmetic, integer-division ROUNDING pitfalls (FS computes monthly rent as',
      'ROR*acquisition_value/10000/12 and bps splits /10000 - truncation/precision matters), U128/u128 + Field arithmetic,',
      'BoundedVec for note loops, std::hash Poseidon2 ergonomics, and any stdlib helpers FS likely reimplements. Map to: rent/ROR/bps',
      'math in housing_fund, the small-pool FIFO floor, and the protocol_rewards bps emission curve. Flag any latent precision/overflow bug.',
    ].join('\n'),
  },
  {
    key: 'libs',
    label: 'explore:noir-examples + awesome-noir libs',
    brief: [
      'FOCUS: adoptable COMMUNITY libraries + common Noir patterns.',
      'USE Noir MCP (noir_list_examples/read_example, noir_list_libraries, noir_read_file) and WebFetch the awesome-noir README',
      '(https://github.com/noir-lang/awesome-noir).',
      'HUNT FOR concrete libraries FS could adopt and exactly where: e.g. zk-kit.noir (Merkle / Sparse-Merkle / ECDH - private',
      'membership & revocation proofs -> M12/M15), noir-bignum / fixed-point (precise euro/ROR math), sparse_array, noir_sort',
      '(DEX order matching), poseidon. Only recommend a lib with a SPECIFIC FS use-case and target file. Map to FS gaps above.',
    ].join('\n'),
  },
  {
    key: 'auth',
    label: 'explore:accounts/wallet/auth(M16)+tooling',
    brief: [
      'FOCUS: account/auth model for the M16 frontend server-wallet problem (frontend/src/lib/serverWallet.ts) + ecosystem tooling.',
      'READ: schnorr_account_contract, ecdsa_r_account_contract, ecdsa_k_account_contract, auth_contract, app_subscription_contract;',
      'explore the demo-wallet repo via aztec_search_code/read_file; WebFetch the awesome-aztec README',
      '(https://github.com/AztecProtocol/awesome-aztec).',
      'HUNT FOR: per-session challenge-signature auth, account-contract entrypoint authorization, @aztec/wallet-sdk session /',
      'secure-channel patterns, one-PXE/key-set-per-session, and authwit for delegated actions - anything that gives a real',
      'cryptographic requester->account binding to replace the shared-PXE "address matches accountIndex" demo posture. Also note any',
      'ecosystem TOOLING (wallet SDKs, indexers, testing libs) FS could adopt. fsTarget here is mostly frontend/src/lib/serverWallet.ts.',
    ].join('\n'),
  },
]

function explorerPrompt(e) {
  return [
    'You are an Aztec/Noir research explorer for the Fair Squares protocol. Read the EXTERNAL sources below and extract',
    'patterns FS can adopt. Ground everything in code you actually open.',
    FS_CONTEXT,
    TOOLS_HINT,
    e.brief,
    OUTPUT_RULES,
    'Set area="' + e.key + '".',
  ].join('\n\n')
}

function verifyPrompt(l) {
  return [
    'You are an adversarial verifier. A research explorer proposed this learning for the Fair Squares (FS) protocol.',
    'Decide whether it is (a) REAL - the cited external pattern exists and does what is claimed - AND (b) NOVEL &',
    'APPLICABLE - FS does not already do it and it is not an explicitly deliberate/accepted posture.',
    '',
    'PROPOSED LEARNING (JSON):',
    JSON.stringify(l, null, 2),
    '',
    FS_CONTEXT,
    TOOLS_HINT,
    '',
    'STEPS:',
    '1. CONFIRM REALITY: open the cited external source (same aztec/noir MCP tools or WebFetch) and verify the pattern/symbol is',
    '   real and behaves as claimed. If you cannot confirm it -> status "not-real", keep=false.',
    '2. CHECK FS CURRENT STATE: Read the cited fsTarget (' + l.fsTarget + ') and Grep the repo (esp. CLAUDE.md) to see if FS',
    '   already does this OR has explicitly ACCEPTED the opposite as a deliberate tradeoff (M12-M16 etc.). already-done OR',
    '   deliberate-tradeoff -> keep=false. If FS does PART of it -> status "partial", keep=true with a precise remaining delta.',
    '3. If real, novel and applicable -> status "novel-applicable", keep=true.',
    'Be skeptical: if not convinced it is BOTH real AND a genuine improvement over current FS, set keep=false.',
    'Provide fsEvidence (file:line or a quoted CLAUDE.md line you checked) and, when keep=true, a concrete recommendation',
    '(exact file + the change to make). Correct any overstatement in correctedClaim.',
  ].join('\n')
}

phase('Explore')

const verified = await pipeline(
  EXPLORERS,
  (e) => agent(explorerPrompt(e), { label: e.label, phase: 'Explore', schema: FINDINGS_SCHEMA }),
  (findings, e) => {
    if (!findings || !Array.isArray(findings.learnings) || findings.learnings.length === 0) return []
    return parallel(findings.learnings.map((l) => () =>
      agent(verifyPrompt(l), {
        label: 'verify:' + e.key + ':' + String(l.title || '').slice(0, 28),
        phase: 'Verify',
        schema: VERDICT_SCHEMA,
      }).then((v) => ({ title: l.title, source: l.source, pattern: l.pattern, fsApplicability: l.fsApplicability, fsTarget: l.fsTarget, category: l.category, effort: l.effort, impact: l.impact, area: e.key, verdict: v })).catch(() => null)))
  },
)

const all = verified.flat().filter(Boolean)
const confirmed = all.filter((l) => l.verdict && l.verdict.keep)
const rejected = all.filter((l) => l.verdict && !l.verdict.keep)
log('Verified ' + all.length + ' learnings: ' + confirmed.length + ' kept, ' + rejected.length + ' set aside.')

const byArea = {}
for (const l of confirmed) byArea[l.area] = (byArea[l.area] || 0) + 1

const confirmedBrief = JSON.stringify(confirmed, null, 2)
const rejectedBrief = JSON.stringify(rejected.map((r) => ({ title: r.title, area: r.area, status: r.verdict.status, reason: r.verdict.reason })), null, 2)

phase('Synthesize')

const synthPrompt = [
  'You are the lead synthesizer. Below are CONFIRMED, verified learnings for the Fair Squares (FS) protocol (each already',
  'checked to be real + novel/applicable vs current FS code), plus the set that was deliberately SET ASIDE (already-done or',
  'deliberate tradeoff) so you can show coverage.',
  '',
  FS_CONTEXT,
  '',
  'CONFIRMED LEARNINGS (JSON):',
  confirmedBrief,
  '',
  'SET ASIDE (JSON):',
  rejectedBrief,
  '',
  'Write a thorough, well-structured markdown report to the file ' + REPORT_PATH + ' using the Write tool. Structure:',
  '1. "# Aztec/Noir ecosystem learnings for Fair Squares" + a 2-3 sentence intro stating what was swept (aztec-examples,',
  '   aztec-packages contracts, noir + noir-examples, awesome-noir/awesome-aztec, gregoswap, demo-wallet @ v4.3.0) and the',
  '   verify methodology.',
  '2. "## Highest-leverage shortlist" - the top 6-10 items ranked by impact/effort. For each: a one-line what + which FS file +',
  '   the external precedent (named source) + effort/impact + the FS limit it advances (M12/M13/M14/M15/M16/reinvest-multinote/',
  '   precision/etc.) when relevant.',
  '3. "## By subsystem" - group the rest under DEX, Governance, Notes & nullifiers, KYC & access control, Funding/claims/rewards,',
  '   Noir math/correctness, Libraries to adopt, Accounts/auth (M16), Tooling. Each item: pattern -> concrete FS change ->',
  '   external source. Merge duplicates across explorers.',
  '4. "## Explicitly checked but NOT recommended" - a compact table of the set-aside items with the reason (already-done /',
  '   deliberate tradeoff), so the reader sees we did not blindly pile on.',
  '5. "## Suggested next steps" - 3-5 concrete, sequenced actions (smallest-high-impact first).',
  'Be precise and honest; cite real symbols/paths; never invent an FS field or an external API. Keep the canonical FS economic +',
  'privacy models intact (do not contradict CLAUDE.md). After writing the file, RETURN (as your final text) a tight markdown',
  'executive summary (the shortlist as a bulleted list, ~10 lines) suitable for pasting into a chat reply.',
].join('\n')

const execSummary = await agent(synthPrompt, { label: 'synthesize:report', phase: 'Synthesize' })

phase('Critique')

const critiquePrompt = [
  'You are a completeness critic. A report was just written to ' + REPORT_PATH + '. Read it.',
  'Then judge: (a) were all intended sources actually leveraged - aztec-examples + aztec-packages contracts (orderbook/amm/',
  'uniswap/escrow/private_voting/claim/crowdfunding/app_subscription/token_blacklist/auth_registry/custom-note/account contracts),',
  'noir + noir-examples stdlib, awesome-noir + awesome-aztec, gregoswap, demo-wallet? (b) is any FS subsystem (housing_fund,',
  'governance, protocol_rewards, fsft_dex, kyc_verifier, notes, frontend M16) under-covered? (c) any over-claim or recommendation',
  'that contradicts the FS canonical economic/privacy model in CLAUDE.md or proposes something already documented as deliberate?',
  'Use Read/Grep on the repo + the aztec/noir MCP (load via ToolSearch) to spot-check 2-3 of the report load-bearing claims.',
  'Return a SHORT markdown list: "Gaps / sources not fully mined", "Claims to double-check", and "Verdict" (is the report',
  'trustworthy and reasonably complete?). Be specific and brief.',
].join('\n')

const critique = await agent(critiquePrompt, { label: 'critique:completeness', phase: 'Critique' })

return { reportPath: REPORT_PATH, kept: confirmed.length, setAside: rejected.length, byArea, execSummary, critique }
