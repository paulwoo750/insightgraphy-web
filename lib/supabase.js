// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qyudomjgizwzhkqrrlhd.supabase.co'
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5dWRvbWpnaXp3emhrcXJybGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MjY0NzUsImV4cCI6MjA4MzEwMjQ3NX0.tRBSyeOyeivge7raLxUND3hkRbRctewsESeoxG2hVgM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 서버 API에서 요청자의 로그인 토큰으로 DB를 읽고 쓰는 클라이언트 (RLS가 그 사용자 기준으로 적용된다)
export function createUserClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}
