import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileMinus,
  Globe,
  IndianRupee,
  Leaf,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sprout,
  Store,
  Truck,
  Users,
  Wheat,
  WifiOff,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LandingBrochure } from "@/components/LandingBrochure";
import { CurrentYear, LandingCta } from "@/components/LandingCta";
import { Logo } from "@/components/ui";
import { CONTACT } from "@/lib/contact";

export const metadata: Metadata = {
  title: {
    absolute: "OneRoot ERP — billing, stock and accounts for agri-input stores",
  },
  description:
    "GST billing, quotations, batch and expiry tracking, purchase orders, goods inward, debit / credit notes, van sales and accounts — one system for seed, fertiliser and pesticide stores.",
};

const MODULES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <ShoppingCart />,
    title: "Point of Sale",
    text: "Fast counter billing with barcode scan, split payments, held bills and an offline mode that syncs when the line is back.",
  },
  {
    icon: <ReceiptText />,
    title: "GST Invoices & Quotations",
    text: "Tax invoices with CGST / SGST or IGST by place of supply, plus quotations in the same layout for customers who ask first.",
  },
  {
    icon: <Boxes />,
    title: "Inventory & Batches",
    text: "Stock by branch and batch with Mfg and expiry dates, first-expiry-first-out picking, serial numbers and reorder alerts.",
  },
  {
    icon: <ClipboardList />,
    title: "Purchase Orders",
    text: "Raise POs with approval chains by value, track expiry, transport and other charges, and send them to vendors.",
  },
  {
    icon: <PackageCheck />,
    title: "Goods Inward (GRN)",
    text: "Receive against the PO: passed, rejected, damaged and expired quantities, with the vendor bill booked automatically.",
  },
  {
    icon: <FileMinus />,
    title: "Debit & Credit Notes",
    text: "Returns, rejected goods, short supply, rate differences and scheme credits — each note tied to its PO and GRN.",
  },
  {
    icon: <Users />,
    title: "Customers & Credit",
    text: "Farmer ledgers, credit limits and periods, customer-type discounts and due reminders by SMS or WhatsApp.",
  },
  {
    icon: <Truck />,
    title: "Van Sales",
    text: "Load a van, bill in the villages from what it carries, and reconcile the stock and cash when it returns.",
  },
  {
    icon: <ShieldCheck />,
    title: "Govt Fertiliser Match",
    text: "Govt POS receipt numbers on every subsidised bill and a daily check of stock against the government portal.",
  },
  {
    icon: <BookOpen />,
    title: "Accounts & Tally",
    text: "Every bill, payment and note posts to the ledgers: trial balance, P&L, balance sheet and a Tally export.",
  },
  {
    icon: <BarChart3 />,
    title: "Reports & Dashboard",
    text: "Sales, purchase, GST and stock registers, margins, expiring stock and dues — per branch or all together.",
  },
  {
    icon: <BadgeCheck />,
    title: "Roles & Approvals",
    text: "View / add / edit / delete rights per screen, discount and return limits, manager PINs and a full audit log.",
  },
];

const HIGHLIGHTS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <IndianRupee />,
    title: "GST-ready",
    text: "HSN, rate slabs and place of supply on every document",
  },
  {
    icon: <Store />,
    title: "Multi-branch",
    text: "Stock, sales and cash kept per shop or warehouse",
  },
  {
    icon: <WifiOff />,
    title: "Works offline",
    text: "The counter keeps billing when the internet drops",
  },
  {
    icon: <Sprout />,
    title: "Built for agri",
    text: "Seeds, fertilisers, pesticides and equipment",
  },
];

/** Who the ERP is for, in the scrolling strip under the hero */
const BUILT_FOR = [
  "Seed stores",
  "Fertiliser dealers",
  "Pesticide retailers",
  "Farm equipment",
  "FPOs",
  "Distributors",
  "Multi-branch chains",
  "Village van sales",
];

/** Top-bar menu: each item scrolls to its section */
const NAV: { href: string; label: string }[] = [
  { href: "#about", label: "About" },
  { href: "#modules", label: "Modules" },
  { href: "#catalogue", label: "Catalogue" },
  { href: "#brochure", label: "Brochure" },
  { href: "#contact", label: "Contact" },
];

