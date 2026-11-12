import type { Metadata, Viewport } from "next";
import { WalletProvider } from "@/components/wallet-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "COVRA — A backstop for autonomous work", template: "%s | COVRA" },
  description: "Agent-native risk coverage. Evidence-led decisions on GenLayer and USDC reserves on Base.",
  openGraph: {
    title: "COVRA — A backstop for autonomous work",
    description: "Underwrite, protect and adjudicate the autonomous economy.",
    type: "website",
  },
};

// Keep the browser layout viewport aligned with the device width. This is
// especially important for injected-wallet mobile browsers, where a missing
// viewport declaration makes responsive CSS measure against a desktop-width
// layout viewport even when the physical screen is narrow.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
