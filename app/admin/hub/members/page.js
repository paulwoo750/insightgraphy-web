'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function AdminMembersPage() {
  const router = useRouter()
  const [members, setMembers] = useState([])
  const [groupPhotoUrl, setGroupPhotoUrl] = useState('')
  const [loading, setLoading] = useState(true)

  // 폼 상태 관리
  const [newMember, setNewMember] = useState({ name: '', generation: '', university: '', department: '' })
  const [photoFile, setPhotoFile] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // 🌟 새롭게 추가된 '활동 기수' 상태 관리
  const [activeGenerations, setActiveGenerations] = useState([])
  const [genInput, setGenInput] = useState('')
  const [savingGens, setSavingGens] = useState(false)

  // 임원진 역할 리스트
  const execRoles = ["학회장", "부학회장", "총무", "기획부장", "교육부장", "홍보부장"]

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) {
      router.push('/admin')
      return
    }
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    // 명단 가져오기 (최신 등록순)
    const { data: memberData } = await supabase.from('pr_members').select('*').order('created_at', { ascending: false })
    if (memberData) setMembers(memberData)

    // 단체사진 주소 가져오기
    const { data: configData } = await supabase.from('pr_config').select('value').eq('key', 'members_group_photo').single()
    if (configData) setGroupPhotoUrl(configData.value)

    // 🌟 활동 기수 설정 가져오기
    const { data: genData } = await supabase.from('pr_members_config').select('active_generations').eq('id', 'main').single()
    if (genData && genData.active_generations) {
      setActiveGenerations(genData.active_generations)
    }
    
    setLoading(false)
  }

  // 1. 단체사진 업로드
  const handlePhotoUpload = async () => {
    if (!photoFile) return alert('사진을 먼저 선택해주세요.')
    setUploadingPhoto(true)
    try {
      const ext = photoFile.name.split('.').pop()
      const path = `members/group_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('showcase').upload(path, photoFile)
      if (uploadErr) throw uploadErr

      const publicUrl = supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl
      const { error: dbErr } = await supabase.from('pr_config').update({ value: publicUrl }).eq('key', 'members_group_photo')
      if (dbErr) throw dbErr

      alert('단체사진이 업데이트 되었습니다! 📸')
      setGroupPhotoUrl(publicUrl)
      setPhotoFile(null)
    } catch (error) {
      alert('업로드 실패: ' + error.message)
    } finally {
      setUploadingPhoto(false)
    }
  }

  // 2. 학회원 등록
  const handleAddMember = async (e) => {
    e.preventDefault()
    if (!newMember.name || !newMember.generation || !newMember.university || !newMember.department) {
      return alert('모든 정보를 입력해주세요.')
    }
    const { error } = await supabase.from('pr_members').insert([{ ...newMember }])
    if (!error) {
      alert('학회원이 등록되었습니다! 🎉')
      setNewMember({ name: '', generation: '', university: '', department: '' })
      fetchData()
    }
  }

  // 🌟 3. 활동 기수 태그 추가/삭제/저장 로직 🌟
  const handleAddGen = () => {
    const val = genInput.trim()
    if (!val) return
    if (!activeGenerations.includes(val)) {
      setActiveGenerations([...activeGenerations, val])
    }
    setGenInput('')
  }
  const handleRemoveGen = (gen) => {
    setActiveGenerations(activeGenerations.filter(g => g !== gen))
  }
  const handleSaveGenerations = async () => {
    setSavingGens(true)
    const { error } = await supabase.from('pr_members_config').upsert({
      id: 'main',
      active_generations: activeGenerations
    })
    if (!error) alert('활동 기수 설정이 저장되었습니다! 🎯')
    else alert('저장 실패: ' + error.message)
    setSavingGens(false)
  }

  // 4. 졸업/활동 상태 변경 (Toggle)
  const toggleActiveStatus = async (id, currentStatus) => {
    const { error } = await supabase.from('pr_members').update({ is_active: !currentStatus }).eq('id', id)
    if (!error) fetchData()
  }

  // 5. 임원진 변경 로직
  const handleRoleChange = async (roleName, selectedMemberId) => {
    const previousExec = members.find(m => m.role === roleName)
    if (previousExec) {
      await supabase.from('pr_members').update({ role: '일반' }).eq('id', previousExec.id)
    }
    if (selectedMemberId !== "none") {
      await supabase.from('pr_members').update({ role: roleName }).eq('id', selectedMemberId)
    }
    alert(`${roleName} 직책이 업데이트 되었습니다.`)
    fetchData()
  }

  const handleDeleteMember = async (id) => {
    if (!confirm('정말 이 학회원 정보를 삭제할까요?')) return
    await supabase.from('pr_members').delete().eq('id', id)
    fetchData()
  }

  const activeMembers = members.filter(m => m.is_active)
  const graduatedMembers = members.filter(m => !m.is_active)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-6xl mx-auto">
        
        <header className="flex justify-between items-end mb-12 border-b border-slate-200 pb-6">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-[#32a4a1] uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">👥</span> Members Manager
            </h1>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* [좌측 1] 단체사진 설정 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h2 className="text-lg font-black uppercase mb-6 text-slate-800">1. Group Photo</h2>
            {groupPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={groupPhotoUrl} alt="Group" className="w-full aspect-video object-cover rounded-2xl mb-4 border border-slate-200" />
            ) : (
              <div className="w-full aspect-video bg-slate-100 rounded-2xl mb-4 flex items-center justify-center text-slate-400 font-bold border-2 border-dashed border-slate-300">
                등록된 사진이 없습니다
              </div>
            )}
            <div className="flex gap-2">
              <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files[0])} className="flex-1 text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
              <button onClick={handlePhotoUpload} disabled={uploadingPhoto} className="bg-[#32a4a1] text-white px-6 rounded-full font-black text-xs uppercase disabled:opacity-50 hover:bg-[#238986] transition-colors">
                {uploadingPhoto ? '업로드중' : 'Save'}
              </button>
            </div>
          </div>

          {/* [우측 1] 학회원 등록 */}
          <div className="bg-[#1a1a1a] text-white p-8 rounded-[2.5rem] shadow-xl">
            <h2 className="text-lg font-black uppercase mb-6 text-[#32a4a1]">2. New Member Registration</h2>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-white/50 uppercase mb-1 block">이름</label>
                  <input type="text" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} className="w-full bg-white/10 p-3 rounded-xl font-bold text-sm outline-none focus:border-[#32a4a1] border border-transparent text-white" placeholder="예: 우제윤" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-white/50 uppercase mb-1 block">기수</label>
                  <input type="text" value={newMember.generation} onChange={e => setNewMember({...newMember, generation: e.target.value})} className="w-full bg-white/10 p-3 rounded-xl font-bold text-sm outline-none focus:border-[#32a4a1] border border-transparent text-white" placeholder="예: 29기" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-white/50 uppercase mb-1 block">대학</label>
                  <input type="text" value={newMember.university} onChange={e => setNewMember({...newMember, university: e.target.value})} className="w-full bg-white/10 p-3 rounded-xl font-bold text-sm outline-none focus:border-[#32a4a1] border border-transparent text-white" placeholder="예: 서울대학교" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-white/50 uppercase mb-1 block">학과</label>
                  <input type="text" value={newMember.department} onChange={e => setNewMember({...newMember, department: e.target.value})} className="w-full bg-white/10 p-3 rounded-xl font-bold text-sm outline-none focus:border-[#32a4a1] border border-transparent text-white" placeholder="예: 산업공학과" />
                </div>
              </div>
              <button type="submit" className="w-full mt-4 py-4 bg-[#32a4a1] text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-[#238986] transition-all">
                Add Member ➕
              </button>
            </form>
          </div>
        </div>

        {/* 🌟 중간 추가: 활동 기수 및 임원진 관리 (1:2 비율 그리드) 🌟 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          
          {/* [새로운 구역] 3. 활동 기수 설정 */}
          <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
            <h2 className="text-lg font-black uppercase mb-2 text-[#a8d0cd]">3. Active Generations</h2>
            <p className="text-[10px] font-bold text-white/50 mb-6">투표 세팅 화면 등에 연동될 현재 활동 기수를 등록하세요.</p>
            
            <div className="flex gap-2 mb-6">
              <input 
                type="number" 
                value={genInput} 
                onChange={e => setGenInput(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleAddGen()}
                className="w-full bg-white/10 p-3 rounded-xl font-black text-sm outline-none focus:border-[#a8d0cd] border border-transparent text-white text-center" 
                placeholder="기수 숫자 (예: 28)" 
              />
              <button onClick={handleAddGen} className="shrink-0 whitespace-nowrap bg-[#a8d0cd] text-[#1a1a1a] px-4 rounded-xl font-black text-sm hover:bg-white transition-colors">
                추가
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-6 min-h-[40px]">
              {activeGenerations.map(gen => (
                <div key={gen} className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg border border-white/20">
                  <span className="font-black text-sm">{gen}기</span>
                  <button onClick={() => handleRemoveGen(gen)} className="text-red-400 hover:text-red-500 font-black text-xs">✕</button>
                </div>
              ))}
              {activeGenerations.length === 0 && <p className="text-xs text-white/30 font-bold w-full text-center mt-2">등록된 활동 기수가 없습니다.</p>}
            </div>

            <button onClick={handleSaveGenerations} disabled={savingGens} className="w-full py-3 border border-[#a8d0cd] text-[#a8d0cd] rounded-xl font-black text-xs uppercase hover:bg-[#a8d0cd] hover:text-[#1a1a1a] transition-colors">
              {savingGens ? 'Saving...' : 'Save Generations 💾'}
            </button>
          </div>

          {/* [기존 구역 이동] 4. 임원진 배정 */}
          <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 border-t-4 border-t-amber-400">
            <h2 className="text-lg font-black uppercase mb-6 text-slate-800">4. Executive Board (임원진 지정)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {execRoles.map(role => {
                const currentExec = activeMembers.find(m => m.role === role)
                return (
                  <div key={role} className="bg-slate-50 p-4 rounded-2xl flex flex-col">
                    <span className="text-xs font-black text-amber-600 mb-2 uppercase tracking-widest">{role}</span>
                    <select 
                      value={currentExec ? currentExec.id : "none"}
                      onChange={(e) => handleRoleChange(role, e.target.value)}
                      className="bg-white border border-slate-200 p-2 rounded-lg font-bold text-sm text-slate-700 outline-none focus:border-amber-400"
                    >
                      <option value="none">-- 지정 안함 --</option>
                      <option disabled>──────────</option>
                      {activeMembers.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.generation})</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* 5. 명단 관리 (활동 / 졸업) */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h2 className="text-lg font-black uppercase mb-6 text-slate-800">5. Member List & Graduation</h2>
          
          {loading ? <p className="text-center font-bold text-slate-400">로딩중...</p> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* 활동 기수 목록 */}
              <div>
                <h3 className="font-black text-[#32a4a1] mb-4 border-b border-slate-100 pb-2">🟢 일반 등록 학회원 ({activeMembers.length}명)</h3>
                <div className="space-y-3">
                  {activeMembers.map(m => (
                    <div key={m.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div>
                        <p className="font-black text-slate-800">{m.name} <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200 ml-1">{m.generation}</span></p>
                        <p className="text-xs text-slate-500 font-bold mt-1">{m.university} {m.department}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => toggleActiveStatus(m.id, m.is_active)} className="text-[10px] font-black px-3 py-1 bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300">졸업시키기 🎓</button>
                        <button onClick={() => handleDeleteMember(m.id)} className="text-[10px] font-black text-red-400 hover:text-red-600 text-right">삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 졸업 기수 목록 */}
              <div>
                <h3 className="font-black text-slate-400 mb-4 border-b border-slate-100 pb-2">🎓 졸업 기수 ({graduatedMembers.length}명)</h3>
                <div className="space-y-3 opacity-60 hover:opacity-100 transition-opacity">
                  {graduatedMembers.map(m => (
                    <div key={m.id} className="flex justify-between items-center bg-slate-100 p-4 rounded-2xl border border-slate-200">
                      <div>
                        <p className="font-black text-slate-600">{m.name} <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200 ml-1">{m.generation}</span></p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => toggleActiveStatus(m.id, m.is_active)} className="text-[10px] font-black px-3 py-1 bg-white border border-slate-300 text-slate-600 rounded-full hover:bg-slate-200">복귀시키기 🔄</button>
                        <button onClick={() => handleDeleteMember(m.id)} className="text-[10px] font-black text-red-400 hover:text-red-600">삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}