const SITE = "https://www.oneroot.farm";
const LINKEDIN = "https://in.linkedin.com/company/oneroot";

/** Company profile, from oneroot.farm */
const ABOUT_STATS: [string, string][] = [
  ["90%", "of Indian agriculture comes from smallholder and marginal farmers"],
  ["~50%", "of them are in debt — fair prices and finance change that"],
  ["24–72 h", "delivery pan-India from farm to business"],
];

const APPS: { name: string; text: string; href: string }[] = [
  {
    name: "Markhet",
    text: "For buyers: source directly from farmers with full traceability.",
    href: "https://play.google.com/store/apps/details?id=enp.oneroot.marketplace&pcampaignid=web_share",
  },
  {
    name: "Markhet Farmer",
    text: "For farmers: reach buyers directly and manage produce.",
    href: "https://play.google.com/store/apps/details?id=enp.oneroot.farmerMarketplace&pcampaignid=web_share",
  },
];

const CUSTOMERS: [string, string][] = [
  ["Olam", "https://www.olamgroup.com/"],
  ["Zepto", "https://www.zeptonow.com/"],
  ["Country Delight", "https://countrydelight.in/"],
  ["Blinkit", "https://blinkit.com"],
];

const SITE_LINKS: [string, string][] = [
  ["About OneRoot", `${SITE}/#about`],
  ["Products", `${SITE}/#products`],
  ["Catalogue", `${SITE}/#catalogue`],
  ["Team", `${SITE}/#team`],
  ["FAQs", `${SITE}/#faq`],
];

/** OneRoot's catalogue, as listed on oneroot.farm; `tint` colours each group's header band */
const CATALOGUE: {
  icon: ReactNode;
  group: string;
  tint: string;
  items: { name: string; detail: string }[];
}[] = [
  {
    icon: <Leaf />,
    group: "Farm Produce",
    tint: "from-[#1a7c4e] to-[#2e8b46]",
    items: [
      {
        name: "Tender Coconut",
        detail:
          "From farmers across Kerala, Karnataka, Tamil Nadu and Andhra Pradesh",
      },
      {
        name: "Turmeric",
        detail: "Regional varieties as fingers and powder; curcumin above 4%",
      },
      { name: "Green Cardamom", detail: "Idukki origin" },
      { name: "Banana", detail: "Nendran, Kathali and G9" },
    ],
  },
  {
    icon: <Wheat />,
    group: "Feed Ingredients",
    tint: "from-[#b07b1c] to-[#c9932a]",
    items: [
      { name: "Rice DDGS", detail: "45–50% protein; Hi-Pro grade 50–55%" },
      { name: "Corn DDGS", detail: "Distillers dried grains with solubles" },
      { name: "Corn Gluten Meal", detail: "About 65% crude protein" },
      { name: "Corn Gluten Feed", detail: "Fibre and protein for cattle feed" },
      { name: "De-oiled Rice Bran", detail: "Feed-grade rice bran" },
    ],
  },
  {
    icon: <Package />,
    group: "Meals, Starch & Oils",
    tint: "from-[#18432e] to-[#166341]",
    items: [
      {
        name: "Soybean Meal",
        detail: "Protein meal for poultry and cattle feed",
      },
      { name: "Rapeseed Meal", detail: "Oilseed meal for feed" },
      { name: "Fish Meal & Poultry Meal", detail: "Animal-protein meals" },
      { name: "Corn Starch", detail: "Industrial and food use" },
      { name: "Turmeric Oil", detail: "Curcumin minimum 18%" },
    ],
  },
];

const STEPS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <ClipboardList />,
    title: "Order",
    text: "Raise a purchase order; it goes for approval and then to the vendor.",
  },
  {
    icon: <PackageCheck />,
    title: "Receive",
    text: "Count the goods at inward. Stock enters by batch and the bill is booked.",
  },
  {
    icon: <ShoppingCart />,
    title: "Sell",
    text: "Quote, bill at the counter or from the van, and collect dues on time.",
  },
  {
    icon: <BookOpen />,
    title: "Account",
    text: "Ledgers, GST and reports stay up to date with no double entry.",
  },
];

