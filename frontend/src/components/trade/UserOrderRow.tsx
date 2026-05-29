import { Button, StatusChip } from "@/components/ui";
import { formatEURDecimals, type DexOrder } from "@/lib/contracts";

const STATUS_KIND: Record<DexOrder["status"], "open" | "pending" | "completed" | "failed"> = {
  open: "open",
  partial: "pending",
  filled: "completed",
  cancelled: "failed",
  expired: "failed",
};

export interface UserOrderRowProps {
  order: DexOrder;
  fundSymbol: string;
  busy: boolean;
  onCancel: (orderId: number) => void;
}

/**
 * A single private order commitment the caller owns. Only rendered if the
 * orderbook snapshot surfaces the caller's own orders; preserves the cancel
 * mutation from the contract flow.
 */
export function UserOrderRow({ order, fundSymbol, busy, onCancel }: UserOrderRowProps) {
  const cancellable = order.status === "open" || order.status === "partial";
  return (
    <div className="surface-muted flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="text-body text-text-1">
          <span className="uppercase">{order.side}</span>{" "}
          <span className="tabular-nums">
            {order.remaining.toLocaleString("en-EU")}/{order.amount.toLocaleString("en-EU")}
          </span>{" "}
          {fundSymbol}
        </p>
        <p className="text-caption text-text-2 tabular-nums">
          {formatEURDecimals(order.priceEur)} per {fundSymbol}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <StatusChip status={STATUS_KIND[order.status]} label={order.status} />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !cancellable}
          onClick={() => onCancel(order.id)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
