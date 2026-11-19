import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "pine studio",
  description: "Teaching studio for Art Appreciation: library, classes, lesson prep, fact-checking.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Darkroom mode is applied before paint so there's no white flash.
const theme = `try{var t=localStorage.getItem("pine.theme");if(t)document.documentElement.dataset.theme=JSON.parse(t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
