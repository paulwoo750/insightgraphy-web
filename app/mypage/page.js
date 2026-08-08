'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import InternalNav from '@/app/components/InternalNav'

export default function MyPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [fines, setFines] = useState([])
  const [attendance, setAttendance] = useState([])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      const name = session.user.user_metadata?.name
      if (name) {
        const { data: fData } = await supabase.from('pr_fines').select('*').eq('user_name', name).order('week', { ascending: false })
        setFines((fData || []).filter(f => !f.reason?.includes('[삭제됨]')))

        const { data: aData } = await supabase.from('pr_attendance').select('*').eq('user_name', name).order('week', { ascending: false })
        setAttendance(aData || [])
      }
      setLoading(false)
    }
    init()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading || !user) return <div className="min-h-screen bg-white flex items-center justify-center font-bold text-slate-400">불러오는 중... 🔄</div>

  const name = user.user_metadata?.name || '학회원'
  const gen = user.user_metadata?.student_id || ''
  const email = user.email

  const unpaidTotal = fines.filter(f => !f.is_paid).reduce((s, f) => s + (f.amount || 0), 0)
  const paidTotal = fines.filter(f => f.is_paid && f.amount > 0).reduce((s, f) => s + (f.amount || 0), 0)

  const attStats = {
    ok: attendance.filter(a => a.status === '출석완료').length,
    late: attendance.filter(a => a.status === '지각').length,
  }

  const fmtDate = (s) => { if (!s) return ''; const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

  return (
    <>
      <InternalNav />
      <div className="bg-white min-h-screen text-slate-900 font-sans p-6 md:p-12 pb-32">
        <div className="max-w-4xl mx-auto">

          {/* 프로필 헤더 */}
          <header className="mb-10 border-b border-slate-200 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
            <div>
              <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest mb-2">My Page</p>
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">{name} <span className="text-lg font-bold text-slate-400">{gen}</span></h1>
              <p className="text-sm font-medium text-slate-400 mt-1">{email}</p>
            </div>
            <button onClick={handleLogout} className="shrink-0 px-5 py-2.5 border border-slate-300 text-slate-500 text-xs font-bold hover:border-slate-900 hover:text-slate-900 transition-colors w-fit">로그아웃</button>
          </header>

          {/* 요약 스탯 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 border border-slate-200 mb-12">
            <Stat label="미납 벌금" value={`₩${unpaidTotal.toLocaleString()}`} tone={unpaidTotal > 0 ? 'red' : 'ok'} />
            <Stat label="누적 납부" value={`₩${paidTotal.toLocaleString()}`} />
            <Stat label="출석" value={`${attStats.ok}회`} />
            <Stat label="지각" value={`${attStats.late}회`} tone={attStats.late > 0 ? 'amber' : 'default'} />
          </div>

          {/* 벌금 내역 */}
          <section className="mb-12">
            <div className="flex justify-between items-end border-b border-slate-200 pb-3 mb-5">
              <h2 className="text-lg font-extrabold text-slate-900">💸 내 벌금 내역</h2>
              <span className="text-xs font-bold text-slate-400">미납 {fines.filter(f => !f.is_paid).length}건 · 전체 {fines.length}건</span>
            </div>
            {fines.length === 0 ? (
              <p className="text-slate-400 font-medium py-8 text-center border border-dashed border-slate-200">부과된 벌금이 없습니다. 👏</p>
            ) : (
              <div className="border-t border-slate-200">
                {fines.map(f => (
                  <div key={f.id} className="flex items-center justify-between py-3 border-b border-slate-100 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {f.semester && <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500">{f.semester}</span>}
                      <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 ${f.is_paid ? 'bg-slate-200 text-slate-500' : 'bg-teal-800 text-white'}`}>W{f.week}</span>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold truncate ${f.is_paid ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{f.category}</p>
                        <p className="text-xs text-slate-400 font-medium truncate">{f.reason}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-sm font-black ${f.is_paid ? 'text-slate-300 line-through' : 'text-red-500'}`}>₩{(f.amount || 0).toLocaleString()}</span>
                      <span className={`text-[9px] font-black px-2 py-0.5 uppercase ${f.is_paid ? (f.amount === 0 ? 'bg-teal-100 text-teal-600' : 'bg-emerald-100 text-emerald-600') : 'bg-red-100 text-red-600'}`}>
                        {f.is_paid ? (f.amount === 0 ? '면제' : '완납') : '미납'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] font-medium text-slate-400 mt-3">※ 과제·피드백 벌금은 자동 스캔되며, 세션 지각 등은 운영진이 반영합니다. 납부 문의는 총무에게.</p>
          </section>

          {/* 출석 이력 */}
          <section className="mb-12">
            <h2 className="text-lg font-extrabold text-slate-900 border-b border-slate-200 pb-3 mb-5">📍 출석 이력</h2>
            {attendance.length === 0 ? (
              <p className="text-slate-400 font-medium py-8 text-center border border-dashed border-slate-200">출석 기록이 없습니다.</p>
            ) : (
              <div className="border-t border-slate-200">
                {attendance.map(a => (
                  <div key={a.id} className="flex items-center justify-between py-3 border-b border-slate-100 gap-3">
                    <div className="flex items-center gap-3">
                      {a.semester && <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500">{a.semester}</span>}
                      <span className="shrink-0 text-[10px] font-black px-2 py-0.5 bg-teal-800 text-white">W{a.week}</span>
                      {a.session_type === 'weekday' && <span className="shrink-0 text-[10px] font-black px-2 py-0.5 bg-teal-100 text-teal-800">평일</span>}
                      <span className="text-sm font-bold text-slate-800">{a.status}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-400">{fmtDate(a.created_at)}{a.distance_m != null ? ` · ${a.distance_m}m` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 평가 기록 (연동 링크) */}
          <section>
            <h2 className="text-lg font-extrabold text-slate-900 border-b border-slate-200 pb-3 mb-5">📊 평가 기록</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link href="/vote/results/my" className="border border-slate-200 hover:border-teal-700 hover:bg-teal-50 p-5 transition-colors group">
                <p className="text-sm font-extrabold text-slate-800 group-hover:text-teal-800">내 성적·분석 보기 →</p>
                <p className="text-xs font-medium text-slate-400 mt-1">주차별 점수 추이·레이더·수상 내역</p>
              </Link>
              <Link href="/vote/results/arxiv" className="border border-slate-200 hover:border-teal-700 hover:bg-teal-50 p-5 transition-colors group">
                <p className="text-sm font-extrabold text-slate-800 group-hover:text-teal-800">내 피드백 모아보기 →</p>
                <p className="text-xs font-medium text-slate-400 mt-1">받은 정성·셀프 피드백 아카이브</p>
              </Link>
            </div>
          </section>

        </div>
      </div>
    </>
  )
}

function Stat({ label, value, tone = 'default' }) {
  const cls = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'ok' ? 'text-teal-800' : 'text-slate-900'
  return (
    <div className="bg-white p-5">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-extrabold ${cls}`}>{value}</p>
    </div>
  )
}
