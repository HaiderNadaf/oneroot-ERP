/**
 * OneRoot logo files in /public: `width` / `height` are each image's pixel size (for next/image). A plain module, not
 * client-only, so server components (the landing page) can read it as well as the client ones.
 */
export const LOGOS = {
  /** Stacked "one / root" (login, forgot password, invoices, the landing brochure and other printed documents and PDFs) */
  vertical: { src: "/logo-vertical.png", width: 900, height: 563 },
  /** "oneroot" on one line (sidebar, landing page header and footer) */
  horizontal: { src: "/logo-horizontal.png", width: 1200, height: 257 },
  /** The older OneRoot.farm logo (no longer used on any page) */
  classic: { src: "/full_logo.png", width: 1630, height: 640 },
} as const;
export type LogoImage = { src: string; width: number; height: number };
