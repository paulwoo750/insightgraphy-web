// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qyudomjgizwzhkqrrlhd.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5dWRvbWpnaXp3emhrcXJybGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MjY0NzUsImV4cCI6MjA4MzEwMjQ3NX0.tRBSyeOyeivge7raLxUND3hkRbRctewsESeoxG2hVgM'

export const supabase = createClient(supabaseUrl, supabaseKey)

