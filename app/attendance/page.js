'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AttendancePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  
  const [isLocating, setIsLocating] = useState(false)
  const [sessionLoc, setSessionLoc] = useState(null)
  const [currentWeek, setCurrentWeek] = useState(1)
  const [hasAttended, setHasAttended] = useState(false)
  const [attendanceRecord, setAttendanceRecord] = useState(null)

  // 🌟 출석 시간 상태 관리
  const [timeConfig, setTimeConfig] = useState({ start: null, session: null, end: null })
  const [timeStatus, setTimeStatus] = useState('loading') // 'before', 'onTime', 'late', 'closed'

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)
      await fetchAttendanceData(session.user)
    }
    init()
  }, [router])

  // 🌟 1초마다 현재 시간을 확인해서 상태(오픈/지각/마감)를 업데이트하는 타이머
  useEffect(() => {
    if (!timeConfig.start || hasAttended) return;

    const timer = setInterval(() => {
      checkTimeStatus(timeConfig)
    }, 1000)
    return () => clearInterval(timer)
  }, [timeConfig, hasAttended])

  const fetchAttendanceData = async (currentUser) => {
    setLoading(true)

    // 🌟 1. 전체 마감 시간을 훑어서 '현재 진행 중이거나 가장 가까운 주차' 자동 탐색!
    const { data: dlData } = await supabase.from('pr_deadlines')
      .select('*')
      .in('category', ['attendance_start', 'session_start', 'attendance_end'])
    
    let targetWeek = 1;
    let tConfig = { start: null, session: null, end: null };

    if (dlData && dlData.length > 0) {
      const weekMap = {}
      dlData.forEach(d => {
        if(!weekMap[d.week]) weekMap[d.week] = {}
        weekMap[d.week][d.category] = d.deadline_time
      })

      const now = new Date().getTime()
      const availableWeeks = Object.keys(weekMap).map(Number).sort((a,b)=>a-b)
      
      let found = false
      // 1순위: 현재 진행 중인 주차 (start <= now <= end)
      for(const w of availableWeeks) {
        const wData = weekMap[w]
        if (wData.attendance_start && wData.attendance_end) {
          const s = new Date(wData.attendance_start).getTime()
          const e = new Date(wData.attendance_end).getTime()
          if (now >= s && now <= e) {
            targetWeek = w
            tConfig = { start: wData.attendance_start, session: wData.session_start, end: wData.attendance_end }
            found = true
            break
          }
        }
      }

      // 2순위: 아직 시작 안 한 가장 가까운 미래 주차
      if (!found) {
        for(const w of availableWeeks) {
          const wData = weekMap[w]
          if (wData.attendance_start) {
            const s = new Date(wData.attendance_start).getTime()
            if (now < s) {
              targetWeek = w
              tConfig = { start: wData.attendance_start, session: wData.session_start, end: wData.attendance_end }
              found = true
              break
            }
          }
        }
      }

      // 3순위: 다 끝났으면 설정값이 있는 가장 마지막 주차
      if (!found && availableWeeks.length > 0) {
        targetWeek = availableWeeks[availableWeeks.length - 1]
        const wData = weekMap[targetWeek]
        tConfig = { start: wData.attendance_start, session: wData.session_start, end: wData.attendance_end }
      }
    }

    setCurrentWeek(targetWeek)
    setTimeConfig(tConfig)
    checkTimeStatus(tConfig)

    // 2. 결정된 주차의 설정(위치) 불러오기
    const { data: configData } = await supabase.from('pr_config').select('*')
    if (configData) {
      const wsStr = configData.find(c => c.key === 'weekly_setup')?.value
      if (wsStr) {
        const weeklySetup = JSON.parse(wsStr)
        if (weeklySetup[targetWeek] && weeklySetup[targetWeek].location) {
          setSessionLoc(weeklySetup[targetWeek].location)
        }
      }
    }

    // 3. 결정된 주차 내 출석 기록이 있는지 확인
    if (currentUser?.user_metadata?.name) {
      const { data: attData } = await supabase
        .from('pr_attendance')
        .select('*')
        .eq('user_name', currentUser.user_metadata.name)
        .eq('week', targetWeek)
        .maybeSingle() 

      if (attData) {
        setHasAttended(true)
        setAttendanceRecord(attData)
      } else {
        setHasAttended(false)
        setAttendanceRecord(null)
      }
    }

    setLoading(false)
  }

  // 🌟 시간 상태 계산 함수
  const checkTimeStatus = (tConfig) => {
    if (!tConfig.start || !tConfig.end) {
      setTimeStatus('no_setting')
      return
    }

    const now = new Date().getTime()
    const startT = new Date(tConfig.start).getTime()
    const sessionT = tConfig.session ? new Date(tConfig.session).getTime() : null
    const endT = new Date(tConfig.end).getTime()

    if (now < startT) {
      setTimeStatus('before')
    } else if (now > endT) {
      setTimeStatus('closed')
    } else {
      if (sessionT && now > sessionT) {
        setTimeStatus('late') // 지각 범위
      } else {
        setTimeStatus('onTime') // 정상 출석 범위
      }
    }
  }

  // 🌍 위도/경도로 두 지점 간의 거리(m)를 계산하는 하버사인 공식
  const getDistanceFromLatLonInM = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3 
    const dLat = (lat2 - lat1) * (Math.PI / 180)
    const dLon = (lon2 - lon1) * (Math.PI / 180)
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return Math.floor(R * c)
  }

  // 📍 GPS 출석체크 실행
  const handleCheckIn = () => {
    if (!sessionLoc || !sessionLoc.lat) {
      return alert("관리자가 아직 이번 주 세션 장소를 설정하지 않았어! 😅")
    }

    setIsLocating(true)

    // 브라우저 GPS 지원 여부 확인
    if (!navigator.geolocation) {
      setIsLocating(false)
      return alert("현재 사용 중인 스마트폰/브라우저에서는 위치 기반 서비스를 지원하지 않아! 😥")
    }

    // 폰의 현재 위치 가져오기
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const myLat = position.coords.latitude
        const myLng = position.coords.longitude

        // 세션 장소와 내 위치의 거리 계산
        const dist = getDistanceFromLatLonInM(sessionLoc.lat, sessionLoc.lng, myLat, myLng)

        // 반경 안에 있는지 확인
        if (dist <= (sessionLoc.radius || 100)) {
          
          // 🌟 성공 시 DB에 기록할 상태 결정 (정상출석 vs 지각)
          const finalStatus = timeStatus === 'late' ? '지각' : '출석완료'

          const { data, error } = await supabase.from('pr_attendance').insert([{
            user_name: user.user_metadata.name,
            week: currentWeek,
            status: finalStatus,
            distance_m: dist
          }]).select()

          if (!error && data) {
            alert(`${finalStatus === '지각' ? '지각 처리되었어! 🏃‍♂️💨' : '출석 반경 내 도착 확인 완료! 🎉'}\n(목적지와의 거리: ${dist}m)`)
            setHasAttended(true)
            setAttendanceRecord(data[0])
          } else {
            alert("서버 저장 중 오류가 발생했어: " + error?.message)
          }
        } else {
          alert(`세션 장소에서 너무 멀어! 🏃‍♂️\n\n(현재 내 거리: ${dist}m / 허용 반경: ${sessionLoc.radius || 100}m)\n\n강의실에 도착한 후 다시 시도해줘!`)
        }
        setIsLocating(false)
      },
      (err) => {
        setIsLocating(false)
        alert("위치 정보를 가져오는 데 실패했어. 폰 설정에서 웹 브라우저(사파리/크롬)의 '위치 정보(GPS) 접근 권한'을 허용해 줘! 🙏")
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    )
  }

  // 시간 포맷 헬퍼 (14:30 형태)
  const formatTimeOnly = (dateStr) => {
    if (!dateStr) return '미설정'
    const d = new Date(dateStr)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading || !user) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">시스템 연동 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 flex flex-col items-center justify-center relative overflow-hidden">
      
      {/* 배경 꾸미기 */}
      <div className="absolute top-0 left-0 w-full h-64 bg-blue-600 rounded-b-[4rem] z-0"></div>
      
      <div className="relative z-10 w-full max-w-md">
        
        <Link href="/home" className="inline-block mb-6 px-4 py-2 bg-white/20 text-white backdrop-blur-md rounded-xl text-xs font-black hover:bg-white/30 transition-all border border-white/30">
          ← 홈으로 돌아가기
        </Link>
        
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col items-center text-center">
          
          <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center text-4xl mb-4 shadow-inner">
            📍
          </div>
          
          <h1 className="text-2xl font-black text-slate-800 mb-1 tracking-tight">Week {currentWeek} 정규 세션</h1>
          
          {/* 🌟 시간 안내 보드 */}
          <div className="w-full bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6 flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-emerald-600">🟢 출석 오픈</span>
              <span className="text-slate-700">{formatTimeOnly(timeConfig.start)}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-orange-600">⚠️ 세션 시작 (지각)</span>
              <span className="text-slate-700">{formatTimeOnly(timeConfig.session)}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-red-600">🔴 출석 마감 (결석)</span>
              <span className="text-slate-700">{formatTimeOnly(timeConfig.end)}</span>
            </div>
          </div>

          {hasAttended ? (
            <div className={`w-full border-2 p-6 rounded-3xl flex flex-col items-center justify-center animate-in zoom-in duration-500 ${attendanceRecord?.status === '지각' ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <span className="text-5xl mb-3 drop-shadow-sm">{attendanceRecord?.status === '지각' ? '🏃💨' : '✅'}</span>
              <span className={`text-xl font-black tracking-tight ${attendanceRecord?.status === '지각' ? 'text-orange-700' : 'text-emerald-700'}`}>
                {attendanceRecord?.status === '지각' ? '지각 처리됨' : '출석 완료!'}
              </span>
              <div className={`mt-4 pt-4 border-t w-full flex flex-col gap-1 ${attendanceRecord?.status === '지각' ? 'border-orange-200/50' : 'border-emerald-200/50'}`}>
                <span className={`text-xs font-bold ${attendanceRecord?.status === '지각' ? 'text-orange-600/80' : 'text-emerald-600/80'}`}>
                  인증 시간: {new Date(attendanceRecord?.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>
          ) : (
            // 🌟 상태에 따른 버튼 렌더링
            <>
              {timeStatus === 'no_setting' && (
                <button disabled className="w-full py-6 bg-slate-200 text-slate-500 rounded-3xl font-black text-sm shadow-inner transition-all opacity-70">
                  관리자가 시간을 아직 설정하지 않았어 ⏳
                </button>
              )}
              {timeStatus === 'before' && (
                <button disabled className="w-full py-6 bg-slate-200 text-slate-500 rounded-3xl font-black text-sm shadow-inner transition-all opacity-70">
                  아직 출석체크 시간이 아닙니다 ⏰
                </button>
              )}
              {timeStatus === 'closed' && (
                <button disabled className="w-full py-6 bg-red-100 text-red-600 border border-red-200 rounded-3xl font-black text-sm shadow-inner transition-all">
                  출석체크가 마감되었습니다 (결석) 🚨
                </button>
              )}
              {timeStatus === 'onTime' && (
                <button 
                  onClick={handleCheckIn} disabled={isLocating}
                  className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-3xl font-black text-lg shadow-xl shadow-blue-600/20 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isLocating ? <span className="animate-pulse">위치 확인 중... 🛰️</span> : <span>현재 위치로 출석하기 👆</span>}
                </button>
              )}
              {timeStatus === 'late' && (
                <button 
                  onClick={handleCheckIn} disabled={isLocating}
                  className="w-full py-6 bg-orange-500 hover:bg-orange-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-orange-600/20 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isLocating ? <span className="animate-pulse">위치 확인 중... 🛰️</span> : <span>출석하기 (지각) 🏃‍♂️</span>}
                </button>
              )}
            </>
          )}

          {!hasAttended && timeStatus !== 'closed' && timeStatus !== 'before' && (
            <p className="text-[10px] text-slate-400 mt-6 font-bold leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 text-left">
              * 최초 1회, 브라우저의 <strong className="text-red-400">위치 정보 제공 동의</strong>가 필요합니다.<br/>
              * 실내에서는 GPS 오차가 발생할 수 있으니, 창가 쪽이나 강의실 문 앞에서 시도해 주세요.
            </p>
          )}

        </div>
      </div>
    </div>
  )
}