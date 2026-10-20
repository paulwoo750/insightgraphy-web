'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { currentSemesterIdFilter, displayTopic, fetchCurrentSemester, fetchSemesterMembers, formatDateTime, fromKstInput, groupDeadlines, memberGroup, submissionTopic, weekFromParam } from '@/lib/semester'
import { MemberHeader, MemberPage, rememberWeekContext, useMember } from '@/app/components/MemberShell'
import WeekOverviewCard from '@/app/components/WeekOverviewCard'
import { Send, Trash2, X } from 'lucide-react'
import { Button, IconButton, LoadingState, Modal, inputClass, useToast } from '@/app/components/ui'
import { Avatar, FeedbackFields, FeedbackView, hasFeedbackContent } from '@/app/vote/_components/Editorial'
import { SubmissionList, WeekSelector } from '../_components/shared'

// 주소(?week=&session=)를 지금 보는 주차·세션으로 맞추고, 다른 자료실 메뉴에도 이어지게 기억한다
function syncWeekUrl(week, mode) {
  const params = new URLSearchParams(window.location.search)
  params.set('week', String(week))
  if (mode === 'weekday') params.set('session', 'weekday')
  else params.delete('session')
  window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`)
  rememberWeekContext(week, mode)
}

export default function VideoRoom() {
  const router = useRouter()
  const identity = useMember()
  const toast = useToast()
  const [user, setUser] = useState(null)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  const [selectedWeek, setSelectedWeek] = useState(1)
  const [targetWeek, setTargetWeek] = useState(1)

  const [activeMembers, setActiveMembers] = useState([])
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [ytUrl, setYtUrl] = useState('')

  const [currentSemester, setCurrentSemester] = useState('')
  const [totalWeeks, setTotalWeeks] = useState(0)
  const [deadlines, setDeadlines] = useState({})
  const [weekTopics, setWeekTopics] = useState({})
  const [weeklySetup, setWeeklySetup] = useState({})

  const [editItem, setEditItem] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  const [viewingFile, setViewingFile] = useState(null)
  const [draftFeedback, setDraftFeedback] = useState(null)

  const [comments, setComments] = useState([])
  const [newCommentData, setNewCommentData] = useState(EMPTY_COMMENT)
  // 댓글 작성칸: 처음엔 한 줄, 누르면 항목별 칸까지 펼친다
  const [composerOpen, setComposerOpen] = useState(false)
  const [posting, setPosting] = useState(false)

  const weeks = Array.from({ length: totalWeeks + 1 }, (_, i) => i)

  // 🌟 방학학기: 정규세션/평일세션 모드
  const [semesterType, setSemesterType] = useState('regular')
  const [semesterInfo, setSemesterInfo] = useState(null)
  const [sessionMode, setSessionMode] = useState('regular') // 'regular' | 'weekday'
  const fileCategory = sessionMode === 'weekday' ? 'weekday_video' : 'video'

  // 🌟 유저가 배정된 평일세션 조의 설정 { date, videoDl, fbDl, ... }
  const myWeekdayTeam = (week) => {
    const grp = memberGroup(weeklySetup, week, user?.user_metadata?.name, 'weekday')
    return grp ? (weeklySetup[week]?.weekday?.[grp] || null) : null
  }
  // 등록 마감: 평일=조별 영상 마감(미설정 시 진행일 자정), 정규=영상 마감
  const activeUploadDeadline = (week) => {
    if (sessionMode === 'weekday') {
      const t = myWeekdayTeam(week)
      if (!t) return null
      if (t.videoDl) return fromKstInput(t.videoDl)
      return t.date ? fromKstInput(`${t.date}T23:59`) : null
    }
    return deadlines[week]?.video || null
  }

  // 이번 학기 제출물만 본다. 학기 전환은 is_archive를 바꾸지 않으므로 학기 코드로 거른다.
  const fetchFiles = useCallback(async (semesterCode) => {
    const { data } = await supabase
      .from('files_metadata')
      .select('*')
      .in('file_category', ['video', 'weekday_video'])
      .eq('semester', semesterCode)
      .eq('is_archive', false)
      .order('created_at', { ascending: false })
    if (data) setFiles(data)
  }, [])

  const fetchSystemData = useCallback(async () => {
    const semester = await fetchCurrentSemester()
    setCurrentSemester(semester.code)
    setSemesterType(semester.type)
    setWeekTopics(semester.weekTopics)
    setTotalWeeks(semester.totalWeeks)
    setWeeklySetup(semester.weeklySetup)

    const { data: dlData } = await supabase.from('pr_deadlines').select('*').or(currentSemesterIdFilter(semester))
    const params = new URLSearchParams(window.location.search)
    const initialWeek = weekFromParam(params.get('week'), semester.totalWeeks, semester.currentWeek)
    const initialMode = semester.type === 'vacation' && params.get('session') === 'weekday' ? 'weekday' : 'regular'
    setDeadlines(groupDeadlines(dlData))
    setSelectedWeek(initialWeek)
    setTargetWeek(initialWeek)
    setSessionMode(initialMode)
    setSemesterInfo(semester)
    rememberWeekContext(initialWeek, initialMode)
    return semester
  }, [])

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      const semester = await fetchSystemData()
      fetchFiles(semester.code)
      // 업로드 대상 기본 명단 = 이번 학기 참여 학회원
      setActiveMembers(await fetchSemesterMembers(semester.id, 'id, name'))
    }
    checkUser()
  }, [router, fetchFiles, fetchSystemData])

  const refreshFiles = () => fetchFiles(currentSemester)

  const uploadTargets = useMemo(
    () => buildUploadTargets(weeklySetup[targetWeek] || {}, sessionMode, activeMembers),
    [weeklySetup, targetWeek, sessionMode, activeMembers]
  )

  const handleUpdateFile = async () => {
    if (!newTitle) return
    const { error } = await supabase.from('files_metadata').update({ file_name: newTitle }).eq('id', editItem.id)
    if (!error) {
      toast.success("파일 이름을 바꿨습니다.");
      setEditItem(null);
      refreshFiles();
    }
  }

  const handleRegisterYoutube = async () => {
    if (!selectedTargetId || !ytUrl.trim()) return toast.error("업로드 대상과 유튜브 링크를 모두 입력하세요.")

    setUploading(true)
    const currentTopic = submissionTopic(weekTopics, targetWeek, sessionMode)
    const target = uploadTargets.find(t => t.id === selectedTargetId);
    if (!target) { setUploading(false); return toast.error("업로드 대상을 다시 선택하세요.") }

    const sessionTag = sessionMode === 'weekday' ? ' [평일세션]' : ''
    const autoTitle = `${targetWeek}W${sessionTag} (${currentTopic}) ${target.id} 발표영상`;
    const myGroup = target.group_id;

    const deadline = activeUploadDeadline(targetWeek)
    const isLate = deadline ? new Date() > new Date(deadline) : false

    const { error } = await supabase.from('files_metadata').insert([{
      file_name: autoTitle,
      file_url: ytUrl.trim(),
      week: targetWeek,
      file_category: fileCategory,
      is_archive: false,
      uploader: target.id,
      // 명단에서 고른 개인이면 그 학회원 ID를 함께 남긴다 (팀 영상은 팀 이름만)
      uploader_member_id: activeMembers.find(m => m.name === target.id)?.id || null,
      semester_id: semesterInfo?.id || null,
      storage_path: 'youtube',
      semester: currentSemester,
      is_late: isLate,
      group_id: myGroup
    }])
    if (!error) {
      toast.success(isLate ? '영상을 등록했습니다. 마감 이후라 지각으로 기록됩니다.' : '영상을 등록했습니다.');
      setYtUrl('');
      setSelectedTargetId('');
      setSelectedWeek(targetWeek);
      refreshFiles();
    }
    else { toast.error("등록하지 못했습니다: " + error.message); }
    setUploading(false)
  }

  const isVideoOwner = (file, userName) => {
    if (!file || !userName) return false;
    if (file.uploader === userName) return true;
    if (file.uploader.startsWith('Team ')) {
      const tId = Number(file.uploader.replace('Team ', ''));
      const setup = weeklySetup[file.week] || {};
      const mTeams = setup.memberTeams || setup.members || {};
      return Number(mTeams[userName]) === tId;
    }
    return false;
  }

  const handleOpenVideo = async (file) => {
    setViewingFile(file);
    setDraftFeedback(null);
    fetchComments(file.id);

    const userName = user?.user_metadata?.name;
    if (!userName) return;

    // 🌟 학기 필터 필수: 같은 주차·같은 이름이 과거 학기에도 있으면 엉뚱한 발표에 매칭된다
    let query = supabase.from('presentations').select('id').eq('week', file.week).eq('semester', file.semester || currentSemester);
    if (file.uploader.startsWith('Team ')) {
      const tId = Number(file.uploader.replace('Team ', ''));
      query = query.eq('team_id', tId);
    } else {
      query = query.eq('presenter_name', file.uploader);
    }

    const { data: pData } = await query.limit(1);
    if (pData && pData.length > 0) {
      const { data: myDraft } = await supabase.from('scores').select('*').eq('presentation_id', pData[0].id).eq('voter_name', userName).single();
      if (myDraft) setDraftFeedback(myDraft.details?.qualitative || null);
    }
  }

  const fetchComments = async (fileId) => {
    const { data } = await supabase.from('file_comments').select('*').eq('file_id', fileId).order('created_at', { ascending: true });
    if (data) setComments(data);
  }

  const handleAddComment = async () => {
    if (posting) return
    if (!newCommentData.originalMessage.trim()) return toast.error("핵심 메시지는 꼭 입력해야 합니다.");

    const realName = user.user_metadata.name || '알 수 없는 유저';
    setPosting(true)
    const { error } = await supabase.from('file_comments').insert([{
      file_id: viewingFile.id,
      user_id: user.id,
      user_name: realName,
      member_id: identity.member?.id || null,
      details: newCommentData
    }]);
    setPosting(false)

    if (!error) {
      setNewCommentData(EMPTY_COMMENT);
      setComposerOpen(false);
      fetchComments(viewingFile.id);
      toast.success("피드백을 등록했습니다.");
    } else { toast.error("피드백을 등록하지 못했습니다: " + error.message); }
  }

  const handleToggleRead = async (commentId, currentDetails) => {
    const isCurrentlyRead = currentDetails?.is_read || false;
    const now = new Date().toISOString();

    const updatedDetails = { ...currentDetails, is_read: !isCurrentlyRead, read_at: !isCurrentlyRead ? now : null };

    const { error } = await supabase.from('file_comments').update({ details: updatedDetails }).eq('id', commentId);
    if (!error) {
      fetchComments(viewingFile.id);
    } else {
      toast.error("상태를 바꾸지 못했습니다: " + error.message);
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!confirm("해당 피드백을 삭제하시겠습니까?")) return
    const { error } = await supabase.from('file_comments').delete().eq('id', commentId)
    if (!error) fetchComments(viewingFile.id)
  }

  const getYoutubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  const handleDeleteFile = async (fileRow) => {
    if (!confirm(`'${fileRow.file_name}' 영상 등록을 지울까요? 유튜브 원본은 지워지지 않습니다.`)) return
    const { data, error } = await supabase.from('files_metadata').delete().eq('id', fileRow.id).select('id')
    if (error || !data?.length) toast.error(`삭제하지 못했습니다${error ? `: ${error.message}` : ' (권한이 없거나 이미 삭제됨)'}`)
    else toast.success('영상 등록을 지웠습니다.')
    refreshFiles()
  }

  const handleWeekChange = (w) => {
    setSelectedWeek(w);
    setTargetWeek(w);
    setSelectedTargetId('');
    syncWeekUrl(w, sessionMode)
  }

  const handleSessionModeChange = (mode) => {
    setSessionMode(mode);
    setSelectedTargetId('');
    syncWeekUrl(selectedWeek, mode)
  }

  if (!user) return <MemberPage><LoadingState label="발표영상을 불러오는 중입니다." /></MemberPage>

  const selfFeedbacks = comments.filter(c => isVideoOwner(viewingFile, c.user_name));
  const peerFeedbacks = comments.filter(c => !isVideoOwner(viewingFile, c.user_name));
  const loggedInUserName = user?.user_metadata?.name;
  const isMeVideoOwner = isVideoOwner(viewingFile, loggedInUserName);

  const getQualitativeDeadline = (weekNum) => {
    // 평일세션 정성 피드백 = 조별 설정값, 미설정 시 진행일 익일 자정
    if (sessionMode === 'weekday') {
      const t = myWeekdayTeam(weekNum)
      if (!t) return null
      if (t.fbDl) return fromKstInput(t.fbDl)
      if (!t.date) return null
      return new Date(new Date(fromKstInput(`${t.date}T23:59`)).getTime() + 24 * 60 * 60 * 1000).toISOString()
    }
    return deadlines[weekNum]?.vote_feedback || deadlines[weekNum]?.feedback;
  }
  const getSelfDeadline = (weekNum) => {
    if (sessionMode === 'weekday') return deadlines[weekNum]?.weekday_self;
    return deadlines[weekNum]?.video_comment;
  }

  const filesThisWeek = files.filter(f => f.week === selectedWeek && (f.file_category || 'video') === fileCategory)
  const myTeamNo = (() => {
    const setup = weeklySetup[selectedWeek] || {}
    return setup.evalMode === 'team' ? (setup.memberTeams || setup.members || {})[user?.user_metadata?.name] : null
  })()
  const myRegularGroup = memberGroup(weeklySetup, selectedWeek, user?.user_metadata?.name)
  const myWeekdayGroup = memberGroup(weeklySetup, selectedWeek, user?.user_metadata?.name, 'weekday')

  return (
    <MemberPage>
      <MemberHeader eyebrow="주차별 자료실" title="발표영상" description="주차별 발표 영상을 등록하고, 조원 영상에 정성 피드백·내 영상에 셀프 피드백을 남깁니다." />
      <WeekSelector weeks={weeks} week={selectedWeek} onChange={handleWeekChange} session={sessionMode} onSession={handleSessionModeChange} allowWeekday={semesterType === 'vacation'} weekTopics={weekTopics} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <WeekOverviewCard
          semesterName={semesterInfo?.name || currentSemester}
          week={selectedWeek}
          sessionMode={sessionMode}
          topic={displayTopic(weekTopics, selectedWeek, sessionMode)}
          cancelled={semesterInfo?.weeks?.[selectedWeek]?.status === 'cancelled'}
          scheduleDate={sessionMode === 'weekday' ? myWeekdayTeam(selectedWeek)?.date : undefined}
          attendance={sessionMode === 'weekday' ? {} : { open: deadlines[selectedWeek]?.attendance_start, late: deadlines[selectedWeek]?.session_start, end: deadlines[selectedWeek]?.attendance_end }}
          groupLabel={sessionMode === 'weekday' ? (myWeekdayGroup ? `평일 ${myWeekdayGroup}조` : '') : myTeamNo ? `${myTeamNo}팀` : myRegularGroup ? `${myRegularGroup}조` : ''}
          deadlines={[
            { key: 'video', label: sessionMode === 'weekday' ? '평일 영상 마감' : '발표영상 등록', at: activeUploadDeadline(selectedWeek) },
            { key: 'vote_feedback', label: '조원 정성 피드백', at: getQualitativeDeadline(selectedWeek) },
            { key: 'video_comment', label: '셀프 피드백', at: getSelfDeadline(selectedWeek) },
          ]}
        />
        <form onSubmit={(event) => { event.preventDefault(); handleRegisterYoutube() }} className="space-y-3 rounded-2xl bg-violet-50/60 p-4">
          <h2 className="text-base font-bold text-slate-900">W{targetWeek} 영상 등록</h2>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">업로드 대상</span>
            <select value={selectedTargetId} onChange={(e) => setSelectedTargetId(e.target.value)} className={inputClass}>
              <option value="">대상 선택</option>
              {uploadTargets.map((t, idx) => <option key={t.id || idx} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">유튜브 링크</span>
            <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://youtu.be/…" className={inputClass} />
          </label>
          <Button type="submit" variant="primary" className="w-full" loading={uploading}>등록</Button>
          {sessionMode === 'weekday' && <p className="text-xs text-teal-700">평일세션은 정량평가 없이 정성·셀프 피드백만 진행합니다.</p>}
        </form>
      </div>

      <section className="mt-8" aria-label={`W${selectedWeek} 영상 목록`}>
        <SubmissionList
          files={filesThisWeek}
          weeklySetup={weeklySetup}
          week={selectedWeek}
          session={sessionMode}
          owner={{ member: identity.member, name: user?.user_metadata?.name, team: myTeamNo }}
          admin={identity.admin}
          onOpen={handleOpenVideo}
          onEdit={(fileRow) => { setEditItem(fileRow); setNewTitle(fileRow.file_name) }}
          onDelete={handleDeleteFile}
          emptyText="이 주차에 등록된 영상이 없습니다."
        />
      </section>

      {editItem && (
        <Modal
          title="파일 이름 바꾸기"
          onClose={() => setEditItem(null)}
          size="sm"
          footer={<><Button onClick={() => setEditItem(null)}>취소</Button><Button variant="primary" onClick={handleUpdateFile}>저장</Button></>}
        >
          <input aria-label="파일 이름" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={inputClass} />
        </Modal>
      )}

      {viewingFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={`${viewingFile.file_name} 피드백`}>
          <button type="button" onClick={() => setViewingFile(null)} aria-label="닫기" className="fixed right-3 top-3 z-[110] grid h-10 w-10 place-items-center rounded-full bg-slate-900/80 text-white shadow-lg backdrop-blur lg:hidden"><X className="h-5 w-5" aria-hidden="true" /></button>
          <div className="relative flex h-full w-full max-w-[1500px] flex-col overflow-y-auto bg-white shadow-2xl sm:h-[92vh] sm:rounded-2xl lg:flex-row lg:overflow-hidden">
            <div className={`flex shrink-0 flex-col bg-slate-950 transition-[flex-grow] lg:overflow-y-auto ${composerOpen ? 'lg:flex-[1.05]' : 'lg:flex-[1.45]'}`}>
              <div className="aspect-video w-full shrink-0 bg-black">
                <iframe className="h-full w-full" title={viewingFile.file_name} src={`https://www.youtube.com/embed/${getYoutubeId(viewingFile.file_url)}?autoplay=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              </div>
              <div className="px-5 py-5 sm:px-7">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-teal-400">W{viewingFile.week} · {viewingFile.uploader}</p>
                <p className="mt-1 break-keep text-lg font-extrabold text-white">{viewingFile.file_name}</p>
                {draftFeedback && hasFeedbackContent(draftFeedback) && (
                  <div className="mt-6 border-t border-white/10 pt-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-black text-amber-300">📒 내 임시 저장 노트</p>
                      <button type="button" onClick={() => { setNewCommentData({ ...EMPTY_COMMENT, ...pickComment(draftFeedback) }); setComposerOpen(true) }} className="rounded-full bg-amber-300/15 px-3 py-1.5 text-xs font-bold text-amber-200 transition hover:bg-amber-300/25">작성칸에 불러오기 ↘</button>
                    </div>
                    <FeedbackView data={draftFeedback} dark />
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col bg-white">
              <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
                <div className="min-w-0">
                  {composerOpen ? (
                    <>
                      <h2 className="text-xl font-black tracking-tight text-slate-900">✍️ {isMeVideoOwner ? '셀프 피드백' : '조원 피드백'} 작성</h2>
                      <button type="button" onClick={() => setComposerOpen(false)} className="mt-1 text-sm font-bold text-teal-700 hover:underline">← 댓글 {comments.length}개 보기</button>
                    </>
                  ) : (
                    <h2 className="text-xl font-black tracking-tight text-slate-900">💬 피드백 <span className="ml-1 text-base text-teal-500">{comments.length}</span></h2>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {getQualitativeDeadline(viewingFile.week) && <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-700">조원 마감 {formatDateTime(getQualitativeDeadline(viewingFile.week))}</span>}
                    {getSelfDeadline(viewingFile.week) && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">셀프 마감 {formatDateTime(getSelfDeadline(viewingFile.week))}</span>}
                  </div>
                </div>
                <span className="hidden lg:block"><IconButton icon={X} label="닫기" onClick={() => setViewingFile(null)} /></span>
              </div>

              {composerOpen ? (
                // 작성 모드: 오른쪽 칸 전체를 작성칸으로 쓴다 (댓글 목록은 잠시 숨김)
                <form onSubmit={(event) => { event.preventDefault(); handleAddComment() }} className="flex min-h-0 flex-1 flex-col">
                  <div className="flex-1 px-5 pb-6 pt-2 sm:px-6 lg:overflow-y-auto">
                    <FeedbackFields wide large value={newCommentData} onChange={(key, text) => setNewCommentData((prev) => ({ ...prev, [key]: text }))} messageLabel="핵심 메시지" messagePlaceholder="전체적인 핵심 메시지와 느낀 점" required />
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 bg-gradient-to-b from-white to-teal-50/60 px-5 py-4 shadow-[0_-12px_24px_-16px_rgba(15,23,42,0.25)] sm:px-6">
                    {draftFeedback && hasFeedbackContent(draftFeedback) && <Button variant="ghost" onClick={() => setNewCommentData({ ...EMPTY_COMMENT, ...pickComment(draftFeedback) })}>📒 임시 저장 노트 불러오기</Button>}
                    <Button variant="ghost" onClick={() => setComposerOpen(false)}>닫기</Button>
                    <Button type="submit" variant="primary" icon={Send} loading={posting}>등록</Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex-1 space-y-9 px-5 pb-6 sm:px-6 lg:overflow-y-auto">
                    <CommentGroup title="셀프 피드백" hint="발표자 본인·팀원" tone="text-violet-600" count={selfFeedbacks.length} empty="아직 셀프 피드백이 없습니다.">
                      {selfFeedbacks.map((c) => (
                        <FeedbackComment key={c.id} comment={c} isLate={isAfter(c.created_at, getSelfDeadline(viewingFile.week))} currentUserId={user.id} onDelete={handleDeleteComment} />
                      ))}
                    </CommentGroup>
                    <CommentGroup title="조원 피드백" hint={isMeVideoOwner ? '읽었으면 확인을 눌러 주세요' : ''} tone="text-teal-600" count={peerFeedbacks.length} empty="아직 조원 피드백이 없습니다.">
                      {peerFeedbacks.map((c) => (
                        <FeedbackComment
                          key={c.id}
                          comment={c}
                          isLate={isAfter(c.created_at, getQualitativeDeadline(viewingFile.week))}
                          isPeerFeedback
                          isVideoOwner={isMeVideoOwner}
                          onToggleRead={handleToggleRead}
                          selfDeadline={getSelfDeadline(viewingFile.week)}
                          currentUserId={user.id}
                          onDelete={handleDeleteComment}
                        />
                      ))}
                    </CommentGroup>
                  </div>
                  <div className="shrink-0 bg-gradient-to-b from-teal-50/60 to-white px-5 pb-5 pt-4 shadow-[0_-12px_24px_-16px_rgba(15,23,42,0.25)] sm:px-6">
                    <button type="button" onClick={() => setComposerOpen(true)} className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left shadow-sm ring-1 ring-teal-100 transition hover:ring-teal-300">
                      <Avatar name={loggedInUserName} />
                      <span className="min-w-0 flex-1 text-sm font-semibold text-slate-400">{isMeVideoOwner ? '내 발표를 돌아보며 셀프 피드백 남기기…' : '이 발표에 피드백 남기기…'}</span>
                      <span className="rounded-full bg-teal-700 px-3 py-1.5 text-xs font-bold text-white">✍️ 작성하기</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </MemberPage>
  )
}

const EMPTY_COMMENT = { originalMessage: '', insightPlus: '', insightMinus: '', graphicPlus: '', graphicMinus: '', deliveryPlus: '', deliveryMinus: '' }
// 임시 저장 노트(정성 피드백 작성실)에서 댓글 칸에 들어갈 값만 꺼낸다 (메모 제외)
const pickComment = (draft) => Object.fromEntries(Object.keys(EMPTY_COMMENT).map((key) => [key, draft?.[key] || '']))
const isAfter = (at, deadline) => Boolean(at && deadline && new Date(at) > new Date(deadline))

function formatCommentDate(value) {
  if (!value) return ''
  const d = new Date(value)
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function CommentGroup({ title, hint, tone, count, empty, children }) {
  return (
    <section>
      <h3 className="flex items-baseline gap-2">
        <span className={`text-sm font-black ${tone}`}>{title}</span>
        <span className="text-xs font-bold text-slate-400">{count}</span>
        {hint && <span className="ml-auto text-[11px] font-semibold text-slate-400">{hint}</span>}
      </h3>
      {count === 0 ? <p className="mt-3 text-sm text-slate-400">{empty}</p> : <ul className="mt-4 space-y-7">{children}</ul>}
    </section>
  )
}

function FeedbackComment({ comment, isLate, isPeerFeedback, isVideoOwner, onToggleRead, selfDeadline, currentUserId, onDelete }) {
  const data = comment.details
  if (!data) return null
  const isRead = Boolean(data.is_read)
  const isReadLate = isRead && isAfter(data.read_at, selfDeadline)
  const mine = currentUserId && (comment.user_id === currentUserId || data.user_id === currentUserId)
  return (
    <li className="flex gap-3">
      <Avatar name={comment.user_name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-black text-slate-900">{comment.user_name}</span>
          <span className="text-xs text-slate-400">{formatCommentDate(comment.created_at)}</span>
          {isLate && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">지각</span>}
          <span className="ml-auto flex items-center gap-1">
            {isPeerFeedback && (isVideoOwner ? (
              <button type="button" onClick={() => onToggleRead(comment.id, data)} aria-pressed={isRead} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${isRead ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'}`}>{isRead ? '✓ 확인함' : '읽음 확인'}</button>
            ) : isRead && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">✓ 발표자 확인</span>)}
            {isReadLate && <span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-700">늦게 확인</span>}
            {mine && <IconButton icon={Trash2} label="피드백 삭제" size="sm" onClick={() => onDelete(comment.id)} />}
          </span>
        </div>
        <div className="mt-2"><FeedbackView data={data} /></div>
      </div>
    </li>
  )
}

// 🌟 업로드 대상 목록 (Dashboard 세팅의 evalMode 기반으로 팀/개인 렌더링)
function buildUploadTargets(setup, sessionMode, activeMembers) {
  let targets = [];
  const evalMode = setup.evalMode || 'individual'; // 대시보드에서 설정한 모드 (기본은 개인)

  // 🌟 평일세션 모드: 항상 개인 단위 + 평일 전용 조 편성 기준
  if (sessionMode === 'weekday') {
    const wdMembers = (setup.weekdayMembers && Object.keys(setup.weekdayMembers).length) ? setup.weekdayMembers : (setup.members || {});
    Object.keys(wdMembers).forEach(name => {
      const gId = wdMembers[name];
      if (gId !== '미정') {
        targets.push({ id: name, label: name + (gId === '결석' ? ' (불참)' : ` · ${gId}조`), group_id: gId === '결석' ? null : Number(gId) });
      }
    });
    if (targets.length === 0 && activeMembers.length > 0) {
      targets = activeMembers.map(m => ({ id: m.name, label: m.name, group_id: null }));
    }
    targets.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return targets;
  }

  const mTeams = setup.memberTeams || setup.members || {};
  const tGroups = setup.teamGroups || setup.groupToCluster || {}; // 개인일 땐 members 값이 조(group)

  if (evalMode === 'team') {
    // 🌟 [팀 발표 모드]
    const teamMap = {};
    const absentMembers = [];

    Object.keys(mTeams).forEach(name => {
      const t = mTeams[name];
      if (t === '결석') {
        absentMembers.push(name);
      } else if (t !== '미정' && !isNaN(Number(t))) {
        if (!teamMap[t]) teamMap[t] = [];
        teamMap[t].push(name);
      }
    });

    Object.keys(teamMap).forEach(tId => {
      targets.push({
        id: `Team ${tId}`,
        label: `Team #${tId} (${teamMap[tId].join(', ')})`,
        group_id: tGroups[tId] || null
      });
    });
    absentMembers.forEach(name => {
      targets.push({
        id: name,
        label: `${name} (결석자 보강)`,
        group_id: null
      });
    });

  } else {
    // 🌟 [개인 발표 모드]
    Object.keys(mTeams).forEach(name => {
      const gId = mTeams[name];
      if (gId !== '미정') {
        targets.push({
          id: name,
          label: name + (gId === '결석' ? ' (결석자 보강)' : ''),
          group_id: gId === '결석' ? null : Number(gId)
        });
      }
    });
  }

  if (targets.length === 0 && activeMembers.length > 0) {
    targets = activeMembers.map(m => ({ id: m.name, label: m.name, group_id: null }));
  }

  targets.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return targets;
}
