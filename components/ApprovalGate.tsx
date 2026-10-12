"use client";

import { KeyRound, Send, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ApprovalKind, ApprovalRequest } from "@/lib/types";
import { Button, Field, Input, Modal, Textarea, cx, errMsg, useToast } from "./ui";

export interface ApprovalNeed {
  kind: ApprovalKind;
  amount: number;
  message: string;
  details?: Record<string, unknown>;
}

/** Reads the server's "needs manager approval" error (403 with code APPROVAL_REQUIRED) */
export function approvalNeeded(e: unknown, details?: Record<string, unknown>): ApprovalNeed | null {
  if (!(e instanceof ApiError) || e.data?.code !== "APPROVAL_REQUIRED") return null;
  return { kind: e.data.kind as ApprovalKind, amount: Number(e.data.amount) || 0, message: e.message, details };
}

/**
 * Manager sign-off for an action above the user's limit: a manager types their PIN here, or the
 * request goes to the approvals inbox and this dialog waits for the decision.
 */
export function ApprovalGate({ need, onApproved, onClose }: { need: ApprovalNeed | null; onApproved: (approvalId: string, by: string) => void; onClose: () => void }) {
  return need ? <GateBody need={need} onApproved={onApproved} onClose={onClose} /> : null;
}

function GateBody({ need, onApproved, onClose }: { need: ApprovalNeed; onApproved: (approvalId: string, by: string) => void; onClose: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"pin" | "ask">("pin");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Waiting for the inbox: poll until a manager decides
  useEffect(() => {
    if (!request || request.status !== "PENDING") return;
    timer.current = setInterval(async () => {
      try {
        const r = await api.get<ApprovalRequest>(`/approvals/${request.id}`);
        if (r.status !== "PENDING") {
          setRequest(r);
          if (r.status === "APPROVED") onApproved(r.id, r.decidedBy?.name ?? "manager");
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [request, onApproved]);

  async function withPin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) return toast.error("PIN is 4 to 6 digits");
    setBusy(true);
    try {
      const r = await api.post<{ id: string; approvedBy: string }>("/approvals/pin", { pin, kind: need.kind, amount: need.amount, details: need.details, reason: reason.trim() || undefined });
      onApproved(r.id, r.approvedBy);
    } catch (err) {
      toast.error(errMsg(err));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<ApprovalRequest>("/approvals", { kind: need.kind, amount: need.amount, details: need.details, reason: reason.trim() || undefined });
      setRequest(r);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Manager approval needed"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {!request && (
            <Button type="submit" form={mode === "pin" ? "gate-pin" : "gate-ask"} loading={busy} icon={mode === "pin" ? <KeyRound className="size-4" /> : <Send className="size-4" />}>
              {mode === "pin" ? "Approve with PIN" : "Send request"}
            </Button>
          )}
        </>
      }
    >
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{need.message}</p>
      {request ? (
        <div className="mt-3 text-sm">
          {request.status === "PENDING" ? (
            <p className="flex items-center gap-2 text-slate-600">
              <span className="size-2 animate-pulse rounded-full bg-amber-500" /> Waiting for a manager to decide in the approvals inbox… this closes itself once approved.
            </p>
          ) : request.status === "REJECTED" ? (
            <p className="text-red-700">
              Rejected by {request.decidedBy?.name}
              {request.note ? ` — ${request.note}` : ""}.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-brand-700">
              <ShieldCheck className="size-4" /> Approved by {request.decidedBy?.name}.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(["pin", "ask"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cx("flex-1 rounded-md px-3 py-1.5 font-medium", mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
              >
                {m === "pin" ? "Manager is here (PIN)" : "Ask a manager"}
              </button>
            ))}
          </div>
          {mode === "pin" ? (
            <form id="gate-pin" onSubmit={withPin} className="mt-3 space-y-3">
              <Field label="Manager PIN" required>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  className="num text-center text-lg tracking-[0.5em]"
                />
              </Field>
              <Field label="Reason (optional)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Regular customer, bulk purchase" />
              </Field>
            </form>
          ) : (
            <form id="gate-ask" onSubmit={ask} className="mt-3 space-y-3">
              <Field label="Reason for the manager" required>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus placeholder="e.g. Farmer buying 20 bags, asks 6% off" />
              </Field>
              <p className="text-xs text-slate-500">Managers get a notification; you can keep this open or come back later from Approvals.</p>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
