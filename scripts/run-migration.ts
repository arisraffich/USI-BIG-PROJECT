/**
 * Database Migration Runner
 * 
 * This script runs the performance indexes migration.
 * Run it once with: npx tsx scripts/run-migration.ts
 * 
 * Make sure your .env.local has:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

async function runMigration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing required environment variables:')
    console.error('   - NEXT_PUBLIC_SUPABASE_URL')
    console.error('   - SUPABASE_SERVICE_ROLE_KEY')
    console.error('\nMake sure these are set in your .env.local file')
    process.exit(1)
  }

  console.log('🚀 Starting database migration...')
  console.log(`📡 Connecting to: ${supabaseUrl}`)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Read the migration SQL file
  const migrationPath = join(process.cwd(), 'supabase', 'migrations', 'add_performance_indexes.sql')
  let sql: string

  try {
    sql = readFileSync(migrationPath, 'utf-8')
  } catch (error) {
    console.error(`❌ Could not read migration file: ${migrationPath}`)
    console.error(error)
    process.exit(1)
  }

  // Split SQL into individual statements (remove comments and empty lines)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`📝 Found ${statements.length} SQL statements to execute\n`)

  // Execute each statement
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';' // Add semicolon back
    const statementPreview = statement.substring(0, 60).replace(/\n/g, ' ') + '...'
    
    console.log(`[${i + 1}/${statements.length}] Executing: ${statementPreview}`)
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement })
      
      // If RPC doesn't work, try direct query (Supabase might not have exec_sql function)
      if (error) {
        // Try using the REST API directly
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ sql_query: statement }),
        })

        if (!response.ok) {
          // Last resort: use pg REST API or direct connection
          console.log('   ⚠️  Using alternative method...')
          // For CREATE INDEX, we can use the Supabase client's query builder
          // But since we need raw SQL, we'll need to use a different approach
          console.log('   ⚠️  Note: Some Supabase setups require running SQL directly in the dashboard')
          console.log('   💡 Please run this SQL manually in Supabase SQL Editor:')
          console.log(`\n${statement}\n`)
          continue
        }
      }
      
      console.log('   ✅ Success')
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`)
      console.log('   💡 You may need to run this SQL manually in Supabase SQL Editor')
      console.log(`\n${statement}\n`)
    }
  }

  console.log('\n✨ Migration completed!')
  console.log('💡 If any statements failed, run them manually in Supabase SQL Editor')
}

runMigration().catch(console.error)








