"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Alert, Badge, Button } from "@/components/ui";
import {
  formatEnumLabel,
  type AccountStatusAction,
  type UserStatus,
} from "@irexpro/types";

interface ManagedUser {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  profile: {
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface AccountAccessControlsProps {
  user: ManagedUser;
  onStatusChanged: (userId: string, status: UserStatus) => void;
}

const ACTIONS: Array<{
  value: AccountStatusAction;
  label: string;
  description: string;
}> = [
  {
    value: "DEACTIVATE",
    label: "Deactivate account",
    description:
      "Blocks sign-in while preserving the account for an access review.",
  },
  {
    value: "PERMANENTLY_LOCK",
    label: "Permanently lock account",
    description:
      "Blocks sign-in until an approved review decision changes the account state.",
  },
  {
    value: "DELETE",
    label: "Soft-delete account",
    description:
      "Closes the account while preserving the record and audit history.",
  },
];

function availableActions(status: string) {
  if (status === "CLOSED") return [];
  if (status === "PERMANENTLY_LOCKED")
    return ACTIONS.filter((item) => item.value === "DELETE");
  if (status === "SUSPENDED") {
    return ACTIONS.filter((item) => item.value !== "DEACTIVATE");
  }
  return ACTIONS;
}

function badgeVariant(status: string): "success" | "warning" | "error" {
  if (status === "ACTIVE") return "success";
  if (status === "PENDING_VERIFICATION") return "warning";
  return "error";
}

/**
 * Admin-only account-access controls. The API remains the authorization and
 * audit boundary; this component provides an explicit reason and confirmation
 * step before a privileged operator submits a state change.
 */
export default function AdminAccountAccessControls({
  user,
  onStatusChanged,
}: AccountAccessControlsProps) {
  const allowedActions = availableActions(user.status);
  const [action, setAction] = useState<AccountStatusAction>("DEACTIVATE");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (allowedActions.length === 0) {
    return (
      <section
        className="admin-account-access"
        aria-labelledby="account-access-heading"
      >
        <div className="admin-account-access__header">
          <div>
            <h3 id="account-access-heading">Account access</h3>
            <p className="text-sm muted">This account is already closed.</p>
          </div>
          <Badge variant="error">Closed</Badge>
        </div>
        <Alert variant="info">
          The account record remains available for audit and may only change
          through a reviewed account-access request.
        </Alert>
      </section>
    );
  }

  const selectedAction =
    allowedActions.find((item) => item.value === action) ?? allowedActions[0];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setError("Provide a concise reason of at least 5 characters.");
      return;
    }
    if (!confirmed) {
      setError(
        "Confirm that you intend to change this account’s access state.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.updateAccountStatus(user.id, {
        action: selectedAction.value,
        reason: trimmedReason,
      });
      onStatusChanged(user.id, result.status);
      setReason("");
      setConfirmed(false);
      setSuccess(
        `Account status updated to ${formatEnumLabel(result.status)}.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update this account’s access state.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="admin-account-access"
      aria-labelledby="account-access-heading"
    >
      <div className="admin-account-access__header">
        <div>
          <h3 id="account-access-heading">Account access</h3>
          <p className="text-sm muted">
            Changes are recorded in the audit log.
          </p>
        </div>
        <Badge variant={badgeVariant(user.status)}>
          {formatEnumLabel(user.status)}
        </Badge>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label className="input-label" htmlFor={`account-action-${user.id}`}>
            Access action
          </label>
          <select
            id={`account-action-${user.id}`}
            className="input"
            value={selectedAction.value}
            disabled={submitting}
            onChange={(event) => {
              setAction(event.target.value as AccountStatusAction);
              setConfirmed(false);
              setError(null);
              setSuccess(null);
            }}
          >
            {allowedActions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="text-sm muted admin-account-access__action-help">
            {selectedAction.description}
          </p>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor={`account-reason-${user.id}`}>
            Reason for this action
          </label>
          <textarea
            id={`account-reason-${user.id}`}
            className="input admin-account-access__textarea"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={submitting}
            minLength={5}
            maxLength={1000}
            rows={3}
            required
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
            I confirm that I intend to {selectedAction.label.toLowerCase()} for
            this user.
          </span>
        </label>

        <div className="admin-account-access__actions">
          <Button
            type="submit"
            variant={
              selectedAction.value === "DEACTIVATE" ? "secondary" : "danger"
            }
            loading={submitting}
          >
            {submitting ? "Saving…" : selectedAction.label}
          </Button>
        </div>
      </form>
    </section>
  );
}
