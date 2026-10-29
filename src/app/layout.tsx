import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { MobileNav, MobileTopBar, SideNav } from "@/components/nav";
import "./globals.css";

const font = Be_Vietnam_Pro({
  variable: "--font-body",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "BodyMetrics",
  description: "Nhật ký ăn uống, tập luyện và cân nặng trong quá trình giảm cân",
  appleWebApp: { capable: true, title: "BodyMetrics", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171b21" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={`${font.variable} font-sans antialiased`}>
        <div className="flex min-h-dvh">
          <SideNav />
          <div className="min-w-0 flex-1">
            <MobileTopBar />
            <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-24 sm:px-6 md:pt-8 md:pb-10">{children}</main>
          </div>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
