'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function AdminJoinPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  
  // 상태 관리
  const [generation, setGeneration] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [docFile, setDocFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) {
      router.push('/admin')
      return
    }
    fetchJoinData()
  }, [])

  // DB에서 기존 설정값 불러오기
  const fetchJoinData = async () => {
    setLoading(true)
    
    // 1. 모집 기수 가져오기
    const { data: genData } = await supabase.from('pr_config').select('value').eq('key', 'recruiting_generation').single()
    if (genData) setGeneration(genData.value)

    // 2. 지원서 파일 주소 가져오기
    const { data: docData } = await supabase.from('pr_config').select('value').eq('key', 'application_form_url').single()
    if (docData) setDocUrl(docData.value)

    setLoading(false)
  }

  // 1. 모집 기수 저장 로직 (upsert: 없으면 만들고 있으면 덮어쓰기)
  const handleSaveGeneration = async () => {
    if (!generation) return alert('모집 기수를 입력해주세요.')
    const { error } = await supabase.from('pr_config').upsert({ key: 'recruiting_generation', value: generation })
    if (!error) alert('모집 기수가 저장되었습니다! 🎯')
    else alert('저장 실패: ' + error.message)
  }

  // 2. 지원서 파일(docx) 업로드 로직
  const handleFileUpload = async () => {
    if (!docFile) return alert('업로드할 지원서 파일을 선택해주세요.')
    setUploading(true)
    
    try {
      const ext = docFile.name.split('.').pop()
      const path = `join/application_form_${Date.now()}.${ext}`
      
      // showcase 버킷을 재사용하여 join 폴더에 저장
      const { error: uploadErr } = await supabase.storage.from('showcase').upload(path, docFile)
      if (uploadErr) throw uploadErr

      const publicUrl = supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl

      // DB에 파일 주소 저장 (upsert)
      const { error: dbErr } = await supabase.from('pr_config').upsert({ key: 'application_form_url', value: publicUrl })
      if (dbErr) throw dbErr

      alert('지원서 양식이 성공적으로 업로드되었습니다! 📄')
      setDocUrl(publicUrl)
      setDocFile(null)
    } catch (error) {
      alert('업로드 실패: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">데이터 불러오는 중...</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-4xl mx-auto">
        
        {/* 헤더 */}
        <header className="flex justify-between items-end mb-12 border-b border-slate-200 pb-6">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-[#32a4a1] uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">📝</span> Join Us Manager
            </h1>
          </div>
        </header>

        <div className="space-y-8">
          
          {/* 1. 모집 기수 설정 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex-1 w-full">
              <h2 className="text-lg font-black uppercase text-slate-800 mb-2">1. Recruiting Generation</h2>
              <p className="text-xs text-slate-500 font-bold mb-4">현재 모집 중인 기수를 입력해주세요. (예: 29기)</p>
              <input 
                type="text" 
                value={generation} 
                onChange={(e) => setGeneration(e.target.value)} 
                className="w-full max-w-sm bg-slate-50 p-4 rounded-xl font-black text-lg outline-none focus:border-[#32a4a1] border border-transparent" 
                placeholder="예: 29기" 
              />
            </div>
            <button 
              onClick={handleSaveGeneration} 
              className="w-full md:w-auto h-fit bg-[#1a1a1a] text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-[#32a4a1] transition-all whitespace-nowrap"
            >
              Save
            </button>
          </div>

          {/* 2. 지원서 양식 파일 업로드 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h2 className="text-lg font-black uppercase text-slate-800 mb-2">2. Application Form (.docx)</h2>
            <p className="text-xs text-slate-500 font-bold mb-6">지원자들이 다운로드할 수 있는 최신 지원서 워드 파일을 업로드하세요.</p>
            
            {docUrl && (
              <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📄</span>
                  <div>
                    <p className="text-xs font-black text-blue-800">현재 등록된 지원서 파일</p>
                    <a href={docUrl} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-blue-500 hover:underline break-all block mt-1">
                      {docUrl}
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-2">
                <input 
                  type="file" 
                  accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                  onChange={(e) => setDocFile(e.target.files[0])} 
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-black file:bg-[#32a4a1]/10 file:text-[#32a4a1] hover:file:bg-[#32a4a1]/20 cursor-pointer" 
                />
              </div>
              <button 
                onClick={handleFileUpload} 
                disabled={uploading || !docFile}
                className="w-full md:w-auto bg-[#32a4a1] text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:bg-[#238986] disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {uploading ? 'Uploading...' : 'Upload File 🚀'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}