import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-chart-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ChartDesk — easychart research workspace",
  description:
    "TradingView-like chart workspace linked to legally ingested easychart membership notes. Not investment advice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${plexSans.variable} ${plexMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full font-[family-name:var(--font-plex-sans)]">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
