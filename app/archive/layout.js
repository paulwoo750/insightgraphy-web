import MemberShell from '@/app/components/MemberShell'
import ThemeScope from '@/app/components/ThemeScope'

export default function MemberLayout({ children }) {
  return <><ThemeScope /><MemberShell>{children}</MemberShell></>
}
