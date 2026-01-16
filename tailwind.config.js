// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 커스텀 컬러 추가
        brand: {
          primary: '#32a4a1', // 로고의 메인 청록색
          secondary: '#a8d0cd', // 로고의 밝은 청록색
          dark: '#0d6b69', // 로고의 어두운 청록색
          black: '#1a1a1a', // 로고의 검은색 부분
        },
      },
      fontFamily: {
        // 전문적인 느낌을 위한 폰트 설정 (선택 사항, 예시: Pretendard)
        sans: ['var(--font-pretendard)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}