"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Field, Input, errMsg, Logo } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    // Light mint page with soft green and wheat-gold glows; the card's deep-green header frames the white logo tile
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-paper-4 via-brand-50 to-leaf-150 p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 size-[28rem] rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-amber-300/30 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(#16634114_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>
      <form onSubmit={submit} className="relative w-full max-w-sm">
        <div className="overflow-hidden rounded-3xl bg-surface shadow-2xl shadow-brand-900/20 ring-1 ring-forest-900/5">
          <div className="relative overflow-hidden bg-gradient-to-br from-forest-900 via-forest-800 to-brand-600  p-4 pb-1 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-400/20 blur-2xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -left-10 size-44 rounded-full bg-amber-300/15 blur-2xl"
            />
            <Logo priority framed className="relative" imageClassName="w-56" textClassName="text-4xl" />
            <p className="relative text-[11px] font-medium uppercase tracking-[0.18em] text-mint-100/80">
              Agri Inputs ERP
            </p>
          </div>
          <div className="h-1 bg-gradient-to-r from-brand-500 via-brand-400 to-amber-400" />
          <div className="px-5 py-4 sm:px-6">
            <div className="mb-2 text-center">
              <h1 className="text-lg font-semibold text-slate-900">Sign In</h1>
              <p className="text-xs text-slate-500">Use your store account</p>
            </div>
            <div className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </Field>
              <Field label="Password">
                <Input
                  isPassword
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              {/* Hidden for everyone: only an administrator resets or changes passwords (Users → Edit)
              <div className="flex justify-end -mt-2">
                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="py-1 text-xs font-medium text-brand-700 hover:text-brand-900 hover:underline transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
              */}
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <Button type="submit" loading={busy} className="w-full max-sm:h-10!">
                Sign In
              </Button>
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