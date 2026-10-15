"use client";

import {
  BadgeCheck,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  FileMinus,
  PackageCheck,
  ClipboardList,
  FileText,
  IndianRupee,
  Landmark,
  LayoutDashboard,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Undo2,
  UserCog,
  UserRoundPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { BranchProvider, useBranch } from "@/lib/branch";
import type { Permission } from "@/lib/permissions";
import { CountsProvider, useCounts } from "./Notifications";
import { TopBar } from "./TopBar";
import { QuickActions } from "./QuickActions";
import { PageHeaderExtraProvider, Spinner, cx, Logo } from "./ui";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Shown (and the pages under it opened) only to users holding any of these; none = everyone */
  perms?: Permission[];
  badge?: "unread" | "approvals";
}

export interface NavGroup {
  section: string;
  items: NavItem[];
}

/**
 * Navigation order:
 * Dashboard -> Sales -> Purchases -> Inventory -> Finance
 * -> Notifications -> Admin.
 * Groups without a section render as direct links; the rest are accordions.
 */
export const NAV: NavGroup[] = [
  {
    section: "",
    items: [{ href: "/", label: "Dashboard", icon: <LayoutDashboard /> }],
  },
   {
    section: "",
    items: [
      {
        href: "/notifications",
        label: "Notifications",
        icon: <Bell />,
        badge: "unread",
      },
    ],
  },
  {
    section: "Sales",
    items: [
      { href: "/sales/new", label: "New Sale (POS)", icon: <ShoppingCart />, perms: ["sales.bill"] },
      { href: "/sales", label: "Invoices", icon: <Receipt />, perms: ["sales.bill"] },
      { href: "/sales/returns", label: "Sales Returns", icon: <Undo2 />, perms: ["sales.returns"] },
      { href: "/customers", label: "Customers", icon: <Users />, perms: ["customers.view"] },
      { href: "/customers/reminders", label: "Due Reminders", icon: <BellRing />, perms: ["customers.view"] },
      { href: "/approvals", label: "Approvals", icon: <BadgeCheck /> },
      { href: "/van", label: "Van Trips", icon: <Truck />, perms: ["sales.van"] },
      { href: "/agents", label: "Agents", icon: <UserRoundPlus />, perms: ["vendors.view"] },
    ],
  },
  {
    section: "Purchases",
    items: [
      { href: "/vendors", label: "Vendors", icon: <Boxes />, perms: ["vendors.view"] },
      {
        href: "/purchase-orders",
        label: "Purchase Orders",
        icon: <ClipboardList />,
        perms: ["purchases.view"],
      },
      {
        href: "/goods-inward",
        label: "Goods Inward (GRN)",
        icon: <PackageCheck />,
        perms: ["purchases.view"],
      },
      {
        href: "/purchases",
        label: "Purchase Invoices",
        icon: <Truck />,
        perms: ["purchases.view"],
      },
      {
        href: "/debit-notes",
        label: "Debit & Credit Notes",
        icon: <FileMinus />,
        perms: ["purchases.view"],
      },
    ],
  },
  {
    section: "Inventory",
    items: [
      { href: "/products", label: "Products", icon: <Package />, perms: ["products.view"] },
      { href: "/inventory", label: "Stock & Batches", icon: <RotateCcw />, perms: ["inventory.view"] },
      {
        href: "/inventory/govt-match",
        label: "Govt Fertiliser Match",
        icon: <ShieldCheck />,
        perms: ["inventory.govt"],
      },
    ],
  },
  {
    section: "Finance",
    items: [
      { href: "/shifts", label: "Shifts & Cash", icon: <Landmark />, perms: ["cash.shifts"] },
      { href: "/payments", label: "Payments", icon: <IndianRupee />, perms: ["payments.view"] },
      {
        href: "/expenses",
        label: "Expenses",
        icon: <Wallet />,
        perms: ["expenses"],
      },
      {
        href: "/accounts",
        label: "Accounts",
        icon: <BookOpen />,
        perms: ["accounts.view"],
      },
      {
        href: "/reports",
        label: "Reports",
        icon: <BarChart3 />,
        perms: ["reports.view"],
      },
    ],
  },
  {
    section: "Admin",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: <UserCog />,
        perms: ["admin.users"],
      },
      {
        href: "/admin/roles",
        label: "Roles & Limits",
        icon: <ShieldCheck />,
        perms: ["admin.roles"],
      },
      {
        href: "/admin/schemes",
        label: "Schemes & Pricing",
        icon: <Tags />,
        perms: ["admin.schemes"],
      },
      {
        href: "/admin/branches",
        label: "Branches",
        icon: <Store />,
        perms: ["admin.branches"],
      },
      {
        href: "/admin/settings",
        label: "Store Settings",
        icon: <Settings />,
        perms: ["admin.settings"],
      },
      {
        href: "/admin/approval-rules",
        label: "PO Approval Rules",
        icon: <BadgeCheck />,
        perms: ["admin.approval_rules"],
      },
      {
        href: "/admin/audit",
        label: "Audit Log",
        icon: <ShieldCheck />,
        perms: ["admin.audit"],
      },
    ],
  },
];

