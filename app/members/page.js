'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

// 상단 네비게이션
function PublicNav() {
  return (
    <nav className="fixed top-0 w-full bg-[#1a1a1a]/95 backdrop-blur-md text-white z-50 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex justify-between items-center h-[64px] md:h-[80px]">
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="relative w-8 h-8 md:w-9 md:h-9">
              <Image src="/logo.png" alt="IG Logo" fill className="object-contain" />
            </div>
            <span className="text-lg md:text-xl font-black uppercase tracking-tighter group-hover:text-[#a8d0cd] transition-colors">
              InsightGraphy
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-x-10 text-[11px] font-black uppercase tracking-widest text-white/60">
            <Link href="/about" className="hover:text-[#32a4a1] transition-colors">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] transition-colors">Activities</Link>
            <Link href="/schedule" className="hover:text-[#32a4a1] transition-colors">Schedule</Link>
            <Link href="/members" className="text-white font-bold transition-colors">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] transition-colors">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1] transition-colors">Join Us</Link>
          </div>

          <div className="flex items-center">
            <Link href="/login" className="bg-[#32a4a1] px-4 md:px-6 h-[32px] md:h-[38px] rounded-lg hover:bg-[#0d6b69] transition-all flex items-center justify-center text-white text-[10px] md:text-[11px] font-black uppercase shadow-lg shadow-brand-primary/20">
              Login
            </Link>
          </div>
        </div>

        <div className="md:hidden border-t border-white/5 overflow-x-auto no-scrollbar whitespace-nowrap py-3">
          <div className="flex items-center gap-x-8 px-2 text-[10px] font-black uppercase tracking-widest text-white/50">
            <Link href="/about" className="hover:text-[#32a4a1] active:text-[#32a4a1]">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Activities</Link>
            <Link href="/schedule" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Schedule</Link>
            <Link href="/members" className="text-white font-bold">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Join Us</Link>
          </div>
        </div>
      </div>
      <style jsx>{`.no-scrollbar::-webkit-scrollbar { display: none; }.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </nav>
  )
}

export default function MembersPage() {
  const [loading, setLoading] = useState(true)
  const [groupPhoto, setGroupPhoto] = useState('/group-photo.jpg') // 기본값 설정
  const [executives, setExecutives] = useState([])
  const [regularMembers, setRegularMembers] = useState([])

  useEffect(() => {
    fetchMemberData()
  }, [])

  const fetchMemberData = async () => {
    setLoading(true)

    // 1. 단체사진 가져오기
    const { data: configData } = await supabase.from('pr_config').select('value').eq('key', 'members_group_photo').single()
    if (configData && configData.value) setGroupPhoto(configData.value)

    // 2. 활동 기수(is_active: true) 명단 가져오기
    const { data: memberData } = await supabase.from('pr_members').select('*').eq('is_active', true).order('created_at', { ascending: true })
    
    if (memberData) {
      // 임원진 순서 정렬을 위한 가중치
      const roleOrder = { "학회장": 1, "부학회장": 2, "총무": 3, "기획부장": 4, "교육부장": 5, "홍보부장": 6 }
      
      // '일반'이 아닌 사람은 임원진으로, '일반'인 사람은 일반 회원으로 분리
      const execs = memberData.filter(m => m.role !== '일반').sort((a, b) => roleOrder[a.role] - roleOrder[b.role])
      const regulars = memberData.filter(m => m.role === '일반').sort((a, b) => a.name.localeCompare(b.name))

      setExecutives(execs)
      setRegularMembers(regulars)
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-24 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 메인 단체 사진 섹션 */}
      <section className="max-w-6xl mx-auto px-8 mb-24">
        <div className="text-center mb-12">
          <p className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-xs mb-4">Our People</p>
          <h2 className="text-5xl font-black tracking-tighter">IGers in Action</h2>
        </div>
        
        <div className="relative h-[350px] md:h-[550px] w-full rounded-[3rem] overflow-hidden shadow-2xl border border-slate-100 bg-slate-100">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center font-bold text-slate-400">Loading...</div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={groupPhoto} alt="InsightGraphy Group" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/40 to-transparent" />
            </>
          )}
        </div>
      </section>

      {/* 2. 운영진 섹션 */}
      <section className="max-w-6xl mx-auto px-8 mb-32">
        <h3 className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mb-16">Executive Board</h3>
        
        {executives.length === 0 && !loading ? (
           <p className="text-center text-slate-400 font-bold">등록된 임원진이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {executives.map((exec) => (
              <div key={exec.id} className="bg-slate-50 p-8 rounded-[2rem] border-l-8 border-[#32a4a1] flex flex-col justify-center hover:shadow-xl transition-all group hover:-translate-y-1">
                <span className="text-[#32a4a1] font-black text-xs uppercase tracking-widest mb-3 opacity-70">
                  {exec.role}
                </span>
                <h4 className="text-2xl font-black mb-1 group-hover:text-[#32a4a1] transition-colors">{exec.name}</h4>
                <p className="text-sm text-slate-500 font-bold">{exec.university} {exec.department}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. 활동 회원 섹션 */}
      <section className="py-24 bg-[#1a1a1a] text-white">
        <div className="max-w-6xl mx-auto px-8">
          <h3 className="text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] mb-20">Active Members</h3>
          
          {regularMembers.length === 0 && !loading ? (
            <p className="text-center text-slate-500 font-bold py-10">등록된 활동 회원이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-16">
              {regularMembers.map((member) => (
                <div key={member.id} className="text-center md:text-left border-b border-white/10 pb-6 hover:border-[#32a4a1] transition-colors">
                  <p className="text-xl font-black mb-2">{member.name}</p>
                  <p className="text-[11px] text-[#a8d0cd] font-black uppercase tracking-wider opacity-80">{member.university}<br/>{member.department}</p>
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-24 text-center">
            <p className="text-slate-500 text-sm font-bold">
              함께 성장하고 소통하는 {executives.length + regularMembers.length}명의 IGer들이 현재 활동 중입니다.
            </p>
          </div>
        </div>
      </section>

      {/* 하단 안내 및 푸터 */}
      <footer className="py-12 text-center bg-white border-t border-slate-100">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}