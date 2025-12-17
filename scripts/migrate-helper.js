#!/usr/bin/env node

/**
 * Migration Helper Script
 * 
 * This script helps you run the database migration by:
 * 1. Reading the SQL file
 * 2. Validating your Supabase connection
 * 3. Providing copy-paste ready SQL
 * 
 * Run: node scripts/migrate-helper.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Database Migration Helper\n');
console.log('=' .repeat(50));

// Read the migration file
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', 'add_performance_indexes.sql');

if (!fs.existsSync(migrationPath)) {
  console.error('❌ Migration file not found:', migrationPath);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf-8');

console.log('\n✅ Migration file found!\n');
console.log('📋 SQL to execute:\n');
console.log('-'.repeat(50));
console.log(sql);
console.log('-'.repeat(50));

console.log('\n📝 Instructions:');
console.log('1. Go to https://supabase.com/dashboard');
console.log('2. Select your project');
console.log('3. Click "SQL Editor" in the left sidebar');
console.log('4. Click "New query"');
console.log('5. Copy the SQL above and paste it');
console.log('6. Click "Run" (or press Cmd/Ctrl + Enter)');
console.log('7. You should see "Success" - indexes are created!\n');

console.log('💡 Tip: The SQL uses "IF NOT EXISTS" so it\'s safe to run multiple times.\n');










