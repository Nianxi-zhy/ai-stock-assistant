import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Stock Assistant — 智能 A 股投研终端",
  description: "AI 驱动的 A 股智能投研平台 · 每日自动筛选、分析、推荐",
  icons: [{ url: "/icon.png" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("theme");var root=document.documentElement;if(t==="dark"||(t===null&&window.matchMedia("(prefers-color-scheme:dark)").matches)){root.classList.add("dark")}else if(t==="cute"){root.classList.add("theme-cute")}}catch(e){}})()`
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
