"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createEligibilityApi } from "@irexpro/api-client/eligibility";
import type {
  EligibilityReviewDecision,
  EligibilityReviewQueueItem,
} from "@irexpro/types/eligibility";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { Alert, Badge, Button, Card, EmptyState } from "@/components/ui";

const eligibilityApi = createEligibilityApi(api);

const DECISIONS: Array<{
  value: EligibilityReviewDecision;
  label: string;
  description: string;
}> = [
  {
    value: "APPROVED",
    label: "Approve eligibility",
    description:
      "Records an approval for this country and the currently active policy version.",
  },
  {
    value: "DENIED",
    label: "Deny eligibility",
    description:
      "Records a denial for this country and the currently active policy version.",
  },
];

export default function EligibilityReviewsPage() {
  const { hasAdminRole } = useAuth();
  const [queue, setQueue] = useState<EligibilityReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [decision, setDecision] = useState<EligibilityReviewDecision>("APPROVED");
  const [reasonCode, setReasonCode] = useState("MANUAL_REVIEW_COMPLETE");
  const [reviewerNote, setReviewerNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasAdminRole) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await eligibilityApi.listReviewQueue();
        if (!cancelled) setQueue(items);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load eligibility reviews.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAdminRole]);

  const selected = queue.find((item) => item.userId === selectedUserId) ?? null;
  const decisionMeta = DECISIONS.find((item) => item.value === decision) ?? DECISIONS[0];

  function selectReview(userId: string) {
    setSelectedUserId(userId);
    setDecision("APPROVED");
    setReasonCode("MANUAL_REVIEW_COMPLETE");
    setReviewerNote("");
    setConfirmed(false);
    setError(null);
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    const normalizedReason = reasonCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!normalizedReason) {
      setError("A review reason code is required.");
      return;
    }
    if (!confirmed) {
      setError("Confirm the reviewed eligibility decision before submitting it.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await eligibilityApi.reviewUser(selected.userId, {
        decision,
        reasonCode: normalizedReason,
        ...(reviewerNote.trim() ? { reviewerNote: reviewerNote.trim() } : {}),
      });
      setQueue((current) => current.filter((item) => item.userId !== selected.userId));
      setSelectedUserId(null);
      setReviewerNote("");
      setConfirmed(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to record the eligibility review.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasAdminRole) {
    return (
      <>
        <h1>Access denied</h1>
        <Card title="Insufficient permissions">
          <Alert variant="error">Your account does not have admin access.</Alert>
        </Card>
      </>
    );
  }

  return (
    <>
      <h1>Eligibility reviews</h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Review jurisdictions that are not explicitly classified by policy. Explicitly blocked
        jurisdictions cannot be overridden here, and every decision is recorded as immutable
        evidence.
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="admin-appeals-grid">
        <Card title={`Pending reviews (${queue.length})`}>
          {loading ? (
            <p className="muted">Loading eligibility reviews…</p>
          ) : queue.length === 0 ? (
            <EmptyState
              icon="✓"
              title="No pending eligibility reviews"
              description="Jurisdictions requiring manual review will appear here."
            />
          ) : (
            <div className="admin-appeals-list">
              {queue.map((item) => {
                const isSelected = item.userId === selectedUserId;
                return (
                  <button
                    key={item.userId}
                    type="button"
                    className={`admin-appeal-card${isSelected ? " admin-appeal-card--selected" : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => selectReview(item.userId)}
                  >
                    <span className="admin-appeal-card__contact break-long">
                      {item.email ?? item.userId}
                    </span>
                    <span className="admin-appeal-card__meta">
                      <Badge variant="warning">Review required</Badge>
                      <span>{item.countryCode}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Compliance decision" className="admin-appeals-detail-card">
          {!selected ? (
            <EmptyState
              icon="📋"
              title="Select a review"
              description="Choose a pending jurisdiction review to inspect its policy context."
            />
          ) : (
            <div className="admin-appeals-detail">
              <div>
                <p className="text-sm muted">Account</p>
                <p className="break-long">{selected.email ?? selected.userId}</p>
              </div>

              <div className="admin-appeals-detail__reason">
                <p className="text-sm muted">Policy context</p>
                <p>
                  Country <strong>{selected.countryCode}</strong> · Policy{" "}
                  <strong>{selected.policyVersion}</strong>
                </p>
                <p className="text-sm muted" style={{ marginTop: "0.35rem" }}>
                  Current reason: {selected.reasonCode}
                </p>
              </div>

              <form onSubmit={submitReview}>
                <div className="input-group">
                  <label className="input-label" htmlFor="eligibility-decision">
                    Review outcome
                  </label>
                  <select
                    id="eligibility-decision"
                    className="input"
                    value={decision}
                    disabled={submitting}
                    onChange={(event) => {
                      setDecision(event.target.value as EligibilityReviewDecision);
                      setConfirmed(false);
                    }}
                  >
                    {DECISIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-sm muted admin-account-access__action-help">
                    {decisionMeta.description}
                  </p>
                </div>

                <div className="input-group">
                  <label className="input-label" htmlFor="eligibility-reason-code">
                    Reason code
                  </label>
                  <input
                    id="eligibility-reason-code"
                    className="input"
                    value={reasonCode}
                    onChange={(event) => {
                      setReasonCode(event.target.value);
                      setConfirmed(false);
                    }}
                    disabled={submitting}
                    maxLength={64}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label" htmlFor="eligibility-review-note">
                    Reviewer note (optional)
                  </label>
                  <textarea
                    id="eligibility-review-note"
                    className="input admin-account-access__textarea"
                    value={reviewerNote}
                    onChange={(event) => setReviewerNote(event.target.value)}
                    disabled={submitting}
                    maxLength={2000}
                    rows={3}
                  />
                </div>

                <label className="admin-account-access__confirmation">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={submitting}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>I confirm this reviewed jurisdiction decision.</span>
                </label>

                <div className="admin-account-access__actions">
                  <Button
                    type="submit"
                    variant={decision === "APPROVED" ? "primary" : "danger"}
                    loading={submitting}
                  >
                    {submitting ? "Saving…" : decisionMeta.label}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
