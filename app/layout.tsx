import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "PianoGo",
  description: "Sheet music practice for beginner pianists.",
  icons: {
    icon: "/pianogo-logo.svg?v=2",
  },
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html className={cn("font-sans", geist.variable)} lang="en">
      <body>{children}</body>
    </html>
  );
}
