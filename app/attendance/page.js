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

  const [timeConfig, setTimeConfig] = useState({ start: null, session: null, end: null })
  const [timeStatus, setTimeStatus] = useState('loading') 

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

  useEffect(() => {
    if (!timeConfig.start || hasAttended) return;

    const timer = setInterval(() => {
      checkTimeStatus(timeConfig)
    }, 1000)
    return () => clearInterval(timer)
  }, [timeConfig, hasAttended])

  const fetchAttendanceData = async (currentUser) => {
    setLoading(true)

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

      if (!found && availableWeeks.length > 0) {
        targetWeek = availableWeeks[availableWeeks.length - 1]
        const wData = weekMap[targetWeek]
        tConfig = { start: wData.attendance_start, session: wData.session_start, end: wData.attendance_end }
      }
    }

    setCurrentWeek(targetWeek)
    setTimeConfig(tConfig)
    checkTimeStatus(tConfig)

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
        setTimeStatus('late') 
      } else {
        setTimeStatus('onTime') 
      }
    }
  }

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

  const handleCheckIn = () => {
    if (!sessionLoc || !sessionLoc.lat) {
      return alert("관리자가 아직 이번 주 세션 장소를 설정하지 않았어! 😅")
    }

    setIsLocating(true)

    if (!navigator.geolocation) {
      setIsLocating(false)
      return alert("현재 사용 중인 기기/브라우저에서는 위치 기반 서비스를 지원하지 않습니다. 😥")
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const myLat = position.coords.latitude
        const myLng = position.coords.longitude

        const dist = getDistanceFromLatLonInM(sessionLoc.lat, sessionLoc.lng, myLat, myLng)

        if (dist <= (sessionLoc.radius || 100)) {
          
          const finalStatus = timeStatus === 'late' ? '지각' : '출석완료'

          const { data, error } = await supabase.from('pr_attendance').insert([{
            user_name: user.user_metadata.name,
            week: currentWeek,
            status: finalStatus,
            distance_m: dist
          }]).select()

          if (!error && data) {
            alert(`${finalStatus === '지각' ? '지각 처리되었습니다. 🏃‍♂️💨' : '출석 확인 완료! 🎉'}\n(목적지와의 거리: ${dist}m)`)
            setHasAttended(true)
            setAttendanceRecord(data[0])
          } else {
            alert("서버 저장 중 오류가 발생했습니다: " + error?.message)
          }
        } else {
          alert(`세션 장소에서 너무 멉니다! 🏃‍♂️\n\n(현재 위치: ${dist}m / 허용 반경: ${sessionLoc.radius || 100}m)\n\n강의실에 도착한 후 다시 시도해 주세요!`)
        }
        setIsLocating(false)
      },
      (err) => {
        setIsLocating(false)
        alert("위치 정보를 가져오는 데 실패했습니다. 설정에서 '위치 정보(GPS) 접근 권한'을 허용해 주세요! 🙏")
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    )
  }

  const formatTimeOnly = (dateStr) => {
    if (!dateStr) return '미설정'
    const d = new Date(dateStr)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading || !user) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">데이터를 불러오는 중입니다...</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col items-center justify-center relative overflow-hidden px-6">
      
      {/* 🌟 배경 꾸미기 (Deep Teal 테마, 직각 베이스) */}
      <div className="absolute top-0 left-0 w-full h-72 bg-teal-800 z-0"></div>
      
      <div className="relative z-10 w-full max-w-md">
        
        {/* 뒤로가기 텍스트 */}
        <Link href="/home" className="inline-flex items-center mb-6 text-white/80 hover:text-white font-extrabold text-xs uppercase tracking-widest transition-colors">
          ← Back to Hub
        </Link>
        
        {/* 🌟 메인 출석 보드 (둥근 모서리 제거, 심플한 테두리) */}
        <div className="bg-white p-8 md:p-10 rounded-sm shadow-xl border border-slate-200 flex flex-col items-center text-center">
          
          {/* 아이콘 */}
          <div className="w-16 h-16 bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center text-2xl mb-6 shadow-sm rounded-sm">
            📍
          </div>
          
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">Week {currentWeek} 정규 세션</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Location Check-in</p>
          
          {/* 🌟 시간 안내 보드 (박스 대신 선 기반 디자인) */}
          <div className="w-full border-y border-slate-200 py-6 mb-8 flex flex-col gap-4">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-emerald-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 block"></span>
                출석 오픈
              </span>
              <span className="text-slate-800">{formatTimeOnly(timeConfig.start)}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-orange-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500 block"></span>
                세션 시작 (지각)
              </span>
              <span className="text-slate-800">{formatTimeOnly(timeConfig.session)}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-red-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 block"></span>
                출석 마감 (결석)
              </span>
              <span className="text-slate-800">{formatTimeOnly(timeConfig.end)}</span>
            </div>
          </div>

          {hasAttended ? (
            /* 🌟 출석 완료 컴포넌트 (선 기반) */
            <div className={`w-full py-8 border-y-2 flex flex-col items-center justify-center animate-in zoom-in duration-500 bg-slate-50 ${attendanceRecord?.status === '지각' ? 'border-orange-500' : 'border-teal-700'}`}>
              <span className="text-4xl mb-4 drop-shadow-sm">{attendanceRecord?.status === '지각' ? '🏃💨' : '✅'}</span>
              <span className={`text-xl font-extrabold tracking-tight ${attendanceRecord?.status === '지각' ? 'text-orange-700' : 'text-teal-800'}`}>
                {attendanceRecord?.status === '지각' ? '지각 처리되었습니다.' : '출석이 완료되었습니다.'}
              </span>
              <div className="mt-4 pt-4 border-t border-slate-200 w-[80%] flex justify-center">
                <span className="text-[11px] font-bold text-slate-500">
                  인증 시간: {new Date(attendanceRecord?.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>
          ) : (
            /* 🌟 상태에 따른 출석 버튼 (둥근 모서리 제거, 딥 틸 적용) */
            <div className="w-full">
              {timeStatus === 'no_setting' && (
                <button disabled className="w-full py-5 bg-slate-100 text-slate-400 border border-slate-200 font-extrabold text-sm transition-all opacity-70 cursor-not-allowed">
                  관리자 시간 설정 대기 중 ⏳
                </button>
              )}
              {timeStatus === 'before' && (
                <button disabled className="w-full py-5 bg-slate-100 text-slate-400 border border-slate-200 font-extrabold text-sm transition-all opacity-70 cursor-not-allowed">
                  출석 시간이 아닙니다 ⏰
                </button>
              )}
              {timeStatus === 'closed' && (
                <button disabled className="w-full py-5 bg-red-50 text-red-600 border border-red-200 font-extrabold text-sm transition-all cursor-not-allowed">
                  출석이 마감되었습니다 (결석) 🚨
                </button>
              )}
              {timeStatus === 'onTime' && (
                <button 
                  onClick={handleCheckIn} disabled={isLocating}
                  className="w-full py-5 bg-teal-800 hover:bg-teal-900 text-white font-extrabold text-base transition-colors active:bg-teal-950 flex items-center justify-center gap-3 disabled:opacity-50 rounded-sm"
                >
                  {isLocating ? <span className="animate-pulse">위치 확인 중... 🛰️</span> : <span>현재 위치로 출석 👆</span>}
                </button>
              )}
              {timeStatus === 'late' && (
                <button 
                  onClick={handleCheckIn} disabled={isLocating}
                  className="w-full py-5 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-base transition-colors active:bg-orange-800 flex items-center justify-center gap-3 disabled:opacity-50 rounded-sm"
                >
                  {isLocating ? <span className="animate-pulse">위치 확인 중... 🛰️</span> : <span>출석하기 (지각) 🏃‍♂️</span>}
                </button>
              )}
            </div>
          )}

          {/* 안내 문구 (테두리 상자 제거, 텍스트 위주) */}
          {!hasAttended && timeStatus !== 'closed' && timeStatus !== 'before' && (
            <div className="w-full mt-8 text-left space-y-1.5 border-l-2 border-red-400 pl-3">
              <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                최초 1회, 브라우저의 <strong className="text-red-500">위치 정보 제공 동의</strong>가 필요합니다.
              </p>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                실내에서는 GPS 오차가 발생할 수 있으니 가급적 창가 쪽에서 시도해 주세요.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}