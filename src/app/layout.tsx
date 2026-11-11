import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { app } from "@/server/app";
import { ownerCredential } from "@/server/session";
import { resetDemo, signOut } from "./actions";
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
  title: "ProofPay",
  description: "AI agents that buy and pay, but only for verified work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} lang="en">
      <body className="flex min-h-full flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3 text-sm">
          <Link className="font-bold" href="/">
            ProofPay
          </Link>
          <Link className="ml-6 underline" href="/scenarios">
            Demo scenarios
          </Link>
          <Link className="ml-4 mr-auto underline" href="/ledger">
            Ledger
          </Link>
          <Suspense fallback={null}>
            <OwnerBar />
          </Suspense>
        </header>
        {children}
      </body>
    </html>
  );
}

async function OwnerBar() {
  if (!app().isOwner(await ownerCredential())) {
    return (
      <Link className="underline" href="/login">
        Owner sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <span className="text-green-700">Signed in as owner</span>
      <form action={resetDemo}>
        <button className="underline" type="submit">
          Reset demo
        </button>
      </form>
      <form action={signOut}>
        <button className="underline" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}
