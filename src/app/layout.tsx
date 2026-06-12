import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";
import { SeedProvider } from "@/components/providers/seed-provider";
import { KeyboardProvider } from "@/components/providers/keyboard-provider";
import { ThemeApplier } from "@/components/providers/theme-provider";
import { VaultProvider } from "@/components/providers/vault-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MasarFlow — Every feature has a path",
  description:
    "AI-native development workflow platform. From idea to implementation — with memory.",
  applicationName: "MasarFlow",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a23" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrains.variable} dark`}>
      <body className="font-sans antialiased">
        <ThemeApplier>
          <TooltipProvider delayDuration={250}>
            <SeedProvider>
              <KeyboardProvider>
                <VaultProvider>
                  {children}
                  <Toaster />
                </VaultProvider>
              </KeyboardProvider>
            </SeedProvider>
          </TooltipProvider>
        </ThemeApplier>
      </body>
    </html>
  );
}
