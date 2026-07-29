import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "H Mountain Retreat | Rest. Reconnect. Renew.",
    template: "%s | H Mountain Retreat",
  },
  description:
    "A peaceful Oklahoma retreat for camping, meaningful gatherings, weddings, family reunions, and renewal.",
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
