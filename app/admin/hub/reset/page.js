'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function SemesterResetPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [currentSemester, setCurrentSemester] = useState('')
  const [currentWeeks, setCurrentWeeks] = useState(0)
  const [currentType, setCurrentType] = useState('regular')

  // 이관 대상 현황
  const [fileCount, setFileCount] = useState(0)
  const [scheduleCount, setScheduleCount] = useState(0)
  const [scoreCount, setScoreCount] = useState(0)
  const [absenceCount, setAbsenceCount] = useState(0)
  const [attendCount, setAttendCount] = useState(0)
  const [fineCount, setFineCount] = useState(0)
  const [unpaidCount, setUnpaidCount] = useState(0)
  const [orphanCount, setOrphanCount] = useState(0) // 학기 미지정(NULL) 출석·벌금

  // 새 학기 설정
  const [newSemester, setNewSemester] = useState('')
  const [newWeeks, setNewWeeks] = useState(12)
  const [newType, setNewType] = useState('regular') // 'regular' 정규학기 | 'vacation' 방학학기
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) {
      router.push('/admin')
      return
    }
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    setLoading(true)

    const { data: config } = await supabase.from('pr_config').select('*')
    const sem = config?.find(c => c.key === 'current_semester')?.value || ''
    const wks = config?.find(c => c.key === 'total_weeks')?.value
    const sType = config?.find(c => c.key === 'semester_type')?.value || 'regular'
    setCurrentSemester(sem)
    setCurrentWeeks(wks ? Number(wks) : 0)
    setCurrentType(sType)

    if (sem) {
      const { count: fCount } = await supabase.from('files_metadata').select('*', { count: 'exact', head: true }).eq('semester', sem).eq('is_archive', false)
      setFileCount(fCount || 0)
      const { count: sCount } = await supabase.from('scores').select('*', { count: 'exact', head: true }).eq('semester', sem)
      setScoreCount(sCount || 0)

      // 🌟 출석·벌금은 학기 태그로 보존된다 (삭제 없음)
      const { count: atCount } = await supabase.from('pr_attendance').select('*', { count: 'exact', head: true }).eq('semester', sem)
      setAttendCount(atCount || 0)
      const { count: fnCount } = await supabase.from('pr_fines').select('*', { count: 'exact', head: true }).eq('semester', sem)
      setFineCount(fnCount || 0)
      const { count: upCount } = await supabase.from('pr_fines').select('*', { count: 'exact', head: true }).eq('semester', sem).eq('is_paid', false)
      setUnpaidCount(upCount || 0)
    }

    // 🌟 학기 미지정(NULL) 기록 — 새 학기로 넘어가면 학기가 섞이므로 리셋 시 현재 학기로 정리한다
    const { count: oaCount } = await supabase.from('pr_attendance').select('*', { count: 'exact', head: true }).is('semester', null)
    const { count: ofCount } = await supabase.from('pr_fines').select('*', { count: 'exact', head: true }).is('semester', null)
    setOrphanCount((oaCount || 0) + (ofCount || 0))

    const { count: schCount } = await supabase.from('pr_schedules').select('*', { count: 'exact', head: true })
    setScheduleCount(schCount || 0)

    const { count: aCount } = await supabase.from('absence_forms').select('*', { count: 'exact', head: true })
    setAbsenceCount(aCount || 0)

    setLoading(false)
  }

  const handleReset = async () => {
    if (!currentSemester) return alert('현재 학기 정보가 없습니다.')
    if (confirmText.trim() !== currentSemester) return alert(`확인을 위해 현재 학기명 "${currentSemester}" 을(를) 정확히 입력해주세요.`)
    if (!newSemester.trim()) return alert('새 학기 이름을 입력해주세요.')
    if (!newWeeks || newWeeks < 1) return alert('새 학기 주차 수를 1 이상으로 입력해주세요.')

    const typeLabel = newType === 'vacation' ? '방학학기' : '정규학기'
    const msg = `[${currentSemester}] → [${newSemester.trim()}] (${typeLabel} · ${newWeeks}주)\n\n` +
      `▸ 기획서·슬라이드·영상 → 과거 자료실로 보관\n` +
      `▸ 타임라인(일정) → 과거 자료실에 스냅샷 보관\n` +
      `▸ 사유서 → 과거 자료실에 스냅샷 보관 후 게시판 초기화\n` +
      `▸ 평가 점수·지표 → 그대로 보존 (개인 화면 유지)\n` +
      `▸ 출석·벌금 → [${currentSemester}] 학기 기록으로 보존 (미납 벌금 유지)\n` +
      `▸ 일정·마감·주차별 주제/조편성 → 초기화\n\n` +
      `이 작업은 되돌리기 어렵습니다. 계속할까요?`
    if (!confirm(msg)) return

    setBusy(true)
    try {
      // 1) 제출 파일(기획서/슬라이드/영상) 과거 자료실로 이관
      const { error: e1 } = await supabase.from('files_metadata')
        .update({ is_archive: true, category: '과거 자료실' })
        .eq('semester', currentSemester).eq('is_archive', false)
      if (e1) throw e1

      // 1-2) 🌟 학기 미지정(NULL) 출석·벌금을 마감하는 학기로 확정
      //      이 단계가 없으면 새 학기에서 지난 기록이 섞여 출석이 막히거나 벌금이 잘못 계산된다
      const { error: eA } = await supabase.from('pr_attendance').update({ semester: currentSemester }).is('semester', null)
      if (eA) throw eA
      const { error: eF } = await supabase.from('pr_fines').update({ semester: currentSemester }).is('semester', null)
      if (eF) throw eF

      // 2) 타임라인 스냅샷을 archive_files 에 보관 (학기별 1건)
      const { data: sch } = await supabase.from('pr_schedules').select('*').order('full_date', { ascending: true })
      if (sch && sch.length > 0) {
        await supabase.from('archive_files').delete().eq('category', 'timeline').eq('file_type', currentSemester)
        const { error: e2 } = await supabase.from('archive_files').insert([{
          uploader_name: 'SYSTEM',
          category: 'timeline',
          file_type: currentSemester,
          semester: currentSemester,
          title: `${currentSemester} 타임라인`,
          file_url: '',
          description: JSON.stringify(sch)
        }])
        if (e2) throw e2
      }

      // 2-2) 사유서 스냅샷을 archive_files 에 보관 후 게시판 초기화
      const { data: abs } = await supabase.from('absence_forms').select('*').order('created_at', { ascending: false })
      if (abs && abs.length > 0) {
        await supabase.from('archive_files').delete().eq('category', 'absence').eq('file_type', currentSemester)
        const { error: e2b } = await supabase.from('archive_files').insert([{
          uploader_name: 'SYSTEM',
          category: 'absence',
          file_type: currentSemester,
          semester: currentSemester,
          title: `${currentSemester} 사유서`,
          file_url: '',
          description: JSON.stringify(abs)
        }])
        if (e2b) throw e2b
        await supabase.from('absence_forms').delete().not('id', 'is', null)
      }

      // 2-3) 주차별 주제(week_topics) 스냅샷 보관 (과거 자료실 주제 표시용)
      const { data: wtCfg } = await supabase.from('pr_config').select('value').eq('key', 'week_topics').single()
      if (wtCfg?.value && wtCfg.value !== '{}') {
        await supabase.from('archive_files').delete().eq('category', 'topics').eq('file_type', currentSemester)
        await supabase.from('archive_files').insert([{
          uploader_name: 'SYSTEM', category: 'topics', file_type: currentSemester, semester: currentSemester,
          title: `${currentSemester} 주차별 주제`, file_url: '', description: wtCfg.value
        }])
      }

      // 3) 현재 타임라인 초기화
      await supabase.from('pr_schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      // 4) 마감 일정 초기화 (week/category 전역)
      await supabase.from('pr_deadlines').delete().gte('week', 0)

      // 5) 새 학기 설정 (점수/발표/사유서 테이블은 건드리지 않음 → 개인 기록 보존)
      const { error: e5 } = await supabase.from('pr_config').upsert([
        { key: 'current_semester', value: newSemester.trim() },
        { key: 'semester_type', value: newType },
        { key: 'total_weeks', value: String(newWeeks) },
        { key: 'current_week', value: '1' },
        { key: 'week_topics', value: '{}' },
        { key: 'weekly_setup', value: '{}' }
      ])
      if (e5) throw e5

      alert(`학기 리셋 완료! [${newSemester.trim()}] 학기가 시작되었습니다. 🎉`)
      router.push('/admin/hub')
    } catch (err) {
      alert('오류 발생: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center font-bold text-slate-400">현황 불러오는 중... 🔄</div>

  const canReset = confirmText.trim() === currentSemester && newSemester.trim() && newWeeks >= 1

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-3xl mx-auto">

        <header className="mb-10 border-b border-slate-200 pb-6">
          <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-teal-800 uppercase tracking-widest mb-3 block transition-colors">← Back to Hub</Link>
          <h1 className="text-3xl md:text-4xl font-extrabold text-teal-800 tracking-tight">Semester Reset</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">학기를 마감하며 자료를 과거 자료실로 이관하고, 새 학기를 설정합니다.</p>
        </header>

        {/* 현재 학기 현황 */}
        <section className="mb-10">
          <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest border-b border-teal-800 pb-2 mb-5">Current Semester</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-slate-200 border border-slate-200">
            <Stat label="현재 학기" value={currentSemester || '—'} />
            <Stat label="학기 유형" value={currentType === 'vacation' ? '방학학기' : '정규학기'} />
            <Stat label="운영 주차" value={currentWeeks ? `${currentWeeks}주` : '—'} />
            <Stat label="이관 대상 파일" value={`${fileCount}건`} />
            <Stat label="타임라인 일정" value={`${scheduleCount}건`} />
            <Stat label="출석 기록" value={`${attendCount}건`} />
            <Stat label="벌금 기록" value={`${fineCount}건`} />
            <Stat label="미납 벌금" value={`${unpaidCount}건`} />
          </div>
          {unpaidCount > 0 && (
            <p className="text-xs font-bold text-amber-700 mt-3">⚠️ 미납 벌금 {unpaidCount}건이 남아 있습니다. 마감 전 정산을 권장합니다. (리셋해도 기록은 보존됩니다)</p>
          )}
        </section>

        {/* 무엇이 어떻게 되는지 */}
        <section className="mb-10">
          <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest border-b border-teal-800 pb-2 mb-5">What Happens</p>
          <div className="space-y-3">
            <Row tone="move" title="기획서 · 슬라이드 · 발표영상" desc={`${fileCount}건을 과거 자료실로 이관 (삭제 아님, 보관)`} />
            <Row tone="move" title="타임라인 (일정표)" desc={`${scheduleCount}건을 과거 자료실에 학기 스냅샷으로 보관`} />
            <Row tone="move" title="사유서 (결석·지각·조퇴)" desc={`${absenceCount}건을 과거 자료실에 스냅샷 보관 후 게시판 비움`} />
            <Row tone="keep" title="평가 점수 · 지표 기록" desc={`${scoreCount}건 그대로 보존 — 개인 화면에서 계속 표시`} />
            <Row tone="keep" title="출석 · 벌금 기록" desc={`출석 ${attendCount}건 · 벌금 ${fineCount}건을 [${currentSemester || '현재'}] 학기 기록으로 보존 (미납 벌금 유지)`} />
            <Row tone="clear" title="일정 · 마감시간 · 주차별 주제/조편성" desc="새 학기를 위해 초기화" />
            {orphanCount > 0 && (
              <Row tone="move" title="학기 미지정 출석·벌금 정리" desc={`${orphanCount}건을 [${currentSemester}] 학기로 확정 — 새 학기에 지난 기록이 섞이는 것을 방지`} />
            )}
          </div>
        </section>

        {/* 새 학기 설정 */}
        <section className="mb-10">
          <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest border-b border-teal-800 pb-2 mb-5">New Semester</p>

          {/* 🌟 학기 유형 선택 (정규학기 / 방학학기) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            <button
              type="button"
              onClick={() => setNewType('regular')}
              className={`text-left p-5 border transition-colors ${newType === 'regular' ? 'border-teal-800 bg-teal-50' : 'border-slate-200 hover:border-teal-400'}`}
            >
              <p className={`text-sm font-extrabold mb-1 ${newType === 'regular' ? 'text-teal-800' : 'text-slate-700'}`}>📚 정규학기</p>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">주 1회 정규세션 (토요일)<br/>기획서 → 피드백 → 발표 → 정량·정성 평가</p>
            </button>
            <button
              type="button"
              onClick={() => setNewType('vacation')}
              className={`text-left p-5 border transition-colors ${newType === 'vacation' ? 'border-teal-800 bg-teal-50' : 'border-slate-200 hover:border-teal-400'}`}
            >
              <p className={`text-sm font-extrabold mb-1 ${newType === 'vacation' ? 'text-teal-800' : 'text-slate-700'}`}>🏖️ 방학학기</p>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">정규세션(매주) + 평일세션(주차별 선택)<br/>평일세션: 기획서·정량평가 없음, 발표 집중 피드백</p>
            </button>
          </div>

          {newType === 'vacation' && (
            <div className="border-l-[3px] border-teal-800 bg-teal-50/50 px-4 py-3 mb-8">
              <p className="text-xs font-bold text-teal-900 leading-relaxed">
                방학학기 운영 방식
              </p>
              <ul className="text-xs font-medium text-slate-600 leading-relaxed mt-1 list-disc list-inside space-y-0.5">
                <li>정규세션은 정규학기와 동일하게 매주 진행됩니다.</li>
                <li>평일세션(화~목 중 조별 진행)은 <b>주차별 세팅에서 켜고 끌 수 있습니다</b> — 기업세션 시작 시 꺼주세요.</li>
                <li>평일세션은 기획서 제출·피드백 없이 발표자료·영상·정성/셀프 피드백만 진행합니다.</li>
                <li>평일세션은 정량평가(채점)와 베스트 프레젠터 선정을 진행하지 않습니다.</li>
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">새 학기 이름</label>
              <input type="text" value={newSemester} onChange={e => setNewSemester(e.target.value)} placeholder={newType === 'vacation' ? '예: 2026-겨울' : '예: 2026-2'} className="w-full border-b border-slate-300 py-2.5 text-sm font-bold outline-none focus:border-teal-700 bg-transparent transition-colors placeholder:font-medium placeholder:text-slate-300" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">주차 수</label>
              <input type="number" min="1" value={newWeeks} onChange={e => setNewWeeks(Number(e.target.value))} className="w-full border-b border-slate-300 py-2.5 text-sm font-bold outline-none focus:border-teal-700 bg-transparent transition-colors" />
            </div>
          </div>
        </section>

        {/* 확인 및 실행 */}
        <section className="border border-red-200 bg-red-50/40 p-6">
          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Danger Zone</p>
          <p className="text-sm font-medium text-slate-600 mb-4">
            실행하려면 현재 학기명 <span className="font-black text-red-600">{currentSemester || '—'}</span> 을(를) 그대로 입력하세요.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="현재 학기명 입력"
            className="w-full border-b border-red-300 py-2.5 text-sm font-bold text-red-600 outline-none focus:border-red-500 bg-transparent transition-colors placeholder:font-medium placeholder:text-red-200 mb-6"
          />
          <button
            onClick={handleReset}
            disabled={!canReset || busy}
            className="w-full py-4 bg-red-600 text-white font-bold text-sm tracking-wide hover:bg-red-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 active:scale-[0.99]"
          >
            {busy ? '처리 중...' : '학기 마감 & 새 학기 시작'}
          </button>
        </section>

      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-white p-5">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-lg font-extrabold text-slate-900 truncate">{value}</p>
    </div>
  )
}

function Row({ tone, title, desc }) {
  const map = {
    move: { tag: '이관', cls: 'bg-teal-100 text-teal-800' },
    keep: { tag: '보존', cls: 'bg-emerald-100 text-emerald-700' },
    clear: { tag: '초기화', cls: 'bg-red-100 text-red-600' }
  }
  const m = map[tone]
  return (
    <div className="flex items-center gap-4 border-b border-slate-200 pb-3">
      <span className={`shrink-0 text-[9px] font-black px-2 py-1 uppercase tracking-widest ${m.cls}`}>{m.tag}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="text-xs font-medium text-slate-400">{desc}</p>
      </div>
    </div>
  )
}
