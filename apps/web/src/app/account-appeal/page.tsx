"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, AuthLayout, Button, Input } from "@/components/ui";
import { api } from "@/lib/api";

const GENERIC_RECEIPT =
  "If an eligible account exists, the request has been received for review.";

/**
 * Public account-access review request.
 *
 * The backend returns the same message for unknown, active, ineligible, and
 * duplicate requests. This page mirrors that behaviour so it does not reveal
 * account state to a visitor.
 */
export default function AccountAppealPage() {
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (reason.trim().length < 20) {
      setError(
        "Please provide at least 20 characters so the review team has enough context.",
      );
      return;
    }

    setLoading(true);
    try {
      await api.submitAccountAppeal({
        identifier: identifier.trim(),
        reason: reason.trim(),
      });
      setSubmitted(true);
    } catch (requestError) {
      // Network failures are actionable; all API responses still receive the
      // generic receipt so no account state is disclosed in the browser.
      if (
        requestError instanceof Error &&
        requestError.message.includes("Network error")
      ) {
        setError(
          "Unable to reach the server. Please check your connection and try again.",
        );
      } else {
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Request account review"
      subtitle="Use the email address or phone number associated with your account."
    >
      {submitted ? (
        <Alert variant="info">{GENERIC_RECEIPT}</Alert>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label="Email or international phone number"
            type="text"
            placeholder="you@example.com or +233241234567"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            disabled={loading}
            required
            autoComplete="username"
          />
          <div className="input-group">
            <label className="input-label" htmlFor="account-review-reason">
              What should the review team know?
            </label>
            <textarea
              id="account-review-reason"
              className="input account-review-textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={loading}
              minLength={20}
              maxLength={2000}
              rows={6}
              required
              aria-describedby="account-review-reason-help"
            />
            <p id="account-review-reason-help" className="text-sm muted">
              Please do not include passwords, verification codes, or
              financial-account details.
            </p>
          </div>
          <Button type="submit" block size="lg" loading={loading}>
            {loading ? "Submitting…" : "Submit review request"}
          </Button>
        </form>
      )}
      <div className="auth-links mt-6">
        Remember your password? <Link href="/login">Back to login</Link>
      </div>
    </AuthLayout>
  );
}
