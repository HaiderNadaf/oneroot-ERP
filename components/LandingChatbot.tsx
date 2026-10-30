"use client";

import { Send, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CONTACT } from "@/lib/contact";
import { cx } from "./ui";

/**
 * Static help bot for the landing page. No backend: a question is matched to the FAQ entry whose
 * keywords it hits most, and only questions about OneRoot ERP get an answer.
 */
type Faq = {
  id: string;
  /** The question as shown on a suggestion chip */
  q: string;
  /** Ids of the FAQs offered as next questions after this answer */
  followUps: string[];
  keywords: string[];
  answer: string;
  link?: { href: string; label: string };
};

const FAQS: Faq[] = [
  {
    id: "overview",
    q: "What is OneRoot ERP?",
    followUps: ["pos", "inventory", "who", "demo"],
    keywords: ["what is", "about erp", "oneroot erp", "what does", "overview", "features", "modules"],
    answer:
      "OneRoot ERP runs the whole day of a seed, fertiliser and pesticide store: GST billing at the counter, quotations, batch-wise stock with expiry, purchase orders, goods inward, debit / credit notes, farmer credit, van sales, accounts and reports — all in one system.",
    link: { href: "#modules", label: "See all modules" },
  },
  {
    id: "pos",
    q: "How does counter billing work?",
    followUps: ["offline", "gst", "shifts", "customers"],
    keywords: ["pos", "point of sale", "counter", "billing", "bill", "barcode", "scan", "split payment", "held bill", "hold"],
    answer:
      "The POS gives fast counter billing with barcode scanning, split payments (cash, UPI, card, credit), held bills you can resume later, and an offline mode that keeps billing when the internet drops.",
  },
  {
    id: "offline",
    q: "Does billing work offline?",
    followUps: ["pos", "branch", "demo"],
    keywords: ["offline", "internet", "no network", "sync"],
    answer:
      "Yes — the counter keeps billing when the internet is down. Offline bills are stored on the device and sync automatically when the connection is back.",
  },
  {
    id: "gst",
    q: "How is GST handled?",
    followUps: ["quotation", "reports", "accounts"],
    keywords: ["gst", "tax", "invoice", "cgst", "sgst", "igst", "hsn", "e-invoice"],
    answer:
      "Every invoice is GST-ready: HSN codes, rate slabs and place of supply decide CGST + SGST or IGST automatically. Sales, purchase and GST registers are available in Reports.",
  },
  {
    id: "quotation",
    q: "Can I send quotations?",
    followUps: ["gst", "customers", "pos"],
    keywords: ["quotation", "quote", "estimate"],
    answer:
      "Quotations use the same layout as tax invoices. Send one to a customer who asks first, and convert it into a bill when they confirm.",
  },
  {
    id: "inventory",
    q: "How is stock and expiry tracked?",
    followUps: ["grn", "po", "reports", "branch"],
    keywords: ["inventory", "stock", "batch", "expiry", "expire", "fefo", "reorder", "serial", "warehouse"],
    answer:
      "Stock is kept per branch and per batch with Mfg and expiry dates. Billing picks first-expiry-first-out, serial numbers are tracked, and reorder alerts warn you before an item runs out. Stock transfers and adjustments are recorded too.",
  },
  {
    id: "po",
    q: "How do purchase orders work?",
    followUps: ["grn", "notes", "inventory"],
    keywords: ["purchase order", "po", "approval chain", "order to vendor", "purchasing"],
    answer:
      "Raise purchase orders with approval chains by value, add transport and other charges, and send them to vendors. Price history for each product is shown while you order.",
  },
  {
    id: "grn",
    q: "What happens at goods inward?",
    followUps: ["notes", "inventory", "accounts"],
    keywords: ["grn", "goods inward", "receive", "receiving", "inward", "rejected", "damaged"],
    answer:
      "Goods Inward (GRN) receives stock against the PO: record passed, rejected, damaged and expired quantities. Passed stock enters by batch and the vendor bill is booked automatically.",
  },
  {
    id: "notes",
    q: "How do debit and credit notes work?",
    followUps: ["grn", "accounts", "reports"],
    keywords: ["debit note", "credit note", "return", "short supply", "rate difference", "scheme credit"],
    answer:
      "Debit and credit notes cover returns, rejected goods, short supply, rate differences and scheme credits — each note is tied to its PO and GRN. Sales returns are handled separately from the Sales menu.",
  },
  {
    id: "customers",
    q: "How is farmer credit managed?",
    followUps: ["van", "schemes", "reports"],
    keywords: ["customer", "farmer", "credit limit", "ledger", "due", "reminder", "whatsapp", "sms", "outstanding"],
    answer:
      "Each farmer / customer has a ledger with a credit limit and credit period, customer-type discounts, and due reminders sent by SMS or WhatsApp.",
  },
  {
    id: "van",
    q: "What are van sales?",
    followUps: ["inventory", "shifts", "customers"],
    keywords: ["van", "village", "mobile sales", "trip"],
    answer:
      "Van Sales lets you load a van, bill in the villages from the stock it carries, and reconcile stock and cash when the van returns.",
  },
  {
    id: "govt",
    q: "What is Govt Fertiliser Match?",
    followUps: ["inventory", "gst", "reports"],
    keywords: ["govt", "government", "fertiliser", "fertilizer", "subsid", "portal", "ifms", "pos receipt"],
    answer:
      "Govt Fertiliser Match records the government POS receipt number on every subsidised bill and runs a daily check of your stock against the government portal.",
  },
  {
    id: "accounts",
    q: "Does it do accounts and Tally?",
    followUps: ["reports", "gst", "demo"],
    keywords: ["account", "tally", "trial balance", "p&l", "profit", "balance sheet", "ledger", "expense", "petty cash"],
    answer:
      "Every bill, payment and note posts to the ledgers automatically: trial balance, P&L, balance sheet, expenses and petty cash, plus a Tally export for your accountant.",
  },
  {
    id: "reports",
    q: "What reports are there?",
    followUps: ["accounts", "branch", "roles"],
    keywords: ["report", "dashboard", "margin", "register", "analytics"],
    answer:
      "Reports include sales, purchase, GST and stock registers, margins, expiring stock and customer dues — per branch or all branches together. The dashboard shows today's sales, bills and collections.",
  },
  {
    id: "roles",
    q: "How do roles and permissions work?",
    followUps: ["branch", "login", "shifts"],
    keywords: ["role", "permission", "user", "access", "pin", "audit", "security"],
    answer:
      "Roles & Approvals give view / add / edit / delete rights per screen, discount and return limits, manager PINs for overrides, and a full audit log of who changed what.",
  },
  {
    id: "branch",
    q: "Does it support multiple branches?",
    followUps: ["inventory", "reports", "roles"],
    keywords: ["branch", "multi", "multiple shop", "chain", "location"],
    answer:
      "OneRoot ERP is multi-branch: stock, sales and cash are kept per shop or warehouse, and you can transfer stock between branches and report on one or all.",
  },
  {
    id: "shifts",
    q: "How is counter cash reconciled?",
    followUps: ["pos", "accounts", "roles"],
    keywords: ["shift", "cash", "closing", "reconcil", "drawer"],
    answer:
      "Shifts & Cash track opening and closing cash at each counter and reconcile it against the bills and payments taken during the shift.",
  },
  {
    id: "schemes",
    q: "Can I set discounts and schemes?",
    followUps: ["customers", "pos"],
    keywords: ["scheme", "discount", "pricing", "campaign", "offer"],
    answer:
      "Schemes & Pricing let you set customer-type discounts and vendor schemes, and Campaigns send offers to your customers.",
  },
  {
    id: "who",
    q: "Who is it built for?",
    followUps: ["overview", "govt", "van", "demo"],
    keywords: ["who", "for whom", "seed", "pesticide", "fpo", "distributor", "suitable"],
    answer:
      "It is built for seed stores, fertiliser dealers, pesticide retailers, farm equipment shops, FPOs, distributors, multi-branch chains and village van sales.",
  },
  {
    id: "login",
    q: "How do I sign in?",
    followUps: ["roles", "demo"],
    keywords: ["login", "log in", "sign in", "signin", "password", "access the erp"],
    answer:
      "Use Sign In at the top of the page with the account your administrator gave you. If you forgot your password, use “Forgot password” on the login screen.",
    link: { href: "/login", label: "Go to Sign In" },
  },
  {
    id: "demo",
    q: "How do I get a demo?",
    followUps: ["brochure", "overview"],
    keywords: ["demo", "price", "pricing plan", "cost", "contact", "call", "email", "phone", "support", "buy"],
    answer: `For a demo or pricing, email ${CONTACT.email} or call ${CONTACT.phone} and the team will get back to you.`,
    link: { href: "#contact", label: "Contact details" },
  },
  {
    id: "brochure",
    q: "Is there a brochure?",
    followUps: ["demo", "overview"],
    keywords: ["brochure", "pdf", "download"],
    answer: "The one-page brochure lists everything in the ERP — you can download it from the Brochure section.",
    link: { href: "#brochure", label: "Open brochure" },
  },
];

