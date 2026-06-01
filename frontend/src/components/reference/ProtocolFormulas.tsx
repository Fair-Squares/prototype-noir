import type { ReactNode } from "react";

interface FormulaProps {
  /** Short title, e.g. "FIFO share". */
  title: string;
  /** The expression, rendered in tabular/mono figures. */
  expr: string;
  /** Plain-language explanation under the expression. */
  children: ReactNode;
}

function Formula({ title, expr, children }: FormulaProps) {
  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="text-label mb-2">{title}</div>
      <pre className="surface-muted text-mono overflow-x-auto whitespace-pre-wrap break-words p-3 text-caption text-text-1">
        {expr}
      </pre>
      <p className="text-caption mt-2 text-text-2">{children}</p>
    </div>
  );
}

/**
 * The real protocol formulas as implemented in the contracts and API layer,
 * stated precisely. These are constants of the protocol (not live reads), so
 * they render statically. Sources are named inline so they can be verified.
 */
export function ProtocolFormulas() {
  return (
    <div>
      <Formula
        title="Distribution split"
        expr={"small_pool = 30% of pool   (SMALL_POOL_BPS = 3000)\nfifo_pool  = 70% of pool\nsmall_threshold = 10,000 EUR   (per-deposit cutoff)"}
      >
        When a passed proposal’s distribution opens, the pool is split into a 30% small-depositor
        floor and a 70% FIFO pool. A deposit is “small” when its amount is at or below the
        small-depositor threshold. From <span className="text-mono">housing_fund/src/main.nr</span>.
      </Formula>

      <Formula
        title="FIFO share (70% pool)"
        expr={"fifo_share = overlap( [cum_before, cum_before + amount), [0, fifo_cap) )"}
      >
        Each deposit owns an immutable FIFO interval starting at the cumulative deposits before it.
        Its FIFO share is the exact 1:1 overlap of that interval with the window{" "}
        <span className="text-mono">[0, fifo_cap)</span> — earliest deposits fill first until the
        cap is exhausted. No division, so the allocation is exact.
      </Formula>

      <Formula
        title="Small-depositor floor (30% pool)"
        expr={"small_share = is_small ? (small_pool × amount) ÷ small_total : 0\nclaimable   = fifo_share + small_share"}
      >
        Small depositors share the 30% floor pro-rata by amount (floored, guarded against an empty
        small population). A small early depositor earns both the floor and its FIFO share. The
        total claimable is the sum of the two, verified in-circuit against the on-chain snapshots{" "}
        <span className="text-mono">small_pool</span>, <span className="text-mono">small_total</span>,
        and <span className="text-mono">fifo_cap</span>.
      </Formula>

      <Formula
        title="Net asset value (NAV)"
        expr={"navEur       = max(0, totalFundDeposits)\nnavPerFsftEur = totalSupply > 0 ? navEur ÷ totalSupply : 0"}
      >
        NAV is the pooled fund capital; NAV per FSFT divides that by the FSFT total
        supply (rounded to 4 decimals). From <span className="text-mono">api/portfolio/route.ts</span>.
      </Formula>

      <Formula
        title="Protocol rewards weighting (FSP)"
        expr={"reward = 40% deposit  +  40% FSFT holdings  +  20% governance"}
      >
        Each epoch’s FSP emission is allocated across three buckets: 40% by deposit position, 40% by
        FSFT holdings, and 20% by governance participation. The yearly emission follows the curve in
        the reward schedule above.
      </Formula>
    </div>
  );
}
