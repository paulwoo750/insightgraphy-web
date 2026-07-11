import { redirect } from 'next/navigation'

// 결과 허브는 GNB '실시간 투표' 드롭다운으로 대체되어 내 결과 화면으로 통합.
export default function ResultsRedirect() {
  redirect('/vote/results/my')
}
