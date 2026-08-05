import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://savvytechautomations.com"),
  title: "SavvyTech Automations | AI Receptionists, Sales Agents & Automation",
  description: "SavvyTech builds AI receptionists, AI sales agents, workflow automations, custom apps, dashboards, and SOPsync for growing businesses.",
  keywords: ["AI receptionist", "AI sales agent", "workflow automation", "custom business apps", "business dashboards", "SOPsync"],
  openGraph: {
    title: "SavvyTech Automations — AI that works like part of your team",
    description: "Answer every call, follow up with every lead, and automate the work slowing your team down.",
    url: "https://savvytechautomations.com",
    siteName: "SavvyTech Automations",
    type: "website",
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
