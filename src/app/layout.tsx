import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Editor de vídeo grátis que roda 100% no navegador: timeline com faixas, legendas automáticas karaokê, detector de silêncio, gravação de voz, busca de músicas e efeitos livres. Sem marca d'água.";

export const metadata: Metadata = {
  title: "GalaxyCut — Editor de vídeo grátis no navegador",
  description: DESCRIPTION,
  applicationName: "GalaxyCut",
  keywords: ["editor de vídeo", "editor de vídeo online", "shorts", "legendas automáticas", "capcut grátis", "galaxycut"],
  icons: {
    icon: [{ url: "favicon.svg", type: "image/svg+xml" }, { url: "icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "icon-192.png" }],
  },
  manifest: undefined,
  openGraph: {
    title: "GalaxyCut — Editor de vídeo grátis no navegador",
    description: DESCRIPTION,
    type: "website",
    siteName: "GalaxyCut",
  },
  twitter: {
    card: "summary_large_image",
    title: "GalaxyCut — Editor de vídeo grátis no navegador",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#080b11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#080b11] text-zinc-200`}
      >
        {/* fontes de legenda/thumbnail (Anton, Bangers, Luckiest Guy, Bebas Neue) — React 19 sobe pro <head> */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Bebas+Neue&family=Luckiest+Guy&display=swap"
          rel="stylesheet"
        />
        {children}
        <Toaster theme="dark" position="bottom-left" richColors />
      </body>
    </html>
  );
}
