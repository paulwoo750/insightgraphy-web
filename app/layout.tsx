import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: 'InsightGraphy | SKY 연합 프레젠테이션 학회 인사이트그래피', // 브라우저 탭에 표시될 이름
  description: '모든 생각은 가치있기에 공유되어야 마땅하다', // 검색 시 나타날 설명
  icons: {
    icon: '/logo.png', // public 폴더에 넣은 로고 파일 이름과 맞춰줘!
  },
  openGraph: {
    title: 'InsightGraphy | SKY 연합 프레젠테이션 학회',
    description: '모든 생각은 가치있기에 공유되어야 마땅하다',
    url: 'https://insightgraphy.org',
    siteName: 'InsightGraphy',
    locale: 'ko_KR',
    type: 'website',
    images: [
      {
        url: '/logo.png', // 공유 시 나타날 대표 이미지
        width: 800,
        height: 600,
      },
    ]
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
