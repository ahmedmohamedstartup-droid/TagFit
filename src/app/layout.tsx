import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TagFit — الحالة العامة للبراند",
  description: "داشبورد يعرض حالة المبيعات والشحن والتحصيلات والمرتجعات بناءً على التاريخ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
