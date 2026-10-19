'use client'
// 벌금 상세 관리
// 화면을 열면 마감·제출·피드백·출석 기록으로 이번 학기 벌금을 다시 계산한다(자동 스캔).
// - 자동 스캔은 쓰기 가능한 역할만 실행한다 (열람자는 저장된 벌금만 본다).
// - 더 이상 해당하지 않는 자동 벌금과 중복 벌금은 지우지 않고 취소(voided_at) 처리한다.
// - 관리자가 삭제(취소)한 벌금은 자동 스캔이 다시 만들지 않는다.
// - 시간은 한국 시간 기준으로 판단한다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeDollarSign, RefreshCw, Search, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchCurrentSemester, fetchSemesterMembers, fromKstInput, parseJson } from '@/lib/semester'
import { canRunAutomation } from '@/lib/permissions'
import { FINE_STATE_LABELS, fineState, isFineVoided, normalizeName, recordBelongsTo, summarizeFines, uniqueNameSet } from '@/lib/memberRecords'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  EmptyState,
  Field,
  inputClass,
  LoadingState,
  Metric,
  Notice,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  StatusBadge,
  useAsyncAction,
  useToast,
} from '@/app/admin/_components/AdminUI'

const AUTO_VOID = '[자동 취소]'
const DUPLICATE_VOID = '[중복 취소]'
const kstTime = (value) => {
  const iso = fromKstInput(value)
  return iso ? new Date(iso).getTime() : NaN
}

