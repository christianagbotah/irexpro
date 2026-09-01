"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createEligibilityApi } from "@irexpro/api-client/eligibility";
import type { KycReviewDecision, KycReviewQueueItem } from "@irexpro/types/eligibility";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { Alert, Badge, Button, Card, EmptyState } from "@/components/ui";

const eligibilityApi = createEligibilityApi(api);

const DECISIONS: Array<{
  value: KycReviewDecision;
  label: string;
  description: string;
}> = [
  {
    value: "APPROVED",
    label: "Approve KYC",
    description: "Records that the approved compliance verification process was completed successfully.",
  },
  {
    value: "REJECTED",
    label: "Reject KYC",
    description: "Records that the approved compliance verification process did not establish eligibility.",
  },
];

export default function KycReviewsPage() {
  const { hasAdminRole } = useAuth();
  const [queue, setQueue] = useState<KycReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [decision, setDecision] = useState<KycReviewDecision>("APPROVED");
  const [reasonCode, setReasonCode] = useState("MANUAL_IDENTITY_VERIFIED");
  const [reviewerNote, setReviewerNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasAdminRole) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await eligibilityApi.listKycReviewQueue();
        if (!cancelled) setQueue(items);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error ? requestError.message : "Unable to load KYC reviews.",
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
    setReasonCode("MANUAL_IDENTITY_VERIFIED");
    setReviewerNote("");
    setConfirmed(false);
    setError(null);
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    const normalizedReason = reasonCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!normalizedReason) {
      setError("A KYC review reason code is required.");
      return;
    }
    if (!confirmed) {
      setError("Confirm that the approved compliance verification process was completed.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await eligibilityApi.reviewKyc(selected.userId, {
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
        requestError instanceof Error ? requestError.message : "Unable to record the KYC review.",
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
      <h1>KYC reviews</h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Record the outcome of the approved identity-verification process for adult accounts. This
        workspace records the result; it is not the identity-verification process itself. Under-18
        accounts are excluded by the server and cannot be approved here.
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="admin-appeals-grid">
        <Card title={`Pending KYC reviews (${queue.length})`}>
          {loading ? (
            <p className="muted">Loading KYC reviews…</p>
          ) : queue.length === 0 ? (
            <EmptyState
              icon="✓"
              title="No pending KYC reviews"
              description="Adult accounts awaiting identity review will appear here."
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
                      <Badge variant="warning">{item.kycStatus}</Badge>
                      <span>{item.countryCode ?? "No country"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Identity review decision" className="admin-appeals-detail-card">
          {!selected ? (
            <EmptyState
              icon="🪪"
              title="Select a KYC review"
              description="Choose an adult account awaiting compliance review."
            />
          ) : (
            <div className="admin-appeals-detail">
              <div>
                <p className="text-sm muted">Account</p>
                <p className="break-long">{selected.email ?? selected.userId}</p>
              </div>

              <div className="admin-appeals-detail__reason">
                <p className="text-sm muted">Review context</p>
                <p>
                  DOB <strong>{selected.dateOfBirth}</strong> · Age status{" "}
                  <strong>{selected.ageStatus}</strong>
                </p>
                <p className="text-sm muted" style={{ marginTop: "0.35rem" }}>
                  Current state: {selected.kycStatus} · {selected.reasonCode}
                </p>
              </div>

              <Alert variant="info">
                Verify identity using the organisation&apos;s approved compliance process before
                recording a decision here. No identity documents are uploaded through this screen.
              </Alert>

              <form onSubmit={submitReview}>
                <div className="input-group">
                  <label className="input-label" htmlFor="kyc-decision">
                    Review outcome
                  </label>
                  <select
                    id="kyc-decision"
                    className="input"
                    value={decision}
                    disabled={submitting}
                    onChange={(event) => {
                      const next = event.target.value as KycReviewDecision;
                      setDecision(next);
                      setReasonCode(next === "APPROVED" ? "MANUAL_IDENTITY_VERIFIED" : "IDENTITY_NOT_VERIFIED");
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
                  <label className="input-label" htmlFor="kyc-reason-code">
                    Reason code
                  </label>
                  <input
                    id="kyc-reason-code"
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
                  <label className="input-label" htmlFor="kyc-review-note">
                    Reviewer note (optional)
                  </label>
                  <textarea
                    id="kyc-review-note"
                    className="input admin-account-access__textarea"
                    value={reviewerNote}
                    onChange={(event) => setReviewerNote(event.target.value)}
                    disabled={submitting}
                    maxLength={1000}
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
                  <span>
                    I confirm identity verification was completed using the approved compliance process.
                  </span>
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
