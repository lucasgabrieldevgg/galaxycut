import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Identidade SALA DE MONTAGEM: Archivo (UI de editor, industrial e compacta)
// + Martian Mono (timecodes e números tabulares). Zero fonte-default de template.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});
const martian = Martian_Mono({
  variable: "--font-martian",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Free video editor that runs 100% in your browser: multi-track timeline, automatic karaoke captions, silence detector, voice recording, free music & SFX search. No watermark.";

export const metadata: Metadata = {
  title: "GalaxyCut — Free video editor in your browser",
  description: DESCRIPTION,
  applicationName: "GalaxyCut",
  keywords: ["video editor", "free video editor", "online video editor", "shorts", "automatic captions", "galaxycut"],
  icons: {
    icon: [{ url: "favicon.svg", type: "image/svg+xml" }, { url: "icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "icon-192.png" }],
  },
  manifest: undefined,
  openGraph: {
    title: "GalaxyCut — Free video editor in your browser",
    description: DESCRIPTION,
    type: "website",
    siteName: "GalaxyCut",
  },
  twitter: {
    card: "summary_large_image",
    title: "GalaxyCut — Free video editor in your browser",
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
        className={`${archivo.variable} ${martian.variable} antialiased bg-[#080b11] text-zinc-200`}
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
