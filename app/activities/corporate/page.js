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

export default function CorporateSessionPage() {
  const [loading, setLoading] = useState(true);
  
  // 1. 헤더 데이터
  const [headerData, setHeaderData] = useState({ title: 'Corporate Session', desc: '' });
  
  // 2. 파트너 로고
  const [partners, setPartners] = useState([]);
  
  // 3. 메인 케이스 스터디
  const [caseStudy, setCaseStudy] = useState({});
  
  // 4. 연계 활동
  const [postActivities, setPostActivities] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Content 불러오기 (헤더 & 연계 활동)
      const { data: content } = await supabase.from('pr_activities_content').select('*').eq('id', 'corporate').single();
      if (content) {
        setHeaderData({ title: content.header_title, desc: content.header_desc });
        if (content.rules_json && content.rules_json.postActivities) {
          setPostActivities(content.rules_json.postActivities);
        } else {
          // DB 비어있을 때 보여줄 기본 연계 활동
          setPostActivities([
            { title: "트리플래닛 안동 현장 답사", desc: "트리플래닛과의 기업 세션 이후, 산림청 관계자 분들이 관심을 가져주셔서 만남을 위해 직접 안동 현장에 방문하여 산림청 관계자분들과 이야기 하는 시간을 가졌습니다.", icon: "🌲", bg_color: "#3e2d35", image_urls: ["/activities/andong.webp"] },
            { title: "대한민국 사회적 가치 페스타 참석", desc: "이후에도 IG와 트리플래닛과의 관계를 이어나가며 임팩트 얼라이언스, 녹색기술연구소, 트리플래닛이 함께한 '기후위기 시대, 우리의 숲은 어디로 가고 있나'라는 주제의 컨퍼런스에 참석하고 주제 전반에 관해 산업 전선에 계시는 실무진과 이야기하는 시간을 가졌습니다.", icon: "👉", bg_color: "#4d4d2e", image_urls: ["/activities/social-festa-1.webp", "/activities/social-festa-2.webp"] }
          ]);
        }
      }

      // 파트너 로고 불러오기
      const { data: partnerData } = await supabase.from('pr_activities_corp_partners').select('*').order('order_num', { ascending: true });
      if (partnerData && partnerData.length > 0) {
        setPartners(partnerData);
      } else {
        // 기본 파트너 로고
        setPartners([
          { name: "법무법인 마중", image_url: "/partners/majoong.png" },
          { name: "motemote", image_url: "/partners/motemote.png" },
          { name: "UT", image_url: "/partners/ut.png" },
          { name: "InBody", image_url: "/partners/inbody.png" },
          { name: "CELLTRION", image_url: "/partners/celltrion.svg" },
          { name: "배달의민족", image_url: "/partners/baemin.png" }
        ]);
      }

      // 케이스 스터디 불러오기
      const { data: caseData } = await supabase.from('pr_activities_corp_projects').select('*').limit(1).single();
      if (caseData) {
        setCaseStudy(caseData);
      } else {
        // 기본 케이스 스터디
        setCaseStudy({
          title: "26기 & 27기 기업세션", corp_name: "트리플래닛 X IG", corp_logo_url: "/logo-treeplanet.png",
          content_json: [
            { title: "트리플래닛이란 기업은?", content: '"Plant For All"\n• 모든 사람이 나무를 심을 수 있는 세상을 조성하는 것을 목표로 하는 소셜 벤처 기업\n• 지구 환경 보전 문제를 해결하는 것을 미션으로 하며, 숲 조성을 위한 B2B 사업 위주', color: "#2d3d33", icon: "♻️" },
            { title: "세션 내용은?", content: "산불 피해 복구 인식 캠페인 기획\n• 젊은 세대의 환경에 대한 경각심을 일깨우고\n• 산불 피해 복구의 필요성에 대한 인식을 실제 행동으로 옮길 수 있게끔 하는 글로벌하고 창의적인 방안을 제안", color: "#4d452e", icon: "✅" },
            { title: "세션 진행 방식", content: "• 약 4개의 조를 편성하여 조별로 기획 발표 준비 후 최종 발표\n• 최우수 팀의 아이디어를 기반으로 캠페인 집행, 희망 학회원에 한해 해당 과정 전반에 참여", color: "#2d3e50", icon: "🗣️" }
          ],
          gallery_urls: ["/activities/corporate-session-1.webp", "/activities/corporate-session-2.webp", "/activities/corporate-session-3.webp"]
        });
      }
      
      setLoading(false);
    };

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-20 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 세션 헤더 및 제휴 기업 */}
      <section className="max-w-5xl mx-auto px-8 mb-24">
        <div className="text-center mb-16">
          <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">Activity 04</div>
          <h2 className="text-5xl font-black uppercase tracking-tighter mb-8 text-black">{headerData.title}</h2>
          <p className="text-lg text-slate-600 leading-relaxed break-keep font-medium bg-slate-50 p-8 rounded-[2rem] border border-slate-100 whitespace-pre-wrap">
            {headerData.desc || "기업세션은 방학기간 중 기업과 연계하여 진행하는 프로젝트형 세션입니다. 매 방학 기업에서 제시한 과제에 대해 IG 학회원들의 창의적인 아이디어를 모으고 솔루션을 기획하여 기업 측에 PT 발표를 진행합니다."}
          </p>
        </div>

        {/* 파트너 로고 렌더링 */}
        <div className="space-y-10 text-center">
          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">IG와 함께 성장한 기업들</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-10 items-center justify-items-center">
            {partners.map((partner, idx) => (
              <div key={idx} className="relative w-32 h-12 flex justify-center items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={partner.image_url} alt={partner.name} className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. 메인 프로젝트 케이스 스터디 */}
      {caseStudy.title && (
        <section className="py-24 bg-[#1a1a1a] text-white">
          <div className="max-w-6xl mx-auto px-8">
            <div className="flex flex-col md:flex-row items-center gap-12 mb-20">
              <div className="flex-1 space-y-4">
                <span className="text-[#32a4a1] font-black tracking-widest uppercase">Special Case Study</span>
                <h3 className="text-4xl font-black break-keep">
                  {caseStudy.title}<br/>{caseStudy.corp_name}
                </h3>
              </div>
              {caseStudy.corp_logo_url && (
                <div className="relative w-48 h-48 bg-white rounded-3xl p-6 flex justify-center items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={caseStudy.corp_logo_url} alt="Corp Logo" className="max-w-full max-h-full object-contain p-2" />
                </div>
              )}
            </div>

            {/* 동적 섹션 블록 렌더링 */}
            <div className="grid grid-cols-1 gap-8">
              {(caseStudy.content_json || []).map((sec, idx) => (
                <div key={idx} className="p-10 rounded-[2.5rem] border border-white/5" style={{ backgroundColor: sec.color || '#2d3d33' }}>
                  <h4 className="text-[#a8d0cd] font-black text-xl mb-6 flex items-center gap-3">{sec.icon} {sec.title}</h4>
                  <p className="text-sm opacity-80 font-medium whitespace-pre-wrap leading-relaxed">{sec.content}</p>
                </div>
              ))}
            </div>

            {/* 케이스 스터디 갤러리 */}
            {caseStudy.gallery_urls && caseStudy.gallery_urls.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
                {caseStudy.gallery_urls.map((url, n) => (
                  <div key={n} className="relative h-64 rounded-2xl overflow-hidden shadow-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Presentation-${n}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3. 연계 활동 섹션 (스마트 레이아웃 적용) */}
      <section className="py-32 px-8 max-w-5xl mx-auto">
        <h3 className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mb-20">Post-Session Activities</h3>
        
        <div className="space-y-20">
          {postActivities.map((post, idx) => {
            // 사진이 2장 이상이면 좌우 그리드, 1장 이하이면 위아래 스택 구조로 자동 변환
            const isGrid = post.image_urls && post.image_urls.length >= 2;

            return (
              <div key={idx} className={isGrid ? "grid grid-cols-1 md:grid-cols-2 gap-12 items-start" : "space-y-8"}>
                
                {/* 텍스트 박스 영역 */}
                <div className={`${isGrid ? 'p-10 rounded-[2.5rem]' : 'p-8 rounded-2xl inline-block'} text-white shadow-lg`} style={{ backgroundColor: post.bg_color || '#3e2d35' }}>
                  <h4 className="text-xl font-black flex items-center gap-3">{post.icon} {post.title}</h4>
                  <p className="mt-6 text-sm opacity-80 leading-relaxed break-keep font-medium whitespace-pre-wrap">
                    {post.desc}
                  </p>
                </div>

                {/* 이미지 영역 */}
                {post.image_urls && post.image_urls.length > 0 && (
                  <div className={isGrid ? "grid grid-cols-2 gap-4 h-full" : "relative h-[500px] rounded-[3rem] overflow-hidden shadow-xl border border-slate-100"}>
                    {post.image_urls.map((url, imgIdx) => (
                      <div key={imgIdx} className={`relative overflow-hidden ${isGrid ? 'h-[250px] rounded-2xl shadow-lg' : 'w-full h-full'}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`post-img-${imgIdx}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

              </div>
            )
          })}
        </div>
      </section>

      {/* 4. 하단 안내 */}
      <section className="pt-10 pb-20 text-center">
        <Link href="/activities" className="inline-block text-xs font-black text-slate-400 hover:text-black uppercase tracking-widest border-b border-slate-200 pb-1">← Back to Activities</Link>
      </section>

      <footer className="py-12 border-t border-slate-100 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}