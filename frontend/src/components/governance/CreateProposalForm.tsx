"use client";

import { type FormEvent, useRef, useState } from "react";
import { ActionBar, Button, FormField } from "@/components/ui";

export interface CreateProposalFormProps {
  /** Submit handler — wraps the real createProposal call. Resolves to an
   *  error string on failure, or null on success. */
  onCreate: (input: {
    title: string;
    description: string;
    amount: number;
  }) => Promise<string | null>;
  onCancel: () => void;
}

/**
 * Funding-request form for the investment committee. Validates inline, focuses
 * the first invalid field on submit, and disables controls while saving. The
 * "title"/"note" are committee metadata stored off-chain via the description
 * hash — they never become an on-chain proposal title.
 */
export function CreateProposalForm({ onCreate, onCancel }: CreateProposalFormProps) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ title?: string; amount?: string }>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const nextErrors: { title?: string; amount?: string } = {};
    const parsedAmount = Number(amount);
    if (!title.trim()) nextErrors.title = "A short internal reference is required.";
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      nextErrors.amount = "Enter the funding amount in EUR (greater than 0).";
    }

    setErrors(nextErrors);
    if (nextErrors.title) {
      titleRef.current?.focus();
      return;
    }
    if (nextErrors.amount) {
      amountRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      const error = await onCreate({
        title: title.trim(),
        description: description.trim(),
        amount: parsedAmount,
      });
      if (error) {
        setSubmitError(error);
        return;
      }
      setTitle("");
      setAmount("");
      setDescription("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        label="Internal reference"
        htmlFor="proposal-title"
        required
        error={errors.title}
        hint="A short label for the committee. Proposals are tracked on-chain by number, not title."
      >
        <input
          id="proposal-title"
          ref={titleRef}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={saving}
          aria-invalid={errors.title ? true : undefined}
          className="w-full rounded-md border border-border-strong bg-card px-3 py-2 text-body text-text-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
        />
      </FormField>

      <FormField
        label="Funding amount (EUR)"
        htmlFor="proposal-amount"
        required
        error={errors.amount}
      >
        <input
          id="proposal-amount"
          ref={amountRef}
          type="number"
          min="1"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          disabled={saving}
          aria-invalid={errors.amount ? true : undefined}
          className="w-full rounded-md border border-border-strong bg-card px-3 py-2 text-body text-mono text-text-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
        />
      </FormField>

      <FormField
        label="Committee note"
        htmlFor="proposal-note"
        hint="Optional context for reviewers."
      >
        <textarea
          id="proposal-note"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={saving}
          className="w-full resize-none rounded-md border border-border-strong bg-card px-3 py-2 text-body text-text-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
        />
      </FormField>

      {submitError ? (
        <p role="alert" className="text-caption text-[var(--color-danger)]">
          {submitError}
        </p>
      ) : null}

      <ActionBar>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {saving ? "Submitting…" : "Submit request"}
        </Button>
      </ActionBar>
    </form>
  );
}
