"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Button, InfoDot, SkeletonRow, Stepper, Tooltip } from "@/components/ui";
import { useWallet } from "@/contexts/WalletContext";
import { useSimulationMode } from "@/hooks/useSimulationMode";
import {
  castVote,
  claimProposalDistribution,
  claimRent,
  depositFunds,
  registerKYC,
  reinvestRent,
} from "@/lib/contracts";
import {
  DEMO_ACCOUNT_INDEX,
  DEMO_INVEST_PRESETS,
  DEMO_PERSONA_NAME,
  DEMO_PROPOSAL_ID,
  DEMO_STEPS,
  deriveDemoStage,
  demoStepIndex,
  fetchDemoSnapshot,
  previewRentShare,
  runDemoAction,
  type DemoSnapshot,
  type DemoStage,
} from "@/lib/demoJourney";
import { formatCount, formatEUR, formatFSFT, formatPctFromBps } from "@/lib/format";
import { clearActivity, logActivity } from "@/lib/sessionActivity";
import { clearVotedLocally, markVoted } from "@/lib/votedStore";

/**
 * Guided demo — one persona, one home, five steps, one action at a time.
 * Every number is the simulation's real state (no tags needed); the two steps
 * that stand in for time passing / the fund's keeper carry a "Demo shortcut"
 * chip so nobody mistakes them for something an investor can do.
 */
