"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RequirePerm } from "@/components/AppShell";
import { Badge, Card, EmptyRow, ErrorBox, LoadingRow, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { AuditLog, Paged, User } from "@/lib/types";

const ENTITIES = ["Sale", "SaleReturn", "Purchase", "PurchaseOrder", "Payment", "Expense", "Product", "Customer", "Vendor", "User", "StoreSettings"];

const ENTITY_LABEL: Record<string, string> = {
  SaleReturn: "Sales return",
  PurchaseOrder: "Purchase order",
  StoreSettings: "Store settings",
};

const ENTITY_HREF: Record<string, string> = {
  Sale: "/sales",
  Purchase: "/purchases",
  PurchaseOrder: "/purchase-orders",
  Product: "/products",
  Customer: "/customers",
  Vendor: "/vendors",
};

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
  const [page, setPage] = useState(1);
  const { data: users } = useApi<User[]>("/users");
  const { data, error, loading, reload } = useApi<Paged<AuditLog>>("/audit-logs", { entity, userId, page, pageSize: 50 });

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, and when — every create, change, cancellation and sign-in" />
      <Card bodyClassName="p-0">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Select value={entity} onChange={(e) => (setEntity(e.target.value), setPage(1))} className="w-48">
            <option value="">All records</option>
            {ENTITIES.map((x) => (
              <option key={x} value={x}>
                {ENTITY_LABEL[x] ?? x}
              </option>
            ))}
          </Select>
          <Select value={userId} onChange={(e) => (setUserId(e.target.value), setPage(1))} className="w-48">
            <option value="">All users</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
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
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <LoadingRow colSpan={6} />
              ) : !data?.items.length ? (
                <EmptyRow colSpan={6}>No activity recorded</EmptyRow>
              ) : (
                data.items.map((log) => <AuditRow key={log.id} log={log} />)
              )}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}

function AuditRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const hasDetails = log.details !== null && log.details !== undefined && !(typeof log.details === "object" && Object.keys(log.details as object).length === 0);
  const compact = hasDetails ? JSON.stringify(log.details) : "";
  const href = log.entityId && ENTITY_HREF[log.entity] && log.action !== "DELETE" ? `${ENTITY_HREF[log.entity]}/${log.entityId}` : null;

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
      <Td className="max-w-md">
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
