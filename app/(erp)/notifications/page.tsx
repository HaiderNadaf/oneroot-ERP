"use client";

import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NotificationRow, useCounts } from "@/components/Notifications";
import { Button, Card, ErrorBox, PageHeader, Pagination, Spinner, Tabs } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { AppNotification, Paged } from "@/lib/types";

export default function NotificationsPage() {
  const router = useRouter();
  const { refresh } = useCounts();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload, setData } = useApi<Paged<AppNotification> & { unread: number }>("/notifications", {
    unread: filter === "unread" ? "true" : undefined,
    page,
    pageSize: 30,
  });

  async function open(n: AppNotification) {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      refresh();
    }
    if (n.link) router.push(n.link);
    else void reload();
  }

  async function readAll() {
    await api.post("/notifications/read-all");
    setData((d) => (d ? { ...d, unread: 0, items: d.items.map((x) => ({ ...x, isRead: true })) } : d));
    refresh();
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Approvals, goods inward, stock and payment alerts for you"
        actions={
          <Button variant="secondary" icon={<CheckCheck className="size-4" />} onClick={readAll} disabled={!data?.unread}>
            Mark all read
          </Button>
        }
      />
      <Tabs
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(1);
        }}
        tabs={[
          { value: "all", label: "All" },
          { value: "unread", label: `Unread${data?.unread ? ` (${data.unread})` : ""}` },
        ]}
      />
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Spinner page />
      ) : (
        <Card bodyClassName="p-0">
          {!data?.items.length ? (
            <div className="px-4 py-16 text-center">
              <CheckCheck className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">{filter === "unread" ? "No unread notifications" : "No notifications yet"}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.items.map((n) => (
                <NotificationRow key={n.id} n={n} onOpen={open} />
              ))}
            </div>
          )}
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
        </Card>
      )}
    </>
  );
}
