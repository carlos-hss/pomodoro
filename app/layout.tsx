import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Instrument_Sans } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--font-display",
});

const text = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-text",
});

export const metadata: Metadata = {
  title: "Pomodoro",
  description: "Timer pomodoro com tempos de foco e pausa ajustáveis.",
};

export const viewport: Viewport = {
  themeColor: "#D7301F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
