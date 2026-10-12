"use client";

import {
  BadgeCheck,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Boxes,
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
  Users,
  Wallet,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Fragment,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/lib/auth";
import { BranchProvider, useBranch } from "@/lib/branch";
import type { Permission } from "@/lib/permissions";
import { CountsProvider, useCounts } from "./Notifications";
import { TopBar } from "./TopBar";
import { Spinner, cx } from "./ui";

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
 * Dashboard -> Sales -> Purchasing -> Inventory -> Finance
 * -> Notifications -> Admin.
 */
export const NAV: NavGroup[] = [
  {
    section: "",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: <LayoutDashboard />,
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
      { href: "/approvals", label: "Approvals", icon: <BadgeCheck />, badge: "approvals" },
    ],
  },
  {
    section: "Purchasing",
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

/** Most specific nav item wins, so /sales/new doesn't also light up /sales */
function activeHref(pathname: string) {
  let best = "";

  for (const group of NAV) {
    for (const item of group.items) {
      const matches =
        item.href === "/"
          ? pathname === "/"
          : pathname === item.href ||
            pathname.startsWith(item.href + "/");

      if (matches && item.href.length > best.length) {
        best = item.href;
      }
    }
  }

  return best;
}

/**
 * Find the expandable menu containing the active route.
 */
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

/**
 * Sidebar navigation with single-open accordion behavior: the menu holding the current page opens by itself,
 * and a click on a menu header opens it (closing the others) or closes it.
 */
function NavLinks({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { can } = useAuth();
  const counts = useCounts();

  const active = activeHref(pathname);
  const activeSection = getActiveSection(pathname);

  // A header click holds until the page moves to another menu, which then opens instead
  const [toggled, setToggled] = useState<{ at: string; open: string } | null>(null);
  const openSection = toggled?.at === activeSection ? toggled.open : activeSection;

  function toggleSection(section: string) {
    setToggled({ at: activeSection, open: openSection === section ? "" : section });
  }

  return (
    <nav
      aria-label="Main navigation"
      className="flex-1 space-y-1 overflow-y-auto px-3 pb-4"
    >
      {NAV.map((group, groupIndex) => {
        const items = group.items.filter(
          (item) => !item.perms || can(...item.perms),
        );

        if (items.length === 0) {
          return null;
        }

        // Dashboard and Notifications are direct links.
        if (!group.section) {
          return (
            <div
              key={`direct-${groupIndex}`}
              className="space-y-1"
            >
              {items.map((item) => {
                const isActive = active === item.href;

                const badgeCount =
                  item.badge === "unread"
                    ? counts.unread
                    : item.badge === "approvals"
                      ? counts.approvals
                      : 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={
                      isActive ? "page" : undefined
                    }
                    className={cx(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors [&>svg]:size-[17px] [&>svg]:shrink-0 [&>svg]:opacity-85",
                      isActive
                        ? "bg-brand-800 font-medium text-white shadow-[inset_3px_0_0_#8fd19e]"
                        : "text-[#d6e4d4] hover:bg-brand-800",
                    )}
                  >
                    {item.icon}

                    <span className="min-w-0 flex-1">
                      {item.label}
                    </span>

                    {badgeCount > 0 && (
                      <span
                        className={cx(
                          "num rounded-full px-1.5 text-[11px] font-semibold leading-5",
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
              })}
            </div>
          );
        }

        const isOpen = openSection === group.section;

        const hasActiveItem = items.some(
          (item) => item.href === active,
        );

        return (
          <div
            key={group.section}
            className="space-y-1"
          >
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
              <span className="flex-1">
                {group.section}
              </span>

              {isOpen ? (
                <ChevronDown
                  className="size-4 shrink-0 opacity-80"
                  aria-hidden="true"
                />
              ) : (
                <ChevronRight
                  className="size-4 shrink-0 opacity-80"
                  aria-hidden="true"
                />
              )}
            </button>

            {isOpen && (
              <div className="ml-3 space-y-1 border-l border-white/15 pl-2">
                {items.map((item) => {
                  const isActive = active === item.href;

                  const badgeCount =
                    item.badge === "unread"
                      ? counts.unread
                      : item.badge === "approvals"
                        ? counts.approvals
                        : 0;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={
                        isActive ? "page" : undefined
                      }
                      className={cx(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition-colors [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-85",
                        isActive
                          ? "bg-brand-800 font-medium text-white shadow-[inset_2px_0_0_#8fd19e]"
                          : "text-[#d6e4d4] hover:bg-brand-800 hover:text-white",
                      )}
                    >
                      {item.icon}

                      <span className="min-w-0 flex-1">
                        {item.label}
                      </span>

                      {badgeCount > 0 && (
                        <span
                          className={cx(
                            "num rounded-full px-1.5 text-[10px] font-semibold leading-5",
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
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Sidebar logo and navigation.
 */
function Sidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-brand-900">
      <Link
        href="/"
        onClick={onNavigate}
        className="block px-5 pb-4 pt-5"
        aria-label="OneRoot.farm — dashboard"
      >
        <Image
          src="/logo-trimmed.png"
          alt="OneRoot.farm"
          width={480}
          height={138}
          priority
          className="h-auto w-[176px]"
        />

        <p className="mt-1.5 text-[10.5px] uppercase tracking-[0.12em] text-[#8fab93]">
          Agri Inputs ERP
        </p>
      </Link>

      <Suspense fallback={<div className="flex-1" />}>
        <NavLinks onNavigate={onNavigate} />
      </Suspense>
    </div>
  );
}

/**
 * Main authenticated application layout.
 */
export function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [drawer, setDrawer] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);

  // Mount the drawer closed, then slide it in on the next frame so the opening transition runs
  function openDrawer() {
    setDrawerMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setDrawer(true)));
  }

  // Slide out; the overlay's transition end unmounts it
  function closeDrawer() {
    setDrawer(false);
  }

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) return <Spinner className="min-h-screen" />;

  return (
    <BranchProvider
      fallback={<Spinner className="min-h-screen" />}
    >
      <CountsProvider>
        <div className="min-h-screen lg:pl-64">
          {/* Desktop sidebar */}
          <aside className="no-print fixed inset-y-0 left-0 hidden w-64 lg:block">
            <Sidebar />
          </aside>

          {/* Mobile/tablet sidebar with identical opening and closing transitions */}
          {drawerMounted && (
            <div
              className={cx(
                "no-print fixed inset-0 z-50 lg:hidden",
                drawer ? "visible" : "invisible",
              )}
              onTransitionEnd={(event) => {
                if (
                  event.target === event.currentTarget &&
                  !drawer
                ) {
                  setDrawerMounted(false);
                }
              }}
            >
              {/* Overlay uses the same duration and easing in both directions */}
              <div
                className={cx(
                  "absolute inset-0 bg-slate-900/50 transition-opacity duration-500 ease-in-out motion-reduce:transition-none",
                  drawer ? "opacity-100" : "opacity-0",
                )}
                onClick={closeDrawer}
                aria-hidden="true"
              />

              {/* Sidebar panel */}
              <aside
                id="mobile-sidebar"
                role="dialog"
                aria-modal="true"
                aria-label="Mobile navigation"
                className={cx(
                  "absolute inset-y-0 left-0 w-72 max-w-[85vw] transform-gpu transition-transform duration-500 ease-in-out motion-reduce:transition-none",
                  drawer
                    ? "translate-x-0"
                    : "-translate-x-full",
                )}
              >
                <Sidebar onNavigate={closeDrawer} />

                <button
                  type="button"
                  onClick={closeDrawer}
                  className="absolute right-2 top-4 rounded-md p-1 text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                  aria-label="Close menu"
                >
                  <X className="size-5" />
                </button>
              </aside>
            </div>
          )}

          <TopBar onMenu={openDrawer} />

          <main className="mx-auto max-w-[1440px] p-4 lg:p-6">
            <BranchScope>
              <Suspense fallback={<Spinner />}>
                <RouteGate>{children}</RouteGate>
              </Suspense>
            </BranchScope>
          </main>

          <footer className="no-print mx-auto flex max-w-[1440px] flex-wrap justify-between gap-2 px-4 pb-6 text-xs text-slate-400 lg:px-6">
            <span>
              © {new Date().getFullYear()} OneRoot Agri Inputs
            </span>

            <span>OneRoot ERP</span>
          </footer>
        </div>
      </CountsProvider>
    </BranchProvider>
  );
}

/**
 * Re-mount page content when the selected branch changes.
 */
function BranchScope({
  children,
}: {
  children: ReactNode;
}) {
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