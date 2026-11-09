"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionBar,
  Alert,
  Button,
  EmptyState,
  FormField,
  PageHeader,
  ProofChip,
  Section,
  Stepper,
} from "@/components/ui";
import { useWallet } from "@/contexts/WalletContext";
import {
  fetchKYCProfile,
  formatEUR,
  registerKYC,
  submitListing,
  type KYCProfile,
} from "@/lib/contracts";
import { hashDossier, type HashedDossier } from "@/lib/dossierHash";

const STEPS = [
  { label: "Property & ask", description: "Address, capital ask, certified market rent" },
  { label: "Dossier", description: "Appraiser report + technical assessment" },
  { label: "Review & sign", description: "Submit for council review" },
];

const inputClass =
  "h-11 w-full rounded-md border border-border-strong bg-card px-3 text-body text-text-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50";

/**
 * J1: the submit-property wizard (journey step 2). A vetted property owner
 * submits a listing — capital ask, appraiser-attested monthly market rent and
 * a hashed document dossier — which then awaits council review (step 3a).
 * Only the dossier HASH goes on-chain; documents stay with the submitter.
 */
export default function SubmitPropertyPage() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;

  const [profile, setProfile] = useState<KYCProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);

  const [step, setStep] = useState(0);
  const [propertyLabel, setPropertyLabel] = useState("");
  const [ask, setAsk] = useState("");
  const [marketRent, setMarketRent] = useState("");
  const [dossier, setDossier] = useState<HashedDossier | null>(null);
  const [hashing, setHashing] = useState(false);
  const [errors, setErrors] = useState<{ label?: string; ask?: string; rent?: string; files?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    if (!address) return;
    setProfileError(null);
    try {
      setProfile(await fetchKYCProfile(address));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    }
  }, [address]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const grantOwnerRole = async () => {
    if (!address) return;
    setGrantBusy(true);
    setProfileError(null);
    try {
      await registerKYC(address, true, ["property_owner"]);
      await loadProfile();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setGrantBusy(false);
    }
  };

  const onFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setHashing(true);
    setErrors((e) => ({ ...e, files: undefined }));
    try {
      setDossier(await hashDossier(Array.from(files)));
    } catch (err) {
      setErrors((e) => ({ ...e, files: err instanceof Error ? err.message : String(err) }));
    } finally {
      setHashing(false);
    }
  };

  const validateStep0 = () => {
    const next: typeof errors = {};
    if (!propertyLabel.trim()) next.label = "A short property reference is required.";
    const askNum = Number(ask);
    if (!ask.trim() || !Number.isFinite(askNum) || askNum <= 0) {
      next.ask = "Enter the capital ask in EUR (greater than 0).";
    }
    const rentNum = Number(marketRent);
    if (!marketRent.trim() || !Number.isFinite(rentNum) || rentNum <= 0) {
      next.rent = "Enter the appraiser-certified monthly market rent in EUR.";
    }
    setErrors(next);
    return !next.label && !next.ask && !next.rent;
  };

  const submit = async () => {
    if (!address || !dossier) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitListing(
        address,
        Number(ask),
        Number(marketRent),
        dossier.dossierHash,
        accountIndex
      );
      setSubmittedId(result.listingId ?? null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!address) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Connect an account to submit a property"
          description="Pick an account in the header to start the onboarding journey."
        />
      </main>
    );
  }

  if (profile && !(profile.isPropertyOwner ?? false)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          title="Submit a property"
          description="Owner onboarding — journey step 2"
        />
        {profileError && <Alert tone="danger">{profileError}</Alert>}
        <EmptyState
          title="Property owner role required"
          description="Submitting a listing needs the property owner role, granted through the same verification process that vets investors. In this demo you can request it instantly."
          action={
            <Button onClick={grantOwnerRole} disabled={grantBusy}>
              {grantBusy ? "Requesting role…" : "Get the property owner role"}
            </Button>
          }
        />
      </main>
    );
  }

  if (submittedId !== null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader title="Listing submitted" description={`Listing #${submittedId} is awaiting council review`} />
        <Alert tone="success">
          The dossier commitment is on-chain. The housing council reviews price-quality
          and technical condition next — once approved, any investor can open the vote.
        </Alert>
        <ActionBar className="mt-4">
          <Link href="/fund" className="btn btn-secondary">Back to properties</Link>
        </ActionBar>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Submit a property" description="Owner onboarding — journey step 2" />
      {profileError && <Alert tone="danger">{profileError}</Alert>}

      <Stepper steps={STEPS} current={step} className="my-6" />

      {step === 0 && (
        <Section title="Property & capital ask">
          <div className="flex flex-col gap-4">
            <FormField
              label="Property reference"
              htmlFor="listing-label"
              required
              error={errors.label}
              hint="A short internal label (address or project name). Kept off-chain."
            >
              <input
                id="listing-label"
                type="text"
                autoComplete="off"
                value={propertyLabel}
                onChange={(e) => setPropertyLabel(e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField
              label="Capital ask (EUR)"
              htmlFor="listing-ask"
              required
              error={errors.ask}
              hint="The acquisition price the fund would pay. Inherited by the investor vote, so it can't drift later."
            >
              <input
                id="listing-ask"
                type="number"
                min="1"
                inputMode="numeric"
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField
              label="Market rent (EUR per month)"
              htmlFor="listing-rent"
              required
              error={errors.rent}
              hint="The appraiser-certified market rent. The protocol caps covenant rent at least 20% below this baseline."
            >
              <input
                id="listing-rent"
                type="number"
                min="1"
                inputMode="numeric"
                value={marketRent}
                onChange={(e) => setMarketRent(e.target.value)}
                className={inputClass}
              />
            </FormField>
          </div>
          <ActionBar className="mt-5">
            <Button onClick={() => validateStep0() && setStep(1)}>Continue to dossier</Button>
          </ActionBar>
        </Section>
      )}

      {step === 1 && (
        <Section title="Document dossier">
          <p className="text-body-sm text-text-2">
            Attach the appraiser report and the technical assessment. The files are hashed
            in your browser — only the commitment goes on-chain, the documents never leave
            your machine in this demo.
          </p>
          <FormField
            label="Dossier documents"
            htmlFor="listing-files"
            required
            error={errors.files}
          >
            <input
              id="listing-files"
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => void onFilesPicked(e.target.files)}
              disabled={hashing}
              className="w-full text-body-sm text-text-2 file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-card file:px-3 file:py-2 file:text-body-sm file:text-text-1"
            />
          </FormField>
          {hashing && <p className="mt-2 text-body-sm text-text-3">Hashing documents…</p>}
          {dossier && (
            <div className="mt-3 flex flex-col gap-2">
              {dossier.files.map((f) => (
                <div key={f.sha256} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <span className="truncate text-body-sm text-text-1">{f.name}</span>
                  <span className="truncate text-mono text-body-sm text-text-3" title={f.sha256}>
                    {f.sha256.slice(0, 14)}…
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <ProofChip label="Dossier commitment ready" state="ok" />
                <span className="truncate text-mono text-body-sm text-text-3" title={dossier.dossierHash}>
                  {dossier.dossierHash.slice(0, 18)}…
                </span>
              </div>
            </div>
          )}
          <ActionBar className="mt-5" align="between">
            <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
            <Button
              onClick={() => {
                if (!dossier) {
                  setErrors((e) => ({ ...e, files: "Attach at least one document to build the dossier." }));
                  return;
                }
                setStep(2);
              }}
            >
              Continue to review
            </Button>
          </ActionBar>
        </Section>
      )}

      {step === 2 && dossier && (
        <Section title="Review & sign">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-label text-text-3">Property</dt>
              <dd className="text-body text-text-1">{propertyLabel}</dd>
            </div>
            <div>
              <dt className="text-label text-text-3">Capital ask</dt>
              <dd className="text-mono text-body text-text-1">{formatEUR(Number(ask))}</dd>
            </div>
            <div>
              <dt className="text-label text-text-3">Market rent (certified)</dt>
              <dd className="text-mono text-body text-text-1">€{Number(marketRent).toLocaleString("en-IE")}/mo</dd>
            </div>
            <div>
              <dt className="text-label text-text-3">Dossier</dt>
              <dd className="text-body text-text-1">
                {dossier.files.length} {dossier.files.length === 1 ? "document" : "documents"},{" "}
                <span className="text-mono text-body-sm" title={dossier.dossierHash}>
                  {dossier.dossierHash.slice(0, 14)}…
                </span>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-body-sm text-text-2">
            Signing submits the listing on-chain as {address.slice(0, 10)}… and opens it for
            housing council review. The maximum covenant rent for this ask must sit at least
            20% below the certified market rent before an investor vote can adopt it.
          </p>
          {submitError && <Alert tone="danger" className="mt-3">{submitError}</Alert>}
          <ActionBar className="mt-5" align="between">
            <Button variant="secondary" onClick={() => setStep(1)} disabled={submitting}>Back</Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? "Submitting…" : "Sign & submit listing"}
            </Button>
          </ActionBar>
        </Section>
      )}
    </main>
  );
}
