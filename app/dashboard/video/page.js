'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { currentSemesterIdFilter, displayTopic, fetchCurrentSemester, fetchSemesterMembers, formatDateTime, fromKstInput, groupDeadlines, memberGroup, nearestDeadlineWeek, submissionTopic, weekFromParam } from '@/lib/semester'
import { MemberHeader, MemberPage, rememberWeekContext, useMember } from '@/app/components/MemberShell'
import WeekOverviewCard from '@/app/components/WeekOverviewCard'
import { Button, inputClass, useToast } from '@/app/components/ui'
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
  const [newCommentData, setNewCommentData] = useState({
    originalMessage: '',
    insightPlus: '', insightMinus: '',
    graphicPlus: '', graphicMinus: '',
    deliveryPlus: '', deliveryMinus: ''
  })

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
    const initialWeek = weekFromParam(params.get('week'), semester.totalWeeks, nearestDeadlineWeek(dlData, 'video'))
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
    if (!newCommentData.originalMessage.trim()) return toast.error("Original Message는 꼭 입력해야 합니다.");

    const realName = user.user_metadata.name || '알 수 없는 유저';
    const { error } = await supabase.from('file_comments').insert([{
      file_id: viewingFile.id,
      user_id: user.id,
      user_name: realName,
      details: newCommentData
    }]);

    if (!error) {
      setNewCommentData({ originalMessage: '', insightPlus: '', insightMinus: '', graphicPlus: '', graphicMinus: '', deliveryPlus: '', deliveryMinus: '' });
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

  if (!user) return <div className="p-8 text-center font-bold text-slate-500">데이터 로딩 중...</div>

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
        <form onSubmit={(event) => { event.preventDefault(); handleRegisterYoutube() }} className="space-y-3 rounded-lg border border-slate-200 p-4">
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
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white p-8 w-full max-w-sm shadow-xl border border-slate-300 rounded-sm">
            <h2 className="font-extrabold mb-6 text-lg text-slate-900 border-l-4 border-red-700 pl-2">파일명 수정</h2>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border-b border-slate-300 py-2 mb-8 font-medium text-sm outline-none focus:border-red-700 bg-transparent" />
            <div className="flex gap-2">
              <button onClick={handleUpdateFile} className="flex-1 py-2.5 bg-red-700 text-white rounded-sm font-bold text-xs border border-red-800 hover:bg-red-800">저장</button>
              <button onClick={() => setEditItem(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-sm font-bold text-xs border border-slate-300 hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}

      {viewingFile && (
        <div className="fixed inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white w-full max-w-[1500px] h-[90vh] flex flex-col lg:flex-row overflow-hidden relative shadow-2xl border border-slate-400 rounded-sm">
            <button onClick={() => setViewingFile(null)} className="absolute top-4 right-4 z-50 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-900 hover:text-white transition-colors rounded-sm border border-slate-300">닫기 ✕</button>

            <div className="flex-[1.5] bg-black flex flex-col border-r border-slate-300 overflow-hidden">
              <div className={`w-full ${draftFeedback ? 'aspect-video shrink-0' : 'flex-1'} bg-black transition-all`}>
                <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${getYoutubeId(viewingFile.file_url)}?autoplay=1`} frameBorder="0" allowFullScreen></iframe>
              </div>

              {draftFeedback && (
                <div className="flex-1 overflow-y-auto p-8 bg-[#0f172a]">
                  <h3 className="text-sm font-extrabold text-emerald-400 uppercase tracking-widest mb-6 pb-2 border-b border-slate-700">
                    내 임시저장 노트
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Original Message</p>
                      <p className="text-sm font-medium text-slate-300 leading-relaxed border-l-2 border-slate-600 pl-3">{draftFeedback.originalMessage || '작성된 내용이 없습니다.'}</p>
                    </div>
                    <DraftBox title="Insight" plus={draftFeedback.insightPlus} minus={draftFeedback.insightMinus} />
                    <DraftBox title="Graphic" plus={draftFeedback.graphicPlus} minus={draftFeedback.graphicMinus} />
                    <DraftBox title="Delivery" plus={draftFeedback.deliveryPlus} minus={draftFeedback.deliveryMinus} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col bg-white">
              <div className="p-6 border-b border-slate-200">
                <h2 className="font-extrabold text-lg text-slate-900 border-l-4 border-red-700 pl-2">Feedback</h2>
                <p className="text-xs text-slate-500 font-semibold mt-2 truncate">{viewingFile.file_name}</p>
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  {getQualitativeDeadline(viewingFile.week) && (
                    <span className="text-xs font-bold text-red-600 border border-red-200 bg-red-50 px-2 py-0.5 rounded-sm w-fit">
                      조원 마감: {formatDateTime(getQualitativeDeadline(viewingFile.week))}
                    </span>
                  )}
                  {deadlines[viewingFile.week]?.video_comment && (
                    <span className="text-xs font-bold text-red-600 border border-red-200 bg-red-50 px-2 py-0.5 rounded-sm w-fit">
                      본인 마감: {formatDateTime(deadlines[viewingFile.week].video_comment)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 border-b-2 border-slate-800 pb-2 mb-4">셀프 피드백 (본인/팀원)</h4>
                  {selfFeedbacks.map((c) => {
                    const isLate = deadlines[viewingFile.week]?.video_comment && new Date(c.created_at) > new Date(deadlines[viewingFile.week].video_comment);
                    return <FeedbackCard key={c.id} commentId={c.id} name={c.user_name} data={c.details} date={c.created_at} isLate={isLate} currentUserId={user.id} onDelete={handleDeleteComment} />
                  })}
                  {selfFeedbacks.length === 0 && <p className="text-xs text-slate-400 font-medium pb-2">등록된 셀프 피드백이 없습니다.</p>}
                </div>

                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 border-b-2 border-slate-800 pb-2 mb-4">조원 상세 피드백</h4>
                  {peerFeedbacks.map((c) => {
                    const isLate = getQualitativeDeadline(viewingFile.week) && new Date(c.created_at) > new Date(getQualitativeDeadline(viewingFile.week));
                    return (
                      <FeedbackCard
                        key={c.id}
                        commentId={c.id}
                        name={c.user_name}
                        data={c.details}
                        date={c.created_at}
                        isLate={isLate}
                        isPeerFeedback={true}
                        isVideoOwner={isMeVideoOwner}
                        onToggleRead={handleToggleRead}
                        selfDeadline={deadlines[viewingFile.week]?.video_comment}
                        currentUserId={user.id}
                        onDelete={handleDeleteComment}
                      />
                    )
                  })}
                  {peerFeedbacks.length === 0 && <p className="text-xs text-slate-400 font-medium">등록된 조원 피드백이 없습니다.</p>}
                </div>
              </div>

              <div className="p-6 border-t border-slate-300 bg-slate-50/50 max-h-[40vh] overflow-y-auto shrink-0">
                <h4 className="text-sm font-extrabold text-slate-800 mb-4 border-l-4 border-red-700 pl-2">피드백 작성</h4>
                <div className="space-y-5">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block uppercase tracking-wider">Original Message (필수)</label>
                    <input
                      type="text"
                      value={newCommentData.originalMessage}
                      onChange={(e)=>setNewCommentData({...newCommentData, originalMessage: e.target.value})}
                      className="w-full border-b border-slate-300 py-1 text-sm font-medium outline-none focus:border-red-800 bg-transparent"
                      placeholder="전체적인 핵심 메시지 및 느낀 점"
                    />
                  </div>
                  <FeedbackInputSection title="Insight" plus={newCommentData.insightPlus} minus={newCommentData.insightMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  <FeedbackInputSection title="Graphic" plus={newCommentData.graphicPlus} minus={newCommentData.graphicMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  <FeedbackInputSection title="Delivery" plus={newCommentData.deliveryPlus} minus={newCommentData.deliveryMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />

                  <button onClick={handleAddComment} className="w-full py-3 bg-slate-900 text-white font-bold text-sm hover:bg-red-800 transition-colors rounded-sm mt-4">댓글 등록</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </MemberPage>
  )
}

function DraftBox({ title, plus, minus }) {
  if (!plus && !minus) return null;
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{title}</p>
      <div className="grid gap-2 border-l-2 border-slate-600 pl-3">
        {plus && <p className="text-xs font-medium text-emerald-300 leading-relaxed"><span className="font-bold text-emerald-400 mr-1">+)</span> {plus}</p>}
        {minus && <p className="text-xs font-medium text-red-300 leading-relaxed"><span className="font-bold text-red-400 mr-1">-)</span> {minus}</p>}
      </div>
    </div>
  )
}

function FeedbackInputSection({ title, plus, minus, onChange }) {
  const kP = title.toLowerCase() + 'Plus';
  const kM = title.toLowerCase() + 'Minus';
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
      <div className="grid grid-cols-1 gap-2">
        <textarea
          value={plus}
          onChange={(e)=>onChange(kP, e.target.value)}
          placeholder="(+) 좋았던 점 및 배울 점"
          className="w-full border-b-2 border-emerald-400 p-2 text-xs font-medium outline-none focus:border-emerald-600 min-h-[40px] resize-none bg-transparent"
        />
        <textarea
          value={minus}
          onChange={(e)=>onChange(kM, e.target.value)}
          placeholder="(-) 아쉬운 점 및 개선 제안"
          className="w-full border-b-2 border-red-400 p-2 text-xs font-medium outline-none focus:border-red-600 min-h-[40px] resize-none bg-transparent"
        />
      </div>
    </div>
  )
}

function FeedbackCard({ commentId, name, data, date, isLate, isPeerFeedback, isVideoOwner, onToggleRead, selfDeadline, currentUserId, onDelete }) {
  if (!data) return null;
  const d = date ? new Date(date) : null;
  const dateStr = d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

  const isRead = data.is_read || false;
  const readAtStr = data.read_at ? new Date(data.read_at) : null;
  const deadlineDate = selfDeadline ? new Date(selfDeadline) : null;
  const isReadLate = isRead && readAtStr && deadlineDate && readAtStr > deadlineDate;

  return (
    <div className="border-b border-slate-200 pb-6 mb-6 last:border-0 group">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">{name}</span>
          {isLate && <span className="text-xs font-bold bg-red-50 text-red-600 border border-red-200 px-1 py-0.5 rounded-sm">LATE</span>}
          <span className="text-xs font-medium text-slate-400 ml-2">{dateStr}</span>
        </div>

        <div className="flex items-center gap-3">
          {currentUserId === data.user_id && (
             <button onClick={() => onDelete(commentId)} className="opacity-100 text-xs font-bold text-slate-400 hover:text-red-600 transition-opacity">삭제</button>
          )}

          {isPeerFeedback && (
            <div className="flex items-center gap-2">
              {isVideoOwner ? (
                <button onClick={() => onToggleRead(commentId, data)} className={`text-xs font-bold px-2 py-1 transition-colors border rounded-sm ${isRead ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}`}>
                  {isRead ? '✅ 확인 완료' : '읽음 확인'}
                </button>
              ) : (
                isRead && <span className="text-xs font-bold text-emerald-600 border border-emerald-200 bg-emerald-50 px-2 py-0.5 rounded-sm">✅ 작성자가 확인</span>
              )}
              {isReadLate && <span className="text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200 px-1 py-0.5 rounded-sm">LATE 확인</span>}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 pl-1">
        <div>
          <p className="text-xs font-bold text-slate-400 mb-1 uppercase">Original Message</p>
          <p className="text-sm font-medium text-slate-700 leading-relaxed border-l-2 border-slate-300 pl-3 py-1">{data.originalMessage}</p>
        </div>
        <FeedbackBox title="Insight" plus={data.insightPlus} minus={data.insightMinus} />
        <FeedbackBox title="Graphic" plus={data.graphicPlus} minus={data.graphicMinus} />
        <FeedbackBox title="Delivery" plus={data.deliveryPlus} minus={data.deliveryMinus} />
      </div>
    </div>
  )
}

function FeedbackBox({ title, plus, minus }) {
  if (!plus && !minus) return null;
  return (
    <div className="space-y-1.5 mt-2">
      <p className="text-xs font-bold text-slate-400 uppercase">{title}</p>
      <div className="grid gap-1.5 border-l-2 border-slate-200 pl-3">
        {plus && <p className="text-xs font-medium text-slate-700 leading-relaxed"><span className="font-bold text-emerald-500 mr-1">+)</span> {plus}</p>}
        {minus && <p className="text-xs font-medium text-slate-700 leading-relaxed"><span className="font-bold text-red-500 mr-1">-)</span> {minus}</p>}
      </div>
    </div>
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
