'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function Archive() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  
  const categories = ['기획서', '교육자료', '양식', '자료실']
  const [activeTab, setActiveTab] = useState('기획서')

  // 1. 데이터 불러오기
  const fetchArchive = async () => {
    const { data } = await supabase
      .from('files_metadata')
      .select('*')
      .eq('is_archive', true)
      .eq('category', activeTab)
      .order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  useEffect(() => { fetchArchive() }, [activeTab])

  // 2. 업로드 함수 (파일명 에러 방지)
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setLoading(true)
    const fileExt = file.name.split('.').pop() 
    const storagePath = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}` 

    const { error: storageError } = await supabase.storage
      .from('ig-files')
      .upload(storagePath, file)

    if (storageError) {
      alert("업로드 실패: " + storageError.message);
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('ig-files').getPublicUrl(storagePath)
    
    await supabase.from('files_metadata').insert([
      { 
        file_name: file.name, 
        file_url: publicUrl, 
        is_archive: true,
        category: activeTab,
        uploader: '관리자',
        storage_path: storagePath 
      }
    ])

    alert(`${activeTab} 탭에 보관 완료! 🎉`)
    fetchArchive()
    setLoading(false)
  }

  // 3. 이름 수정
  const handleUpdate = async () => {
    if (!newTitle) return
    await supabase.from('files_metadata').update({ file_name: newTitle }).eq('id', editItem.id)
    setEditItem(null)
    fetchArchive()
  }

  // 4. 삭제
  const handleDelete = async (id, filePath) => {
    if (!confirm("이 자료를 삭제할까요?")) return
    if (filePath) await supabase.storage.from('ig-files').remove([filePath])
    await supabase.from('files_metadata').delete().eq('id', id)
    fetchArchive()
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900">
      <header className="flex justify-between items-center mb-8">
        <div>
          {/* 홈으로 이동 버튼만 남기고 자료실 링크는 삭제함 */}
          <div className="flex gap-4 mb-1">
            <Link href="/home" className="text-blue-600 text-xs font-bold hover:underline">← 홈으로 가기</Link>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">IG Archive 🏛️</h1>
        </div>
        
        <div className="flex gap-4 items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col gap-1">
            <span className="font-bold text-xs text-gray-400 uppercase">{activeTab} 업로드</span>
            <input type="file" onChange={handleUpload} disabled={loading} className="text-xs cursor-pointer" />
          </div>
        </div>
      </header>

      {/* 탭 메뉴 */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button 
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === cat ? 'bg-blue-600 text-white shadow-md' : 'bg-white border text-gray-400 hover:border-blue-300'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 리스트 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.length > 0 ? items.map(file => (
          <div key={file.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
            <div className="flex justify-between items-start mb-4">
              <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-1 rounded font-black uppercase">{file.file_name.split('.').pop()}</span>
              <div className="flex gap-3">
                <button onClick={() => { setEditItem(file); setNewTitle(file.file_name); }} className="text-[10px] text-blue-400 font-bold hover:underline">수정</button>
                <button onClick={() => handleDelete(file.id, file.storage_path)} className="text-[10px] text-red-300 font-bold hover:underline">삭제</button>
              </div>
            </div>
            <h3 className="text-base font-bold mb-4 text-slate-800 truncate">{file.file_name}</h3>
            <div className="flex justify-between items-center pt-4 border-t border-gray-50">
              <span className="text-xs text-gray-400 flex items-center gap-1 font-medium italic">👤 {file.uploader}</span>
              <a href={file.file_url} target="_blank" className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-600 hover:text-white transition-colors">자료 보기</a>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-20 text-center text-gray-300 font-bold italic">아직 보물이 없어요! 💎</div>
        )}
      </div>

      {/* 수정 모달 */}
      {editItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-100">
            <h2 className="font-bold mb-4 text-lg text-slate-800">이름 고치기 ✏️</h2>
            <input 
              type="text" 
              value={newTitle} 
              onChange={(e) => setNewTitle(e.target.value)} 
              className="w-full border-2 border-slate-100 p-3 rounded-xl mb-4 focus:border-blue-500 outline-none transition-all" 
            />
            <div className="flex gap-2">
              <button onClick={handleUpdate} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">저장</button>
              <button onClick={() => setEditItem(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}