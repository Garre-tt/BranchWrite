import type { Metadata } from "next";

import "./styles.css";

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
      <body>{children}</body>
    </html>
  );
}
