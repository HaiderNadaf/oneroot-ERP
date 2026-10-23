"use client";

import { ChevronDown, ChevronRight, MonitorSmartphone, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { Badge, Button, Card, EmptyRow, ErrorBox, Field, Input, LoadingRow, Modal, PageHeader, Pagination, Select, Table, Td, Th, errMsg, useToast } from "@/components/ui";
import { api, getDeviceId } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Permission } from "@/lib/permissions";
import type { AuditLog, Paged, User } from "@/lib/types";

const ENTITIES = ["Sale", "SaleReturn", "Purchase", "PurchaseOrder", "Payment", "Expense", "Product", "Customer", "Vendor", "User", "StoreSettings"];

const ENTITY_LABEL: Record<string, string> = {
  SaleReturn: "Sales Return",
  PurchaseOrder: "Purchase Order",
  StoreSettings: "Store Settings",
};

/** Record pages, and the permission needed to open each */
const ENTITY_HREF: Record<string, [string, Permission]> = {
  Sale: ["/sales", "sales.view"],
  Purchase: ["/purchases", "invoices.view"],
  PurchaseOrder: ["/purchase-orders", "purchases.view"],
  Product: ["/products", "products.view"],
  Customer: ["/customers", "customers.view"],
  Vendor: ["/vendors", "vendors.view"],
};

/** Device name, the start of its id (click to see only that device) and IP; full user agent on hover */
type DeviceActions = { onDevice: (d: { id: string; name: string }) => void; onRename: (log: AuditLog) => void };

