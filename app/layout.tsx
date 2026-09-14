import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clothing Finder — Find your piece",
  description: "Find clothing across resale and replica marketplaces. Compare prices, seller evidence, and proxy costs.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
