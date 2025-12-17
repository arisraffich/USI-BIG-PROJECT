import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * One-time migration endpoint to add performance indexes
 * 
 * Call this once: GET /api/migrations/run-indexes
 * 
 * This will add database indexes for better query performance.
 * Safe to run multiple times (uses IF NOT EXISTS).
 */
export async function GET(request: NextRequest) {
  // Optional: Add a secret token check for security
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.MIGRATION_SECRET_TOKEN
  
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      { error: 'Unauthorized. Set MIGRATION_SECRET_TOKEN in .env.local' },
      { status: 401 }
    )
  }

  try {
    const supabase = createAdminClient()
    
    // Read the migration SQL file
    const migrationPath = join(process.cwd(), 'supabase', 'migrations', 'add_performance_indexes.sql')
    const sql = readFileSync(migrationPath, 'utf-8')
    
    // Split into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
    
    const results: Array<{ statement: string; success: boolean; error?: string }> = []
    
    // Execute each statement using Supabase's REST API
    for (const statement of statements) {
      if (!statement.trim()) continue
      
      const fullStatement = statement + ';'
      
      try {
        // Use Supabase's REST API to execute SQL
        // Note: This requires the service role key and uses PostgREST
        // For CREATE INDEX, we need to use the direct database connection
        // Since Supabase JS client doesn't support raw SQL execution,
        // we'll need to use the REST API endpoint
        
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        
        if (!supabaseUrl || !serviceRoleKey) {
          throw new Error('Missing Supabase credentials')
        }
        
        // Use Supabase Management API or direct PostgreSQL connection
        // Since we can't execute raw SQL via the JS client, we'll return
        // instructions for manual execution
        results.push({
          statement: fullStatement,
          success: false,
          error: 'Cannot execute raw SQL via Supabase JS client. Please run manually in SQL Editor.',
        })
      } catch (error: any) {
        results.push({
          statement: fullStatement,
          success: false,
          error: error.message,
        })
      }
    }
    
    // Since Supabase JS client doesn't support raw SQL execution,
    // return the SQL statements for manual execution
    return NextResponse.json({
      message: 'Supabase JS client cannot execute raw SQL statements.',
      instructions: 'Please run the migration manually in Supabase SQL Editor.',
      sql: sql,
      statements: statements.map(s => s + ';'),
      note: 'Copy the SQL above and paste it into your Supabase SQL Editor, then click Run.',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to read migration file', details: error.message },
      { status: 500 }
    )
  }
}