/** Joins class names. Local copy: this is a server component and ui.tsx's cx is client-only */
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Sections sit under the sticky header: taller on phones, where the menu has its own row */
const ANCHOR = "scroll-mt-28 md:scroll-mt-20";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Highlights />
        <BuiltFor />
        <About />
        <Modules />
        <HowItWorks />
        <Catalogue />
        <Brochure />
        <Contact />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/85 shadow-[0_1px_12px_rgba(18,53,36,0.06)] backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          aria-label="OneRoot.farm ERP home"
          className="flex shrink-0 items-center gap-1"
        >
          <Image
            src="/full_logo.png"
            alt="OneRoot.farm"
            width={1630}
            height={840}
            priority
            className="h-14 w-auto sm:h-18"
          />
          <span className="font-display text-3xl font-bold leading-none text-brand-800 sm:text-4xl">
            ERP
          </span>
        </Link>
        <nav
          className="hidden items-center gap-1 rounded-full border border-line bg-paper-2/80 p-1 text-sm font-medium text-muted md:flex"
          aria-label="Sections"
        >
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-full px-3.5 py-1.5 transition-colors hover:bg-surface hover:text-brand-700 hover:shadow-sm"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <LandingCta />
      </div>
      {/* Phones: the menu scrolls sideways under the logo */}
      <nav
        className="no-scrollbar flex gap-2 overflow-x-auto border-t border-line-soft px-4 py-2 text-sm font-medium text-muted md:hidden"
        aria-label="Sections"
      >
        {NAV.map((n) => (
          <a
            key={n.href}
            href={n.href}
            className="shrink-0 rounded-full bg-paper-2 px-3 py-1 ring-1 ring-line hover:text-brand-700"
          >
            {n.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

/** Dark forest band with glows and a dotted grid; colours here never flip with the theme */
function DarkBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute -left-40 -top-40 size-[34rem] rounded-full bg-[#289a62]/30 blur-3xl" />
      <div className="absolute -bottom-48 right-[-8rem] size-[36rem] rounded-full bg-gold-500/20 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:24px_24px]" />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-forest-900 pb-28 text-white sm:pb-32">
      <DarkBackdrop />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 sm:pt-20 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-mint-100 ring-1 ring-white/20 backdrop-blur">
            <Sprout className="size-3.5" /> ERP for agri-input stores
          </p>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Billing, stock and accounts for your agri store,{" "}
            <span className="bg-gradient-to-r from-gold-500 via-[#f0c766] to-[#9be3b8] bg-clip-text text-transparent">
              in one place
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
            OneRoot ERP runs the whole day of a seed, fertiliser and pesticide
            business: GST billing at the counter, quotations, batch-wise stock
            with expiry, purchase orders and goods inward, vendor notes, farmer
            credit and the books.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <LandingCta size="lg" />
            <a
              href="#modules"
              className="inline-flex h-12 items-center gap-2 rounded-lg px-6 text-base font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/10"
            >
              See What It Does <ArrowRight className="size-4" />
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
            {["GST tax invoices", "Offline POS", "Tally export"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-gold-500" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
}

/** A static picture of the dashboard with two floating cards (illustrative figures) */
function HeroPreview() {
  const bars = [42, 58, 49, 71, 64, 83, 77];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-lg lg:max-w-none">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-white/15 to-white/0 blur-sm" />
      <div className="relative rounded-2xl bg-surface p-5 text-ink shadow-2xl shadow-black/40 ring-1 ring-white/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-500" />
            <p className="ml-2 text-sm font-semibold text-slate-800">
              Today at the counter
            </p>
          </div>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            Main Branch
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            ["Sales", "₹48,250", "+12%"],
            ["Bills", "37", "+5"],
            ["Collected", "₹12,400", "+8%"],
          ].map(([label, value, delta]) => (
            <div key={label} className="rounded-xl bg-paper-2 p-3">
              <p className="text-[11px] text-muted">{label}</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-slate-900">
                {value}
              </p>
              <p className="text-[11px] font-semibold text-emerald-600">
                {delta}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-32 items-end gap-2 rounded-xl bg-gradient-to-b from-paper-2 to-brand-50 p-3">
          {bars.map((h, i) => (
            <div
              key={i}
              className={cx(
                "flex-1 rounded-t-md",
                i === bars.length - 2 ? "bg-gold-500" : "bg-brand-500/80",
              )}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {[
            [
              "NPK 19:19:19 · 1 kg",
              "Expires in 21 days",
              "bg-amber-50 text-amber-700",
            ],
            [
              "Hybrid Tomato Seeds",
              "Below reorder level",
              "bg-red-50 text-red-600",
            ],
          ].map(([title, note, tone]) => (
            <li
              key={title}
              className="flex items-center justify-between gap-3 rounded-lg border border-line-soft px-3 py-2"
            >
              <span className="truncate font-medium text-slate-800">
                {title}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
              >
                {note}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Floating cards */}
      <div className="absolute -left-4 top-24 hidden w-56 -rotate-3 rounded-xl bg-surface p-3 text-ink shadow-xl shadow-black/30 ring-1 ring-line sm:block lg:-left-10">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <ReceiptText className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">
              INV/26-27/00128
            </p>
            <p className="text-[11px] text-muted">₹6,420 · paid by UPI</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -right-3 hidden w-60 rotate-2 rounded-xl bg-surface p-3 text-ink shadow-xl shadow-black/30 ring-1 ring-line sm:block">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <PackageCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">
              PO/26-27/00042 received
            </p>
            <p className="text-[11px] text-muted">
              120 bags in stock · bill booked
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Four highlights on a card that overlaps the bottom of the hero */
function Highlights() {
  return (
    <section className="relative z-10 -mt-16 px-4">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-px overflow-hidden rounded-2xl bg-line shadow-xl shadow-forest-900/10 ring-1 ring-line sm:grid-cols-2 lg:grid-cols-4">
        {HIGHLIGHTS.map((h) => (
          <div key={h.title} className="flex items-start gap-3 bg-surface p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm [&>svg]:size-5">
              {h.icon}
            </span>
            <div>
              <p className="font-semibold text-slate-900">{h.title}</p>
              <p className="mt-0.5 text-sm text-muted">{h.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BuiltFor() {
  // Listed twice so the strip loops without a gap
  const items = [...BUILT_FOR, ...BUILT_FOR];
  return (
    <section aria-label="Built for" className="py-10">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        Built for
      </p>
      <div className="relative mt-4 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <ul className="flex w-max animate-marquee gap-3">
          {items.map((t, i) => (
            <li
              key={i}
              aria-hidden={i >= BUILT_FOR.length}
              className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
            >
              <Sprout className="size-4 text-brand-600" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SectionTitle({
  eyebrow,
  title,
  text,
  align = "center",
  dark,
}: {
  eyebrow: string;
  title: string;
  text: string;
  align?: "center" | "left";
  dark?: boolean;
}) {
  return (
    <div
      className={cx("max-w-2xl", align === "center" && "mx-auto text-center")}
    >
      <p
        className={cx(
          "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]",
          dark ? "text-gold-500" : "text-brand-700",
        )}
      >
        <span
          className={cx("h-px w-6", dark ? "bg-gold-500" : "bg-brand-500")}
        />
        {eyebrow}
      </p>
      <h2
        className={cx(
          "mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl",
          dark ? "text-white" : "text-slate-900",
        )}
      >
        {title}
      </h2>
      <p
        className={cx(
          "mt-3 leading-relaxed",
          dark ? "text-white/70" : "text-muted",
        )}
      >
        {text}
      </p>
    </div>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

const outLink =
  "inline-flex items-center gap-1 font-medium text-brand-700 hover:underline";

function About() {
  return (
    <section id="about" className={cx(ANCHOR, "py-16 sm:py-24")}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
        <div>
          <SectionTitle
            align="left"
            eyebrow="About us"
            title="ENP Farms Private Limited — OneRoot"
            text="India's most transparent and traceable farm to business marketplace."
          />
          <p className="mt-6 leading-relaxed text-slate-700">
            OneRoot connects farmers directly with businesses that buy their
            produce. Smallholder and marginal farmers carry most of Indian
            agriculture yet are squeezed on price and credit. OneRoot helps them
            manage their farms with advice from satellite data, sell at fair
            prices, and reach financing through banks and NBFCs — with training
            programmes to lift yield and quality. Buyers get produce they can
            trace back to the farm.
          </p>
          <dl className="mt-8 grid grid-cols-1 divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {ABOUT_STATS.map(([value, label]) => (
              <div key={value} className="py-4 sm:px-4 sm:first:pl-0">
                <dt className="font-display text-3xl font-bold text-brand-700">
                  {value}
                </dt>
                <dd className="mt-1 text-xs leading-snug text-muted">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {APPS.map((a) => (
              <a
                key={a.name}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Smartphone className="size-5" />
                </span>
                <span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                    {a.name}{" "}
                    <ExternalLink className="size-3.5 text-muted-2 transition-colors group-hover:text-brand-600" />
                  </span>
                  <span className="text-xs text-muted">
                    {a.text} Get it on Google Play.
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* At-a-glance card: dark, so it reads as a panel beside the story */}
        <aside className="relative overflow-hidden rounded-3xl bg-forest-800 p-6 text-white shadow-xl sm:p-8">
          <DarkBackdrop />
          <div className="relative space-y-7">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-gold-500">
                <Building2 className="size-4" /> Offices
              </h3>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-sm font-semibold">India (HQ)</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/70">
                    {CONTACT.address}
                  </p>
                </div>
                <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                  <p className="text-sm font-semibold">Vietnam</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/70">
                    Office 203, No. 65 Street No. 39, Van Phuc Urban Area, Hiep
                    Binh Ward, Ho Chi Minh City
                  </p>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gold-500">
                Trusted by
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {CUSTOMERS.map(([name, href]) => (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15 transition-colors hover:bg-white/20"
                  >
                    {name}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gold-500">
                Explore OneRoot
              </h3>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {SITE_LINKS.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-white/85 hover:text-white hover:underline"
                    >
                      {label}{" "}
                      <ExternalLink className="size-3.5 text-white/50" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center gap-3 border-t border-white/10 pt-5">
              <span className="text-xs text-white/60">Follow us</span>
              <SocialLinks />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SocialLinks() {
  return (
    <div className="flex items-center gap-2">
      <a
        href={LINKEDIN}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="OneRoot on LinkedIn"
        className="flex size-9 items-center justify-center rounded-lg bg-[#0a66c2] text-white transition-transform hover:-translate-y-0.5"
      >
        <LinkedInIcon className="size-4" />
      </a>
      <a
        href={SITE}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="oneroot.farm website"
        className="flex size-9 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/20 transition-transform hover:-translate-y-0.5"
      >
        <Globe className="size-4" />
      </a>
    </div>
  );
}

function Modules() {
  const [first, second, ...rest] = MODULES;
  return (
    <section
      id="modules"
      className={cx(ANCHOR, "border-y border-line bg-surface py-16 sm:py-24")}
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle
          eyebrow="Modules"
          title="Everything the store runs on"
          text="From the first purchase order to the last rupee collected, every step is in the same system and talks to the next."
        />
        {/* Bento: the two counter modules lead, the rest follow in a grid */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[first, second].map((m) => (
            <article
              key={m.title}
              className="relative overflow-hidden rounded-2xl bg-forest-800 p-6 text-white shadow-lg sm:col-span-1 lg:col-span-2"
            >
              <div
                aria-hidden
                className="absolute -right-6 -top-6 text-white/5 [&>svg]:size-40"
              >
                {m.icon}
              </div>
              <span className="relative flex size-12 items-center justify-center rounded-xl bg-gold-500 text-forest-900 shadow-sm [&>svg]:size-6">
                {m.icon}
              </span>
              <h3 className="relative mt-5 font-display text-xl font-bold">
                {m.title}
              </h3>
              <p className="relative mt-2 max-w-md text-sm leading-relaxed text-white/75">
                {m.text}
              </p>
            </article>
          ))}
          {rest.map((m) => (
            <article
              key={m.title}
              className="group rounded-2xl border border-line bg-paper-2 p-5 transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:bg-surface hover:shadow-lg"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white [&>svg]:size-5">
                {m.icon}
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{m.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {m.text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className={cx(ANCHOR, "py-16 sm:py-24")}>
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle
          eyebrow="How it works"
          title="One flow, no double entry"
          text="Each document carries on from the one before it, so stock, dues and the books always agree."
        />
        <div className="relative mt-14">
          {/* The line joining the steps on wide screens */}
          <div
            aria-hidden
            className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-0.5 bg-gradient-to-r from-brand-300 via-gold-500 to-brand-300 lg:block"
          />
          <ol className="relative grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative text-center">
                <span className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-forest-800 text-white shadow-lg ring-4 ring-paper [&>svg]:size-6">
                  {s.icon}
                  <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-gold-500 font-display text-xs font-bold text-forest-900">
                    {i + 1}
                  </span>
                </span>
                <h3 className="mt-5 font-display text-lg font-bold text-slate-900">
                  {s.title}
                </h3>
                <p className="mx-auto mt-1.5 max-w-60 text-sm leading-relaxed text-muted">
                  {s.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Catalogue() {
  return (
    <section
      id="catalogue"
      className={cx(ANCHOR, "border-y border-line bg-surface py-16 sm:py-24")}
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle
            align="left"
            eyebrow="Catalogue"
            title="What OneRoot supplies"
            text="Traceable farm produce and feed ingredients, sourced direct from farmers and processors."
          />
          <p className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-gold-50 px-4 py-2 text-sm font-semibold text-gold-700 ring-1 ring-gold-500/30 sm:self-auto">
            <Zap className="size-4" /> 24–72 h delivery across India
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {CATALOGUE.map((c) => (
            <article
              key={c.group}
              className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-lg"
            >
              <div
                className={cx(
                  "relative overflow-hidden bg-gradient-to-br px-5 py-6 text-white",
                  c.tint,
                )}
              >
                <div
                  aria-hidden
                  className="absolute -bottom-6 -right-4 text-white/15 [&>svg]:size-28"
                >
                  {c.icon}
                </div>
                <span className="relative flex size-11 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30 [&>svg]:size-5">
                  {c.icon}
                </span>
                <h3 className="relative mt-3 font-display text-xl font-bold">
                  {c.group}
                </h3>
                <p className="relative text-xs text-white/80">
                  {c.items.length} products
                </p>
              </div>
              <ul className="divide-y divide-line-soft px-5">
                {c.items.map((i) => (
                  <li key={i.name} className="flex gap-3 py-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {i.name}
                      </p>
                      <p className="text-xs leading-snug text-muted">
                        {i.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center text-sm">
          <a
            href={`${SITE}/#catalogue`}
            target="_blank"
            rel="noopener noreferrer"
            className={outLink}
          >
            See the full catalogue on oneroot.farm{" "}
            <ExternalLink className="size-3.5" />
          </a>
        </p>
      </div>
    </section>
  );
}

function Brochure() {
  return (
    <section id="brochure" className={cx(ANCHOR, "py-16 sm:py-24")}>
      <div className="mx-auto max-w-5xl px-4">
        <SectionTitle
          eyebrow="Brochure"
          title="OneRoot ERP at a glance"
          text="Everything in the ERP on one page — download it to share with your team or partners."
        />
        <div className="relative mt-12">
          {/* A second sheet peeking out behind the brochure */}
          <div
            aria-hidden
            className="absolute inset-x-6 -top-3 bottom-3 -rotate-1 rounded-2xl bg-brand-100/70 ring-1 ring-brand-200"
          />
          <div className="relative">
            <LandingBrochure />
          </div>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const cards: {
    icon: ReactNode;
    label: string;
    value: string;
    href?: string;
  }[] = [
    {
      icon: <Mail />,
      label: "Email",
      value: CONTACT.email,
      href: `mailto:${CONTACT.email}`,
    },
    {
      icon: <Phone />,
      label: "Phone",
      value: CONTACT.phone,
      href: CONTACT.phoneHref,
    },
    { icon: <MapPin />, label: "Office", value: CONTACT.address },
  ];
  return (
    <section
      id="contact"
      className={cx(ANCHOR, "border-t border-line bg-surface py-16 sm:py-24")}
    >
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <SectionTitle
            align="left"
            eyebrow="Contact"
            title="Talk to us"
            text="For procurement, partnerships or an ERP demo, write or call and the team will get back to you."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={`mailto:${CONTACT.email}`}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              <Mail className="size-4" /> Email Procurement
            </a>
            <a
              href={CONTACT.phoneHref}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-line-2 bg-surface px-5 text-sm font-semibold text-slate-800 transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              <Phone className="size-4" /> Call Us
            </a>
          </div>
        </div>
        <div className="space-y-3">
          {cards.map((c) => (
            <div
              key={c.label}
              className="flex gap-4 rounded-2xl border border-line bg-paper-2 p-5 transition-colors hover:border-brand-200"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm [&>svg]:size-5">
                {c.icon}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {c.label}
                </p>
                {c.href ? (
                  <a
                    href={c.href}
                    className="mt-0.5 block break-words text-lg font-semibold text-slate-900 hover:text-brand-700"
                  >
                    {c.value}
                  </a>
                ) : (
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-800">
                    {c.value}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="px-4 py-16 sm:py-24">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-forest-800 px-6 py-14 text-center shadow-2xl shadow-forest-900/30 sm:px-12">
        <DarkBackdrop />
        <div className="relative">
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Ready for today&apos;s counter?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sidebar-text">
            Sign in with the account your administrator gave you to start
            billing, receiving and reporting.
          </p>
          <LandingCta size="lg" tone="ash" className="mt-8" />
        </div>
      </div>
    </section>
  );
}

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            {l.href.startsWith("/") ? (
              <Link
                href={l.href}
                className="text-white/65 transition-colors hover:text-white"
              >
                {l.label}
              </Link>
            ) : (
              <a
                href={l.href}
                {...(l.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="text-white/65 transition-colors hover:text-white"
              >
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-forest-900 text-white">
      <DarkBackdrop />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.3fr]">
        <div>
          <Logo framed imageClassName="w-[92px]" textClassName="text-2xl" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">
            Inventory, billing, purchasing and accounts for agri-input stores —
            seeds, fertilisers, pesticides and equipment.
          </p>
          <div className="mt-5">
            <SocialLinks />
          </div>
        </div>
        <FooterLinks
          title="Product"
          links={[
            { label: "Modules", href: "#modules" },
            { label: "How It Works", href: "#how-it-works" },
            { label: "Brochure", href: "#brochure" },
            { label: "Sign In", href: "/login" },
          ]}
        />
        <FooterLinks
          title="Company"
          links={[
            { label: "About", href: "#about" },
            { label: "Catalogue", href: "#catalogue" },
            { label: "oneroot.farm", href: SITE, external: true },
            { label: "LinkedIn", href: LINKEDIN, external: true },
          ]}
        />
        <div>
          <p className="text-sm font-semibold text-white">Contact</p>
          <ul className="mt-4 space-y-3 text-sm text-white/65">
            <li>
              <a
                href={`mailto:${CONTACT.email}`}
                className="inline-flex items-center gap-2 transition-colors hover:text-white"
              >
                <Mail className="size-4 text-gold-500" /> {CONTACT.email}
              </a>
            </li>
            <li>
              <a
                href={CONTACT.phoneHref}
                className="inline-flex items-center gap-2 transition-colors hover:text-white"
              >
                <Phone className="size-4 text-gold-500" /> {CONTACT.phone}
              </a>
            </li>
            <li className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold-500" />
              <span className="leading-relaxed">{CONTACT.address}</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © <CurrentYear /> ENP Farms Private Limited (OneRoot). All rights
            reserved.
          </p>
          <p>Made for agri-input stores across India</p>
        </div>
      </div>
    </footer>
  );
}
