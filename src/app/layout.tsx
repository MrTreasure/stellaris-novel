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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      style={{ colorScheme: 'dark' }}
    >
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        {/* 全局背景 */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(8,145,178,0.08),transparent_60%)]" />
          <div className="absolute inset-0 bg-[url('/images/bg-space.png')] bg-cover bg-center opacity-10" />
        </div>
        <nav className="relative z-20 border-b border-cyan-800/20 bg-gray-950/80 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <img src="/images/logo.png" alt="Stellaris" className="h-6 w-auto drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]" />
              <span className="text-base font-bold tracking-wider text-transparent bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text">银河编年史</span>
            </Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/campaigns" className="text-gray-400 hover:text-cyan-300 transition-colors">战役列表</Link>
              <Link href="/settings" className="text-gray-400 hover:text-cyan-300 transition-colors">设置</Link>
            </div>
          </div>
        </nav>
        <main className="relative z-10 flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
