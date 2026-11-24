import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "pine kitchen",
  description: "Where Tanya cooks her classes: notes, slides, presenting and fact-checking.",
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
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body>
        <div className="shell">
          <Suspense>
            <Nav />
          </Suspense>
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