/** Pages under a gated sidebar item that any signed-in user may open (e.g. a named PO approver) */
const OPEN_ROUTES = ["/purchase-orders/approvals"];

/**
 * Detail pages a named approver opens from their queue without holding the section's permission. The API decides
 * who may see each record (a 403 shows as the page's error); /purchase-orders/new and …/edit keep their own guards.
 */
const OPEN_DETAIL_ROUTES = [/^\/purchase-orders\/(?!new$|approvals$)[^/]+$/];

/** Most specific nav item wins, so /sales/new doesn't also light up /sales */
function activeHref(pathname: string) {
  let best = "";
  for (const g of NAV)
    for (const i of g.items) {
      const match =
        i.href === "/"
          ? pathname === "/"
          : pathname === i.href || pathname.startsWith(i.href + "/");
      if (match && i.href.length > best.length) best = i.href;
    }
  return best;
}

/** The accordion section holding the active route */
function getActiveSection(pathname: string): string {
  const active = activeHref(pathname);
  return (
    NAV.find(
      (group) =>
        group.section !== "" &&
        group.items.some((item) => item.href === active),
    )?.section ?? ""
  );
}

function NavItemLink({
  item,
  active,
  nested,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const counts = useCounts();
  const badgeCount =
    item.badge === "unread"
      ? counts.unread
      : item.badge === "approvals"
        ? counts.approvals
        : 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors [&>svg]:shrink-0 [&>svg]:opacity-85",
        nested
          ? "text-[12.5px] [&>svg]:size-4"
          : "text-[13.5px] [&>svg]:size-[17px]",
        active
          ? cx(
              "bg-brand-800 font-medium text-white",
              nested
                ? "shadow-[inset_2px_0_0_#8fd19e]"
                : "shadow-[inset_3px_0_0_#8fd19e]",
            )
          : "text-[#d6e4d4] hover:bg-brand-800 hover:text-white",
      )}
    >
      {item.icon}
      <span className="min-w-0 flex-1">{item.label}</span>
      {badgeCount > 0 && (
        <span
          className={cx(
            "num rounded-full px-1.5 font-semibold leading-5",
            nested ? "text-[10px]" : "text-[11px]",
            item.badge === "unread"
              ? "bg-red-500 text-white"
              : "bg-amber-400 text-amber-950",
          )}
        >
          {badgeCount}
        </span>
      )}
    </Link>
  );
}

