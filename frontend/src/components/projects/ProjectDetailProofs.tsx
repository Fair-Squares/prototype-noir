import { AdvancedDetails } from "@/components/ui";
import { formatEUR, type Proposal, type PropertyDeed } from "@/lib/contracts";
import { ProjectDetailNotOnChain } from "./ProjectDetailNotOnChain";

type Field = { label: string; value: string; mono?: boolean };

/**
 * Proofs / on-chain tab. The honest "show your work" view: a dense, collapsed
 * table of the raw on-chain ids and fields backing every figure shown in the
 * friendlier tabs, followed by an explicit note about what is deliberately NOT
 * on-chain. Nothing here is computed for display beyond formatting.
 *
 * The raw table lives behind AdvancedDetails (collapsed by default) so the calm
 * flow stays primary and the technical detail is progressive disclosure.
 */
export function ProjectDetailProofs({
  proposal,
  deed,
}: {
  proposal: Proposal;
  deed: PropertyDeed | null;
}) {
  const proposalFields: Field[] = [
    { label: "Proposal id", value: `#${proposal.id}`, mono: true },
    { label: "Title", value: proposal.title },
    { label: "Description hash", value: proposal.descHash, mono: true },
    { label: "Requested amount (EUR)", value: formatEUR(proposal.amount), mono: true },
    { label: "Status code", value: String(proposal.status), mono: true },
    { label: "Yes votes", value: proposal.yesVotes.toLocaleString(), mono: true },
    { label: "No votes", value: proposal.noVotes.toLocaleString(), mono: true },
  ];

  if (typeof proposal.totalVotes === "number") {
    proposalFields.push({
      label: "Total votes",
      value: proposal.totalVotes.toLocaleString(),
      mono: true,
    });
  }
  if (typeof proposal.quorumRequired === "number") {
    proposalFields.push({
      label: "Quorum required",
      value: proposal.quorumRequired.toLocaleString(),
      mono: true,
    });
  }
  if (typeof proposal.createdBlock === "number") {
    proposalFields.push({
      label: "Created block",
      value: proposal.createdBlock.toLocaleString(),
      mono: true,
    });
  }
  if (typeof proposal.deadlineBlock === "number") {
    proposalFields.push({
      label: "Deadline block",
      value: proposal.deadlineBlock.toLocaleString(),
      mono: true,
    });
  }
  if (typeof proposal.currentBlock === "number") {
    proposalFields.push({
      label: "Current block",
      value: proposal.currentBlock.toLocaleString(),
      mono: true,
    });
  }
  if (typeof proposal.distributionOpened === "boolean") {
    proposalFields.push({
      label: "Distribution opened",
      value: proposal.distributionOpened ? "true" : "false",
      mono: true,
    });
  }
  if (typeof proposal.distributionAmount === "number") {
    proposalFields.push({
      label: "Distribution amount (EUR)",
      value: formatEUR(proposal.distributionAmount),
      mono: true,
    });
  }
  if (typeof proposal.distributionClaimed === "number") {
    proposalFields.push({
      label: "Distribution claimed (EUR)",
      value: formatEUR(proposal.distributionClaimed),
      mono: true,
    });
  }
  if (typeof proposal.distributionSnapshotDeposits === "number") {
    proposalFields.push({
      label: "Snapshot deposits (EUR)",
      value: formatEUR(proposal.distributionSnapshotDeposits),
      mono: true,
    });
  }

  const deedFields: Field[] | null = deed
    ? [
        { label: "Deed token id", value: `#${deed.tokenId}`, mono: true },
        { label: "Deed owner", value: deed.owner, mono: true },
        { label: "Recorded valuation (EUR)", value: formatEUR(deed.valuationEur), mono: true },
        { label: "Linked proposal id", value: `#${deed.proposalId}`, mono: true },
        { label: "Distribution open", value: deed.distributionOpen ? "true" : "false", mono: true },
      ]
    : null;

  return (
    <div className="space-y-5">
      <div className="surface p-5">
        <AdvancedDetails summary="Raw on-chain fields">
          <p className="text-caption text-text-2">
            Every figure in this memo, as the protocol records it. Shown verbatim
            for verification.
          </p>

          <FieldTable caption="Governance proposal" fields={proposalFields} />
          {deedFields ? (
            <FieldTable caption="Property deed (AIP-721)" fields={deedFields} />
          ) : (
            <p className="text-caption mt-4 text-text-2">
              No property deed has been minted for this proposal yet.
            </p>
          )}
        </AdvancedDetails>
      </div>

      <ProjectDetailNotOnChain />
    </div>
  );
}

function FieldTable({ caption, fields }: { caption: string; fields: Field[] }) {
  return (
    <div className="mt-4">
      <p className="text-label">{caption}</p>
      {/* Table on >=sm; stacks to label/value rows on mobile via overflow. */}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <tbody>
            {fields.map((field) => (
              <tr key={field.label} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  className="text-caption py-2 pr-4 align-top font-normal text-text-2"
                >
                  {field.label}
                </th>
                <td
                  className={`py-2 align-top text-text-1 ${field.mono ? "text-mono break-all" : "text-body"}`}
                >
                  {field.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
