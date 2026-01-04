'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link' // 페이지 이동을 위한 링크 추가

export default function Dashboard() {
  const router = useRouter()
  const [files, setFiles] = useState([])
  const [user, setUser] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(1) 
  const [targetWeek, setTargetWeek] = useState(1) 
  
  // 수정 기능을 위한 상태
  const [editItem, setEditItem] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  // 1. 로그인 체크 및 유저 정보 가져오기
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        alert("로그인이 필요해! 🚪")
        router.push('/signup')
      } else {
        setUser(session.user)
        fetchFiles()
      }
    }
    checkUser()
  }, [])

  // 2. 파일 목록 불러오기 (is_archive가 false인 것만)
  const fetchFiles = async () => {
    const { data } = await supabase
      .from('files_metadata')
      .select('*')
      .eq('is_archive', false) 
      .order('created_at', { ascending: false })
    if (data) setFiles(data)
  }

  // 3. 업로드 함수 (파일명 에러 방지 로직 포함)
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !user) return

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    // 창고용 영어 주소 생성
    const storagePath = `dashboard/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('ig-files')
      .upload(storagePath, file)

    if (uploadError) {
      alert('업로드 실패: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('ig-files').getPublicUrl(storagePath)
    
    await supabase.from('files_metadata').insert([
      { 
        file_name: file.name, 
        file_url: publicUrl, 
        week: targetWeek,
        is_archive: false,
        uploader: user.user_metadata.name || '익명 학회원',
        storage_path: storagePath 
      }
    ])

    alert('업로드 완료! 🎉')
    setUploading(false)
    fetchFiles() 
  }

  // 4. 이름 수정 함수
  const handleUpdate = async () => {
    if (!newTitle) return
    const { error } = await supabase
      .from('files_metadata')
      .update({ file_name: newTitle })
      .eq('id', editItem.id)

    if (!error) {
      alert("이름 수정 완료! ✨")
      setEditItem(null)
      fetchFiles()
    }
  }

  // 5. 삭제 함수 (창고 + 장부 세트 삭제)
  const handleDelete = async (id, filePath) => {
    if (!confirm("정말 이 파일을 삭제할 거야? 🗑️")) return
    if (filePath) await supabase.storage.from('ig-files').remove([filePath])
    await supabase.from('files_metadata').delete().eq('id', id)
    fetchFiles()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/signup')
  }

  if (!user) return <div className="p-8">로딩 중... 🔄</div>

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900">
      <header className="flex justify-between items-center mb-8">
        <div>
          {/* 홈으로 이동 버튼 추가 */}
          <div className="flex gap-4 mb-1">
            <Link href="/home" className="text-blue-600 text-xs font-bold hover:underline">← 홈으로 가기</Link>
          </div>
          <h1 className="text-3xl font-bold text-blue-800">InsightGraphy 자료실 📂</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            반가워요, <span className="font-bold text-blue-600">{user.user_metadata.name}</span>님!
          </p>
        </div>
        
        <div className="flex gap-4 items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col gap-1">
            <span className="font-bold text-xs text-gray-400 uppercase tracking-widest">Upload Section</span>
            <div className="flex gap-2 items-center">
              <select value={targetWeek} onChange={(e) => setTargetWeek(Number(e.target.value))} className="border p-1 rounded text-sm bg-gray-50 outline-none">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(w => <option key={w} value={w}>{w}주차</option>)}
              </select>
              <input type="file" onChange={handleUpload} disabled={uploading} className="text-xs cursor-pointer" />
            </div>
          </div>
          <button onClick={handleLogout} className="ml-4 text-xs text-gray-400 hover:text-red-500 underline font-bold transition-colors">로그아웃</button>
        </div>
      </header>

      {/* 주차 필터 탭 */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(w => (
          <button 
            key={w} 
            onClick={() => setSelectedWeek(w)} 
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${selectedWeek === w ? 'bg-blue-600 text-white shadow-md' : 'bg-white border text-gray-400 hover:border-blue-300'}`}
          >
            {w}주차
          </button>
        ))}
      </div>

      {/* 파일 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {files.filter(f => f.week === selectedWeek).length > 0 ? (
          files.filter(f => f.week === selectedWeek).map(file => (
            <div key={file.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
              <div className="flex justify-between items-start mb-4">
                <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-1 rounded font-black uppercase">
                  {file.file_name.split('.').pop()}
                </span>
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setEditItem(file); setNewTitle(file.file_name); }} 
                    className="text-[10px] text-blue-400 font-bold hover:underline"
                  >
                    수정
                  </button>
                  <button 
                    onClick={() => handleDelete(file.id, file.storage_path)}
                    className="text-[10px] text-red-300 font-bold hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <h3 className="text-base font-bold mb-4 text-slate-800 truncate" title={file.file_name}>
                {file.file_name}
              </h3>
              <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                <span className="text-xs text-gray-400 font-medium italic">👤 {file.uploader}</span>
                <a 
                  href={file.file_url} 
                  target="_blank" 
                  className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-600 hover:text-white transition-all"
                >
                  다운로드
                </a>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center text-gray-300 font-bold italic">
            아직 자료가 없어요! 😅
          </div>
        )}
      </div>

      {/* 수정 팝업 모달 */}
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
              <button onClick={handleUpdate} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">저장</button>
              <button onClick={() => setEditItem(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold hover:bg-slate-200 transition-colors">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}