'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

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
            <Link href="/about" className="text-white font-bold transition-colors">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] transition-colors">Activities</Link>
            <Link href="/schedule" className="hover:text-[#32a4a1] transition-colors">Schedule</Link>
            <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
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
            <Link href="/members" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Showcase</Link>
            <Link href="/join" className="text-white font-bold active:text-[#32a4a1]">Join Us</Link>
          </div>
        </div>
      </div>
      <style jsx>{`.no-scrollbar::-webkit-scrollbar { display: none; }.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </nav>
  )
}

export default function AboutPage() {
  const [loading, setLoading] = useState(true);
  
  // 상태 변수 (기본값 세팅)
  const [vision, setVision] = useState({ subtitle: "", desc: "" });
  const [coreValues, setCoreValues] = useState([]);
  const [igdValues, setIgdValues] = useState([]);
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [alumni, setAlumni] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // 1. 기본 콘텐츠 (비전, 가치, IGD, 환영문구) 불러오기
      const { data: content } = await supabase.from('pr_about_content').select('*').eq('id', 'main').single();
      if (content) {
        setVision({ subtitle: content.vision_subtitle, desc: content.vision_desc });
        setWelcomeMsg(content.welcome_msg);
        if (content.core_values) setCoreValues(content.core_values);
        if (content.igd_values) setIgdValues(content.igd_values);
      }

      // 2. 알럼나이 인터뷰 리스트 불러오기
      const { data: alumniData } = await supabase.from('pr_about_alumni').select('*').order('order_num', { ascending: true });
      if (alumniData) setAlumni(alumniData);

      setLoading(false);
    };

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />
      
      {/* 1. 비전 및 소개 섹션 */}
      <section className="max-w-4xl mx-auto px-8 mb-24">
        <div className="text-center mb-16">
          <p className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-s mb-6">Our Vision</p>
          <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-10 leading-tight whitespace-pre-wrap">
            {vision.subtitle || "Precision in Vision,\nValue in Insight."}
          </h2>
        </div>
        <div className="text-lg text-slate-700 leading-relaxed break-keep font-medium bg-slate-50 p-10 rounded-[3rem] border border-slate-100 whitespace-pre-wrap">
          {vision.desc || "InsightGraphy는 다양한 전공과 역량을 가진 학회원들이 모여 최고의 프레젠터가 되기 위한 훈련을 진행하고 있습니다."}
        </div>
      </section>

      {/* 2. 3대 핵심 가치 */}
      {coreValues.length > 0 && (
        <section className="py-24 px-8 bg-[#111111] text-white">
          <div className="max-w-5xl mx-auto">
            <h3 className="text-center text-[25px] font-black text-slate-500 uppercase tracking-[0.5em] mb-16">3 Core Values</h3>
            <div className="flex flex-col gap-5">
              {coreValues.map((val, idx) => (
                <div key={idx} className={`${val.bg} p-8 rounded-2xl flex items-center gap-6 border-l-8 ${val.color}`}>
                  <span className="text-3xl">{val.icon}</span>
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                    <h4 className="text-xl font-black min-w-[60px]">{val.title}</h4>
                    <p className="opacity-80 font-medium text-sm md:text-base">{val.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 3. IGD 핵심 역량 */}
      {igdValues.length > 0 && (
        <section className="bg-white py-32 px-8">
          <div className="max-w-5xl mx-auto text-center">
            <h3 className="text-[20px] font-black text-slate-400 uppercase tracking-[0.5em] mb-20">IGD Core Competency</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {igdValues.map((igd, idx) => (
                <div key={idx} className={`${igd.bg} p-10 rounded-[2.5rem] text-white shadow-xl flex flex-col items-center`}>
                  <span className="text-4xl mb-6">{igd.icon}</span>
                  <h4 className="text-2xl font-black uppercase mb-4 text-[#a8d0cd]">{igd.title}</h4>
                  <p className="text-sm font-bold opacity-90 break-keep text-white whitespace-pre-wrap">{igd.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 4. 알럼나이 인터뷰 리스트 섹션 */}
      <section className="py-32 px-8 bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-center text-[20px] font-black text-slate-400 uppercase tracking-[0.5em] mb-20">Alumni Interview</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full text-center font-bold text-slate-400 py-10">인터뷰 목록을 불러오는 중입니다... 🔄</div>
            ) : alumni.length === 0 ? (
              <div className="col-span-full text-center font-bold text-slate-400 py-10">등록된 인터뷰가 없습니다.</div>
            ) : (
              alumni.map((alumnus) => (
                <Link 
                  key={alumnus.id} 
                  href={`/about/interviews/${alumnus.id}`} // DB에 저장된 id로 라우팅
                  className="group p-10 rounded-[3rem] bg-white border border-slate-100 hover:bg-[#1a1a1a] transition-all duration-300 shadow-sm hover:shadow-2xl flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <p className="text-[#32a4a1] font-black text-[12px] uppercase tracking-widest">
                      {alumnus.generation}기 / {alumnus.university} {alumnus.dept}
                    </p>
                    <h4 className="text-xl font-black group-hover:text-white transition-colors">{alumnus.name} Alumni님</h4>
                    <div className="h-px w-8 bg-[#32a4a1] group-hover:w-full transition-all duration-500"></div>
                    <p className="text-sm text-slate-500 group-hover:text-slate-300 leading-relaxed break-keep font-medium whitespace-pre-wrap">
                      "{alumnus.short_quote}"
                    </p>
                  </div>
                  <div className="mt-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#32a4a1] opacity-0 group-hover:opacity-100 transition-opacity">
                    View Full Interview <span>→</span>
                  </div>
                </Link>
              ))
            )}
          </div>

        </div>
      </section>

      {/* 5. 환영 문구 섹션 */}
      <section className="py-24 px-8 text-center bg-white">
        <div className="max-w-4xl mx-auto">
          <p className="text-xl md:text-2xl font-black leading-relaxed text-slate-800 break-keep whitespace-pre-wrap">
            {welcomeMsg || "자신의 창의적인 아이디어를 당당하게 말하며 성장할\n스스로를 마주하게 될 IGer들을 환영합니다 🖐️"}
          </p>
          <div className="mt-12">
             <Link href="/join" className="px-12 py-5 bg-[#32a4a1] text-white font-black uppercase tracking-widest rounded-full hover:bg-[#0d6b69] transition-all shadow-xl hover:scale-110 active:scale-95 inline-block">
                Join InsightGraphy
             </Link>
          </div>
        </div>
      </section>

      <footer className="py-12 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}