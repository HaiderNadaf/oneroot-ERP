"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Field, Input, errMsg, Logo, useToast } from "@/components/ui";
import { forgotPassword, useAuth } from "@/lib/auth";

/** Change password from the sign-in screen: email + current password, then the new one twice */
export default function ForgotPassword() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < 6;
  const mismatch = confirm.length > 0 && next !== confirm;

  // Already signed in: the account page has the same form
  useEffect(() => {
    if (!loading && user) router.replace("/account");
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 6) return setError("New password must be at least 6 characters");
    if (next !== confirm) return setError("New passwords don't match");
    if (next === current) return setError("New password must be different from the current one");
    setBusy(true);
    try {
      await forgotPassword(email.trim(), current, next);
      toast.success("Password changed — sign in with your new password");
      router.replace("/login");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    // Light mint page with soft green and wheat-gold glows; the card's deep-green header frames the white logo tile
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-[#f6faf2] via-brand-50 to-[#dcefe3] p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 size-[28rem] rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-amber-300/30 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#16634114_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>
      <form onSubmit={submit} className="relative w-full max-w-sm">
        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-brand-900/20 ring-1 ring-brand-900/5">
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600  p-4 pb-1 text-center">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-400/20 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 size-44 rounded-full bg-amber-300/15 blur-2xl" />
            <Logo priority framed className="relative" imageClassName="w-56" />
            <p className="relative text-[11px] font-medium uppercase tracking-[0.18em] text-brand-100/80">Agri Inputs ERP</p>
          </div>
          <div className="h-1 bg-gradient-to-r from-brand-500 via-brand-400 to-amber-400" />
          <div className="px-5 py-4 sm:px-6">
            <div className="mb-2 text-center">
              <h1 className="text-lg font-semibold text-slate-900">Change password</h1>
              <p className="text-xs text-slate-500">Enter your current password, then pick a new one</p>
            </div>
            <div className="space-y-4">
              <Field label="Email">
                <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
              <Field label="Current password">
                <Input isPassword autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
              </Field>
              <Field label="New password" hint={tooShort ? undefined : "At least 6 characters"}>
                <Input
                  isPassword
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className={tooShort ? "border-red-400" : undefined}
                  required
                />
                {tooShort && <span className="mt-1 block text-xs text-red-600">At least 6 characters</span>}
              </Field>
              <Field label="Confirm new password">
                <Input
                  isPassword
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={mismatch ? "border-red-400" : undefined}
                  required
                />
                {mismatch && <span className="mt-1 block text-xs text-red-600">Passwords don&apos;t match</span>}
              </Field>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button type="submit" loading={busy} className="w-full max-sm:h-10!" disabled={!email || !current || !next || !confirm}>
                Change password
              </Button>
              <p className="text-center text-xs text-slate-500">
                Forgot your current password? Ask an administrator to reset it in Users.
              </p>
              <Link
                href="/login"
                className="flex items-center justify-center gap-1 text-xs font-medium text-brand-700 transition-colors hover:text-brand-900 hover:underline"
              >
                <ArrowLeft className="size-3.5" /> Back to sign in
              </Link>
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-brand-800/60">
          © {new Date().getFullYear()} OneRoot Agri Inputs
        </p>
      </form>
    </div>
  );
}
