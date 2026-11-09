'use client'
// 화면 밝기 바꾸기: 머리말의 해·달 버튼(누르면 반대로) + 설정 화면의 세 가지 선택(기기 설정 · 밝게 · 어둡게)
import { Moon, Sun } from 'lucide-react'
import { COLOR_MODES, setColorMode, useColorMode, useIsDark } from '@/lib/colorMode'
import { SegmentedControl } from '@/app/components/ui'

export function ColorModeToggle({ className = '' }) {
  const dark = useIsDark()
  const label = dark ? '밝은 화면으로 보기' : '어두운 화면으로 보기'
  const Icon = dark ? Sun : Moon
  return (
    <button type="button" onClick={() => setColorMode(dark ? 'light' : 'dark')} aria-label={label} title={label} className={`inline-grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 ${className}`}>
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  )
}

export function ColorModeSetting({ size = 'md' }) {
  const mode = useColorMode()
  return <SegmentedControl label="화면 밝기" size={size} value={mode} onChange={setColorMode} options={COLOR_MODES} />
}
