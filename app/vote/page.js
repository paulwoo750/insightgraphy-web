import { redirect } from 'next/navigation'

// 투표 허브는 GNB '실시간 투표' 드롭다운으로 대체되어 채점 화면으로 통합.
export default function VoteRedirect() {
  redirect('/vote/score')
}
