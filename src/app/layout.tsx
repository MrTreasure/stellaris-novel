import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "银河编年史 - 群星小说生成器",
  description: "基于Stellaris游戏存档自动生成银河史诗小说",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 text-lg font-bold tracking-wide text-cyan-400 hover:text-cyan-300 transition-colors">
              <img src="/images/logo.png" alt="Stellaris" className="h-7 w-auto" />
              <span>银河编年史</span>
            </Link>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/campaigns" className="text-gray-400 hover:text-gray-200 transition-colors">
                战役列表
              </Link>
              <Link href="/settings" className="text-gray-400 hover:text-gray-200 transition-colors">
                设置
              </Link>
            </div>
          </div>
        </nav>
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
