import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Impacta CVs",
  description: "Internal consultant CV repository for Impacta Strategy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="bg-impacta text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="text-xl font-semibold tracking-tight">Impacta</span>
              <span className="text-impacta-accent text-sm uppercase tracking-widest">CVs</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:text-impacta-accent">Dashboard</Link>
              <Link href="/projects" className="hover:text-impacta-accent">Projects</Link>
              <Link href="/capacity" className="hover:text-impacta-accent">Capacity</Link>
              <Link href="/consultants" className="hover:text-impacta-accent">Consultants</Link>
              <Link
                href="/upload"
                className="rounded border border-white/30 px-3 py-1.5 hover:bg-white/10"
              >
                Add CV
              </Link>
              <Link
                href="/projects/new"
                className="bg-impacta-accent text-impacta rounded px-3 py-1.5 font-medium hover:opacity-90"
              >
                Staff a project
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
