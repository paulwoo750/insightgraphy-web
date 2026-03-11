'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function VoteContentManager() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [versions, setVersions] = useState([]) // ['v1', 'v2']
  const [activeVersion, setActiveVersion] = useState('')
  
  // 전체 기준표 데이터 상태 (버전 이름을 key로, 카테고리 배열을 value로 가짐)
  const [rubricData, setRubricData] = useState({})

  // 테마 색상 옵션
  const colorOptions = [
    { label: '파랑', value: 'blue' },
    { label: '보라', value: 'purple' },
    { label: '분홍', value: 'pink' },
    { label: '초록', value: 'emerald' },
    { label: '주황', value: 'amber' }
  ]

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) {
      router.push('/admin')
      return
    }
    fetchData()
  }, [])

  // 🌟 과거 데이터를 새로운 '동적 배열 구조'로 바꿔주는 마법 함수
  const migrateLegacyData = (legacyObj) => {
    if (!legacyObj || Array.isArray(legacyObj)) return legacyObj || [];
    const iItems = []; const gItems = []; const dItems = []; const cItems = [];
    Object.keys(legacyObj).forEach(k => {
      const item = { id: k, label: legacyObj[k].label, criteria: legacyObj[k].criteria };
      if (k.startsWith('i')) iItems.push(item);
      else if (k.startsWith('g')) gItems.push(item);
      else if (k.startsWith('d')) dItems.push(item);
      else cItems.push(item);
    });
    const categories = [];
    if (iItems.length > 0) categories.push({ id: `cat_i_${Date.now()}`, title: "인사이트", icon: "💡", color: "blue", items: iItems });
    if (gItems.length > 0) categories.push({ id: `cat_g_${Date.now()}`, title: "그래픽", icon: "🎨", color: "purple", items: gItems });
    if (dItems.length > 0) categories.push({ id: `cat_d_${Date.now()}`, title: "딜리버리", icon: "🎤", color: "pink", items: dItems });
    if (cItems.length > 0) categories.push({ id: `cat_c_${Date.now()}`, title: "상호보완성", icon: "🔗", color: "emerald", items: cItems });
    return categories;
  }

  const fetchData = async () => {
    setLoading(true)
    const { data } = await supabase.from('pr_vote_criteria').select('*')
    
    if (data && data.length > 0) {
      const loadedVersions = []
      const loadedData = {}
      
      data.forEach(row => {
        loadedVersions.push(row.version)
        loadedData[row.version] = migrateLegacyData(row.criteria_data)
      })
      
      setVersions(loadedVersions)
      setRubricData(loadedData)
      setActiveVersion(loadedVersions[0])
    } else {
      // 데이터가 아예 없으면 기본 v1 생성
      setVersions(['v1'])
      setRubricData({ v1: [] })
      setActiveVersion('v1')
    }
    setLoading(false)
  }

  // 🌟 데이터 안전 업데이트 도우미 (점수칸 2개씩 생기는 버그 해결!)
  const updateActiveData = (updater) => {
    setRubricData(prev => {
      // 현재 활성화된 버전의 데이터를 통째로 복사 (Deep Copy)해서 안전하게 수정
      const clonedData = JSON.parse(JSON.stringify(prev[activeVersion] || []))
      updater(clonedData)
      return { ...prev, [activeVersion]: clonedData }
    })
  }

  // --- 버전(Version) 관리 ---
  const handleAddVersion = () => {
    const vName = prompt('새로운 버전의 이름을 입력하세요. (예: v3, mid-term)')
    if (!vName) return
    if (versions.includes(vName)) return alert('이미 존재하는 버전 이름입니다.')
    
    setVersions([...versions, vName])
    setRubricData(prev => ({ ...prev, [vName]: [] }))
    setActiveVersion(vName)
  }

  const handleDeleteVersion = async (vName) => {
    if (!confirm(`정말 [${vName}] 버전을 완전히 삭제할까요? 복구할 수 없습니다.`)) return
    await supabase.from('pr_vote_criteria').delete().eq('version', vName)
    
    const newVersions = versions.filter(v => v !== vName)
    setVersions(newVersions)
    if (activeVersion === vName) setActiveVersion(newVersions[0] || '')
  }

  // --- 카테고리(Category) 관리 ---
  const addCategory = () => {
    updateActiveData(data => {
      data.push({ id: `cat_${Date.now()}`, title: "새로운 카테고리", icon: "📌", color: "blue", items: [] })
    })
  }

  const removeCategory = (cIdx) => {
    if(confirm('이 카테고리와 내부 항목을 모두 삭제할까요?')) updateActiveData(data => data.splice(cIdx, 1))
  }

  const updateCategory = (cIdx, field, val) => updateActiveData(data => { data[cIdx][field] = val })

  // --- 평가 항목(Item) 관리 ---
  const addItem = (cIdx) => {
    updateActiveData(data => {
      data[cIdx].items.push({ id: `item_${Date.now()}`, label: "새로운 평가 항목", criteria: [{ s: 10, t: "최고 점수 기준" }, { s: 0, t: "최하 점수 기준" }] })
    })
  }

  const removeItem = (cIdx, iIdx) => {
    if(confirm('이 평가 항목을 삭제할까요?')) updateActiveData(data => data[cIdx].items.splice(iIdx, 1))
  }

  const updateItemLabel = (cIdx, iIdx, val) => updateActiveData(data => { data[cIdx].items[iIdx].label = val })

  // --- 점수 기준(Criteria) 관리 ---
  const addCriteriaRow = (cIdx, iIdx) => {
    updateActiveData(data => {
      data[cIdx].items[iIdx].criteria.push({ s: 0, t: "새 평가 기준" })
      data[cIdx].items[iIdx].criteria.sort((a,b) => b.s - a.s) // 추가 후 자동 정렬
    })
  }

  const removeCriteriaRow = (cIdx, iIdx, critIdx) => {
    updateActiveData(data => { data[cIdx].items[iIdx].criteria.splice(critIdx, 1) })
  }

  const updateCriteria = (cIdx, iIdx, critIdx, field, val) => {
    updateActiveData(data => {
      data[cIdx].items[iIdx].criteria[critIdx][field] = field === 's' ? Number(val) : val
      if (field === 's') data[cIdx].items[iIdx].criteria.sort((a,b) => b.s - a.s) // 점수 바뀌면 즉시 정렬
    })
  }

  // --- 전체 저장 ---
  const handleSave = async () => {
    setSaving(true)
    for (const v of versions) {
      const { error } = await supabase.from('pr_vote_criteria').upsert({ version: v, criteria_data: rubricData[v] })
      if (error) {
        alert(`${v} 버전 저장 실패: ${error.message}`)
        setSaving(false)
        return
      }
    }
    alert('모든 채점 시스템 셋업이 성공적으로 저장되었습니다! 📝')
    setSaving(false)
  }

  if (loading) return <div className="p-10 text-center font-black text-slate-500 min-h-screen flex items-center justify-center">루브릭 데이터 로딩 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-5xl mx-auto space-y-10">
        
        {/* 헤더 */}
        <header className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6 sticky top-0 bg-slate-50/90 backdrop-blur-md z-20 pt-4">
          <div>
            <Link href="/admin/hub/vote" className="text-xs font-black text-slate-400 hover:text-yellow-500 uppercase tracking-widest mb-2 block transition-colors">
              ← Back to Vote Hub
            </Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">📝</span> Dynamic Rubric Editor
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">버전, 카테고리, 평가 항목, 세부 기준까지 모든 것을 내 마음대로 커스텀하세요.</p>
          </div>
          <button onClick={handleSave} disabled={saving} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg active:scale-95">
            {saving ? 'Saving...' : 'Save All 💾'}
          </button>
        </header>

        {/* 🌟 동적 버전 탭 관리 🌟 */}
        <div className="flex flex-wrap items-center gap-3 mb-8 bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Versions</span>
          {versions.map(v => (
            <div key={v} className="flex items-center gap-1">
              <button 
                onClick={() => setActiveVersion(v)} 
                className={`px-6 py-2.5 rounded-full font-black text-sm transition-all border-2 ${activeVersion === v ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}
              >
                {v.toUpperCase()} 버전
              </button>
              <button onClick={() => handleDeleteVersion(v)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500 font-black transition-colors">✕</button>
            </div>
          ))}
          <button onClick={handleAddVersion} className="px-5 py-2.5 rounded-full font-black text-sm border-2 border-dashed border-blue-300 text-blue-500 hover:bg-blue-50 transition-colors ml-2">
            + 새 버전 추가
          </button>
        </div>

        {/* 🌟 동적 카테고리 에디터 본문 🌟 */}
        {activeVersion && (
          <div className="space-y-12 animate-in fade-in duration-500">
            {(rubricData[activeVersion] || []).map((cat, cIdx) => {
              
              // 색상 테마 클래스 매칭
              const colorBg = `bg-${cat.color}-50`
              const colorText = `text-${cat.color}-600`
              const colorBorder = `border-${cat.color}-200`
              
              return (
                <div key={cat.id} className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-200 relative overflow-hidden group">
                  <button onClick={() => removeCategory(cIdx)} className="absolute top-6 right-6 text-red-300 hover:text-red-600 font-black text-xs bg-red-50 px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">카테고리 삭제 🗑️</button>
                  
                  {/* 1️⃣ 카테고리 설정 (아이콘, 이름, 색상) */}
                  <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8 pb-6 border-b border-slate-100 pr-20">
                    <input type="text" value={cat.icon} onChange={(e) => updateCategory(cIdx, 'icon', e.target.value)} className="w-16 h-16 text-4xl text-center bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-200" placeholder="💡" />
                    <input type="text" value={cat.title} onChange={(e) => updateCategory(cIdx, 'title', e.target.value)} className={`flex-1 text-3xl font-black ${colorText} outline-none bg-transparent placeholder-slate-300`} placeholder="카테고리명 (예: 1. 인사이트)" />
                    
                    <div className="flex gap-2 bg-slate-50 p-2 rounded-xl">
                      {colorOptions.map(c => (
                        <button 
                          key={c.value} 
                          onClick={() => updateCategory(cIdx, 'color', c.value)}
                          className={`w-6 h-6 rounded-full border-2 ${cat.color === c.value ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent opacity-50 hover:opacity-100'} bg-${c.value}-500`}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>

                  {/* 2️⃣ 내부 평가 항목(Items) 리스트 */}
                  <div className="space-y-6">
                    {cat.items.map((item, iIdx) => (
                      <div key={item.id} className={`bg-slate-50 p-6 rounded-3xl border ${colorBorder} shadow-sm relative group/item`}>
                        <button onClick={() => removeItem(cIdx, iIdx)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 font-black opacity-0 group-hover/item:opacity-100 transition-all shadow-sm">✕</button>
                        
                        {/* 평가 항목명 */}
                        <div className="flex items-center gap-3 mb-4 pr-10">
                          <span className={`${colorBg} ${colorText} px-3 py-1 rounded-lg text-xs font-black uppercase`}>항목 {iIdx + 1}</span>
                          <input type="text" value={item.label} onChange={(e) => updateItemLabel(cIdx, iIdx, e.target.value)} className="flex-1 text-xl font-black text-slate-800 outline-none bg-transparent border-b border-transparent focus:border-slate-300 pb-1" placeholder="항목 이름 (예: 1-1. 주제의 명료성)" />
                        </div>

                        {/* 점수 기준표(Criteria) 에디터 */}
                        <div className="space-y-2 bg-white p-4 rounded-2xl shadow-inner border border-slate-100">
                          {item.criteria.map((crit, critIdx) => (
                            <div key={critIdx} className="flex items-start gap-3 group/crit">
                              <input 
                                type="number" 
                                value={crit.s} 
                                onChange={(e) => updateCriteria(cIdx, iIdx, critIdx, 's', e.target.value)}
                                className={`w-16 ${colorBg} ${colorText} font-black text-center p-3 rounded-xl outline-none focus:ring-2`}
                                placeholder="점수"
                              />
                              <textarea 
                                rows="2"
                                value={crit.t} 
                                onChange={(e) => updateCriteria(cIdx, iIdx, critIdx, 't', e.target.value)}
                                className="flex-1 bg-slate-50 text-sm font-bold text-slate-600 p-3 rounded-xl outline-none focus:ring-2 focus:ring-slate-200 resize-none leading-relaxed"
                                placeholder="이 점수에 해당하는 평가 기준 설명"
                              />
                              <button onClick={() => removeCriteriaRow(cIdx, iIdx, critIdx)} className="mt-2 w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 font-black opacity-0 group-hover/crit:opacity-100 transition-opacity">✕</button>
                            </div>
                          ))}
                          
                          <button onClick={() => addCriteriaRow(cIdx, iIdx)} className={`w-full py-3 mt-2 border-2 border-dashed ${colorBorder} ${colorText} rounded-xl font-black text-xs hover:${colorBg} transition-colors`}>
                            + 세부 점수칸 추가 (Add Criteria)
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* 항목 추가 버튼 */}
                    <div className="text-center pt-4">
                      <button onClick={() => addItem(cIdx)} className={`px-6 py-4 bg-white border border-slate-200 rounded-[2rem] font-black ${colorText} shadow-sm hover:shadow-md transition-all`}>
                        + 이 카테고리에 새로운 평가 항목 추가
                      </button>
                    </div>

                  </div>
                </div>
              )
            })}

            {/* 거대한 카테고리 추가 버튼 */}
            <button onClick={addCategory} className="w-full py-10 bg-slate-900 text-white rounded-[3rem] font-black text-xl shadow-2xl hover:bg-blue-600 hover:scale-[1.01] transition-all">
              + 새로운 카테고리 (Category) 추가하기
            </button>
            
          </div>
        )}
      </div>
    </div>
  )
}