import { AppShell } from "@/components/AppShell";

/**
 * ERP pages load their data in the browser after sign-in, so there is nothing for the server to
 * prefetch. Opting out of instant-navigation validation stops dev-mode overlay errors on every page.
 */
export const instant = false;

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
