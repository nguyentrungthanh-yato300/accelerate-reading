import type { Metadata } from "next";
import { Geist, Geist_Mono, Literata } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Literata is designed for long-form screen reading and covers Vietnamese.
const literata = Literata({ variable: "--font-reading", subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Accelerate Reading",
  description: "Evidence-based training to read technical documents faster and remember more.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. page translation, dark mode)
    // add classes/attributes to <html> before React hydrates.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${literata.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-stone-200 dark:border-stone-800">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Accelerate<span className="text-amber-600">Reading</span>
            </Link>
            <Link href="/" className="text-sm text-stone-600 hover:text-foreground dark:text-stone-400">
              Practice
            </Link>
            <Link href="/history" className="text-sm text-stone-600 hover:text-foreground dark:text-stone-400">
              Progress
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
