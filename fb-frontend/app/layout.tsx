import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";


const geistSans = Geist({ 
  variable: "--font-geist-sans",
  subsets: ["latin"],
});


const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FileBox — The right tool for every file",
  description: "Compress, convert, merge, and work with files in one focused place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><SiteHeader />{children}
        <footer className="site-footer"><div className="container"><Link href="/" className="brand"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span>FileBox</Link>
          <p>File work, without the friction.</p><nav aria-label="Footer"><Link href="/pdf">PDF</Link><Link href="/images">Images</Link>
            <Link href="/office">Documents</Link><Link href="/#about">About</Link></nav></div></footer>
      </body>
    </html>
  );
}
