import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Wordmark only — the interface stays on Inter.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

// Studio's poster caption. Self-hosted like the others, so the worker's headless
// export renderer draws the very same typeface as the preview (see render.ts).
const posterSerif = Playfair_Display({
  variable: "--font-poster-serif",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  // Absolute URLs for the Open Graph image; NEXT_PUBLIC_APP_URL is in .env.example.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  // FE-37: pages set their own title; this frames it. The default is the landing page's.
  title: { default: "Maceut: scheduled traffic capture for road agencies", template: "%s · Maceut" },
  description:
    "Draw a zone, set the hours, and Maceut collects traffic flow on schedule so you can replay or export it.",
  applicationName: "Maceut",
  // A real Maceut capture (Yogyakarta, 17:15 WIB, 7 Oct 2026), not a stand-in (FE-38).
  openGraph: {
    type: "website",
    siteName: "Maceut",
    title: "Maceut: scheduled traffic capture for road agencies",
    description: "Draw a zone, set the hours, and Maceut collects traffic flow on schedule so you can replay or export it.",
    images: [{ url: "/landing/capture-yogyakarta-1715-dark.webp", width: 1080, height: 1080, alt: "Yogyakarta traffic at 17:15 WIB, captured by Maceut" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable} ${posterSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-page text-text-primary">
        {children}
      </body>
    </html>
  );
}
