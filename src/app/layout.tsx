import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MIRA — Autonomous Verifiable Credit Agent",
  description: "MIRA underwrites, disburses, and manages micro-loans on Creditcoin using Attestcoin-verified cross-chain data, and accrues a portable on-chain reputation it cannot fake.",
  keywords: ["MIRA", "Creditcoin", "Attestcoin", "on-chain credit", "AI agent", "DeFi", "Ethereum"],
  authors: [{ name: "MIRA" }],
  openGraph: {
    title: "MIRA — Autonomous Verifiable Credit Agent",
    description: "Cryptographically verified credit decisions on Creditcoin, powered by Attestcoin.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MIRA — Autonomous Verifiable Credit Agent",
    description: "Cryptographically verified credit decisions on Creditcoin, powered by Attestcoin.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
