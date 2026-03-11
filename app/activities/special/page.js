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

export default function SpecialSessionPage() {
  const [loading, setLoading] = useState(true);
  const [headerData, setHeaderData] = useState({ title: 'Union Session', desc: '' });
  const [projects, setProjects] = useState([]);
  const [gallery, setGallery] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // 1. 헤더 및 갤러리 불러오기
      const { data: content } = await supabase.from('pr_activities_content').select('*').eq('id', 'union').single();
      if (content) {
        setHeaderData({ title: content.header_title, desc: content.header_desc });
        if (content.rules_json && content.rules_json.gallery) setGallery(content.rules_json.gallery);
      }

      // 2. 프로젝트 리스트 불러오기
      const { data: projectData } = await supabase.from('pr_activities_union_projects').select('*').order('order_num', { ascending: true });
      if (projectData && projectData.length > 0) {
        setProjects(projectData);
      } else {
        // DB가 비어있을 경우 보여줄 기본 예시 데이터
        setProjects([
          {
            semester: '2025 Autumn Semester', title: '‘중용 굿즈’ 기획 프로젝트', description: '감정의 균형을 회복하는 과정을 물질적이고 감각적인 형태로 구현해 봄으로써 감정과 인간에 대해 이해하고, 중용의 지혜를 현대적으로 재해석하여 상품 판매를 기획합니다.', theme: 'light', image_url: '/special-25-2.webp',
            sub_items: ['{"t":"회피와 무모","d":""}', '{"t":"무절제와 무감각","d":""}', '{"t":"성마름과 화낼 줄 모름","d":""}', '{"t":"자기비하와 자만","d":""}']
          },
          {
            semester: '2025 Spring Semester', title: '갈등을 넘어, 새로운 공존을 모색하다', description: '각종 사회 갈등 현상을 분석하고, 이를 완화하거나 해결할 수 있는 창의적인 솔루션을 제시하는 경쟁 PT를 진행했습니다.', theme: 'dark', image_url: '/special-251.webp',
            sub_items: ['{"t":"세대 갈등","d":"청년과 기성세대 간 공존 방안"}', '{"t":"계층 갈등","d":"경제적 불평등과 사회적 이동성"}', '{"t":"문화/가치 갈등","d":"다문화, 젠더, 이주민 충돌 분석"}']
          }
        ]);
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
        <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">Activity 03</div>
        <h2 className="text-5xl font-black uppercase tracking-tighter mb-8">{headerData.title}</h2>
        <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
          <p className="text-lg text-slate-600 leading-relaxed break-keep font-medium">
            {headerData.desc ? (
              <span dangerouslySetInnerHTML={{ __html: headerData.desc.replace(/\n/g, '<br/>') }} />
            ) : (
              <>연합세션은 정규 세션 외의 다양한 경험을 제공하기 위해 마련된 세션입니다.<br/>매 학기 <span className="text-[#32a4a1] font-black">서울대학교 프레젠테이션 학회 C!SL</span>과 함께 연합 프레젠테이션 세션을 진행하고 있습니다.</>
            )}
          </p>
        </div>
      </section>

      {/* 2. 자동 렌더링: 학기별 프로젝트 아카이브 */}
      {loading ? (
        <div className="text-center font-bold text-slate-400 py-20">프로젝트 히스토리를 불러오는 중입니다... 🔄</div>
      ) : (
        projects.map((proj, idx) => {
          const isDark = proj.theme === 'dark';
          // 짝수 인덱스(0, 2...)는 왼쪽 글씨/오른쪽 사진 | 홀수 인덱스(1, 3...)는 반대
          const isReversed = idx % 2 !== 0; 
          
          return (
            <section key={idx} className={`py-20 px-8 overflow-hidden ${isDark ? 'bg-slate-900 text-white' : 'bg-white text-[#1a1a1a]'}`}>
              <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                
                {/* 텍스트 영역 */}
                <div className={`space-y-6 ${isReversed ? 'order-1 lg:order-2' : 'order-2 lg:order-1'}`}>
                  <span className={`font-black text-sm tracking-widest uppercase ${isDark ? 'text-[#a8d0cd]' : 'text-[#32a4a1]'}`}>
                    {proj.semester}
                  </span>
                  <h3 className={`text-4xl font-black break-keep ${isDark ? 'text-[#a8d0cd]' : ''}`}>
                    {proj.title}
                  </h3>
                  <p className={`font-medium leading-relaxed break-keep ${isDark ? 'opacity-70' : 'text-slate-500'}`}>
                    {proj.description}
                  </p>
                  
                  {/* 세부 항목 (리스트 or 태그 형태 자동 판별) */}
                  {proj.sub_items && proj.sub_items.length > 0 && (
                    <ul className={proj.sub_items[0].includes('"d":""') ? "grid grid-cols-2 gap-4" : "space-y-3"}>
                      {proj.sub_items.map((itemStr, i) => {
                        let item = { t: '', d: '' };
                        try { item = typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr; } catch(e){}
                        
                        // 설명(d)이 없으면 박스 태그 형태, 있으면 리스트 형태로 출력
                        if (!item.d) {
                          return (
                            <div key={i} className={`p-4 rounded-xl border-l-4 border-[#32a4a1] text-sm font-bold ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
                              {item.t}
                            </div>
                          );
                        } else {
                          return (
                            <li key={i} className="flex gap-4 items-start">
                              <span className="text-[#32a4a1] font-black">0{i+1}</span>
                              <div>
                                <p className="font-black text-sm">{item.t}</p>
                                <p className={`text-xs ${isDark ? 'opacity-50' : 'text-slate-500'}`}>{item.d}</p>
                              </div>
                            </li>
                          );
                        }
                      })}
                    </ul>
                  )}
                </div>

                {/* 이미지 영역 (에러 방지용 일반 img 태그 사용) */}
                <div className={`relative h-[400px] rounded-[3rem] overflow-hidden shadow-2xl ${isReversed ? 'order-2 lg:order-1' : 'order-1 lg:order-2'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proj.image_url || '/special-25-2.webp'} alt={proj.title} className="w-full h-full object-cover" />
                </div>

              </div>
            </section>
          )
        })
      )}

      {/* 3. 활동 스케치 (이미지 갤러리) */}
      <section className="py-32 px-8 max-w-6xl mx-auto">
        <h3 className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mb-16">Activity Sketch</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {gallery && gallery.length > 0 ? (
            gallery.map((url, i) => (
              <div key={i} className="relative h-64 rounded-2xl overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Sketch ${i}`} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-[#32a4a1]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))
          ) : (
            // DB에 갤러리 사진이 없을 경우 기본 이미지 4장 노출
            [1, 2, 3, 4].map((num) => (
              <div key={num} className="relative h-64 rounded-2xl overflow-hidden group">
                <Image src={`/sketch-${num}.webp`} alt="Sketch" fill className="object-cover transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-[#32a4a1]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))
          )}
        </div>
      </section>

      <footer className="py-12 border-t border-slate-100 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}