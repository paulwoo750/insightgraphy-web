'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function AdminShowcasePage() {
  const router = useRouter()
  const [works, setWorks] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  // 폼 상태 관리
  const [formData, setFormData] = useState({
    author: '', generation: '', topic: '', title: ''
  })
  const [thumbFile, setThumbFile] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)

  useEffect(() => {
    // 보안 체크
    if (!sessionStorage.getItem('isIGAdmin')) {
      router.push('/admin')
      return
    }
    fetchWorks()
  }, [])

  // 기존 업로드된 데이터 불러오기
  const fetchWorks = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('pr_showcase')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setWorks(data)
    setLoading(false)
  }

  // 텍스트 입력 핸들러
  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  // 업로드 실행 로직
  const handleUpload = async (e) => {
    e.preventDefault()
    if (!formData.author || !formData.generation || !formData.topic || !formData.title || !thumbFile || !pdfFile) {
      return alert('모든 항목을 입력하고 파일을 첨부해주세요!')
    }

    setUploading(true)
    try {
      // 1. 썸네일 이미지 Storage에 업로드
      const thumbExt = thumbFile.name.split('.').pop()
      const thumbPath = `thumbnails/${Date.now()}.${thumbExt}`
      const { error: thumbErr } = await supabase.storage.from('showcase').upload(thumbPath, thumbFile)
      if (thumbErr) throw thumbErr
      const thumbUrl = supabase.storage.from('showcase').getPublicUrl(thumbPath).data.publicUrl

      // 2. PDF 파일 Storage에 업로드
      const pdfExt = pdfFile.name.split('.').pop()
      const pdfPath = `pdfs/${Date.now()}.${pdfExt}`
      const { error: pdfErr } = await supabase.storage.from('showcase').upload(pdfPath, pdfFile)
      if (pdfErr) throw pdfErr
      const pdfUrl = supabase.storage.from('showcase').getPublicUrl(pdfPath).data.publicUrl

      // 3. Database 테이블에 텍스트와 파일 링크 저장
      const { error: dbErr } = await supabase.from('pr_showcase').insert([{
        author: formData.author,
        generation: formData.generation,
        topic: formData.topic,
        title: formData.title,
        thumb_url: thumbUrl,
        pdf_url: pdfUrl
      }])
      if (dbErr) throw dbErr

      alert('쇼케이스 업로드 성공! 🎉')
      // 폼 초기화 및 목록 새로고침
      setFormData({ author: '', generation: '', topic: '', title: '' })
      setThumbFile(null)
      setPdfFile(null)
      document.getElementById('thumbInput').value = ''
      document.getElementById('pdfInput').value = ''
      fetchWorks()

    } catch (error) {
      alert('업로드 실패: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  // 데이터 삭제 로직
  const handleDelete = async (id) => {
    if (!confirm('정말 이 작품을 쇼케이스에서 삭제할까요?')) return
    const { error } = await supabase.from('pr_showcase').delete().eq('id', id)
    if (!error) fetchWorks()
    else alert('삭제 실패: ' + error.message)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-5xl mx-auto">
        
        {/* 헤더 */}
        <header className="flex justify-between items-end mb-12 border-b border-slate-200 pb-6">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">🖼️</span> Showcase Manager
            </h1>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
          
          {/* 좌측: 업로드 폼 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 h-fit sticky top-8">
            <h2 className="text-lg font-black uppercase mb-6 text-slate-800">New Artwork Upload</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              
              {/* 텍스트 정보 입력 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">발표자 이름</label>
                  <input type="text" name="author" value={formData.author} onChange={handleInputChange} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-300 border border-transparent" placeholder="예: 우제윤" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">기수</label>
                  <input type="text" name="generation" value={formData.generation} onChange={handleInputChange} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-300 border border-transparent" placeholder="예: 28기" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">해당 주차 주제명 (Topic)</label>
                <input type="text" name="topic" value={formData.topic} onChange={handleInputChange} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-300 border border-transparent" placeholder="예: 죽은 아이디어를 부활시켜라" />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">발표 제목 (Title)</label>
                <input type="text" name="title" value={formData.title} onChange={handleInputChange} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-300 border border-transparent" placeholder="예: Connect KE" />
              </div>

              {/* 파일 업로드 */}
              <div className="pt-4 border-t border-slate-100">
                <div className="mb-4">
                  <label className="text-[10px] font-black text-blue-500 uppercase mb-2 block">🖼️ 표지 썸네일 (이미지)</label>
                  <input id="thumbInput" type="file" accept="image/*" onChange={(e) => setThumbFile(e.target.files[0])} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-red-500 uppercase mb-2 block">📄 발표자료 (PDF)</label>
                  <input id="pdfInput" type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files[0])} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer" />
                </div>
              </div>

              <button type="submit" disabled={uploading} className="w-full mt-6 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#32a4a1] transition-all disabled:opacity-50">
                {uploading ? 'Uploading...' : 'Upload Artwork 🚀'}
              </button>
            </form>
          </div>

          {/* 우측: 업로드된 작품 리스트 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h2 className="text-lg font-black uppercase mb-6 text-slate-800">Current Showcase</h2>
            {loading ? (
              <p className="text-center text-slate-400 font-bold py-10">데이터 불러오는 중... 🔄</p>
            ) : works.length === 0 ? (
              <p className="text-center text-slate-400 font-bold py-10 border-2 border-dashed border-slate-100 rounded-3xl">아직 등록된 작품이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {works.map(work => (
                  <div key={work.id} className="border border-slate-100 rounded-3xl overflow-hidden hover:shadow-md transition-all group">
                    <div className="aspect-video bg-slate-100 relative">
                      {/* 썸네일 이미지 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={work.thumb_url} alt={work.title} className="w-full h-full object-cover" />
                      <button onClick={() => handleDelete(work.id)} className="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full font-black opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-lg">✕</button>
                    </div>
                    <div className="p-4">
                      <p className="text-[9px] font-black text-[#32a4a1] uppercase tracking-widest mb-1">{work.topic}</p>
                      <h3 className="font-black text-slate-800 text-sm truncate mb-2">{work.title}</h3>
                      <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                        <span>{work.author} ({work.generation})</span>
                        <a href={work.pdf_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">PDF 보기</a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}