// 자동 스캔: 기존 계산 규칙을 그대로 쓰고 결과를 DB에 반영한다
async function scanFines(current, activeMembers) {
  const currentPenalties = parseJson(current.config.penalty_rules, {})
  const { weeklySetup, totalWeeks, type: semesterType, code: semester } = current
  const semesterFilter = current.id ? `semester_id.eq.${current.id},semester.eq."${semester}"` : `semester.eq."${semester}"`

  const [dlResult, filesResult, commentsResult, attResult, fineResult, absResult] = await Promise.all([
    supabase.from('pr_deadlines').select('*').or(current.id ? `semester_id.eq.${current.id},semester_id.is.null` : 'semester_id.is.null'),
    supabase.from('files_metadata').select('*').eq('semester', semester).eq('is_archive', false),
    supabase.from('file_comments').select('*'),
    supabase.from('pr_attendance').select('*').or(semesterFilter),
    supabase.from('pr_fines').select('*').or(semesterFilter),
    supabase.from('absence_forms').select('*').or(current.id ? `semester_id.eq.${current.id},semester_id.is.null` : 'semester_id.is.null'),
  ])
  const readError = dlResult.error || filesResult.error || commentsResult.error || attResult.error || fineResult.error || absResult.error
  if (readError) return { error: readError, summary: null }

  const deadlines = dlResult.data || []
  const files = filesResult.data || []
  const comments = commentsResult.data || []
  const attendances = attResult.data || []
  const existingFines = fineResult.data || []
  const absences = absResult.data || []
  const uniqueNames = uniqueNameSet(activeMembers)
  const findAbsence = (member, week, sessionType) => absences.find((item) => recordBelongsTo(item, member, uniqueNames) && item.week === week && (item.session_type || 'regular') === sessionType)
  const findAttendance = (member, week, sessionType) => attendances.find((item) => recordBelongsTo(item, member, uniqueNames) && item.week === week && (item.session_type || 'regular') === sessionType)
  // 완전인정 = 출석 인정 / 부분인정 = 결석이지만 벌금 면제 (대체 제출 의무)
  const absenceExempt = (absence) => Boolean(absence) && (absence.status?.includes('완전인정') || absence.status?.includes('부분인정'))

  const byKey = new Map()
  for (const fine of existingFines) {
    const key = `${normalizeName(fine.user_name)}|${fine.week}|${fine.category}`
    byKey.set(key, [...(byKey.get(key) || []), fine])
  }

  const inserts = []
  const updates = []
  const handledKeys = new Set()
  const now = Date.now()

  function processFine(member, week, category, expectedFine, expectedReason) {
    const key = `${normalizeName(member.name)}|${week}|${category}`
    handledKeys.add(key)
    const list = byKey.get(key) || []
    const active = list.filter((fine) => !isFineVoided(fine))
    const autoVoided = list.filter((fine) => fine.voided_at && String(fine.reason || '').startsWith(AUTO_VOID))
    const manuallyVoided = list.some((fine) => isFineVoided(fine) && !autoVoided.includes(fine))
    const currentFine = active[0]

    // 같은 항목의 미납 중복 벌금은 하나만 남기고 취소한다
    active.slice(1).filter((fine) => !fine.is_paid).forEach((fine) => updates.push({ id: fine.id, patch: { voided_at: new Date().toISOString(), reason: `${DUPLICATE_VOID} ${fine.reason || ''}`.trim() } }))

    if (expectedFine > 0) {
      if (currentFine) {
        if (!currentFine.is_paid && (currentFine.amount !== expectedFine || currentFine.reason !== expectedReason)) {
          updates.push({ id: currentFine.id, patch: { amount: expectedFine, reason: expectedReason, member_id: currentFine.member_id || member.id } })
        }
      } else if (autoVoided[0]) {
        updates.push({ id: autoVoided[0].id, patch: { voided_at: null, amount: expectedFine, reason: expectedReason, is_paid: false, member_id: autoVoided[0].member_id || member.id } })
      } else if (!manuallyVoided) {
        inserts.push({ user_name: member.name, member_id: member.id, week, category, amount: expectedFine, reason: expectedReason, is_paid: false, semester, semester_id: current.id || null })
      }
    } else if (currentFine && !currentFine.is_paid) {
      updates.push({ id: currentFine.id, patch: { voided_at: new Date().toISOString(), reason: `${AUTO_VOID} ${currentFine.reason || ''}`.trim() } })
    }
  }

  const autoCategories = ['기획서 지각/미제출', '슬라이드 지각/미제출', '영상 지각/미제출', '기획서 피드백 페널티', '영상 조원평가 페널티', '영상 셀프평가 페널티', '오프라인 세션 페널티']
  const lateFine = (diffMin, prefix) => Math.min(currentPenalties[`${prefix}Max`] || 3000, (currentPenalties[`${prefix}Initial`] || 1000) + Math.floor(diffMin / 60) * (currentPenalties[`${prefix}Hourly`] || 500))
  const feedbackLateFine = (diffMin) => (currentPenalties.fbInitial || 1000) + Math.floor(diffMin / 10) * (currentPenalties.fbPer10Min || 300)

  for (let w = 1; w <= totalWeeks; w++) {
    const weekDl = deadlines.filter((deadline) => deadline.week === w)
    if (weekDl.length === 0) continue
    const wSetup = weeklySetup[w] || {}
    const isNewLogic = Boolean(wSetup.memberTeams)
    const mTeams = wSetup.memberTeams || wSetup.members || {}
    const tGroups = wSetup.teamGroups || wSetup.groupToCluster || {}
    const gClusters = wSetup.groupClusters || {}
    const due = (category) => {
      const deadline = weekDl.find((item) => item.category === category)
      return deadline?.deadline_time ? new Date(deadline.deadline_time).getTime() : null
    }

    activeMembers.forEach((member) => {
      const userName = member.name
      const myTId = mTeams[userName]
      // 편성되지 않았거나 불참 표시인 사람은 자동 벌금 대상이 아니다
      if (!myTId || myTId === '미정' || myTId === '결석') {
        autoCategories.forEach((category) => processFine(member, w, category, 0, ''))
        return
      }
      const myGId = tGroups[myTId] || myTId
      const myCId = gClusters[myGId] || gClusters[myTId] || 1
      const myUploaderNames = [userName, `Team ${myTId}`, `Team #${myTId}`]
      const targetUploaders = []
      Object.keys(mTeams).forEach((name) => {
        if (name === userName) return
        const tId = mTeams[name]
        if (tId === '미정' || tId === '결석') return
        const gId = tGroups[tId] || tId
        const cId = gClusters[gId] || gClusters[tId] || 1
        const isTarget = isNewLogic ? (cId === myCId && tId !== myTId) : (tId === myTId)
        if (isTarget) targetUploaders.push(name, `Team ${tId}`, `Team #${tId}`)
      })

      const submissionFine = (category, deadlineKey, missLabel, prefix, missAmount) => {
        const deadline = due(deadlineKey)
        let fine = 0
        let reason = ''
        if (deadline && deadline < now) {
          const myFile = files.find((file) => file.week === w && file.file_category === deadlineKey && myUploaderNames.includes(file.uploader))
          if (!myFile) {
            fine = missAmount
            reason = `${missLabel} 미제출`
          } else if (new Date(myFile.created_at).getTime() > deadline) {
            const diffMin = Math.floor((new Date(myFile.created_at).getTime() - deadline) / 60000)
            fine = lateFine(diffMin, prefix)
            reason = `${missLabel} ${diffMin}분 지각`
          }
        }
        processFine(member, w, category, fine, reason)
      }
      submissionFine('기획서 지각/미제출', 'proposal', '기획서', 'proposal', currentPenalties.proposalMiss || 10000)
      submissionFine('슬라이드 지각/미제출', 'slide', '슬라이드', 'slide', currentPenalties.slideMiss || 10000)
      submissionFine('영상 지각/미제출', 'video', '발표영상', 'slide', currentPenalties.slideMiss || 10000)

      const peerFeedbackFine = (category, deadlineKey, fileCategory, label) => {
        const deadline = due(deadlineKey)
        let fine = 0
        let reason = ''
        if (deadline && deadline < now) {
          const targetFiles = files.filter((file) => file.week === w && file.file_category === fileCategory && targetUploaders.includes(file.uploader))
          let missed = 0
          let maxLateMin = 0
          targetFiles.forEach((targetFile) => {
            const myComment = comments.find((comment) => comment.file_id === targetFile.id && (comment.member_id ? comment.member_id === member.id : comment.user_name === userName))
            if (!myComment) missed++
            else if (new Date(myComment.created_at).getTime() > deadline) maxLateMin = Math.max(maxLateMin, Math.floor((new Date(myComment.created_at).getTime() - deadline) / 60000))
          })
          if (targetFiles.length > 0 && missed > 0) {
            fine = currentPenalties.fbMiss || 3000
            reason = `${label} 누락 (${missed}건 미제출)`
          } else if (maxLateMin >= 60) {
            fine = currentPenalties.fbMiss || 3000
            reason = `${label} 1시간 이상 지각`
          } else if (maxLateMin > 0) {
            fine = feedbackLateFine(maxLateMin)
            reason = `${label} 최대 ${maxLateMin}분 지각`
          }
        }
        processFine(member, w, category, fine, reason)
      }
      peerFeedbackFine('기획서 피드백 페널티', 'proposal_comment', 'proposal', '기획서 조원 피드백')
      peerFeedbackFine('영상 조원평가 페널티', 'vote_feedback', 'video', '영상 조원평가')

      // 영상 셀프 피드백
      const selfDeadline = due('video_comment')
      let selfFine = 0
      let selfReason = ''
      if (selfDeadline && selfDeadline < now) {
        const myVideo = files.find((file) => file.week === w && file.file_category === 'video' && myUploaderNames.includes(file.uploader))
        if (myVideo) {
          const myComment = comments.find((comment) => comment.file_id === myVideo.id && (comment.member_id ? comment.member_id === member.id : comment.user_name === userName))
          if (!myComment) {
            selfFine = currentPenalties.fbMiss || 3000
            selfReason = '영상 셀프평가 미제출'
          } else if (new Date(myComment.created_at).getTime() > selfDeadline) {
            const diffMin = Math.floor((new Date(myComment.created_at).getTime() - selfDeadline) / 60000)
            selfFine = diffMin >= 60 ? currentPenalties.fbMiss || 3000 : feedbackLateFine(diffMin)
            selfReason = diffMin >= 60 ? '영상 셀프평가 1시간 이상 지각' : `영상 셀프평가 ${diffMin}분 지각`
          }
        }
      }
      processFine(member, w, '영상 셀프평가 페널티', selfFine, selfReason)

      // 오프라인 세션 출석
      const sessionStart = due('session_start')
      const attendanceEnd = due('attendance_end')
      let attFine = 0
      let attReason = ''
      if (attendanceEnd && attendanceEnd < now) {
        const myAtt = findAttendance(member, w, 'regular')
        const maxFine = Number(currentPenalties.sessionMax) || Number(currentPenalties.sessionMiss) || 20000
        const perMinFine = Number(currentPenalties.sessionPerMin) || Number(currentPenalties.sessionLatePerMin) || 200
        const per10MinFine = Number(currentPenalties.sessionPer10Min) || Number(currentPenalties.sessionLatePer10Min) || 2000
        const myAbs = findAbsence(member, w, 'regular')
        if (absenceExempt(myAbs)) {
          attFine = 0
        } else if (!myAtt) {
          attFine = maxFine
          attReason = myAbs ? `오프라인 세션 결석 (사유서 ${myAbs.status})` : '오프라인 세션 무단 결석 (미인증)'
        } else if (myAtt.status?.includes('무단') || myAtt.status === '결석') {
          attFine = maxFine
          attReason = '오프라인 세션 무단 결석 (출석 미기록)'
        } else if (sessionStart && new Date(myAtt.created_at).getTime() > sessionStart && !String(myAtt.status || '').includes('인정')) {
          const diffMin = Math.floor((new Date(myAtt.created_at).getTime() - sessionStart) / 60000)
          attFine = Math.min(maxFine, diffMin <= 20 ? diffMin * perMinFine : 20 * perMinFine + Math.ceil((diffMin - 20) / 10) * per10MinFine)
          attReason = `오프라인 세션 ${diffMin}분 지각`
        }
      }
      processFine(member, w, '오프라인 세션 페널티', attFine, attReason)
    })
  }

  // 방학학기 평일세션: 조별 진행일 기준 (마감 미설정 시 진행일 자정 / 피드백은 익일 자정)
  if (semesterType === 'vacation') {
    for (let w = 1; w <= totalWeeks; w++) {
      const wSetup = weeklySetup[w] || {}
      const wdMembers = (wSetup.weekdayMembers && Object.keys(wSetup.weekdayMembers).length) ? wSetup.weekdayMembers : (wSetup.members || {})
      const wd = wSetup.weekday || {}
      const groupOf = (name) => {
        const group = wdMembers[name]
        return group && group !== '미정' && group !== '결석' ? Number(group) : null
      }
      const roster = {}
      activeMembers.forEach((member) => {
        const group = groupOf(member.name)
        if (group) (roster[group] = roster[group] || []).push(member.name)
      })

      activeMembers.forEach((member) => {
        const userName = member.name
        const clearAll = () => ['평일세션 발표자료 지각/미제출', '평일세션 영상 지각/미제출', '평일세션 정성 피드백 페널티', '평일세션 출석 페널티'].forEach((category) => processFine(member, w, category, 0, ''))
        if (!wSetup.weekdaySession) return clearAll()
        const group = groupOf(userName)
        const team = group ? wd[group] : null
        const dateStr = team?.date
        if (!dateStr) return clearAll()
        const baseDl = kstTime(`${dateStr}T23:59`)
        if (!Number.isFinite(baseDl) || baseDl >= now) return clearAll()
        const slideDlTime = team.slideDl ? kstTime(team.slideDl) : baseDl
        const videoDlTime = team.videoDl ? kstTime(team.videoDl) : baseDl
        const fbDlTime = team.fbDl ? kstTime(team.fbDl) : baseDl + 24 * 60 * 60 * 1000
        const calcLate = (fileTime, deadline) => {
          const diffMin = Math.floor((fileTime - deadline) / 60000)
          return { fine: lateFine(diffMin, 'slide'), diffMin }
        }

        // 평일세션 출석: 사유서 인정 시 면제, 20분까지 미부과, 1시간 초과 시 무단결석
        const myAbs = findAbsence(member, w, 'weekday')
        const myAtt = findAttendance(member, w, 'weekday')
        const wdMaxFine = Number(currentPenalties.sessionMax) || 20000
        const wdPer10 = Number(currentPenalties.sessionPer10Min) || Number(currentPenalties.sessionLatePer10Min) || 2000
        let aFine = 0
        let aReason = ''
        const attEndT = team.attEnd ? kstTime(`${dateStr}T${team.attEnd}`) : baseDl
        if (attEndT < now) {
          if (absenceExempt(myAbs)) {
            aFine = 0
          } else if (!myAtt) {
            aFine = wdMaxFine
            aReason = myAbs ? `평일세션 결석 (사유서 ${myAbs.status})` : '평일세션 무단 결석 (미인증)'
          } else if (myAtt.status?.includes('무단') || myAtt.status === '결석') {
            aFine = wdMaxFine
            aReason = '평일세션 무단 결석 (출석 미기록)'
          } else if (team.sessionStart && !String(myAtt.status || '').includes('인정')) {
            const diffMin = Math.floor((new Date(myAtt.created_at).getTime() - kstTime(`${dateStr}T${team.sessionStart}`)) / 60000)
            if (diffMin > 60) {
              aFine = wdMaxFine
              aReason = '평일세션 1시간 초과 지각 (무단결석 처리)'
            } else if (diffMin > 20) {
              aFine = Math.min(wdMaxFine, 4000 + Math.floor((diffMin - 20) / 10) * wdPer10)
              aReason = `평일세션 ${diffMin}분 지각`
            }
          }
        }
        processFine(member, w, '평일세션 출석 페널티', aFine, aReason)

        const submission = (category, fileCategory, label, deadline) => {
          const mine = files.find((file) => file.week === w && file.file_category === fileCategory && file.uploader === userName)
          let fine = 0
          let reason = ''
          if (deadline < now) {
            if (!mine) {
              fine = currentPenalties.slideMiss || 10000
              reason = `평일세션 ${label} 미제출`
            } else if (new Date(mine.created_at).getTime() > deadline) {
              const result = calcLate(new Date(mine.created_at).getTime(), deadline)
              fine = result.fine
              reason = `평일세션 ${label} ${result.diffMin}분 지각`
            }
          }
          processFine(member, w, category, fine, reason)
        }
        submission('평일세션 발표자료 지각/미제출', 'weekday_slide', '발표자료', slideDlTime)
        submission('평일세션 영상 지각/미제출', 'weekday_video', '영상', videoDlTime)

        let fbFine = 0
        let fbReason = ''
        if (fbDlTime < now) {
          const teammates = (roster[group] || []).filter((name) => name !== userName)
          const targetVideos = files.filter((file) => file.week === w && file.file_category === 'weekday_video' && teammates.includes(file.uploader))
          let missed = 0
          let maxLateMin = 0
          targetVideos.forEach((video) => {
            const myComment = comments.find((comment) => comment.file_id === video.id && (comment.member_id ? comment.member_id === member.id : comment.user_name === userName))
            if (!myComment) missed++
            else if (new Date(myComment.created_at).getTime() > fbDlTime) maxLateMin = Math.max(maxLateMin, Math.floor((new Date(myComment.created_at).getTime() - fbDlTime) / 60000))
          })
          if (targetVideos.length > 0 && missed > 0) {
            fbFine = currentPenalties.fbMiss || 3000
            fbReason = `평일세션 정성 피드백 누락 (${missed}건 미제출)`
          } else if (maxLateMin >= 60) {
            fbFine = currentPenalties.fbMiss || 3000
            fbReason = '평일세션 정성 피드백 1시간 이상 지각'
          } else if (maxLateMin > 0) {
            fbFine = feedbackLateFine(maxLateMin)
            fbReason = `평일세션 정성 피드백 최대 ${maxLateMin}분 지각`
          }
        }
        processFine(member, w, '평일세션 정성 피드백 페널티', fbFine, fbReason)
      })
    }
  }

  // DB 반영. 실패한 작업은 모아서 알린다 (다음 스캔 때 다시 시도된다)
  const failures = []
  for (const update of updates) {
    const { error } = await supabase.from('pr_fines').update(update.patch).eq('id', update.id)
    if (error) failures.push(error.message)
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from('pr_fines').insert(inserts)
    if (error) failures.push(error.message)
  }
  return {
    error: null,
    summary: {
      inserted: inserts.length,
      voided: updates.filter((item) => item.patch.voided_at).length,
      updated: updates.filter((item) => !item.patch.voided_at).length,
      failures,
    },
  }
}

