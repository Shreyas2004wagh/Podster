import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Podster | Remote recording for podcasters",
  description:
    "Riverside-style remote recording MVP with local capture, resumable uploads, and a clean UX.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-20 border-b border-white/5 bg-black/50 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <div className="text-lg font-semibold tracking-tight text-white">Podster</div>
              <div className="flex items-center gap-3 text-sm text-slate-200">
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-200">
                  Local-first recording
                </span>
                <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-indigo-100">
                  Upload after stop
                </span>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
