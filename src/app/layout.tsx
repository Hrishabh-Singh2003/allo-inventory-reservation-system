import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StockLock | Concurrency-Safe Inventory Control Room",
  description:
    "Enterprise-grade concurrency-safe inventory reservation and stock keeper dashboard.",
};

import { Navbar } from "@/components/navigation/navbar";
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <Navbar />
        <main className="container mx-auto flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