/** The name given to the device (if any) over what the browser says it is: model · OS · browser */
function DeviceCell({ log, thisDevice, onDevice, onRename }: { log: AuditLog; thisDevice: string | null } & DeviceActions) {
  if (!log.deviceId && !log.deviceName && !log.ipAddress) return <span className="text-slate-400">—</span>;
  const name = log.deviceLabel || log.deviceName || "Unknown device";
  return (
    <div title={log.userAgent ?? undefined}>
      <p className="flex flex-wrap items-center gap-1.5 text-slate-900">
        <span className={log.deviceLabel ? "font-semibold" : undefined}>{name}</span>
        {log.deviceId && log.deviceId === thisDevice && <Badge tone="green">This device</Badge>}
        {log.deviceId && (
          <button
            type="button"
            onClick={() => onRename(log)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand-700"
            aria-label={log.deviceLabel ? `Rename ${log.deviceLabel}` : "Name this device"}
            title={log.deviceLabel ? "Rename this device" : "Name this device"}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </p>
      {log.deviceLabel && log.deviceName && <p className="text-xs text-slate-600">{log.deviceName}</p>}
      <p className="text-xs text-slate-500">
        {log.deviceId ? (
          <button
            type="button"
            onClick={() => onDevice({ id: log.deviceId!, name: `${name} · ${log.deviceId!.slice(0, 8)}` })}
            className="font-mono text-brand-700 hover:underline"
            title={`Show only activity from device ${log.deviceId}`}
          >
            ID {log.deviceId.slice(0, 8)}
          </button>
        ) : (
          <span>No device ID</span>
        )}
        {log.ipAddress && <span> · {log.ipAddress}</span>}
      </p>
    </div>
  );
}

const ACTION_TONE: Record<string, "green" | "blue" | "red" | "amber" | "slate" | "violet"> = {
  CREATE: "green",
  UPDATE: "blue",
  DELETE: "red",
  CANCEL: "red",
  DEACTIVATE: "amber",
  ADJUST: "violet",
  LOGIN: "slate",
};

export default function AuditPage() {
  return (
    <RequirePerm perms={["admin.audit"]}>
      <Audit />
    </RequirePerm>
  );
}

function Audit() {
  const [entity, setEntity] = useState("");
  const [userId, setUserId] = useState("");
  // Showing one device's activity: picked by clicking a device in the list
  const [device, setDevice] = useState<{ id: string; name: string } | null>(null);
  const [page, setPage] = useState(1);
  const thisDevice = getDeviceId();
  const { can } = useAuth();
  // The user filter needs the user list, which only user admins can read
  const { data: users } = useApi<User[]>(can("admin.users") ? "/users" : null);
  const { data, error, loading, reload } = useApi<Paged<AuditLog>>("/audit-logs", { entity, userId, deviceId: device?.id, page, pageSize: 50 });
  // Device being named / renamed
  const [naming, setNaming] = useState<AuditLog | null>(null);
  const pickDevice = (d: { id: string; name: string }) => {
    setDevice(d);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Who did what, and when — every create, change, cancellation and sign-in" />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Select value={entity} onChange={(e) => (setEntity(e.target.value), setPage(1))} className="w-full sm:w-48">
            <option value="">All Records</option>
            {ENTITIES.map((x) => (
              <option key={x} value={x}>
                {ENTITY_LABEL[x] ?? x}
              </option>
            ))}
          </Select>
          {can("admin.users") && (
            <Select value={userId} onChange={(e) => (setUserId(e.target.value), setPage(1))} className="w-full sm:w-48">
              <option value="">All Users</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
          {device && (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 pl-3 pr-1 text-sm text-brand-800">
              <MonitorSmartphone className="size-4" />
              Device: {device.name}
              <Button variant="ghost" size="sm" aria-label="Show all devices" onClick={() => (setDevice(null), setPage(1))}>
                <X className="size-4" />
              </Button>
            </span>
          )}
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>User</Th>
                <Th>Action</Th>
                <Th>Record</Th>
                <Th>Record ID</Th>
                <Th>Device</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={7} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={7}>No activity recorded</EmptyRow>
              ) : (
                data.items.map((log) => <AuditRow key={log.id} log={log} thisDevice={thisDevice} onDevice={pickDevice} onRename={setNaming} />)
              )}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>
      {naming?.deviceId && (
        <DeviceNameForm
          key={naming.deviceId}
          log={naming}
          onClose={() => setNaming(null)}
          onSaved={() => {
            setNaming(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

/** Give a device a name everyone sees in the audit log, e.g. "Front Counter PC" or "Ravi's phone" */
function DeviceNameForm({ log, onClose, onSaved }: { log: AuditLog; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(log.deviceLabel ?? "");
  const [saving, setSaving] = useState(false);
  async function save(clear = false) {
    setSaving(true);
    try {
      await api.put(`/audit-logs/devices/${log.deviceId}`, { label: clear ? "" : label.trim() });
      toast.success(clear || !label.trim() ? "Device name removed" : `Device named ${label.trim()}`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={log.deviceLabel ? "Rename Device" : "Name This Device"}
      footer={
        <>
          {log.deviceLabel && (
            <Button variant="ghost" className="mr-auto" onClick={() => void save(true)} disabled={saving}>
              Remove Name
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!label.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) void save();
        }}
        className="space-y-3"
      >
        <p className="text-sm text-slate-600">
          {log.deviceName ?? "Unknown device"}
          <span className="block font-mono text-xs text-slate-400">ID {log.deviceId}</span>
        </p>
        <Field label="Device Name" hint="Shown on every audit entry from this device, past and future">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="e.g. Front Counter PC, Ravi's phone" autoFocus />
        </Field>
      </form>
    </Modal>
  );
}

function AuditRow({ log, thisDevice, onDevice, onRename }: { log: AuditLog; thisDevice: string | null } & DeviceActions) {
  const [open, setOpen] = useState(false);
  const hasDetails = log.details !== null && log.details !== undefined && !(typeof log.details === "object" && Object.keys(log.details as object).length === 0);
  const compact = hasDetails ? JSON.stringify(log.details) : "";
  const { can } = useAuth();
  const target = ENTITY_HREF[log.entity];
  const href = log.entityId && target && can(target[1]) && log.action !== "DELETE" ? `${target[0]}/${log.entityId}` : null;

  return (
    <tr className="align-top hover:bg-slate-50">
      <Td className="whitespace-nowrap text-xs">{dateTime(log.createdAt)}</Td>
      <Td>
        {log.user ? (
          <>
            <span className="font-medium text-slate-900">{log.user.name}</span>
            <p className="text-xs text-slate-500">{log.user.email}</p>
          </>
        ) : (
          <span className="text-slate-400">System</span>
        )}
      </Td>
      <Td>
        <Badge tone={ACTION_TONE[log.action] ?? "slate"}>{log.action.charAt(0) + log.action.slice(1).toLowerCase()}</Badge>
      </Td>
      <Td>{ENTITY_LABEL[log.entity] ?? log.entity}</Td>
      <Td className="font-mono text-xs">
        {href ? (
          <Link href={href} className="text-brand-700 hover:underline">
            {log.entityId}
          </Link>
        ) : (
          log.entityId || "—"
        )}
      </Td>
      <Td className="min-w-40">
        <DeviceCell log={log} thisDevice={thisDevice} onDevice={onDevice} onRename={onRename} />
      </Td>
      <Td className="max-w-64 sm:max-w-md">
        {!hasDetails ? (
          <span className="text-slate-400">—</span>
        ) : (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-1 text-left">
            {open ? <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-slate-400" />}
            {open ? (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            ) : (
              <span className="truncate font-mono text-[11px] text-slate-500">{compact}</span>
            )}
          </button>
        )}
      </Td>
    </tr>
  );
}
