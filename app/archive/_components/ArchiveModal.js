'use client'
import { Modal } from '@/app/components/ui'

const SIZES = { 'max-w-md': 'sm', 'max-w-xl': 'md', 'max-w-2xl': 'lg', 'max-w-3xl': 'lg' }

// 아카이브 모달은 공통 모달(포커스 가두기·Esc 닫기)을 그대로 쓴다
export default function ArchiveModal({ icon, title, onClose, size = 'max-w-2xl', footer, children }) {
  return (
    <Modal title={icon ? `${icon} ${title}` : title} onClose={onClose} size={SIZES[size] || 'lg'} footer={footer}>
      <div className="p-5">{children}</div>
    </Modal>
  )
}
