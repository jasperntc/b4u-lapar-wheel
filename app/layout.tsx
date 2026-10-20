import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import { brandToken } from "@/lib/brand-tokens";
import "./globals.css";

// "/lapar-wheel/": plain paths like these don't get the basePath on their own.
const base = import.meta.env.BASE_URL;

export const metadata: Metadata = {
  metadataBase: new URL("https://built4you.jasperntc.dev"),
  title: "Lapar Wheel",
  description: "Spin a wheel to pick where to eat in Kota Kinabalu.",
  icons: {
    icon: `${base}brand/b4u-favicon.svg`,
    apple: `${base}apple-touch-icon.png`,
  },
};

// Browser chrome matches the kraft ground in each theme.
const kraft = brandToken("surface-kraft");
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: kraft.light },
    { media: "(prefers-color-scheme: dark)", color: kraft.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  preload(`${base}fonts/BricolageGrotesque-latin.woff2`, {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });

  return (
    <html lang="en">
      <body className="min-h-dvh bg-surface-kraft font-sans text-body text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
