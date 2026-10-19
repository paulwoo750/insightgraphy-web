import { supabase } from '@/lib/supabase'

export async function getAdminAccess() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const session = sessionData?.session

  if (sessionError || !session) {
    return { status: 'signed_out', session: null, admin: null, error: sessionError }
  }

  const { data: admin, error: adminError } = await supabase
    .from('admin_users')
    .select('role, is_active')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (adminError || !admin?.is_active) {
    return { status: 'forbidden', session, admin: null, error: adminError }
  }

  return { status: 'authorized', session, admin, error: null }
}
