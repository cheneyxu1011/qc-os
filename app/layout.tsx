import type { ReactNode } from "react";

export const metadata = {
  title: "QC OS",
  description: "Production quality corrective action workflow for Vanwell Factory OS."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

