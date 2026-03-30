'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function FineAdmin() {
  const [loading, setLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const scanLock = useRef(false) // 🌟 중복 실행 방지를 위한 자물쇠 (Lock)
  
  // 데이터 상태
  const [members, setMembers] = useState([])
  const [fines, setFines] = useState([])
  const [penalties, setPenalties] = useState({})
  
  // 수동 벌금 입력 상태
  const [manualFine, setManualFine] = useState({
    user_name: '', week: 1, category: '세션 지각', amount: '', reason: ''
  })

  useEffect(() => {
    fetchAndScanData()
  }, [])

  // ==========================================
  // 🧮 핵심: 데이터 로드 및 100% 동기화 자동 스캐너
  // ==========================================
  const fetchAndScanData = async () => {
    // 🌟 스캐너가 이미 돌고 있다면 중단! (React Strict Mode 더블 렌더링 방어)
    if (scanLock.current) return
    scanLock.current = true
    setLoading(true)
    setIsScanning(true)

    try {
      // 1. 기초 데이터 불러오기
      const { data: memData } = await supabase.from('pr_members').select('*').eq('is_active', true).order('name')
      const activeMembers = memData || []
      setMembers(activeMembers)

      const { data: configData } = await supabase.from('pr_config').select('*')
      let currentPenalties = {}
      let weeklySetup = {}
      let totalWeeks = 12
      if (configData) {
        const penVal = configData.find(c => c.key === 'penalty_rules')?.value
        const wsVal = configData.find(c => c.key === 'weekly_setup')?.value
        const tWks = configData.find(c => c.key === 'total_weeks')?.value
        if (penVal) currentPenalties = JSON.parse(penVal)
        if (wsVal) weeklySetup = JSON.parse(wsVal)
        if (tWks) totalWeeks = Number(tWks)
        setPenalties(currentPenalties)
      }

      const { data: dlData } = await supabase.from('pr_deadlines').select('*')
      const deadlines = dlData || []

      const { data: filesData } = await supabase.from('files_metadata').select('*').eq('is_archive', false)
      const files = filesData || []
      
      const { data: commentsData } = await supabase.from('file_comments').select('*')
      const comments = commentsData || []

      // 🌟 [복구 완료!] 출석 데이터 불러오기
      const { data: attData } = await supabase.from('pr_attendance').select('*')
      const attendances = attData || []

      // 🌟 기존 벌금 데이터 불러오기 및 중복 데이터(버그) 자동 청소
      const { data: existingFinesDataRaw } = await supabase.from('pr_fines').select('*')
      const existingFinesData = existingFinesDataRaw || []
      
      const uniqueFines = []
      const duplicateIdsToDelete = []
      const seenMap = new Set()

      existingFinesData.forEach(f => {
        // 이름 + 주차 + 카테고리 조합으로 고유 키 생성
        const key = `${f.user_name}-${f.week}-${f.category}`
        if (seenMap.has(key) && !f.is_paid) {
          // 이미 같은 건이 있는데 또 미납 상태로 존재하면 중복(에러)이므로 삭제 명단에 추가
          duplicateIdsToDelete.push(f.id)
        } else {
          seenMap.add(key)
          uniqueFines.push(f)
        }
      })
      
      const existingFines = uniqueFines // 중복이 제거된 깨끗한 데이터만 스캐너에 사용

      // 2. 조 편성에 따른 벌금 '동기화' 배열 준비 (Insert, Update, Delete)
      const finesToInsert = []
      const finesToUpdate = []
      const finesToDelete = []
      const now = new Date().getTime()

      // 벌금 검증 헬퍼 함수
      const processFine = (userName, w, category, expectedFine, expectedReason) => {
        const existing = existingFines.find(f => f.user_name === userName && f.week === w && f.category === category)
        
        if (expectedFine > 0) {
          if (!existing) {
            finesToInsert.push({ user_name: userName, week: w, category, amount: expectedFine, reason: expectedReason, is_paid: false })
          } else if (!existing.is_paid && (existing.amount !== expectedFine || existing.reason !== expectedReason)) {
            finesToUpdate.push({ id: existing.id, amount: expectedFine, reason: expectedReason })
          }
        } else {
          if (existing && !existing.is_paid) {
            finesToDelete.push(existing.id)
          }
        }
      }

      for (let w = 1; w <= totalWeeks; w++) {
        const weekDl = deadlines.filter(d => d.week === w)
        if (weekDl.length === 0) continue

        const wSetup = weeklySetup[w] || { members: {} }

        activeMembers.forEach(m => {
          const userName = m.name
          const myGroup = wSetup.members[userName]
          
          const autoCategories = [
            '기획서 지각/미제출', '슬라이드 지각/미제출', '영상 지각/미제출', 
            '기획서 피드백 페널티', '영상 조원평가 페널티', '영상 셀프평가 페널티',
            '오프라인 세션 페널티'
          ]

          // 결석/미정인 경우 자동 벌금 0으로 덮어씀 (기존 미납액 지움)
          if (!myGroup || myGroup === '미정' || myGroup === '결석') {
            autoCategories.forEach(cat => processFine(userName, w, cat, 0, ''))
            return
          }

          const groupMembers = Object.keys(wSetup.members).filter(name => wSetup.members[name] === myGroup && name !== userName)

          // [A] 기획서 (proposal)
          const pDl = weekDl.find(d => d.category === 'proposal')
          let pFine = 0, pReason = ''
          if (pDl && pDl.deadline_time && new Date(pDl.deadline_time).getTime() < now) {
            const myFile = files.find(f => f.week === w && f.file_category === 'proposal' && f.uploader === userName)
            if (!myFile) {
              pFine = currentPenalties.proposalMiss || 10000; pReason = '기획서 미제출'
            } else if (new Date(myFile.created_at).getTime() > new Date(pDl.deadline_time).getTime()) {
              const diffMin = Math.floor((new Date(myFile.created_at).getTime() - new Date(pDl.deadline_time).getTime()) / 60000)
              pFine = Math.min(currentPenalties.proposalMax || 3000, (currentPenalties.proposalInitial || 1000) + Math.floor(diffMin/60) * (currentPenalties.proposalHourly || 500))
              pReason = `기획서 ${diffMin}분 지각`
            }
          }
          processFine(userName, w, '기획서 지각/미제출', pFine, pReason)

          // [B] 슬라이드 (slide)
          const sDl = weekDl.find(d => d.category === 'slide')
          let sFine = 0, sReason = ''
          if (sDl && sDl.deadline_time && new Date(sDl.deadline_time).getTime() < now) {
            const myFile = files.find(f => f.week === w && f.file_category === 'slide' && f.uploader === userName)
            if (!myFile) {
              sFine = currentPenalties.slideMiss || 10000; sReason = '슬라이드 미제출'
            } else if (new Date(myFile.created_at).getTime() > new Date(sDl.deadline_time).getTime()) {
              const diffMin = Math.floor((new Date(myFile.created_at).getTime() - new Date(sDl.deadline_time).getTime()) / 60000)
              sFine = Math.min(currentPenalties.slideMax || 3000, (currentPenalties.slideInitial || 1000) + Math.floor(diffMin/60) * (currentPenalties.slideHourly || 500))
              sReason = `슬라이드 ${diffMin}분 지각`
            }
          }
          processFine(userName, w, '슬라이드 지각/미제출', sFine, sReason)

          // [C] 영상 (video)
          const vDl = weekDl.find(d => d.category === 'video')
          let vFine = 0, vReason = ''
          if (vDl && vDl.deadline_time && new Date(vDl.deadline_time).getTime() < now) {
            const myFile = files.find(f => f.week === w && f.file_category === 'video' && f.uploader === userName)
            if (!myFile) {
              vFine = currentPenalties.slideMiss || 10000; vReason = '발표영상 미제출'
            } else if (new Date(myFile.created_at).getTime() > new Date(vDl.deadline_time).getTime()) {
              const diffMin = Math.floor((new Date(myFile.created_at).getTime() - new Date(vDl.deadline_time).getTime()) / 60000)
              vFine = Math.min(currentPenalties.slideMax || 3000, (currentPenalties.slideInitial || 1000) + Math.floor(diffMin/60) * (currentPenalties.slideHourly || 500))
              vReason = `발표영상 ${diffMin}분 지각`
            }
          }
          processFine(userName, w, '영상 지각/미제출', vFine, vReason)

          // [D] 기획서 피드백
          const pcDl = weekDl.find(d => d.category === 'proposal_comment')
          let pcFine = 0, pcReason = ''
          if (pcDl && pcDl.deadline_time && new Date(pcDl.deadline_time).getTime() < now) {
            const groupProps = files.filter(f => f.week === w && f.file_category === 'proposal' && groupMembers.includes(f.uploader))
            let missed = 0, maxLateMin = 0
            
            groupProps.forEach(gp => {
              const myComm = comments.find(c => c.file_id === gp.id && c.user_name === userName)
              if (!myComm) missed++
              else if (new Date(myComm.created_at).getTime() > new Date(pcDl.deadline_time).getTime()) {
                const diffMin = Math.floor((new Date(myComm.created_at).getTime() - new Date(pcDl.deadline_time).getTime()) / 60000)
                if (diffMin > maxLateMin) maxLateMin = diffMin
              }
            })

            if (groupProps.length > 0 && missed > 0) {
              pcFine = currentPenalties.fbMiss || 3000; pcReason = `기획서 조원 피드백 누락 (${missed}건 미제출)`
            } else if (maxLateMin > 0) {
              if (maxLateMin >= 60) { pcFine = currentPenalties.fbMiss || 3000; pcReason = '기획서 피드백 1시간 이상 지각' }
              else { pcFine = (currentPenalties.fbInitial || 1000) + Math.floor(maxLateMin/10) * (currentPenalties.fbPer10Min || 300); pcReason = `기획서 피드백 최대 ${maxLateMin}분 지각` }
            }
          }
          processFine(userName, w, '기획서 피드백 페널티', pcFine, pcReason)

          // [E] 영상 정성 피드백 (조원 평가)
          const vfDl = weekDl.find(d => d.category === 'vote_feedback')
          let vfFine = 0, vfReason = ''
          if (vfDl && vfDl.deadline_time && new Date(vfDl.deadline_time).getTime() < now) {
            const groupVids = files.filter(f => f.week === w && f.file_category === 'video' && groupMembers.includes(f.uploader))
            let missed = 0, maxLateMin = 0
            
            groupVids.forEach(gv => {
              const myComm = comments.find(c => c.file_id === gv.id && c.user_name === userName)
              if (!myComm) missed++
              else if (new Date(myComm.created_at).getTime() > new Date(vfDl.deadline_time).getTime()) {
                const diffMin = Math.floor((new Date(myComm.created_at).getTime() - new Date(vfDl.deadline_time).getTime()) / 60000)
                if (diffMin > maxLateMin) maxLateMin = diffMin
              }
            })

            if (groupVids.length > 0 && missed > 0) {
              vfFine = currentPenalties.fbMiss || 3000; vfReason = `영상 조원평가 누락 (${missed}건 미제출)`
            } else if (maxLateMin > 0) {
              if (maxLateMin >= 60) { vfFine = currentPenalties.fbMiss || 3000; vfReason = '영상 조원평가 1시간 이상 지각' }
              else { vfFine = (currentPenalties.fbInitial || 1000) + Math.floor(maxLateMin/10) * (currentPenalties.fbPer10Min || 300); vfReason = `영상 조원평가 최대 ${maxLateMin}분 지각` }
            }
          }
          processFine(userName, w, '영상 조원평가 페널티', vfFine, vfReason)

          // [F] 영상 셀프 피드백
          const vcDl = weekDl.find(d => d.category === 'video_comment')
          let vcFine = 0, vcReason = ''
          if (vcDl && vcDl.deadline_time && new Date(vcDl.deadline_time).getTime() < now) {
            const myVid = files.find(f => f.week === w && f.file_category === 'video' && f.uploader === userName)
            if (myVid) {
              const myComm = comments.find(c => c.file_id === myVid.id && c.user_name === userName)
              if (!myComm) {
                vcFine = currentPenalties.fbMiss || 3000; vcReason = '영상 셀프평가 미제출'
              } else if (new Date(myComm.created_at).getTime() > new Date(vcDl.deadline_time).getTime()) {
                const diffMin = Math.floor((new Date(myComm.created_at).getTime() - new Date(vcDl.deadline_time).getTime()) / 60000)
                if (diffMin >= 60) { vcFine = currentPenalties.fbMiss || 3000; vcReason = '영상 셀프평가 1시간 이상 지각' }
                else { vcFine = (currentPenalties.fbInitial || 1000) + Math.floor(diffMin/10) * (currentPenalties.fbPer10Min || 300); vcReason = `영상 셀프평가 ${diffMin}분 지각` }
              }
            }
          }
          processFine(userName, w, '영상 셀프평가 페널티', vcFine, vcReason)

          // 🌟 [G] 오프라인 세션 출석 (attendances 변수 정상 작동!)
          const sessionStartDl = weekDl.find(d => d.category === 'session_start')
          const attEndDl = weekDl.find(d => d.category === 'attendance_end')
          let attFine = 0, attReason = ''
          
          if (attEndDl && attEndDl.deadline_time && new Date(attEndDl.deadline_time).getTime() < now) {
            const myAtt = attendances.find(a => a.week === w && a.user_name === userName)
            
            const maxFine = Number(currentPenalties.sessionMax) || Number(currentPenalties.sessionMiss) || 20000;
            const perMinFine = Number(currentPenalties.sessionPerMin) || Number(currentPenalties.sessionLatePerMin) || 200;
            const per10MinFine = Number(currentPenalties.sessionPer10Min) || Number(currentPenalties.sessionLatePer10Min) || 2000;

            if (!myAtt) {
              attFine = maxFine; 
              attReason = '오프라인 세션 무단 결석 (미인증)'
            } else if (sessionStartDl && sessionStartDl.deadline_time && new Date(myAtt.created_at).getTime() > new Date(sessionStartDl.deadline_time).getTime()) {
              const diffMin = Math.floor((new Date(myAtt.created_at).getTime() - new Date(sessionStartDl.deadline_time).getTime()) / 60000)
              
              if (diffMin <= 20) {
                attFine = diffMin * perMinFine;
              } else {
                attFine = (20 * perMinFine) + Math.ceil((diffMin - 20) / 10) * per10MinFine;
              }

              if (attFine > maxFine) attFine = maxFine; 
              
              attReason = `오프라인 세션 ${diffMin}분 지각`
            }
          }
          processFine(userName, w, '오프라인 세션 페널티', attFine, attReason)

        }) // members loop end
      } // weeks loop end

      // 3. 변경 사항 DB 실행 (중복삭제 -> 삭제 -> 수정 -> 추가 순)
      const finalDeletes = [...new Set([...finesToDelete, ...duplicateIdsToDelete])]
      
      if (finalDeletes.length > 0) {
        await supabase.from('pr_fines').delete().in('id', finalDeletes)
      }
      if (finesToUpdate.length > 0) {
        for (const f of finesToUpdate) {
          await supabase.from('pr_fines').update({ amount: f.amount, reason: f.reason }).eq('id', f.id)
        }
      }
      if (finesToInsert.length > 0) {
        await supabase.from('pr_fines').insert(finesToInsert)
      }

      // 4. 모든(납부/미납 포함) 벌금 내역 가져오기
      const { data: finalFinesData } = await supabase.from('pr_fines').select('*').order('week', { ascending: false }).order('created_at', { ascending: false })
      setFines(finalFinesData || [])

    } finally {
      // 로직이 다 끝나거나 에러가 나도 자물쇠는 무조건 푼다!
      scanLock.current = false
      setIsScanning(false)
      setLoading(false)
    }
  }

  // ==========================================
  // ✍️ 2. 수동 벌금 입력 (세션 지각 등)
  // ==========================================
  const handleAddManualFine = async () => {
    if (!manualFine.user_name || !manualFine.amount || !manualFine.reason) return alert("대상, 금액, 사유를 모두 입력해줘!")
    const { error } = await supabase.from('pr_fines').insert([{
      user_name: manualFine.user_name, week: manualFine.week, category: manualFine.category, amount: Number(manualFine.amount), reason: manualFine.reason, is_paid: false
    }])
    if (!error) {
      alert(`${manualFine.user_name}님에게 벌금 부과 완료! 💸`)
      setManualFine({ ...manualFine, amount: '', reason: '' }) 
      fetchAndScanData()
    }
  }

  // ==========================================
  // 💸 3. 삭제, 납부 및 예외(면제) 처리
  // ==========================================
  const handleDeleteFine = async (id) => {
    if (!confirm("이 벌금 내역을 완전히 삭제할까?\n(조 편성이 바뀌어 억울하게 들어간 벌금을 지울 때 사용해!)")) return
    await supabase.from('pr_fines').delete().eq('id', id)
    fetchAndScanData() 
  }

  const handleMarkAsPaid = async (id) => {
    await supabase.from('pr_fines').update({ is_paid: true }).eq('id', id)
    fetchAndScanData()
  }

  const handleExemptFine = async (fineObj) => {
    const reasonMsg = prompt("예외(면제) 처리 사유를 적어주세요. (예: 병결, 시스템오류 등)")
    if (reasonMsg === null) return 
    
    await supabase.from('pr_fines').update({ 
      is_paid: true, 
      amount: 0, 
      reason: `${fineObj.reason} [면제: ${reasonMsg || '사유없음'}]` 
    }).eq('id', fineObj.id)
    fetchAndScanData()
  }

  const handlePayAll = async (userName) => {
    if (!confirm(`${userName}님의 누적 벌금을 모두 납부 처리할까? 💰`)) return
    await supabase.from('pr_fines').update({ is_paid: true }).eq('user_name', userName).eq('is_paid', false)
    fetchAndScanData()
  }

  if (loading) return <div className="p-10 text-center font-black text-slate-500">벌금 데이터를 스캔하고 불러오는 중... 🔄</div>

  // 멤버별 데이터 병합
  const combinedData = members.map(m => {
    const userFines = fines.filter(f => f.user_name === m.name)
    const totalAmount = userFines.filter(f => !f.is_paid).reduce((sum, curr) => sum + curr.amount, 0)
    return {
      name: m.name,
      generation: m.generation,
      total: totalAmount,
      details: userFines
    }
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)) 

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        <header className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">📊</span> Attendance & Fines
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">과제 지각/미제출 자동 스캔 및 통합 엑셀 대장입니다.</p>
          </div>
          
          <div className="flex items-center gap-3">
            {isScanning && <div className="bg-blue-100 text-blue-600 px-4 py-2 rounded-xl text-xs font-black animate-pulse">자동 스캔 동기화 중... 🔍</div>}
            <button 
              onClick={fetchAndScanData} 
              disabled={isScanning} 
              className="bg-slate-900 text-white px-6 py-3 rounded-xl text-sm font-black hover:bg-blue-600 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              <span>조 편성 연동 새로고침</span> 🔄
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8 items-start">
          
          {/* 🌟 좌측: 엑셀 형태의 통합 벌금 대장 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800">📋 통합 벌금 대장 (Excel View)</h2>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-lg">전체 활동 학회원: {members.length}명</span>
            </div>
            
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-inner">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead className="bg-slate-100 text-slate-600 text-[11px] uppercase font-black tracking-widest border-b-2 border-slate-300">
                  <tr>
                    <th className="p-4 border-r border-slate-200 text-center w-24">이름</th>
                    <th className="p-4 border-r border-slate-200 text-center w-32">현재 미납액</th>
                    <th className="p-4 border-r border-slate-200">벌금 상세 내역 및 히스토리</th>
                    <th className="p-4 text-center w-24">일괄 처리</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium">
                  {combinedData.map((user, idx) => (
                    <tr key={user.name} className={`border-b border-slate-200 transition-colors ${user.total > 0 ? 'bg-red-50/20 hover:bg-red-50' : 'bg-white hover:bg-slate-50'}`}>
                      
                      {/* 이름 */}
                      <td className="p-4 border-r border-slate-200 text-center align-top pt-6">
                        <span className="font-black text-slate-800 block">{user.name}</span>
                        <span className="text-[9px] text-slate-400">{user.generation}</span>
                      </td>
                      
                      {/* 총 미납액 */}
                      <td className="p-4 border-r border-slate-200 text-center align-top pt-6 font-black">
                        {user.total > 0 ? (
                          <span className="text-red-600 bg-red-100 px-3 py-1.5 rounded-lg text-lg tracking-tighter">₩{user.total.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-300">₩0</span>
                        )}
                      </td>
                      
                      {/* 상세 내역 리스트 */}
                      <td className="p-4 border-r border-slate-200">
                        {user.details.length === 0 ? (
                          <span className="text-slate-300 text-xs font-bold pl-2 flex items-center h-full">-</span>
                        ) : (
                          <div className="space-y-2">
                            {user.details.map(f => (
                              <div key={f.id} className={`flex flex-col xl:flex-row xl:justify-between xl:items-center p-3 rounded-xl border shadow-sm text-xs transition-all gap-3 ${f.is_paid ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-red-100'}`}>
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-1 rounded font-black text-[10px] ${f.is_paid ? 'bg-slate-200 text-slate-500' : 'bg-slate-800 text-white'}`}>W{f.week}</span>
                                  <div className="flex flex-col">
                                    <span className={`font-black ${f.is_paid ? 'text-slate-500 line-through' : 'text-slate-700'}`}>{f.category}</span>
                                    <span className="text-[10px] text-slate-400 font-bold mt-0.5">{f.reason}</span>
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-4 mt-2 xl:mt-0">
                                  <span className={`font-black text-sm ${f.is_paid && f.amount === 0 ? 'text-blue-500' : f.is_paid ? 'text-slate-400 line-through' : 'text-red-500'}`}>
                                    ₩{f.amount.toLocaleString()}
                                  </span>
                                  
                                  {/* 🌟 액션 버튼들 */}
                                  {!f.is_paid ? (
                                    <div className="flex gap-1.5 shrink-0">
                                      <button onClick={() => handleDeleteFine(f.id)} className="bg-white hover:bg-slate-800 hover:text-white text-slate-400 px-2 py-1.5 rounded-lg font-black text-[10px] transition-colors border border-slate-200 hover:border-slate-800" title="잘못 부과된 벌금 삭제">
                                        삭제 🗑️
                                      </button>
                                      <button onClick={() => handleExemptFine(f)} className="bg-slate-100 hover:bg-yellow-500 hover:text-white text-slate-500 px-3 py-1.5 rounded-lg font-black text-[10px] transition-colors border border-slate-200 hover:border-yellow-500">
                                        면제 ✋
                                      </button>
                                      <button onClick={() => handleMarkAsPaid(f.id)} className="bg-red-50 hover:bg-emerald-500 hover:text-white text-red-600 px-3 py-1.5 rounded-lg font-black text-[10px] transition-colors border border-red-200 hover:border-emerald-500">
                                        납부 ✓
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className={`text-[10px] font-black px-2 py-1 rounded-md ${f.amount === 0 ? 'bg-blue-100 text-blue-500' : 'bg-emerald-100 text-emerald-600'}`}>
                                        {f.amount === 0 ? '면제됨' : '완납'}
                                      </span>
                                      <button onClick={() => handleDeleteFine(f.id)} className="text-[10px] font-black text-slate-300 hover:text-red-500 px-1" title="기록 영구 삭제">
                                        ✕
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      
                      {/* 일괄 납부 버튼 */}
                      <td className="p-4 text-center align-middle">
                        <button 
                          onClick={() => handlePayAll(user.name)} 
                          disabled={user.total === 0} 
                          className="bg-slate-800 text-white px-3 py-2 rounded-xl text-[10px] font-black hover:bg-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-sm w-full"
                        >
                          전액 납부
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 🌟 우측: 수동 벌금 부과 폼 */}
          <div className="space-y-6 sticky top-8">
            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl border border-slate-800 text-white">
              <h2 className="text-lg font-black mb-6 border-b border-slate-700 pb-3 flex items-center gap-2">
                <span>✍️</span> 수동 벌금 부과
              </h2>
              <p className="text-[10px] font-bold text-slate-400 mb-4 line-relaxed">
                과제 및 피드백은 자동으로 스캔됩니다.<br/>현장 세션 지각 등은 여기서 수동으로 입력하세요.
              </p>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <select value={manualFine.user_name} onChange={e => setManualFine({...manualFine, user_name: e.target.value})} className="flex-1 bg-slate-800 p-3 rounded-xl text-xs font-bold outline-none border border-slate-700 cursor-pointer">
                    <option value="">대상자 선택</option>
                    {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                  <select value={manualFine.week} onChange={e => setManualFine({...manualFine, week: Number(e.target.value)})} className="w-24 bg-slate-800 p-3 rounded-xl text-xs font-bold outline-none border border-slate-700 cursor-pointer text-center">
                    {Array.from({length: 13}, (_, i) => <option key={i} value={i}>{i}주차</option>)}
                  </select>
                </div>
                <select value={manualFine.category} onChange={e => setManualFine({...manualFine, category: e.target.value})} className="w-full bg-slate-800 p-3 rounded-xl text-xs font-bold outline-none border border-slate-700 cursor-pointer">
                  <option value="세션 지각">세션 지각</option>
                  <option value="무단 결석">무단 결석</option>
                  <option value="기타 벌금">기타 벌금</option>
                </select>
                <input type="text" placeholder="상세 사유 (예: 13:25 도착, 5분 지각)" value={manualFine.reason} onChange={e => setManualFine({...manualFine, reason: e.target.value})} className="w-full bg-slate-800 p-3 rounded-xl text-xs font-bold outline-none border border-slate-700 focus:border-red-500 transition-colors" />
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="금액 (숫자만)" value={manualFine.amount} onChange={e => setManualFine({...manualFine, amount: e.target.value})} className="flex-1 bg-slate-800 p-3 rounded-xl text-sm font-black outline-none border border-slate-700 focus:border-red-500 text-red-400" />
                  <span className="text-xs font-black text-slate-500 pr-2">원</span>
                </div>
                <button onClick={handleAddManualFine} className="w-full py-4 bg-red-600 text-white rounded-xl font-black text-sm hover:bg-red-700 active:scale-95 transition-all shadow-md mt-4">
                  부과하기 💥
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}