"use client";

import { Info as InfoIcon, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { Badge, Button, Card, Checkbox, ErrorBox, Input, PageHeader, Spinner, Table, Td, Th, errMsg, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { inr0 } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import { hasPerm } from "@/lib/permissions";
import { ROLE_LEVELS, type ApprovalConfig, type RoleLevel, type User } from "@/lib/types";

interface BandRow {
  key: number;
  upTo: string; // "" on the open-ended last band
  /** Highest level the band goes up to: L2 = L1 → L2, L3 = L1 → L2 → L3 */
  level: RoleLevel;
}

/** The chain every band takes the first steps of (same as the API) */
const LEVEL_INFO: Record<RoleLevel, { title: string; who: string }> = {
  L1: { title: "L1 Approval", who: "Staff on an L1 role or above" },
  L2: {
    title: "Manager Approval (L2)",
    who: "Managers and heads (L2 roles) and above",
  },
  L3: { title: "Admin Approval (L3)", who: "Administrators and L3 roles" },
};

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
  const { can } = useAuth();
  // Who sits at each level is shown when the user list may be read
  const { data: users } = useApi<User[]>(can("admin.users") ? "/users" : null);
  const [version, setVersion] = useState(0);

  return (
    <>
      <PageHeader title="Approval Rules" subtitle="How far up the L1 → L2 → L3 chain a purchase order and its goods inward must go, by value" />
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !config ? (
        <Spinner page />
      ) : (
        <RulesEditor
          key={`${config.bands.map((b) => b.id).join()}#${version}`}
          config={config}
          users={users ?? null}
          onSaved={setData}
          onDiscard={() => setVersion((v) => v + 1)}
        />
      )}
    </>
  );
}

const rank = (l: RoleLevel) => ROLE_LEVELS.indexOf(l) + 1;

/** A user's approval level, as the API works it out: administrators L3, else their role's level (built-in managers L2) */
function levelOfUser(u: User): number {
  if (u.role === "ADMIN") return 3;
  if (u.roleTemplate?.level) return rank(u.roleTemplate.level);
  return u.role === "MANAGER" ? 2 : 1;
}

function toRows(config: ApprovalConfig): BandRow[] {
  const sorted = [...config.bands].sort((a, b) => (a.upTo === null ? 1 : b.upTo === null ? -1 : a.upTo - b.upTo));
  const rows: BandRow[] = sorted.map((b) => ({
    key: ++seq,
    upTo: b.upTo === null ? "" : String(b.upTo),
    level: b.level ?? "L1",
  }));
  if (!rows.length || sorted[sorted.length - 1].upTo !== null)
    rows.push({
      key: ++seq,
      upTo: "",
      level: rows[rows.length - 1]?.level ?? "L3",
    });
  return rows;
}

const snapshot = (bands: BandRow[]) => JSON.stringify(bands.map((b) => [b.upTo, b.level]));

