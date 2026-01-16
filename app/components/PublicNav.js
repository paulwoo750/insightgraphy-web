import Link from 'next/link'

export default function PublicNav() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-slate-900/80 backdrop-blur-md border-b border-white/10 px-8 py-4 flex justify-between items-center text-white">
      <div className="text-xl font-black tracking-tighter uppercase">InsightGraphy</div>
      <div className="flex gap-8 text-[11px] font-black uppercase tracking-widest">
        <Link href="/about" className="hover:text-blue-400 transition-colors">About Us</Link>
        <Link href="/activities" className="hover:text-blue-400 transition-colors">Activities</Link>
        <Link href="/members" className="hover:text-blue-400 transition-colors">Members</Link>
        <Link href="/showcase" className="hover:text-blue-400 transition-colors">Showcase</Link>
        <Link href="/recruit" className="hover:text-blue-400 transition-colors">Join Us</Link>
        <Link href="/login" className="bg-blue-600 px-3 py-1 rounded-md">Login</Link>
      </div>
    </nav>
  )
}