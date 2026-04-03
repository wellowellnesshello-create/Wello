import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://esocyyhnphjqcfjidffu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzb2N5eWhucGhqcWNmamlkZmZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjQ3NzAsImV4cCI6MjA5MDgwMDc3MH0.k4-BqiozKijbhycOw7HpyICys3WYDniu325nUBstxyc'

export const supabase = createClient(supabaseUrl, supabaseKey)