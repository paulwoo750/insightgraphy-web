'use client'

export default function ArchiveModal({ icon, title, onClose, size = 'max-w-2xl', children }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110]" role="dialog" aria-modal="true">
      <div className={`bg-white w-full ${size} max-h-[85vh] flex flex-col shadow-xl border border-slate-200 border-t-[3px] border-t-teal-800`}>
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-200">
          <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">{icon && <span>{icon}</span>}{title}</h2>
          <button onClick={onClose} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-900 hover:text-white transition-colors">닫기 ✕</button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}
