"use client";

import { ArrowDown, ArrowUp, Info as InfoIcon, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { Button, Card, ErrorBox, Input, PageHeader, Select, Spinner, Table, Td, Th, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { inr0 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { ApprovalConfig, User } from "@/lib/types";

interface StepRow {
  key: number;
  title: string;
  approverId: string;
}

interface BandRow {
  key: number;
  upTo: string; // "" on the open-ended last band
  steps: number;
}

let seq = 0;

export default function ApprovalRulesPage() {
  return (
    <RequirePerm perms={["admin.approval_rules"]}>
      <ApprovalRules />
    </RequirePerm>
  );
}

function ApprovalRules() {
  const { data: config, error, reload, setData } = useApi<ApprovalConfig>("/approval-rules");
  const { data: users, error: usersError } = useApi<User[]>("/users");
  const [version, setVersion] = useState(0);

  return (
    <>
      <PageHeader
        title="PO approval rules"
        subtitle="Who approves purchase orders, and how many approvals each order value needs"
      />
      {error || usersError ? (
        <ErrorBox message={error ?? usersError ?? ""} onRetry={reload} />
      ) : !config || !users ? (
        <Spinner page />
      ) : (
        <RulesEditor
          key={`${config.steps.map((s) => s.id).join()}#${version}`}
          config={config}
          users={users}
          onSaved={setData}
          onDiscard={() => setVersion((v) => v + 1)}
        />
      )}
    </>
  );
}

function toRows(config: ApprovalConfig) {
  const steps: StepRow[] = config.steps.map((s) => ({ key: ++seq, title: s.title, approverId: s.approverId ?? "" }));
  const sorted = [...config.bands].sort((a, b) => (a.upTo === null ? 1 : b.upTo === null ? -1 : a.upTo - b.upTo));
  const bands: BandRow[] = sorted.map((b) => ({ key: ++seq, upTo: b.upTo === null ? "" : String(b.upTo), steps: b.steps }));
  if (!bands.length || sorted[sorted.length - 1].upTo !== null) {
    bands.push({ key: ++seq, upTo: "", steps: Math.max(1, bands[bands.length - 1]?.steps ?? steps.length) });
  }
  return { steps, bands };
}

const snapshot = (steps: StepRow[], bands: BandRow[]) =>
  JSON.stringify([steps.map((s) => [s.title.trim(), s.approverId]), bands.map((b) => [b.upTo, b.steps])]);

function RulesEditor({
  config,
  users,
  onSaved,
  onDiscard,
}: {
  config: ApprovalConfig;
  users: User[];
  onSaved: (c: ApprovalConfig) => void;
  onDiscard: () => void;
}) {
  const toast = useToast();
  const [initial] = useState(() => toRows(config));
  const [steps, setSteps] = useState<StepRow[]>(initial.steps);
  const [bands, setBands] = useState<BandRow[]>(initial.bands);
  const [saved, setSaved] = useState(() => snapshot(initial.steps, initial.bands));
  const [saving, setSaving] = useState(false);

  const dirty = snapshot(steps, bands) !== saved;
  const userName = (id: string) => users.find((u) => u.id === id)?.name;

  // ── steps ──
  const updateStep = (key: number, patch: Partial<StepRow>) => setSteps((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((ss) => {
      const next = [...ss];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  const addStep = () => setSteps((ss) => [...ss, { key: ++seq, title: "", approverId: "" }]);
  const removeStep = (key: number) => {
    const left = steps.length - 1;
    setSteps((ss) => ss.filter((s) => s.key !== key));
    setBands((bs) => bs.map((b) => ({ ...b, steps: Math.min(b.steps, Math.max(left, 1)) })));
  };

  // ── bands ──
  const updateBand = (key: number, patch: Partial<BandRow>) => setBands((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const addBand = () =>
    setBands((bs) => {
      const limits = bs.slice(0, -1);
      const prev = Number(limits[limits.length - 1]?.upTo) || 0;
      const fresh: BandRow = {
        key: ++seq,
        upTo: prev ? String(prev * 5) : "200000",
        steps: Math.min(limits.length + 1, steps.length),
      };
      return [...limits, fresh, bs[bs.length - 1]];
    });
  const removeBand = (key: number) => setBands((bs) => bs.filter((b) => b.key !== key));

  const routeText = (count: number) =>
    steps
      .slice(0, Math.max(1, Math.min(count, steps.length)))
      .map((s) => s.title.trim() || "Untitled step")
      .join(" → ");

  const preview =
    bands.length === 1
      ? `Any value: ${routeText(bands[0].steps)}`
      : bands
          .map((b, i) => (i === bands.length - 1 ? `Above: ${routeText(b.steps)}` : `Up to ${inr0(b.upTo)}: ${routeText(b.steps)}`))
          .join(" · ");

  function validate() {
    if (!steps.length) return "Add at least one approval step";
    const blank = steps.findIndex((s) => !s.title.trim());
    if (blank >= 0) return `Give step ${blank + 1} a title`;
    let prev = 0;
    for (let i = 0; i < bands.length - 1; i++) {
      const v = Number(bands[i].upTo);
      if (!(v > 0)) return `Enter the upper limit for value band ${i + 1}`;
      if (v <= prev) return "Value bands must go up in order — each limit higher than the one above it";
      prev = v;
    }
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) return toast.error(problem);
    setSaving(true);
    try {
      const res = await api.put<ApprovalConfig>("/approval-rules", {
        steps: steps.map((s) => ({ title: s.title.trim(), approverId: s.approverId || null })),
        bands: bands.map((b, i) => ({
          upTo: i === bands.length - 1 ? null : Number(b.upTo),
          steps: Math.max(1, Math.min(b.steps, steps.length)),
        })),
      });
      setSaved(snapshot(steps, bands));
      toast.success("Approval rules saved");
      onSaved(res);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  const activeUsers = users.filter((u) => u.isActive);

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p>
            Every PO goes through the first steps of this chain in order — the value bands decide how many. Admins can approve at any
            level, and a step with no assigned approver can be approved by any manager.
          </p>
          <p className="text-sky-700">
            Changes apply straight away: POs already waiting keep the number of approvals they need, but each step goes to whoever is
            assigned to it now.
          </p>
        </div>
      </div>

      <Card
        title="Approval chain"
        bodyClassName="p-0"
        actions={
          <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={addStep}>
            Add step
          </Button>
        }
      >
        <Table>
          <thead>
            <tr>
              <Th className="w-12">Step</Th>
              <Th>Title</Th>
              <Th>Approver</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => {
              const assigned = users.find((u) => u.id === s.approverId);
              return (
                <tr key={s.key}>
                  <Td className="num font-medium text-slate-500">{i + 1}</Td>
                  <Td>
                    <Input
                      className="min-w-48"
                      value={s.title}
                      onChange={(e) => updateStep(s.key, { title: e.target.value })}
                      placeholder="e.g. Store Manager"
                      aria-label={`Title of step ${i + 1}`}
                    />
                  </Td>
                  <Td>
                    <Select
                      className="min-w-56"
                      value={s.approverId}
                      onChange={(e) => updateStep(s.key, { approverId: e.target.value })}
                      aria-label={`Approver for step ${i + 1}`}
                    >
                      <option value="">Any manager (unassigned)</option>
                      {activeUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} · {u.role.charAt(0) + u.role.slice(1).toLowerCase()}
                        </option>
                      ))}
                      {assigned && !assigned.isActive && <option value={assigned.id}>{assigned.name} (inactive)</option>}
                    </Select>
                    {assigned && !assigned.isActive && (
                      <p className="mt-1 text-xs text-amber-700">This user is inactive — pick someone who can sign in.</p>
                    )}
                  </Td>
                  <Td right>
                    <div className="flex justify-end gap-0.5">
                      <IconBtn label="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                        <ArrowUp className="size-4" />
                      </IconBtn>
                      <IconBtn label="Move down" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}>
                        <ArrowDown className="size-4" />
                      </IconBtn>
                      <IconBtn label="Remove step" danger disabled={steps.length <= 1} onClick={() => removeStep(s.key)}>
                        <Trash2 className="size-4" />
                      </IconBtn>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card
        title="Value bands"
        bodyClassName="p-0"
        actions={
          <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={addBand}>
            Add band
          </Button>
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>PO value (incl. GST)</Th>
              <Th>Approvals needed</Th>
              <Th>Route</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {bands.map((b, i) => {
              const last = i === bands.length - 1;
              return (
                <tr key={b.key}>
                  <Td>
                    {last ? (
                      <span className="font-medium text-slate-700">{bands.length === 1 ? "Any value" : "Above that"}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-slate-500">Up to ₹</span>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          className="num h-8 w-36 text-right"
                          value={b.upTo}
                          onChange={(e) => updateBand(b.key, { upTo: e.target.value })}
                          aria-label={`Upper limit of band ${i + 1}`}
                        />
                      </div>
                    )}
                  </Td>
                  <Td>
                    <Select
                      className="h-8 w-40"
                      value={Math.min(b.steps, steps.length)}
                      onChange={(e) => updateBand(b.key, { steps: Number(e.target.value) })}
                      aria-label={`Approvals needed for band ${i + 1}`}
                    >
                      {steps.map((_, k) => (
                        <option key={k} value={k + 1}>
                          {k + 1} step{k ? "s" : ""}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td className="text-slate-600">{routeText(b.steps)}</Td>
                  <Td right>
                    {!last && (
                      <IconBtn label="Remove band" danger onClick={() => removeBand(b.key)}>
                        <Trash2 className="size-4" />
                      </IconBtn>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card title="In plain words">
        <p className="text-sm text-slate-700">{preview}</p>
        <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
          {steps.map((s, i) => (
            <li key={s.key}>
              {s.title.trim() || `Step ${i + 1}`}: {s.approverId ? (userName(s.approverId) ?? "unknown user") : "any manager"}
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="mr-auto text-sm text-amber-700">You have unsaved changes</span>}
        <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={onDiscard} disabled={!dirty || saving}>
          Discard
        </Button>
        <Button icon={<Save className="size-4" />} onClick={save} loading={saving} disabled={!dirty}>
          Save rules
        </Button>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={
        "rounded-md p-1.5 text-slate-400 disabled:cursor-not-allowed disabled:opacity-30 " +
        (danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100 hover:text-slate-700")
      }
    >
      {children}
    </button>
  );
}
