"use client";

import { useState, type FormEvent } from "react";
import { dayOf } from "@/components/SchemeForm";
import { Badge, Button, DateInput, Field, Input, Modal, Textarea, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { n, today } from "@/lib/format";
import type { Campaign, CampaignStatus } from "@/lib/types";

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: "green" | "amber" | "slate" | "red" }> = {
  RUNNING: { label: "Running", tone: "green" },
  UPCOMING: { label: "Upcoming", tone: "amber" },
  ENDED: { label: "Ended", tone: "slate" },
  STOPPED: { label: "Stopped", tone: "red" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={CAMPAIGN_STATUS[status].tone}>{CAMPAIGN_STATUS[status].label}</Badge>;
}

/** Add or edit a campaign: name, dates, budget and notes; its offers are added on the campaign's page */
export function CampaignForm({ campaign, onClose, onSaved }: { campaign: Campaign | null; onClose: () => void; onSaved: (c: Campaign) => void }) {
  const toast = useToast();
  const [name, setName] = useState(campaign?.name ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [from, setFrom] = useState(campaign ? dayOf(campaign.from) : today());
  const [to, setTo] = useState(campaign?.to ? dayOf(campaign.to) : "");
  const [budget, setBudget] = useState(campaign?.budget != null ? String(n(campaign.budget)) : "");
  const [notes, setNotes] = useState(campaign?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Enter the campaign name");
    if (to && to < from) return toast.error("End date is before the start date");
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        from,
        to: to || undefined,
        budget: budget === "" ? null : Number(budget),
        isActive: campaign?.isActive ?? true,
        notes: notes.trim() || undefined,
      };
      const saved = campaign ? await api.patch<Campaign>(`/campaigns/${campaign.id}`, body) : await api.post<Campaign>("/campaigns", body);
      toast.success(campaign ? `${saved.code} updated` : `Campaign ${saved.code} created — now add its offers`);
      onSaved(saved);
    } catch (err) {
      toast.error(errMsg(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={campaign ? `Edit ${campaign.code}` : "New Campaign"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="campaign-form" loading={saving}>
            {campaign ? "Save" : "Create Campaign"}
          </Button>
        </>
      }
    >
      <form id="campaign-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Campaign Name" required className="sm:col-span-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus placeholder="e.g. Kharif 2026 Seed Drive" />
        </Field>
        <Field label="Starts" required>
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="Ends" hint="Blank = runs until stopped">
          <DateInput value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Budget (₹)" hint="Planned discount / free goods spend">
          <Input type="number" min="0" step="1" value={budget} onChange={(e) => setBudget(e.target.value)} className="num" placeholder="Optional" />
        </Field>
        <Field label="Description" className="sm:col-span-3">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="What it promotes, to whom, where…" />
        </Field>
        <Field label="Notes" className="sm:col-span-3">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Company circular no., conditions…" />
        </Field>
        <p className="text-xs text-slate-500 sm:col-span-3">
          The campaign&apos;s offers (schemes) apply at the counter only between these dates, and stop if the campaign is stopped.
        </p>
      </form>
    </Modal>
  );
}