export function DemoTour() {
  const mode = useSimulationMode();
  const { activeAccount, connect, isConnecting } = useWallet();
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const isPersona = activeAccount?.index === DEMO_ACCOUNT_INDEX;

  useEffect(() => {
    if (mode !== "simulation") return;
    let active = true;
    fetchDemoSnapshot()
      .then((s) => {
        if (active) setSnapshot(s);
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
    };
  }, [mode]);

  /** Run one step, then re-read the snapshot so the stage advances from state. */
  const act = useCallback(async (run: () => Promise<string>) => {
    setBusy(true);
    setActionError(null);
    try {
      const done = await run();
      setSnapshot(await fetchDemoSnapshot());
      setNote(done);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const restart = useCallback(
    () =>
      act(async () => {
        const fresh = await runDemoAction("reset");
        clearVotedLocally(fresh.account.address, DEMO_PROPOSAL_ID);
        clearActivity(fresh.account.address);
        await connect(DEMO_ACCOUNT_INDEX);
        return `You're ${DEMO_PERSONA_NAME} now. Start with step 1.`;
      }),
    [act, connect]
  );

  if (mode === "live") return <LiveModeNotice />;
  if (loadError) {
    return (
      <Alert tone="danger" title="Could not load the demo">
        {loadError}
      </Alert>
    );
  }
  if (mode === "unknown" || !snapshot) {
    return (
      <div className="space-y-3" aria-busy="true">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  const stage = deriveDemoStage(snapshot);
  const pristine = stage === "verify";
  // Starting over wipes the persona's progress (and the shared demo fund), so
  // it asks first — except from a pristine state, where there is nothing to lose.
  const startOver = () => {
    if (
      pristine ||
      window.confirm(`Start over? This resets ${DEMO_PERSONA_NAME}'s progress and the demo fund.`)
    ) {
      void restart();
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-label mb-1.5">Guided demo</p>
          <h1 className="text-display text-text-1">Fair Squares in five steps</h1>
          <p className="text-body mt-3 text-text-2">
            Invest in an affordable home, help decide which one the fund buys, and
            collect your share of the rent.
          </p>
        </div>
        {isPersona && !pristine ? (
          <Button variant="ghost" size="sm" onClick={startOver} disabled={busy} className="self-start sm:self-auto">
            Start over
          </Button>
        ) : null}
      </header>

      {/* Full stepper from sm up; on a phone a slim bar keeps the action above
          the fold (the card's eyebrow already says "Step N of 5"). */}
      <div className="hidden sm:block">
        <Stepper
          steps={DEMO_STEPS.map((s) => ({ label: s.label, description: s.description }))}
          current={isPersona ? demoStepIndex(stage) : -1}
        />
      </div>
      <MobileProgress step={isPersona ? demoStepIndex(stage) : 0} />

      {actionError ? (
        <Alert tone="danger" title="That step didn't go through">
          {actionError} Try again, or start over to reset the demo.
        </Alert>
      ) : null}
      {note && isPersona && !actionError ? (
        <Alert tone="success" title="Done">
          {note}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isPersona ? (
            <StageCard stage={stage} snapshot={snapshot} busy={busy} act={act} startOver={startOver} />
          ) : (
            <StartCard
              snapshot={snapshot}
              pristine={pristine}
              busy={busy || isConnecting}
              onStart={startOver}
              onResume={() => act(async () => {
                await connect(DEMO_ACCOUNT_INDEX);
                return `Welcome back, ${DEMO_PERSONA_NAME}. Pick up where you left off.`;
              })}
            />
          )}
        </div>
        <PositionAside snapshot={snapshot} />
      </div>
    </div>
  );
}

// ── Start / resume ───────────────────────────────────────────────────────────

function StartCard({
  snapshot,
  pristine,
  busy,
  onStart,
  onResume,
}: {
  snapshot: DemoSnapshot;
  pristine: boolean;
  busy: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <StepFrame
      illustration="/brand/illustrations/housing-fund.png"
      eyebrow="Before you start"
      title={`You'll play ${DEMO_PERSONA_NAME}, a first-time saver`}
      body={
        <>
          {DEMO_PERSONA_NAME} has {formatEUR(snapshot.eurBalance)} in demo money and has
          never invested before. It takes about three minutes, and nothing here is real
          money.
        </>
      }
    >
      {pristine ? (
        <Button onClick={onStart} loading={busy}>
          Start the demo
        </Button>
      ) : (
        <>
          <Button onClick={onResume} loading={busy}>
            Continue as {DEMO_PERSONA_NAME}
          </Button>
          <Button variant="ghost" onClick={onStart} disabled={busy}>
            Start over
          </Button>
        </>
      )}
    </StepFrame>
  );
}

// ── One card per stage ───────────────────────────────────────────────────────

type Act = (run: () => Promise<string>) => Promise<void>;

function StageCard({
  stage,
  snapshot: s,
  busy,
  act,
  startOver,
}: {
  stage: DemoStage;
  snapshot: DemoSnapshot;
  busy: boolean;
  act: Act;
  startOver: () => void;
}) {
  const { address, index } = s.account;
  const home = s.proposal;

  switch (stage) {
    case "verify":
      return (
        <StepFrame
          illustration="/brand/illustrations/registry-tablet.png"
          eyebrow="Step 1 of 5"
          title="Verify who you are"
          body="Only verified people can invest. Your documents stay private: the fund only learns that you passed."
        >
          <Button
            loading={busy}
            onClick={() =>
              act(async () => {
                await registerKYC(address, true);
                return "You're verified. Next, put some money into the fund.";
              })
            }
          >
            Verify with a demo passport
          </Button>
        </StepFrame>
      );

    case "invest":
      return <InvestStep snapshot={s} busy={busy} act={act} />;

    case "vote":
      return (
        <StepFrame
          illustration="/brand/illustrations/governance-table.png"
          eyebrow="Step 3 of 5"
          title="Vote on the next home"
          body="Members decide together which homes the fund buys. Your ballot stays private: only the running totals are public."
        >
          <HomeSummary snapshot={s} />
          <div className="flex w-full flex-wrap items-center gap-3">
            <Button
              loading={busy}
              onClick={() =>
                act(async () => {
                  await castVote(address, home.id, true, index);
                  markVoted(address, home.id);
                  logActivity(address, "vote", `Voted yes on ${home.title}`);
                  return "Your yes vote is in. Now let the vote close.";
                })
              }
            >
              Vote yes
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await castVote(address, home.id, false, index);
                  markVoted(address, home.id);
                  logActivity(address, "vote", `Voted no on ${home.title}`);
                  return "Your no vote is in. Now let the vote close.";
                })
              }
            >
              Vote no
            </Button>
            <Link
              href={`/fund/${home.id}`}
              className="text-caption text-fs-teal-dark hover:underline"
            >
              Read the project dossier
            </Link>
          </div>
        </StepFrame>
      );

    case "fund_home":
      return (
        <StepFrame
          illustration="/brand/illustrations/governance-table.png"
          eyebrow="Meanwhile at the fund"
          shortcut="Normally the vote stays open for its full window, then the fund's keeper buys the home if it passed. In the demo you can skip the wait."
          title="Close the vote"
          body={`${home.yesVotes} yes and ${home.noVotes} no so far, with ${home.quorumRequired} votes needed. If yes wins, the fund buys the home for ${formatEUR(home.amount)}.`}
        >
          <Button
            loading={busy}
            onClick={() =>
              act(async () => {
                const next = await runDemoAction("fund_home");
                return next.proposal.status === 3
                  ? "The vote passed and the fund bought the home. Your Fund Shares are ready."
                  : "The vote is closed.";
              })
            }
          >
            Close the vote now
          </Button>
        </StepFrame>
      );

    case "rejected":
      return (
        <StepFrame
          illustration="/brand/illustrations/governance-table.png"
          eyebrow="The community decided"
          title="The vote said no"
          body="The fund doesn't buy this home, and your money stays in the fund for the next one. Start over to see a home get funded."
        >
          <Button onClick={startOver} loading={busy}>
            Start over
          </Button>
        </StepFrame>
      );

    case "vote_expired":
      return (
        <StepFrame
          illustration="/brand/illustrations/governance-table.png"
          eyebrow="Step 3 of 5"
          title="This vote has closed"
          body="The voting window ended before you voted. Start over to get a fresh vote."
        >
          <Button onClick={startOver} loading={busy}>
            Start over
          </Button>
        </StepFrame>
      );

    case "claim_shares":
      return (
        <StepFrame
          illustration="/brand/illustrations/ownership-distribute.png"
          eyebrow="Step 4 of 5"
          title="Collect your Fund Shares"
          body={
            <>
              The fund bought {home.title}. Everyone with money in the fund receives Fund
              Shares (FSFT) in proportion, and they are your claim on the homes.
            </>
          }
        >
          <BigFigure label="Ready for you" value={`${formatCount(s.sharesClaimable)} Fund Shares`} />
          <Button
            loading={busy}
            onClick={() =>
              act(async () => {
                const res = await claimProposalDistribution(home.id, address, index);
                const got = res.claimedAmount ?? s.sharesClaimable;
                logActivity(address, "payout-claim", `Collected ${formatCount(got)} Fund Shares`);
                return `You now own ${formatCount(got)} Fund Shares. Next, see the rent come in.`;
              })
            }
          >
            Collect {formatCount(s.sharesClaimable)} shares
          </Button>
        </StepFrame>
      );

    case "collect_rent": {
      const mySlice = previewRentShare(s.monthlyRent, s.shares, s.totalShares);
      return (
        <StepFrame
          illustration="/brand/illustrations/house.png"
          eyebrow="Meanwhile, a month passes"
          shortcut="Normally tenants pay at the end of each month and the fund records it. In the demo you can skip ahead one month."
          title="Tenants pay rent"
          body={
            <>
              Rent is capped at {formatPctFromBps(s.rorBps, 0)} of the purchase price a
              year, which is {formatEUR(s.monthlyRent)} a month for this home and below
              market by design. All rent is pooled and split by Fund Shares.{" "}
              <InfoDot
                label="Why is rent pooled?"
                content="Every holder shares the rent of every home, so one late payment dips the whole pool slightly instead of hitting one investor."
              />
            </>
          }
        >
          <BigFigure label="Your slice this month" value={`about ${formatEUR(mySlice)}`} />
          <Button
            loading={busy}
            onClick={() =>
              act(async () => {
                await runDemoAction("collect_rent");
                return "A month of rent came in. Your share is ready to collect.";
              })
            }
          >
            Skip ahead one month
          </Button>
        </StepFrame>
      );
    }

    case "use_rent":
      return (
        <StepFrame
          illustration="/brand/illustrations/house.png"
          eyebrow="Step 5 of 5"
          title="Your rent is ready"
          body="Take it as cash, or reinvest it so your stake grows. Rent is separate income and never changes what a share is worth."
        >
          <BigFigure label="Rent to collect" value={formatEUR(s.rentClaimable)} />
          <div className="flex w-full flex-wrap gap-3">
            <Button
              loading={busy}
              onClick={() =>
                act(async () => {
                  const res = await claimRent(address, index);
                  const amount = res.claimed ?? s.rentClaimable;
                  logActivity(address, "rent-withdraw", `Withdrew ${formatEUR(amount)} rent`);
                  return `${formatEUR(amount)} is back in your wallet.`;
                })
              }
            >
              Withdraw {formatEUR(s.rentClaimable)}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const res = await reinvestRent(address, index);
                  const amount = res.reinvested ?? s.rentClaimable;
                  logActivity(address, "rent-reinvest", `Reinvested ${formatEUR(amount)} rent`);
                  return `${formatEUR(amount)} went back into the fund as new capital.`;
                })
              }
            >
              Reinvest
            </Button>
          </div>
        </StepFrame>
      );

    case "done":
      return (
        <StepFrame
          illustration="/brand/illustrations/housing-fund.png"
          eyebrow="You did the whole cycle"
          title="That's how Fair Squares works"
          body="You verified, invested, voted, became a co-owner and earned rent. Your portfolio shows everything you did."
        >
          <Button href="/portfolio">See your portfolio</Button>
          <Button variant="ghost" onClick={startOver} disabled={busy}>
            Start over
          </Button>
        </StepFrame>
      );
  }
}

function InvestStep({ snapshot: s, busy, act }: { snapshot: DemoSnapshot; busy: boolean; act: Act }) {
  const [amount, setAmount] = useState<number>(DEMO_INVEST_PRESETS[1]);
  const { address, index } = s.account;
  return (
    <StepFrame
      illustration="/brand/illustrations/invest-piggybank.png"
      eyebrow="Step 2 of 5"
      title="Put money into the fund"
      body="Your money joins one shared pool that buys affordable homes. The amount you put in stays private; only the fund's total is public."
    >
      <fieldset className="w-full">
        <legend className="text-label mb-2">
          How much? You have {formatEUR(s.eurBalance)} in demo money
        </legend>
        <div className="flex flex-wrap gap-2">
          {DEMO_INVEST_PRESETS.map((preset) => (
            <label
              key={preset}
              className={`btn btn-sm btn-secondary cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${amount === preset ? "border-fs-teal bg-teal-50 ring-2 ring-fs-teal" : ""}`}
            >
              <input
                type="radio"
                name="demo-amount"
                value={preset}
                checked={amount === preset}
                onChange={() => setAmount(preset)}
                className="sr-only"
              />
              {formatEUR(preset)}
            </label>
          ))}
        </div>
      </fieldset>
      <Button
        loading={busy}
        onClick={() =>
          act(async () => {
            await depositFunds(address, amount, index);
            logActivity(address, "deposit", `Deposited ${formatEUR(amount)}`);
            return `${formatEUR(amount)} is in the fund. Now help decide which home it buys.`;
          })
        }
      >
        Invest {formatEUR(amount)}
      </Button>
    </StepFrame>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────

function StepFrame({
  illustration,
  eyebrow,
  title,
  body,
  shortcut,
  children,
}: {
  illustration: string;
  eyebrow: string;
  title: string;
  body: ReactNode;
  /** When set, this step stands in for time passing or the keeper. */
  shortcut?: string;
  children: ReactNode;
}) {
  return (
    <section className="surface overflow-hidden" aria-labelledby="demo-step-title">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="space-y-5 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-label">{eyebrow}</p>
            {shortcut ? (
              <Tooltip content={shortcut} align="left">
                <span className="chip chip-sim" tabIndex={0}>
                  Demo shortcut
                </span>
              </Tooltip>
            ) : null}
          </div>
          <h2 id="demo-step-title" className="text-heading text-text-1">
            {title}
          </h2>
          <p className="text-body max-w-prose text-text-2">{body}</p>
          <div className="flex flex-wrap items-center gap-3">{children}</div>
        </div>
        <div className="band-mint hidden items-center justify-center p-6 sm:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={illustration}
            alt=""
            aria-hidden="true"
            className="max-h-44 w-auto object-contain"
          />
        </div>
      </div>
    </section>
  );
}

function MobileProgress({ step }: { step: number }) {
  const pct = (Math.min(step, DEMO_STEPS.length) / DEMO_STEPS.length) * 100;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 sm:hidden"
      role="progressbar"
      aria-label="Demo progress"
      aria-valuemin={0}
      aria-valuemax={DEMO_STEPS.length}
      aria-valuenow={Math.min(step, DEMO_STEPS.length)}
    >
      <div className="h-full rounded-full bg-fs-teal" style={{ width: `${pct}%` }} />
    </div>
  );
}

function BigFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-full">
      <p className="text-label">{label}</p>
      <p className="text-kpi text-text-1">{value}</p>
    </div>
  );
}

function HomeSummary({ snapshot: s }: { snapshot: DemoSnapshot }) {
  const home = s.proposal;
  return (
    <div className="surface-mint w-full rounded-2xl p-4">
      <p className="text-body font-semibold text-text-1">{home.title}</p>
      <p className="text-caption mt-1 text-text-2">
        Asks {formatEUR(home.amount)} from the fund · {home.yesVotes} yes, {home.noVotes} no
        · {home.quorumRequired} votes needed to decide
      </p>
    </div>
  );
}

function PositionAside({ snapshot: s }: { snapshot: DemoSnapshot }) {
  const rentTaken = s.rentWithdrawn + s.rentReinvested;
  const sharePct = s.totalShares > 0 ? (s.shares / s.totalShares) * 100 : 0;
  return (
    <aside className="surface space-y-5 p-6" aria-label={`${DEMO_PERSONA_NAME}'s position`}>
      <div>
        <p className="text-label">{DEMO_PERSONA_NAME}&apos;s position</p>
        <p className="text-caption mt-1 text-text-3">Updates after every step.</p>
      </div>
      <dl className="space-y-4">
        <Fact label="In the fund" value={formatEUR(s.deposited)} />
        <Fact
          label="Fund Shares"
          value={formatFSFT(s.shares)}
          sub={s.shares > 0 ? `${sharePct.toLocaleString("en", { maximumFractionDigits: 1 })}% of all shares` : undefined}
        />
        <Fact
          label="Rent collected"
          value={formatEUR(rentTaken)}
          sub={
            rentTaken > 0
              ? `${formatEUR(s.rentWithdrawn)} withdrawn · ${formatEUR(s.rentReinvested)} reinvested`
              : undefined
          }
        />
      </dl>
      <p className="text-caption border-t border-border pt-4 text-text-3">
        Want to look around? The{" "}
        <Link href="/fund" className="text-fs-teal-dark hover:underline">
          homes
        </Link>{" "}
        and{" "}
        <Link href="/portfolio" className="text-fs-teal-dark hover:underline">
          portfolio
        </Link>{" "}
        pages show the same demo data.
      </p>
    </aside>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-caption text-text-3">{label}</dt>
      <dd className="text-kpi-sm text-text-1 tabular-nums">{value}</dd>
      {sub ? <dd className="text-caption text-text-3">{sub}</dd> : null}
    </div>
  );
}

function LiveModeNotice() {
  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <p className="text-label mb-1.5">Guided demo</p>
        <h1 className="text-display text-text-1">The guided demo runs on demo data</h1>
        <p className="text-body mt-3 text-text-2">
          This app is connected to a real Aztec network, where votes take their full
          window and rent is recorded by the fund&apos;s keeper, so there are no shortcuts.
          Follow the same steps in the app itself.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button href="/portfolio">Go to your portfolio</Button>
        <Button href="/fund" variant="ghost">
          Browse homes
        </Button>
      </div>
    </div>
  );
}