/** Sidebar navigation with single-open accordion behaviour */
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();

  const active = activeHref(pathname);
  const activeSection = getActiveSection(pathname);

  const [openSection, setOpenSection] = useState(activeSection);
  const [prevActiveSection, setPrevActiveSection] = useState(activeSection);

  // Open the section holding the page whenever navigation moves into another section
  if (activeSection !== prevActiveSection) {
    setPrevActiveSection(activeSection);
    setOpenSection(activeSection);
  }

  function toggleSection(section: string) {
    setOpenSection((current) => (current === section ? "" : section));
  }

  return (
    <nav
      aria-label="Main navigation"
      className="no-scrollbar flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-4"
    >
      {NAV.map((group, groupIndex) => {
        const items = group.items.filter((i) => !i.perms || can(...i.perms));
        if (!items.length) return null;

        // Dashboard and Notifications are direct links
        if (!group.section) {
          return (
            <div key={`direct-${groupIndex}`} className="space-y-1">
              {items.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  active={active === item.href}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          );
        }

        const isOpen = openSection === group.section;
        const hasActiveItem = items.some((item) => item.href === active);

        return (
          <div key={group.section} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleSection(group.section)}
              aria-expanded={isOpen}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13.5px] font-medium transition-colors",
                hasActiveItem
                  ? "bg-brand-800 text-white"
                  : "text-[#d6e4d4] hover:bg-brand-800 hover:text-white",
              )}
            >
              <span className="flex-1">{group.section}</span>
              {isOpen ? (
                <ChevronDown className="size-4 shrink-0 opacity-80" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4 shrink-0 opacity-80" aria-hidden="true" />
              )}
            </button>

            {isOpen && (
              <div className="ml-3 space-y-1 border-l border-white/15 pl-2">
                {items.map((item) => (
                  <NavItemLink
                    key={item.href}
                    item={item}
                    active={active === item.href}
                    nested
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** `onClose` (mobile / tablet drawer) adds a close button beside the logo, so it never sits on top of it */
function Sidebar({ onNavigate, onClose }: { onNavigate?: () => void; onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-brand-900">
      <div className="flex items-start gap-2 px-5 pb-4 pt-5">
        <Link href="/" onClick={onNavigate} className="block min-w-0 flex-1" aria-label="OneRoot.farm — dashboard">
          <Logo priority framed className="flex" imageClassName="w-full" />
          <p className="mt-1.5 text-[10.5px] uppercase tracking-[0.12em] text-[#8fab93]">
            Agri Inputs ERP
          </p>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 shrink-0 rounded-md p-1.5 text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      <Suspense fallback={<div className="flex-1" />}>
        <NavLinks onNavigate={onNavigate} />
      </Suspense>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [drawer, setDrawer] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Offline shell for the POS (production builds only; dev chunks change on every edit)
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Prevent background scrolling while the drawer is open
  useEffect(() => {
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawer]);

  function openDrawer() {
    setDrawerMounted(true);
    // Start the transition after the drawer has mounted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setDrawer(true));
    });
  }

  function closeDrawer() {
    setDrawer(false);
  }

  if (loading || !user) return <Spinner page />;

  return (
    <BranchProvider fallback={<Spinner page />}>
      <CountsProvider>
        <div className="min-h-screen overflow-x-clip lg:pl-64">
          <aside className="no-print fixed inset-y-0 left-0 hidden w-64 lg:block">
            <Sidebar />
          </aside>

          {drawerMounted && (
            <div
              className={cx(
                "no-print fixed inset-0 z-50 lg:hidden",
                drawer ? "visible" : "invisible",
              )}
            >
              <div
                className={cx(
                  "absolute inset-0 bg-slate-900/50 transition-opacity duration-500 ease-in-out motion-reduce:transition-none",
                  drawer ? "opacity-100" : "opacity-0",
                )}
                onClick={closeDrawer}
                aria-hidden="true"
              />
              <aside
                id="mobile-sidebar"
                role="dialog"
                aria-modal="true"
                aria-label="Mobile navigation"
                className={cx(
                  "absolute inset-y-0 left-0 w-72 max-w-[85vw] transform-gpu transition-transform duration-500 ease-in-out motion-reduce:transition-none",
                  drawer ? "translate-x-0" : "-translate-x-full",
                )}
                onTransitionEnd={(event) => {
                  // Unmount once the closing slide has finished
                  if (event.target === event.currentTarget && !drawer) {
                    setDrawerMounted(false);
                  }
                }}
              >
                <Sidebar onNavigate={closeDrawer} onClose={closeDrawer} />
              </aside>
            </div>
          )}

          <TopBar onMenu={openDrawer} />

          <main className="mx-auto w-full min-w-0 max-w-[1440px] p-3 sm:p-4 lg:p-6">
            <BranchScope>
              {/* Every PageHeader shows the quick-actions bar under it (the dashboard places its own) */}
              <PageHeaderExtraProvider value={<QuickActions />}>
                <Suspense fallback={<Spinner page />}>
                  <RouteGate>{children}</RouteGate>
                </Suspense>
              </PageHeaderExtraProvider>
            </BranchScope>
          </main>
          <footer className="no-print mx-auto flex max-w-[1440px] flex-wrap justify-between gap-2 px-4 pb-6 text-xs text-slate-400 lg:px-6">
            <span>© {new Date().getFullYear()} OneRoot Agri Inputs</span>
            <span>OneRoot ERP</span>
          </footer>
        </div>
      </CountsProvider>
    </BranchProvider>
  );
}

/** Re-mounts the page when the branch changes, so every list reloads for the new branch */
function BranchScope({ children }: { children: ReactNode }) {
  const { version } = useBranch();
  return <Fragment key={version}>{children}</Fragment>;
}

function NoAccess() {
  return (
    <div className="mx-auto mt-20 max-w-md text-center">
      <FileText className="mx-auto size-10 text-slate-300" />
      <p className="mt-3 font-medium text-slate-700">
        You don&apos;t have access to this page
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Ask an administrator to give you this permission in Users.
      </p>
    </div>
  );
}

/** Pages inherit the permission of the sidebar item they sit under (typed URLs included) */
function RouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can } = useAuth();
  if (OPEN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) return <>{children}</>;
  if (OPEN_DETAIL_ROUTES.some((r) => r.test(pathname))) return <>{children}</>;
  const href = activeHref(pathname);
  const item = NAV.flatMap((g) => g.items).find((i) => i.href === href);
  if (item?.perms && !can(...item.perms)) return <NoAccess />;
  return <>{children}</>;
}

/** Wrap a page (or part of one) that needs a permission beyond its sidebar item's */
export function RequirePerm({
  perms,
  children,
}: {
  perms: Permission[];
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(...perms)) return <NoAccess />;
  return <>{children}</>;
}
