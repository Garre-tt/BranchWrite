import type { Metadata } from "next";

import "./styles.css";
import { QueryProvider } from "@/ui/providers/query-provider";
import { BranchWriteApp } from "@/ui/workspace/branchwrite-app";

export const metadata: Metadata = {
  title: "BranchWrite",
  description:
    "A local writing environment where AI proposes and humans curate.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <BranchWriteApp />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
