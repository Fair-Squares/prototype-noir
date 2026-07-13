import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simRecordRent, simGetPropertyRentPolicy } from "@/lib/simulationStore";
import { getAztecTxOutcome } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";

/** W1c ceiling with the contract's exact floor math: acq * bps / 10000 / 12. */
function monthlyRentCap(acquisitionValue: number, rentCeilingBps: number): number {
  return Math.floor(Math.floor((acquisitionValue * rentCeilingBps) / 10000) / 12);
}

/**
 * GET /api/fund/rent?propertyId=N — the enforced rent policy for a property:
 * whether a covenant is synced into the fund, its terms, the recorded
 * acquisition value, and the resulting max monthly rent (null while the
 * ceiling is not yet enforceable). Pre-flight for keepers/scripts so a
 * ceiling revert is never the first signal.
 */
export async function GET(request: NextRequest) {
  const propertyId = Number(new URL(request.url).searchParams.get("propertyId"));
  if (!Number.isInteger(propertyId) || propertyId < 0) {
    return NextResponse.json({ error: "propertyId (integer >= 0) is required" }, { status: 400 });
  }

  if (!isLiveModeEnabled()) {
    return NextResponse.json({ ...simGetPropertyRentPolicy(propertyId), source: "simulation" });
  }

  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }
    const reader = await getTestAccount(0);
    const from = AztecAddress.fromString(reader.address);
    const HfJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, reader.wallet);

    const [covenantRaw, acqRaw] = await Promise.all([
      hfContract.methods.get_property_covenant(propertyId).simulate({ from }),
      hfContract.methods.get_acquisition_value(propertyId).simulate({ from }),
    ]);
    // get_property_covenant returns (synced, rent_ceiling_bps, lock_years).
    const [syncedRaw, ceilingRaw, lockRaw] = simResult<[boolean, bigint, bigint]>(covenantRaw);
    const covenantSynced = Boolean(syncedRaw);
    const rentCeilingBps = Number(ceilingRaw);
    const lockYears = Number(lockRaw);
    const acquisitionValue = Number(simResult(acqRaw));

    return NextResponse.json({
      covenantSynced,
      rentCeilingBps,
      lockYears,
      acquisitionValue,
      maxMonthlyRent:
        covenantSynced && acquisitionValue > 0 ? monthlyRentCap(acquisitionValue, rentCeilingBps) : null,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/rent GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/fund/rent — record collected rent for a funded property (Phase 1.1,
 * the real cash-flow primitive behind "earn the rent"). Live: calls
 * HousingFund.record_rent from the admin/keeper account (contract enforces
 * admin-or-keeper). Sim: accrues to the in-memory rent income. No fabricated
 * yield: rent is posted by an authorized party, never invented.
 *
 * Body: { propertyId: number, amount: number, accountIndex?: number, address?: string }
 */
export async function POST(request: NextRequest) {
  const { propertyId, amount, accountIndex = 0, address } = await request.json();
  const pid = Number(propertyId);
  const amt = Number(amount);
  if (!Number.isInteger(pid) || pid < 0 || !Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json(
      { error: "propertyId (integer >= 0) and a positive amount are required" },
      { status: 400 }
    );
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    const result = simRecordRent(pid, amt);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: `Recorded €${amt.toLocaleString()} rent for property ${pid} (simulation)`,
      txHash: `sim_rent_${Date.now()}`,
    });
  }

  // ── Live mode: call HousingFund.record_rent via the server wallet ─────────
  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const account = await getTestAccount(accountIndex);
    if (address && address.toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const HfJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(
      AztecAddress.fromString(housingFundAddr),
      hfArtifact,
      account.wallet
    );

    const receipt = await hfContract.methods
      .record_rent(pid, BigInt(amt))
      .send({ from: AztecAddress.fromString(account.address) });

    // record_rent can revert post-mining (pause, authorization, the W1c
    // covenant ceiling) — inspect the receipt, never report a reverted
    // booking as recorded.
    const meta = getAztecTxOutcome(receipt);
    if (meta.reverted) {
      // W1c: the ceiling revert is actionable — read the enforced policy and
      // tell the keeper the exact cap instead of only echoing the assertion.
      if ((meta.error ?? "").includes("rent exceeds affordability covenant ceiling")) {
        const [syncedRaw, ceilingRaw] = simResult<[boolean, bigint, bigint]>(
          await hfContract.methods
            .get_property_covenant(pid)
            .simulate({ from: AztecAddress.fromString(account.address) })
        );
        const acq = Number(
          simResult(
            await hfContract.methods
              .get_acquisition_value(pid)
              .simulate({ from: AztecAddress.fromString(account.address) })
          )
        );
        const cap = Boolean(syncedRaw) && acq > 0 ? monthlyRentCap(acq, Number(ceilingRaw)) : null;
        return NextResponse.json(
          {
            error:
              cap !== null
                ? `Rent exceeds the affordability covenant ceiling — property ${pid} is capped at €${cap.toLocaleString()}/month (${(Number(ceilingRaw) / 100).toFixed(2)}%/yr of its €${acq.toLocaleString()} acquisition value). Post €${cap.toLocaleString()} or less.`
                : `Rent exceeds the affordability covenant ceiling for property ${pid}.`,
            maxMonthlyRent: cap,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: `Rent booking was mined but reverted on-chain: ${meta.error ?? "no revert reason in receipt"}` },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Recorded €${amt.toLocaleString()} rent for property ${pid}`,
      txHash: meta.txHash,
      blockNumber: meta.blockNumber,
      status: meta.status,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/rent]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
