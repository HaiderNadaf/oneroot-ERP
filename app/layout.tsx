import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { ConfirmProvider, ToastProvider } from "@/components/ui";
import { AuthProvider } from "@/lib/auth";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

/** Headings and big numbers */
const displayFont = Bricolage_Grotesque({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "OneRoot ERP", template: "%s · OneRoot ERP" },
  description: "Inventory, billing, purchasing and accounts for agri-input stores",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the theme script below adds the "dark" class before React hydrates
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies the saved light / dark theme before the first paint, so pages never flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Suspense>{children}</Suspense>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
