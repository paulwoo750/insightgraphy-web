// 이 표시가 있는 페이지(내부·관리자·앱)는 다크 모드를 따른다 (app/dark-theme.css의 :has(.ig-themed)).
// 공개 홈페이지는 따로 디자인돼 있어 늘 밝게 둔다.
export default function ThemeScope() {
  return <span className="ig-themed" hidden />
}