export default function FineAdmin() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const [run, pending] = useAsyncAction()
  const scanLock = useRef(false)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [semester, setSemester] = useState(null)
  const [members, setMembers] = useState([])
  const [fines, setFines] = useState([])
  const [scanNote, setScanNote] = useState(null)
  const [query, setQuery] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const [manualFine, setManualFine] = useState({ memberId: '', week: 1, category: '세션 지각', amount: '', reason: '' })

  const loadFines = useCallback(async (current) => {
    const filter = current.id ? `semester_id.eq.${current.id},semester.eq."${current.code}"` : `semester.eq."${current.code}"`
    const { data, error } = await supabase.from('pr_fines').select('*').or(filter).order('week', { ascending: false }).order('created_at', { ascending: false })
    if (error) throw error
    setFines(data || [])
  }, [])

  const refresh = useCallback(async ({ scan }) => {
    if (scanLock.current || !role) return
    scanLock.current = true
    setLoading(true)
    try {
      const current = await fetchCurrentSemester()
      setSemester(current)
      const activeMembers = await fetchSemesterMembers(current.id, 'id, name, generation')
      setMembers(activeMembers)
      if (scan && canRunAutomation(role)) {
        setScanning(true)
        if (current.id) await supabase.rpc('admin_sync_missing_attendance', { p_semester_id: current.id })
        const result = await scanFines(current, activeMembers)
        if (result.error) setScanNote({ tone: 'danger', text: `자동 스캔에 필요한 기록을 읽지 못해 벌금을 바꾸지 않았습니다: ${result.error.message}` })
        else if (result.summary.failures.length) setScanNote({ tone: 'danger', text: `자동 스캔 중 ${result.summary.failures.length}건을 저장하지 못했습니다 (${result.summary.failures[0]}). 다시 스캔하면 남은 항목을 다시 시도합니다.` })
        else if (result.summary.inserted + result.summary.updated + result.summary.voided > 0) setScanNote({ tone: 'success', text: `자동 스캔 반영: 새 벌금 ${result.summary.inserted}건 · 금액 변경 ${result.summary.updated}건 · 자동 취소 ${result.summary.voided}건` })
        else setScanNote({ tone: 'neutral', text: '자동 스캔 결과 바뀐 벌금이 없습니다.' })
      } else if (scan) {
        setScanNote({ tone: 'neutral', text: '열람자 계정이라 자동 스캔을 실행하지 않았습니다. 저장된 벌금만 표시합니다.' })
      }
      await loadFines(current)
    } catch (error) {
      setScanNote({ tone: 'danger', text: `벌금을 불러오지 못했습니다: ${error.message}` })
    } finally {
      scanLock.current = false
      setScanning(false)
      setLoading(false)
    }
  }, [loadFines, role])

  useEffect(() => {
    const timer = setTimeout(() => refresh({ scan: true }), 0)
    return () => clearTimeout(timer)
  }, [refresh])

  const uniqueNames = useMemo(() => uniqueNameSet(members), [members])
  const rows = useMemo(() => {
    const keyword = normalizeName(query)
    return members
      .map((member) => {
        const memberFines = fines.filter((fine) => recordBelongsTo(fine, member, uniqueNames))
        return { member, fines: memberFines, ...summarizeFines(memberFines) }
      })
      .filter((row) => !keyword || normalizeName(`${row.member.name}${row.member.generation}`).includes(keyword))
      .sort((a, b) => b.unpaidTotal - a.unpaidTotal || a.member.name.localeCompare(b.member.name, 'ko'))
  }, [members, fines, uniqueNames, query])
  const totals = summarizeFines(fines)

  async function addManualFine(event) {
    event.preventDefault()
    const member = members.find((item) => item.id === manualFine.memberId)
    if (!member || !Number(manualFine.amount) || !manualFine.reason.trim()) {
      toast.error('대상, 금액, 사유를 모두 입력하세요.')
      return
    }
    await run(async () => {
      const { error } = await supabase.from('pr_fines').insert([{
        user_name: member.name,
        member_id: member.id,
        week: Number(manualFine.week),
        category: manualFine.category,
        amount: Number(manualFine.amount),
        reason: manualFine.reason.trim(),
        is_paid: false,
        semester: semester.code,
        semester_id: semester.id || null,
      }])
      if (error) {
        toast.error(`벌금을 부과하지 못했습니다: ${error.message}`)
        return
      }
      toast.success(`${member.name}님에게 ${Number(manualFine.amount).toLocaleString()}원 벌금을 부과했습니다.`)
      setManualFine((current) => ({ ...current, amount: '', reason: '' }))
      await loadFines(semester)
    })
  }

  async function updateFine(fine, patch, message) {
    await run(async () => {
      const { error } = await supabase.from('pr_fines').update(patch).eq('id', fine.id)
      if (error) {
        toast.error(`저장하지 못했습니다: ${error.message}`)
        return
      }
      setFines((current) => current.map((item) => item.id === fine.id ? { ...item, ...patch } : item))
      toast.success(message)
    })
  }

  function voidFine(fine) {
    if (!confirm(`'${fine.category}' 벌금(₩${Number(fine.amount || 0).toLocaleString()})을 취소할까요?\n기록은 지워지지 않고 취소로 남으며, 자동 스캔이 다시 만들지 않습니다.`)) return
    updateFine(fine, { voided_at: new Date().toISOString(), reason: `[삭제됨] ${fine.reason || ''}`.trim() }, '벌금을 취소했습니다.')
  }

  async function payAll(row) {
    const ids = row.fines.filter((fine) => !isFineVoided(fine) && !fine.is_paid).map((fine) => fine.id)
    if (ids.length === 0 || !confirm(`${row.member.name}님의 미납 벌금 ${ids.length}건(₩${row.unpaidTotal.toLocaleString()})을 모두 납부 처리할까요?`)) return
    await run(async () => {
      const { error } = await supabase.from('pr_fines').update({ is_paid: true }).in('id', ids)
      if (error) {
        toast.error(`납부 처리하지 못했습니다: ${error.message}`)
        return
      }
      setFines((current) => current.map((item) => ids.includes(item.id) ? { ...item, is_paid: true } : item))
      toast.success(`${row.member.name}님 벌금 ${ids.length}건을 납부 처리했습니다.`)
    })
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="학회원 시스템"
        title="벌금 상세 관리"
        description="과제·피드백·출석 기록으로 이번 학기 벌금을 자동 계산하고, 납부·면제·취소를 관리합니다. 마이페이지와 같은 기준으로 합계를 냅니다."
        actions={<Button icon={RefreshCw} onClick={() => refresh({ scan: true })} loading={scanning || loading}>{canRunAutomation(role) ? '다시 스캔' : '새로고침'}</Button>}
      />
      <ReadOnlyBanner role={role} />
      {scanNote && <Notice tone={scanNote.tone} className="mb-4" onClose={() => setScanNote(null)}>{scanNote.text}</Notice>}

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={BadgeDollarSign} label="미납 합계" value={`₩${totals.unpaidTotal.toLocaleString()}`} note={`${totals.unpaidCount}건`} tone={totals.unpaidTotal ? 'red' : 'green'} />
        <Metric icon={Wallet} label="납부 합계" value={`₩${totals.paidTotal.toLocaleString()}`} tone="green" />
        <Metric label="면제" value={`${totals.waivedCount}건`} note="사유서 인정 등으로 0원 처리" tone="blue" />
        <Metric label="취소" value={`${totals.voidedCount}건`} note="삭제·자동 취소·중복 (기록은 보존)" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="학회원별 벌금"
          description={`${semester?.name || ''} 참여 학회원 ${members.length}명`}
          action={
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input aria-label="학회원 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·기수" className={`${inputClass} h-9 w-40 pl-9`} />
              </div>
              <label className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={showVoided} onChange={(event) => setShowVoided(event.target.checked)} className="h-4 w-4 accent-teal-700" />취소 내역 보기
              </label>
            </div>
          }
        >
          {loading ? <LoadingState label={scanning ? '기록을 스캔해 벌금을 계산하는 중입니다.' : '불러오는 중입니다.'} /> : rows.length === 0 ? <EmptyState title="표시할 학회원이 없습니다." /> : (
            <div className="divide-y divide-slate-100">
              {rows.map((row) => {
                const visible = row.fines.filter((fine) => showVoided || !isFineVoided(fine))
                return (
                  <section key={row.member.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[160px_minmax(0,1fr)_auto]">
                    <div>
                      <p className="font-bold text-slate-900">{row.member.name}</p>
                      <p className="text-xs text-slate-500">{row.member.generation || '-'}</p>
                      <p className={`mt-1 text-lg font-bold ${row.unpaidTotal ? 'text-red-600' : 'text-slate-400'}`}>₩{row.unpaidTotal.toLocaleString()}</p>
                    </div>
                    <ul className="min-w-0 space-y-1.5">
                      {visible.length === 0 ? <li className="text-sm text-slate-400">벌금 없음</li> : visible.map((fine) => {
                        const state = fineState(fine)
                        return (
                          <li key={fine.id} className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${state === 'unpaid' ? 'border-red-100 bg-white' : 'border-slate-100 bg-slate-50 text-slate-500'}`}>
                            <span className="rounded bg-slate-800 px-1.5 text-xs font-bold text-white">W{fine.week}</span>
                            <span className="min-w-0 flex-1">
                              <span className={`font-semibold ${state === 'voided' ? 'line-through' : 'text-slate-800'}`}>{fine.category}</span>
                              <span className="block truncate text-xs text-slate-500">{fine.reason}</span>
                            </span>
                            <span className="font-bold">₩{Number(fine.amount || 0).toLocaleString()}</span>
                            <StatusBadge tone={state === 'unpaid' ? 'red' : state === 'paid' ? 'green' : state === 'waived' ? 'blue' : 'gray'}>{FINE_STATE_LABELS[state]}</StatusBadge>
                            {state !== 'voided' && (
                              <span className="flex gap-1">
                                <Button size="sm" onClick={() => updateFine(fine, { is_paid: !fine.is_paid }, fine.is_paid ? '미납으로 바꿨습니다.' : '납부 처리했습니다.')} disabled={!canWrite || pending}>{fine.is_paid ? '미납으로' : '납부'}</Button>
                                <Button size="sm" variant="danger" onClick={() => voidFine(fine)} disabled={!canWrite || pending}>취소</Button>
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    <div className="lg:self-start">
                      <Button size="sm" variant="dark" onClick={() => payAll(row)} disabled={!canWrite || pending || row.unpaidTotal === 0}>전액 납부</Button>
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="수동 벌금 부과" description="과제·피드백·출석은 자동 스캔됩니다. 현장 지각 등 예외는 여기서 부과합니다." className="self-start">
          <form onSubmit={addManualFine} className="space-y-3 p-4">
            <Field label="대상" htmlFor="manual-member">
              <select id="manual-member" value={manualFine.memberId} onChange={(event) => setManualFine({ ...manualFine, memberId: event.target.value })} disabled={!canWrite} className={inputClass}>
                <option value="">학회원 선택</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.generation || '-'})</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="주차" htmlFor="manual-week">
                <select id="manual-week" value={manualFine.week} onChange={(event) => setManualFine({ ...manualFine, week: Number(event.target.value) })} disabled={!canWrite} className={inputClass}>
                  {Array.from({ length: (semester?.totalWeeks || 12) + 1 }, (_, index) => <option key={index} value={index}>{index}주차</option>)}
                </select>
              </Field>
              <Field label="종류" htmlFor="manual-category">
                <select id="manual-category" value={manualFine.category} onChange={(event) => setManualFine({ ...manualFine, category: event.target.value })} disabled={!canWrite} className={inputClass}>
                  <option value="세션 지각">세션 지각</option>
                  <option value="무단 결석">무단 결석</option>
                  <option value="기타 벌금">기타 벌금</option>
                </select>
              </Field>
            </div>
            <Field label="사유" htmlFor="manual-reason"><input id="manual-reason" value={manualFine.reason} onChange={(event) => setManualFine({ ...manualFine, reason: event.target.value })} placeholder="예: 13:25 도착, 5분 지각" disabled={!canWrite} className={inputClass} /></Field>
            <Field label="금액 (원)" htmlFor="manual-amount"><input id="manual-amount" type="number" min="0" inputMode="numeric" value={manualFine.amount} onChange={(event) => setManualFine({ ...manualFine, amount: event.target.value })} disabled={!canWrite} className={inputClass} /></Field>
            <Button type="submit" variant="dangerSolid" className="w-full" loading={pending} disabled={!canWrite}>부과하기</Button>
          </form>
        </Panel>
      </div>
    </AdminPage>
  )
}
