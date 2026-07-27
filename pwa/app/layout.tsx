import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const description =
    "Enterprise Sales Intelligence Platform for governed Daily Raw, Mapping and Admin confirmation.";
  return {
    metadataBase: base,
    title: {
      default: "ESIP Enterprise Intelligence",
      template: "%s · ESIP",
    },
    description,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
      apple: "/favicon.svg",
    },
    openGraph: {
      title: "ESIP Enterprise Intelligence",
      description,
      type: "website",
      images: [{ url: "/og.png", width: 1792, height: 1024, alt: "ESIP Enterprise Sales Intelligence" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ESIP Enterprise Intelligence",
      description,
      images: ["/og.png"],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#061626",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
