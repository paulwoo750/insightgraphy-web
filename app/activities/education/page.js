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
            <Link href="/about" className="hover:text-[#32a4a1] transition-colors">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] transition-colors">Activities</Link>
            <Link href="/schedule" className="hover:text-[#32a4a1] transition-colors">Schedule</Link>
            <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] transition-colors">Showcase</Link>
            <Link href="/join" className="text-white font-bold transition-colors">Join Us</Link>
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

export default function EducationSessionPage() {
  const [loading, setLoading] = useState(true);
  
  // 1. 헤더 데이터
  const [headerData, setHeaderData] = useState({ title: 'Education Session', desc: '' });
  
  // 2. 커리큘럼 데이터 (기본값 세팅)
  const [curriculum, setCurriculum] = useState({
    insight_basic: { title: "기획의 원칙과 구조", items: ["프리젠테이션의 구성요소 및 기획의 정의", "타깃과 목적에 맞는 기획서의 원칙", "문제 발견 - 분석 - 해결 - 결론의 구조화"] },
    insight_advanced: { title: "기획 심화 스킬", items: ["논리적 구조화 확립을 위한 틀의 정립", "기획 제안서 작성의 디테일", "발표 논리 정돈법과 구조의 확립"] },
    graphic_basic: { title: "디자인의 원칙과 방법", items: ["색상, 폰트, 레이아웃 선정의 정석", "사진, 타이포, 아이콘의 효과적 미디어 활용", "실무 생산성을 높이는 핵심 단축키 교육"] },
    graphic_advanced: { title: "비주얼 브랜딩 실전", items: ["PPT 제작 효율화를 위한 사전 세팅 노하우", "PPT 제작에 도움이 되는 디자인 원칙의 이해", "프레젠테이션 효과를 배가시키는 그래픽 스킬"] },
    delivery_basic: { title: "좋은 Delivery의 공통점", items: ["언어적 요소: 목소리 톤, 발음, 말투 조절", "비언어적 요소: 시선 처리, 제스처, 동선 이동", "청중의 시선을 사로잡는 오프닝 기법"] },
    delivery_advanced: { title: "딜리버리 실전 스킬", items: ["발표 단계별 효과적인 딜리버리 스킬", "설득력을 낮추는 잘못된 방식 집중 분석", "이론을 완성시키는 실전 실습"] },
  });

  // 3. 특강 강사 데이터
  const [speakers, setSpeakers] = useState([
    { name: "비드리머 최현정 대표님", desc: "청중의 마음을 저격하는 논리적 스토리텔링 특강" },
    { name: "피피티헌터 (@ppt_hunter)", desc: "실전에 바로 쓰는 압도적인 디자인 스킬 교육" }
  ]);

  // 4. 시스템 안내 데이터
  const [systemData, setSystemData] = useState({
    mentoring_desc: "선배 학회원과의 매칭을 통해 개인별 강점과 보완점을 분석하고 밀착 성장을 지원합니다.",
    alumni_desc: "다양한 산업군에서 활약 중인 선배들의 현직 시선으로 실전과 가장 유사한 피드백을 제공합니다."
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Content 불러오기 (헤더, 특강, 시스템)
      const { data: content } = await supabase.from('pr_activities_content').select('*').eq('id', 'education').single();
      if (content) {
        setHeaderData({ title: content.header_title, desc: content.header_desc });
        if (content.rules_json && Object.keys(content.rules_json).length > 0) {
          setSystemData(prev => ({...prev, ...content.rules_json}));
        }
        if (content.feedback_json && content.feedback_json.speakers && content.feedback_json.speakers.length > 0) {
          setSpeakers(content.feedback_json.speakers);
        }
      }

      // Curriculum 불러오기
      const { data: curData } = await supabase.from('pr_activities_edu_curriculum').select('*');
      if (curData && curData.length > 0) {
        let dbCurObj = {};
        curData.forEach(item => {
          dbCurObj[`${item.category}_${item.course_type}`] = { title: item.title, items: item.items };
        });
        setCurriculum(prev => ({ ...prev, ...dbCurObj }));
      }
      
      setLoading(false);
    };

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-20 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 세션 헤더 */}
      <section className="max-w-4xl mx-auto px-8 mb-20 text-center">
        <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">Activity 02</div>
        <h2 className="text-5xl font-black uppercase tracking-tighter mb-8">{headerData.title}</h2>
        <p className="text-lg text-slate-600 leading-relaxed break-keep font-medium">
          {headerData.desc || "학회원들의 실질적인 역량 강화를 위해 알럼나이 및 전문가와 함께하는 교육 세션입니다. Insight, Graphic, Delivery의 단계별 커리큘럼과 1:1 맞춤형 멘토링을 제공합니다."}
        </p>
      </section>

      {/* 2. 3대 핵심 커리큘럼 */}
      <section className="max-w-6xl mx-auto px-8 mb-32">
        <div className="grid grid-cols-1 gap-12">
          
          {/* 반복되는 커리큘럼 섹션 렌더링 */}
          {['insight', 'graphic', 'delivery'].map(category => (
            <div key={category} className="bg-slate-50 rounded-[3rem] p-12 border border-slate-100 group hover:shadow-2xl transition-all">
              <div className="flex items-center gap-4 mb-10">
                <span className="text-4xl">{category === 'insight' ? '💡' : category === 'graphic' ? '🎨' : '🎤'}</span>
                <h3 className="text-3xl font-black uppercase tracking-tight">{category} Curriculum</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Basic / Advanced 렌더링 */}
                {['basic', 'advanced'].map(type => (
                  <div key={type} className={`bg-white p-8 rounded-3xl shadow-sm ${type === 'advanced' ? 'border-t-4 border-[#32a4a1]' : ''}`}>
                    <p className="text-[#32a4a1] font-black text-xs uppercase mb-4">{type} Course</p>
                    <h4 className="text-xl font-black mb-4">{curriculum[`${category}_${type}`].title}</h4>
                    <ul className="text-sm text-slate-500 space-y-2 font-medium">
                      {curriculum[`${category}_${type}`].items.map((item, idx) => (
                        <li key={idx}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                ))}

              </div>
            </div>
          ))}

        </div>
      </section>

      {/* 3. 전문가 특강 섹션 */}
      <section className="py-24 px-8 bg-[#1a1a1a] text-white">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-center text-[20px] font-black text-[#a8d0cd] uppercase tracking-[0.5em] mb-16">Guest Speaker Sessions</h3>
          <div className="space-y-6">
            {speakers.map((speaker, idx) => (
              <div key={idx} className="bg-white/5 border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-all">
                <p className="text-[#32a4a1] font-black text-xs mb-2">Speaker {String(idx + 1).padStart(2, '0')}</p>
                <h4 className="text-2xl font-black mb-4">{speaker.name}</h4>
                <p className="opacity-70 text-sm font-medium">{speaker.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-12 text-sm font-bold opacity-50 italic">현업 전문가들의 생생한 노하우를 직접 전수받습니다.</p>
        </div>
      </section>

      {/* 4. 시스템 안내 */}
      <section className="py-32 px-8 max-w-5xl mx-auto text-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="p-10 rounded-[3rem] bg-slate-50">
            <h4 className="text-2xl font-black mb-6">1:1 맞춤형 멘토링</h4>
            <p className="text-sm text-slate-500 leading-relaxed font-medium break-keep">
              {systemData.mentoring_desc}
            </p>
          </div>
          <div className="p-10 rounded-[3rem] bg-slate-50">
            <h4 className="text-2xl font-black mb-6">알럼나이 피드백</h4>
            <p className="text-sm text-slate-500 leading-relaxed font-medium break-keep">
              {systemData.alumni_desc}
            </p>
          </div>
        </div>
        <Link href="/activities" className="inline-block mt-20 text-xs font-black text-slate-400 hover:text-black uppercase tracking-widest border-b border-slate-200 pb-1">← Back to Activities</Link>
      </section>

      <footer className="py-12 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}