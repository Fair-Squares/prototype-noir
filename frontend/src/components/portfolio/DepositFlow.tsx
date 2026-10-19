"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaucetPanel } from "@/components/invest/FaucetPanel";
import { InvestQuote } from "@/components/invest/InvestQuote";
import {
  ActionBar,
  AdvancedDetails,
  Alert,
  Button,
  EmptyState,
  FormField,
  InfoDot,
  KpiCard,
  KpiGrid,
  Section,
  StatusChip,
  Stepper,
} from "@/components/ui";
import { useWallet } from "@/contexts/WalletContext";
import {
  depositFunds,
  fetchFundStats,
  fetchKYCProfile,
  fetchPortfolio,
  formatEUR,
  formatEURDecimals,
  type DepositResult,
  type FundStats,
  type KYCProfile,
  type PortfolioData,
} from "@/lib/contracts";

const FAUCET_AMOUNT = 50_000;
const QUICK_AMOUNTS = [1_000, 5_000, 10_000];

const STEP_LABELS = [
  "Connect",
  "Verify",
  "Fund",
  "Amount",
  "Review",
  "Confirm",
] as const;

// The first three steps are gated by real on-chain state. Once an investor is
// verified and has cash, they drive the amount → review → confirm sequence
// themselves, so we track that tail explicitly.
type ManualStep = 3 | 4 | 5;

function shortHash(hash?: string | null): string {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
}

/**
 * S3 (UX_SIMPLIFICATION_PLAN.md): the guided deposit flow, moved from the
 * retired /invest route into Portfolio -- the money hub. Same real-state
 * gating (connect -> verify -> fund -> amount -> review -> confirm); the step
 * tail is local state now (no URL sync -- /invest redirects to
 * /portfolio#deposit).
 */
