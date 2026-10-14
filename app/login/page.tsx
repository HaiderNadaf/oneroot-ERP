"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Field, Input, errMsg } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        {/* White logo sits on the green background, above the card */}
        <Image
          src="/logo-trimmed.png"
          alt="OneRoot.farm"
          width={480}
          height={138}
          priority
          className="mx-auto mb-6 h-auto w-60"
        />
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <div className="mb-6 flex flex-col items-center justify-center text-center">
            <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
            <p className="text-xs text-slate-500">
              Agri Inputs ERP — use your store account
            </p>
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
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" loading={busy} className="w-full">
              Sign in
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}