function RulesEditor({
  config,
  users,
  onSaved,
  onDiscard,
}: {
  config: ApprovalConfig;
  users: User[] | null;
  onSaved: (c: ApprovalConfig) => void;
  onDiscard: () => void;
}) {
  const canSave = useAuth().can("approval_rules.edit");
  const toast = useToast();
  const [initial] = useState(() => toRows(config));
  const [bands, setBands] = useState<BandRow[]>(initial);
  const [saved, setSaved] = useState(() => snapshot(initial));
  const [saving, setSaving] = useState(false);
  const dirty = snapshot(bands) !== saved;

  const updateBand = (key: number, patch: Partial<BandRow>) => setBands((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const addBand = () =>
    setBands((bs) => {
      const limits = bs.slice(0, -1);
      const prev = Number(limits[limits.length - 1]?.upTo) || 0;
      const fresh: BandRow = {
        key: ++seq,
        upTo: prev ? String(prev * 2) : "200000",
        level: limits[limits.length - 1]?.level ?? "L1",
      };
      return [...limits, fresh, bs[bs.length - 1]];
    });
  const removeBand = (key: number) => setBands((bs) => bs.filter((b) => b.key !== key));
  // Levels tick cumulatively: L2 ticks L1 too, L3 ticks L1 and L2; unticking one clears those above. L1 always stays
  const toggleLevel = (b: BandRow, l: RoleLevel, on: boolean) => {
    const i = ROLE_LEVELS.indexOf(l);
    updateBand(b.key, { level: on ? l : ROLE_LEVELS[Math.max(i - 1, 0)] });
  };
  const levelOn = (b: BandRow, l: RoleLevel) => rank(l) <= rank(b.level);

  const routeText = (level: RoleLevel) =>
    ROLE_LEVELS.slice(0, rank(level))
      .map((l) => LEVEL_INFO[l].title)
      .join(" → ");

  const preview = bands.map((b, i) => {
    const prev = i > 0 ? Number(bands[i - 1].upTo) : 0;
    const label =
      bands.length === 1
        ? "Any value"
        : i === bands.length - 1
          ? `Above ${inr0(prev)}`
          : i === 0
            ? `Up to ${inr0(b.upTo)}`
            : `${inr0(prev)} – ${inr0(b.upTo)}`;
    return { key: b.key, label, route: routeText(b.level) };
  });

  // Who may act at each level: administrators, and users with the PO "Approve" permission at that level or higher
  const approvers = (l: RoleLevel) =>
    (users ?? []).filter((u) => u.isActive && (u.role === "ADMIN" || hasPerm(u, "purchases.approve")) && levelOfUser(u) >= rank(l));

  function validate() {
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
        bands: bands.map((b, i) => ({
          upTo: i === bands.length - 1 ? null : Number(b.upTo),
          level: b.level,
        })),
      });
      setSaved(snapshot(bands));
      toast.success("Approval rules saved");
      onSaved(res);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p>
            Purchase orders and their goods inward go up the same chain: <b className="font-medium">L1 → Manager (L2) → Admin (L3)</b>. The PO&apos;s
            value (incl. GST) picks its band, and the band decides how far up it goes. Anyone at a step&apos;s level or higher may approve it.
          </p>
          <p className="text-sky-700">
            Changes apply to POs submitted and goods inward entered from now on; anything already waiting keeps the chain it started with.
          </p>
        </div>
      </div>

      <Card title="Approval Levels" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <Th className="w-16">Level</Th>
              <Th>Step</Th>
              <Th>Who Can Approve</Th>
            </tr>
          </thead>
          <tbody>
            {ROLE_LEVELS.map((l) => {
              const list = approvers(l);
              return (
                <tr key={l}>
                  <Td>
                    <Badge tone={l === "L3" ? "violet" : l === "L2" ? "blue" : "slate"}>{l}</Badge>
                  </Td>
                  <Td className="font-medium text-slate-800">{LEVEL_INFO[l].title}</Td>
                  <Td>
                    <p className="text-sm text-slate-700">{LEVEL_INFO[l].who}</p>
                    {users && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {list.length ? list.map((u) => u.name).join(", ") : "Nobody yet — give someone an approving role at this level"}
                      </p>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          A user&apos;s level comes from their role (set on the Users → Role tab); they also need the Purchase Orders &ldquo;Approve&rdquo;
          permission. Administrators can approve at every level.
        </p>
      </Card>

      <Card
        title="Value Bands"
        bodyClassName="p-0"
        actions={
          <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={addBand}>
            Add Band
          </Button>
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>PO Value (Incl. GST)</Th>
              {ROLE_LEVELS.map((l) => (
                <Th key={l} className="w-14 text-center">
                  {l}
                </Th>
              ))}
              <Th>Approval Chain</Th>
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
                  {ROLE_LEVELS.map((l) => (
                    <Td key={l} className="text-center">
                      <span className="inline-flex">
                        <Checkbox
                          checked={levelOn(b, l)}
                          onChange={(on) => toggleLevel(b, l, on)}
                          disabled={l === "L1"}
                          title={l === "L1" ? "Every band needs at least L1" : undefined}
                          aria-label={`${l} for band ${i + 1}`}
                        />
                      </span>
                    </Td>
                  ))}
                  <Td className="text-slate-600">{routeText(b.level)}</Td>
                  <Td right>
                    {!last && (
                      <button
                        type="button"
                        title="Remove Band"
                        aria-label="Remove Band"
                        onClick={() => removeBand(b.key)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card title="In Plain Words">
        <ul className="space-y-1 text-sm text-slate-700">
          {preview.map((p) => (
            <li key={p.key}>
              <span className="font-medium">{p.label}:</span> {p.route}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          The same chain approves the PO when it is submitted and the goods inward when it is received; the GRN is posted (stock, invoice) only after
          the last approval.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && <span className="mr-auto text-sm text-amber-700">You have unsaved changes</span>}
        <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={onDiscard} disabled={!dirty || saving}>
          Discard
        </Button>
        <Button
          icon={<Save className="size-4" />}
          onClick={save}
          loading={saving}
          disabled={!dirty || !canSave}
          title={canSave ? undefined : "You can view these rules but not change them"}
        >
          Save Rules
        </Button>
      </div>
    </div>
  );
}
