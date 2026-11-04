import type { Metadata } from "next";
import { preload } from "react-dom";
import { lookScript } from "@/lib/look";
import { laparToken } from "@/lib/tokens";
import "./globals.css";

// "/lapar-wheel/": plain paths like these don't get the basePath on their own.
const base = import.meta.env.BASE_URL;
const og = { url: `${base}og-night.jpg`, width: 1200, height: 630 };

export const metadata: Metadata = {
  metadataBase: new URL("https://built4you.jasperntc.dev"),
  title: "Lapar Wheel",
  description: "Spin a wheel to pick where to eat near you.",
  // Every ?p= share link is the same page to search engines.
  alternates: { canonical: "https://built4you.jasperntc.dev/lapar-wheel" },
  icons: {
    icon: `${base}favicon-32.png`,
    apple: `${base}apple-touch-icon.png`,
  },
  // Apps cache the preview at first share, so it's the night one at any hour.
  openGraph: { images: [og] },
  twitter: { card: "summary_large_image", images: [og] },
};

// Browser chrome matches the ground. The inline script makes the only theme-color meta and switches it with the look.
const ground = laparToken("ground");

export default function RootLayout({ children }: LayoutProps<"/">) {
  for (const font of ["Bungee-latin-400", "Figtree-latin-400"]) {
    preload(`${base}fonts/${font}.woff2`, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }

  return (
    // The inline script sets data-look before first paint, so React keeps the DOM's value.
    <html lang="en" data-look="day" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: lookScript(ground) }} />
      </head>
      <body className="min-h-dvh font-body text-body text-ink antialiased">{children}</body>
    </html>
  );
}
