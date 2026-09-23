import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "המרחב המתמטי – אלגברה וגאומטריה אנליטית",
  description: "סביבת עבודה אינטראקטיבית לנקודות, ישרים, זוויות ופונקציות קוויות, ריבועיות וכלליות",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
