import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import Image from "next/image";
import { ArchiveIcon, SettingsIcon } from "@/components/Icons";

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
      className="h-full antialiased dark"
      style={{ colorScheme: 'dark' }}
    >
      <body className="min-h-full flex flex-col">
        {/* Cloudflare Web Analytics */}
        <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "0310317750684c17888142a9332dc71a"}' />
        {/* End Cloudflare Web Analytics */}
        <a href="#main-content" className="skip-link">跳至主要内容</a>
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <Image
            src="/images/nomads-background.png"
            alt=""
            fill
            className="object-cover opacity-55"
            priority
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(50,201,190,0.04),transparent_40%),radial-gradient(ellipse_at_85%_30%,rgba(92,110,185,0.03),transparent_36%),linear-gradient(180deg,rgba(3,10,18,0.15),rgba(3,8,17,0.45)_60%)]" />
          <div className="stellar-grid absolute inset-0 opacity-45" />
        </div>
        {/* Version tag */}
        <div className="fixed bottom-4 right-5 z-50 font-mono text-xs tracking-[0.22em] text-[#5eb8af]/80 select-none pointer-events-none">
          Stellaris v4.4.3
        </div>
        <nav className="relative z-20 border-b border-[#376d73]/35 bg-[#030811]/88 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="group flex min-h-11 items-center gap-3">
              <span className="relative flex h-9 w-9 items-center justify-center border border-[#58c6bb]/45 bg-[#071722]/80 [clip-path:polygon(18%_0,100%_0,100%_82%,82%_100%,0_100%,0_18%)]">
                <Image src="/images/logo.png" alt="" width={30} height={30} className="h-6 w-auto object-contain opacity-90 transition group-hover:drop-shadow-[0_0_8px_rgba(97,223,206,0.65)]" />
              </span>
              <span>
                <span className="block text-sm font-semibold tracking-[0.18em] text-[#d9f3ef]">银河编年史</span>
                <span className="hidden text-[9px] tracking-[0.28em] text-[#65979a] sm:block">STELLARIS ARCHIVE</span>
              </span>
            </Link>
            <div className="flex items-center gap-1 text-sm font-medium">
              <Link href="/campaigns" className="nav-link">
                <ArchiveIcon className="h-4 w-4" />
                <span>战役档案</span>
              </Link>
              <Link href="/settings" className="nav-link">
                <SettingsIcon className="h-4 w-4" />
                <span>系统设置</span>
              </Link>
            </div>
          </div>
        </nav>
        <main id="main-content" className="relative z-10 flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