const GREETINGS = ["hi", "hello", "hey", "hai", "good morning", "good evening", "namaste"];

const BY_ID = new Map(FAQS.map((f) => [f.id, f]));

/** Offered after the welcome, a greeting or an unmatched question */
const STARTERS = ["overview", "offline", "gst", "demo"];

const FALLBACK =
  "I can only answer questions about OneRoot ERP — billing, stock, purchases, GST, accounts, van sales and so on. Try one of the suggestions below, or contact the team for anything else.";

type Reply = { id?: string; answer: string; link?: Faq["link"]; followUps: string[] };

function reply(question: string): Reply {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9&\s]/g, " ").replace(/\s+/g, " ")} `;
  if (GREETINGS.some((g) => q.trim() === g || q.startsWith(` ${g} `)) && q.trim().split(" ").length <= 3) {
    return {
      answer: "Hello! Ask me anything about OneRoot ERP — billing, stock, GST, purchases, accounts or reports.",
      followUps: STARTERS,
    };
  }
  let best: Faq | undefined;
  let bestScore = 0;
  for (const f of FAQS) {
    // Short keywords (po, pos, gst) must match a whole word; longer ones can match inside a word
    const score = f.keywords.reduce(
      (s, k) => s + (q.includes(k.length <= 3 ? ` ${k} ` : k) ? k.split(" ").length : 0),
      0,
    );
    if (score > bestScore) [best, bestScore] = [f, score];
  }
  return best ?? { answer: FALLBACK, link: { href: "#contact", label: "Contact the team" }, followUps: STARTERS };
}

/** greenbot.png has wide white margins, so it is scaled up to fill the round / square tile */
function BotLogo() {
  return <Image src="/greenbot.png" alt="" width={447} height={447} className="size-full scale-[1.7] object-contain" />;
}

/** `shown` is how many words of a bot reply have been typed out so far */
type Message = { from: "bot" | "user"; text: string; link?: Faq["link"]; followUps?: string[]; shown?: number };

const WELCOME: Message = {
  from: "bot",
  text: "Hi! I'm the OneRoot ERP assistant. Ask me about billing, stock, GST, purchases or accounts.",
  followUps: STARTERS,
};

/** Words with their trailing spaces, so a partly typed reply keeps its spacing */
const words = (text: string) => text.match(/\S+\s*/g) ?? [];

const THINK_MS = 700;
const WORD_MS = 70;

export function LandingChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  /** "thinking" shows the dots; "streaming" types the reply out word by word */
  const [phase, setPhase] = useState<"idle" | "thinking" | "streaming">("idle");
  const [asked, setAsked] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = phase !== "idle";

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, phase]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function ask(text: string, faqId?: string) {
    const question = text.trim();
    if (!question || busy) return;
    setMessages((m) => [...m, { from: "user", text: question }]);
    setInput("");
    setPhase("thinking");
    const faq = faqId ? BY_ID.get(faqId) : undefined;
    const r: Reply = faq ? { id: faq.id, answer: faq.answer, link: faq.link, followUps: faq.followUps } : reply(question);
    if (r.id) setAsked((a) => [...a, r.id!]);
    const total = words(r.answer).length;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    timers.current.push(
      setTimeout(() => {
        setMessages((m) => [
          ...m,
          { from: "bot", text: r.answer, link: r.link, followUps: r.followUps, shown: reduceMotion ? total : 0 },
        ]);
        if (reduceMotion) return setPhase("idle");
        setPhase("streaming");
        // Reveal one word at a time on the last message, like a streamed AI reply
        for (let n = 1; n <= total; n++) {
          timers.current.push(
            setTimeout(() => {
              setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, shown: n } : msg)));
              if (n === total) setPhase("idle");
            }, n * WORD_MS),
          );
        }
      }, THINK_MS),
    );
  }

  const last = messages[messages.length - 1];
  // Follow-ups of the latest answer, skipping what was already asked
  const followUps =
    !busy && last.from === "bot"
      ? (last.followUps ?? [])
          .filter((id) => !asked.includes(id))
          .map((id) => BY_ID.get(id)!)
          .slice(0, 3)
      : [];

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <div
          role="dialog"
          aria-label="OneRoot ERP assistant"
          className="flex h-[min(32rem,calc(100dvh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl shadow-forest-900/25 sm:w-96"
        >
          <div className="flex items-center gap-3 bg-forest-800 px-4 py-3 text-white">
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
              <BotLogo />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">OneRoot ERP Assistant</p>
              {/* Status: yellow while thinking or typing a reply, green otherwise */}
              <p className="flex items-center gap-1.5 text-[11px] text-white/80">
                <span className="relative flex size-2">
                  <span
                    className={cx(
                      "absolute inset-0 animate-ping rounded-full opacity-60",
                      busy ? "bg-amber-400" : "bg-emerald-400",
                    )}
                  />
                  <span className={cx("relative size-2 rounded-full", busy ? "bg-amber-400" : "bg-emerald-400")} />
                </span>
                {busy ? "Typing…" : "Available"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-paper-2 px-4 py-4" aria-live="polite" aria-busy={busy}>
            {messages.map((m, i) => {
              const all = words(m.text);
              const done = m.shown === undefined || m.shown >= all.length;
              return (
              <div key={i} className={cx("flex", m.from === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cx(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    m.from === "user"
                      ? "rounded-br-sm bg-brand-600 text-white"
                      : "rounded-bl-sm border border-line-soft bg-surface text-ink shadow-sm",
                  )}
                >
                  {done ? m.text : all.slice(0, m.shown).join("")}
                  {!done && (
                    <span aria-hidden className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-brand-600" />
                  )}
                  {done && m.link && (
                    <a
                      href={m.link.href}
                      onClick={() => m.link!.href.startsWith("#") && setOpen(false)}
                      className="mt-1.5 block text-xs font-semibold text-brand-700 hover:underline"
                    >
                      {m.link.label} →
                    </a>
                  )}
                </div>
              </div>
              );
            })}
            {phase === "thinking" && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-sm border border-line-soft bg-surface px-3.5 py-3 shadow-sm">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="size-1.5 animate-bounce rounded-full bg-muted-2"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            {followUps.length > 0 && (
              <div className="flex flex-col items-start gap-1.5 pl-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                  {messages.length === 1 ? "Try asking" : "Ask next"}
                </p>
                {followUps.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => ask(f.q, f.id)}
                    className="rounded-full bg-brand-50 px-3 py-1 text-left text-xs font-medium text-brand-700 ring-1 ring-brand-200 transition-colors hover:bg-brand-100"
                  >
                    {f.q}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 border-t border-line-soft bg-surface p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about OneRoot ERP…"
              aria-label="Your question"
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-2 bg-paper-2 px-3 text-sm text-ink outline-none placeholder:text-muted-2 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              aria-label="Send"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Chat with us"}
        aria-expanded={open}
        className={cx(
          "flex size-16 items-center justify-center overflow-hidden rounded-full shadow-xl shadow-forest-900/30 ring-2 transition-transform hover:scale-105",
          open ? "bg-brand-600 text-white ring-white/60 hover:bg-brand-700" : "bg-white ring-brand-200",
        )}
      >
        {open ? <X className="size-6" /> : 
          <div  className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
            <BotLogo />
          </div>
        }
      </button>
    </div>
  );
}