export function DepositFlow({ onDeposited }: { onDeposited?: () => void }) {
  const { activeAccount, connect, isConnecting } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [kycProfile, setKycProfile] = useState<KYCProfile | null>(null);
  const [stats, setStats] = useState<FundStats | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Deposit form + submission state.
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<DepositResult | null>(null);
  // Snapshot of the amount actually deposited, taken before the input is
  // cleared — the confirmation card must never fall back to the TOTAL position
  // under an "Added this transaction" label.
  const [confirmedAmount, setConfirmedAmount] = useState<number | null>(null);
  const [manualStep, setManualStep] = useState<ManualStep>(3);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchFundStats()
      .then(setStats)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Could not load fund data.");
      });
  }, []);

  useEffect(() => {
    if (!address) {
      setKycProfile(null);
      setPortfolio(null);
      return;
    }
    setAccountLoading(true);
    Promise.all([fetchKYCProfile(address), fetchPortfolio(address, accountIndex)])
      .then(([profile, nextPortfolio]) => {
        setKycProfile(profile);
        setPortfolio(nextPortfolio);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Could not load account data.");
      })
      .finally(() => setAccountLoading(false));
  }, [address, accountIndex]);

  const refreshPortfolio = useCallback(async () => {
    if (!address) return;
    const nextPortfolio = await fetchPortfolio(address, accountIndex);
    setPortfolio(nextPortfolio);
  }, [address, accountIndex]);

  // ── Derived real state ──────────────────────────────────────────────────────
  const isConnected = Boolean(address);
  const isInvestor = Boolean(kycProfile?.isInvestor && kycProfile?.verified);
  const eurBalance = portfolio?.eurBalance ?? 0;
  const hasCash = eurBalance > 0;

  // Shares are issued at purchase price; null until the fund has bought a home.
  const sharePriceEur = portfolio?.sharePriceEur ?? stats?.sharePriceEur ?? null;

  const parsedAmount = Number.parseFloat(amount);
  const amountEur = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;

  // The current step index for the Stepper. Gated steps resolve from real
  // state; once funded, the manual tail (amount/review/confirm) takes over.
  const currentStep: number = useMemo(() => {
    if (result?.success) return 5; // Confirm — completed deposit.
    if (!isConnected) return 0;
    if (!isInvestor) return 1;
    if (!hasCash) return 2;
    return manualStep;
  }, [result, isConnected, isInvestor, hasCash, manualStep]);

  const goToManualStep = useCallback((next: ManualStep) => {
    setManualStep(next);
  }, []);

  // ── Amount validation ───────────────────────────────────────────────────────
  const validateAmount = (): boolean => {
    if (amountEur <= 0) {
      setAmountError("Enter an amount greater than zero.");
      amountInputRef.current?.focus();
      return false;
    }
    if (amountEur > eurBalance) {
      setAmountError(`Amount exceeds your available cash of ${formatEURDecimals(eurBalance)}.`);
      amountInputRef.current?.focus();
      return false;
    }
    setAmountError(null);
    return true;
  };

  const handleReviewAmount = () => {
    if (validateAmount()) goToManualStep(4);
  };

  // ── Deposit submit (preserves depositFunds wiring) ──────────────────────────
  const handleConfirm = async () => {
    if (!address) {
      setSubmitError("Connect your account first.");
      return;
    }
    if (!validateAmount()) {
      goToManualStep(3);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const res = await depositFunds(address, amountEur, accountIndex);
      if (!res.success) {
        setSubmitError(res.error ?? "Deposit failed.");
        return;
      }
      setResult(res);
      setConfirmedAmount(amountEur);
      setAmount("");
      await refreshPortfolio();
      onDeposited?.();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Deposit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const startAnotherDeposit = () => {
    setResult(null);
    setConfirmedAmount(null);
    setSubmitError(null);
    setAmount("");
    goToManualStep(3);
  };

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const verifyChip = !isConnected ? null : isInvestor ? (
    <StatusChip status="verified" label="Verified investor" />
  ) : (
    <StatusChip status="pending" label="Verification required" />
  );

  return (
    <div className="space-y-6">
      {loadError ? <Alert tone="danger" title="Could not load data">{loadError}</Alert> : null}

      <Section padding="tight">
        <Stepper steps={STEP_LABELS.map((label) => ({ label }))} current={currentStep} />
      </Section>

      {/* S7: one compact context row -- available cash and value per share
          (the full KPI story lives in the surrounding portfolio page). */}
      <KpiGrid cols={2}>
        <KpiCard label="Available cash" value={formatEUR(eurBalance)} sub="EUR in your wallet" />
        <KpiCard
          label="Price per share"
          value={sharePriceEur != null ? formatEURDecimals(sharePriceEur) : "—"}
          sub={sharePriceEur != null ? "Price paid when the fund bought a home" : "Set when the fund buys its first home"}
        />
      </KpiGrid>

      {/* ── Step 1: Connect ─────────────────────────────────────────────────── */}
      {!isConnected ? (
        <Section
          title="Connect your account"
          description="Connect an Aztec account to begin. Your deposit and position are held privately to your account."
        >
          <ActionBar align="start">
            <Button onClick={() => connect(0)} loading={isConnecting}>
              {isConnecting ? "Connecting…" : "Connect account"}
            </Button>
          </ActionBar>
          <p className="text-caption mt-3 text-text-3">
            To pick a different account, use the account button in the top-right
            of the page.
          </p>
        </Section>
      ) : null}

      {/* ── Step 2: Verify ──────────────────────────────────────────────────── */}
      {isConnected && !isInvestor ? (
        <Section
          title="Verify investor eligibility"
          description="Depositing requires a verified investor credential. Verification is a private KYC check held to your account."
          actions={verifyChip}
        >
          {accountLoading && !kycProfile ? (
            <p className="text-caption text-text-3" aria-live="polite">
              Checking your verification status…
            </p>
          ) : (
            <ActionBar align="start">
              <Link href="/kyc" className="btn btn-primary">
                Go to verification
              </Link>
            </ActionBar>
          )}
        </Section>
      ) : null}

      {/* ── Step 3: Fund wallet (faucet is test-only) ───────────────────────── */}
      {isConnected && isInvestor && !hasCash ? (
        <Section
          title="Fund your wallet (test faucet)"
          description="You need EUR in your wallet before depositing. On this demo network you can add test EUR below — this is not a real onramp."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {verifyChip}
              <StatusChip status="simulation" label="Test only" />
            </div>
          }
        >
          <EmptyState
            title="No cash available to deposit"
            description="Your wallet holds no EUR yet. Use the test faucet to add funds, then continue."
          />
          <div className="mt-4">
            <FaucetPanel
              address={address}
              accountIndex={accountIndex}
              amount={FAUCET_AMOUNT}
              onFunded={refreshPortfolio}
            />
          </div>
        </Section>
      ) : null}

      {/* ── Steps 4–6: Amount → Review → Confirm ────────────────────────────── */}
      {isConnected && isInvestor && hasCash && !result?.success ? (
        <Section
          title="Make your deposit"
          description="Enter an amount, review the quote, then confirm. Your deposit settles as a private position in the fund."
          actions={verifyChip}
        >
          {/* Step 4: Amount */}
          {manualStep === 3 ? (
            <div className="space-y-4">
              <div className="surface-muted flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="text-label">Available cash</span>
                <span className="text-mono text-text-1">{formatEURDecimals(eurBalance)}</span>
              </div>

              <FormField
                label="Deposit amount"
                htmlFor="deposit-amount"
                required
                hint="Amount of EUR to deposit into the fund."
                error={amountError ?? undefined}
              >
                <div className="flex items-center gap-2">
                  <input
                    id="deposit-amount"
                    ref={amountInputRef}
                    type="number"
                    min="0"
                    step="100"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      if (amountError) setAmountError(null);
                    }}
                    placeholder="0"
                    aria-invalid={amountError ? true : undefined}
                    aria-describedby={amountError ? "deposit-amount-error" : "deposit-amount-hint"}
                    className="text-body text-mono h-11 w-full rounded-md border border-border-strong bg-card px-3 text-text-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fs-teal"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAmount(String(eurBalance));
                      if (amountError) setAmountError(null);
                    }}
                  >
                    Max
                  </Button>
                </div>
              </FormField>

              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.filter((q) => q <= eurBalance).map((quick) => (
                  <Button
                    key={quick}
                    variant="ghost"
                    onClick={() => {
                      setAmount(String(quick));
                      if (amountError) setAmountError(null);
                    }}
                  >
                    {formatEUR(quick)}
                  </Button>
                ))}
              </div>

              <ActionBar>
                <Button onClick={handleReviewAmount} disabled={amountEur <= 0}>
                  Review deposit
                </Button>
              </ActionBar>
            </div>
          ) : null}

          {/* Step 5: Review quote */}
          {manualStep === 4 ? (
            <div className="space-y-4">
              <InvestQuote
                amountEur={amountEur}
                eurBalance={eurBalance}
                sharePriceEur={sharePriceEur}
              />

              {submitting ? (
                <Alert tone="info" title={`Processing your private deposit… (${formatEUR(amountEur)})`}>
                  This usually takes 30&ndash;60 seconds; your position updates
                  once the deposit lands on-chain.
                  <AdvancedDetails summary="What happens under the hood" className="mt-2">
                    <p className="text-caption text-text-2">
                      Two on-chain transactions are sent: an EUR transfer to the
                      fund and your private deposit note, proven with a
                      zero-knowledge proof so the amount and your identity stay
                      private.
                    </p>
                  </AdvancedDetails>
                </Alert>
              ) : null}

              <div aria-live="polite">
                {submitError ? (
                  <Alert tone="danger" title="Deposit failed">{submitError}</Alert>
                ) : null}
              </div>

              <ActionBar align="between">
                <Button
                  variant="secondary"
                  onClick={() => goToManualStep(3)}
                  disabled={submitting}
                >
                  Back
                </Button>
                <Button onClick={handleConfirm} loading={submitting}>
                  {submitting ? "Submitting…" : `Confirm deposit of ${formatEUR(amountEur)}`}
                </Button>
              </ActionBar>
            </div>
          ) : null}

          <div className="text-caption mt-4 flex items-center gap-1.5 text-text-3">
            <span>After depositing, your fund shares can be sold to other members if you ever need out.</span>
            <InfoDot
              label="About secondary liquidity"
              content="Selling is never required — holding your position funds homes for the long term. When you do sell, the price is constrained to a band around the last issuance reference price (not current NAV per share)."
              align="right"
            />
          </div>
        </Section>
      ) : null}

      {/* ── Step 6: Confirmation ─────────────────────────────────────────────── */}
      {result?.success ? (
        <Section
          title="Deposit confirmed"
          description="Your deposit has been included on-chain and your private position is updated."
          actions={<StatusChip status="completed" label="Included on-chain" />}
        >
          <div aria-live="polite" className="space-y-4">
            <Alert
              tone="success"
              title={
                result.blockNumber != null
                  ? `Deposit included — block ${result.blockNumber}`
                  : "Deposit included on-chain"
              }
            >
              Your cash has been transferred and your private position recorded.
              Fund shares are issued when the fund distributes.
            </Alert>

            <KpiGrid cols={2}>
              <KpiCard
                label="Deposited"
                value={formatEURDecimals(confirmedAmount ?? 0)}
                tone="accent"
                sub="Added this transaction"
              />
              <KpiCard
                label="Your position"
                value={formatEURDecimals(portfolio?.depositedAmount ?? 0)}
                sub="Total deposited in the fund"
              />
            </KpiGrid>

            <AdvancedDetails summary="Transaction details">
              <dl className="divide-y divide-border">
                {result.eurTransferTxHash ? (
                  <div className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <dt className="text-caption text-text-2">
                      EUR transfer
                      {result.eurTransferBlockNumber != null
                        ? ` · block ${result.eurTransferBlockNumber}`
                        : ""}
                    </dt>
                    <dd className="text-mono min-w-0 break-all text-text-1 sm:truncate sm:text-right">
                      {shortHash(result.eurTransferTxHash)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <dt className="text-caption text-text-2">
                    Private deposit{result.status ? ` · ${result.status}` : ""}
                  </dt>
                  <dd className="text-mono min-w-0 break-all text-text-1 sm:truncate sm:text-right">
                    {shortHash(result.txHash)}
                  </dd>
                </div>
              </dl>
            </AdvancedDetails>

            <ActionBar align="between">
              <Link href="/portfolio" className="btn btn-secondary">
                View your position
              </Link>
              <Button onClick={startAnotherDeposit}>Deposit again</Button>
            </ActionBar>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
