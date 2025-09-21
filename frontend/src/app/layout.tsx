import "./globals.css";
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ChatProvider } from "@/components/chat/chat-context";

export const metadata: Metadata = {
  title: "Researcher",
  description: "Agent to connect to you Finance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const modelName = process.env.NEXT_PUBLIC_MODEL_NAME || "gemini/gemini-2.5-flash";

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased dot-matrix-bg"
      >
        <ThemeProvider>
          <ChatProvider apiUrl={apiUrl} modelName={modelName}>
            {children}
            <Toaster />
          </ChatProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}