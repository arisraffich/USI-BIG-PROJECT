import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const DRY_RUN_DATABASE_URL = 'MIGRATION_DRY_RUN_DATABASE_URL'
const ALLOW_REMOTE_DRY_RUN = 'ALLOW_REMOTE_MIGRATION_DRY_RUN'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function parseDatabaseUrl(value: string, label: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new Error(`${label} is not a valid database URL.`)
  }
}

function sameDatabase(left: URL, right: URL): boolean {
  return (
    left.hostname === right.hostname &&
    left.port === right.port &&
    left.pathname === right.pathname &&
    left.username === right.username
  )
}

function getDryRunDatabaseUrl(): string {
  const dryRunUrl = process.env[DRY_RUN_DATABASE_URL]
  if (!dryRunUrl) {
    throw new Error(`${DRY_RUN_DATABASE_URL} is required. Do not use DATABASE_URL for this script.`)
  }

  const parsedDryRunUrl = parseDatabaseUrl(dryRunUrl, DRY_RUN_DATABASE_URL)

  if (process.env.DATABASE_URL) {
    const productionUrl = parseDatabaseUrl(process.env.DATABASE_URL, 'DATABASE_URL')
    if (sameDatabase(parsedDryRunUrl, productionUrl)) {
      throw new Error(`${DRY_RUN_DATABASE_URL} points at the same database as DATABASE_URL. Refusing to continue.`)
    }
  }

  if (!LOCAL_HOSTS.has(parsedDryRunUrl.hostname) && process.env[ALLOW_REMOTE_DRY_RUN] !== 'true') {
    throw new Error(
      `${DRY_RUN_DATABASE_URL} points at a remote host. Use a local disposable database, or set ` +
        `${ALLOW_REMOTE_DRY_RUN}=true only for a dedicated temporary database.`
    )
  }

  return dryRunUrl
}

async function main() {
  const connectionString = getDryRunDatabaseUrl()
  const parsedUrl = parseDatabaseUrl(connectionString, DRY_RUN_DATABASE_URL)
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  const client = new Client({
    connectionString,
    ssl: LOCAL_HOSTS.has(parsedUrl.hostname) ? undefined : { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    console.log(`Connected to dry-run database at ${parsedUrl.hostname}.`)
    console.log('Installing local Supabase compatibility shims.')
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE OR REPLACE FUNCTION auth.role()
      RETURNS TEXT AS $$
        SELECT 'service_role'::text;
      $$ LANGUAGE sql STABLE;

      CREATE SCHEMA IF NOT EXISTS storage;

      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public BOOLEAN DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
        bucket_id TEXT,
        name TEXT
      );

      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    `)

    console.log(`Applying ${migrationFiles.length} migration files.`)

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file)
      const sql = readFileSync(filePath, 'utf8')

      console.log(`Applying ${file}`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Migration failed in ${file}: ${message}`)
      }
    }

    const expectedTables = [
      'projects',
      'pages',
      'characters',
      'reviews',
      'illustration_reviews',
      'scheduled_sends',
      'email_templates',
      'covers',
      'project_followups',
    ]

    const { rows } = await client.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name
      `,
      [expectedTables]
    )

    const foundTables = new Set(rows.map((row) => row.table_name))
    const missingTables = expectedTables.filter((table) => !foundTables.has(table))

    if (missingTables.length > 0) {
      throw new Error(`Dry run completed, but expected tables are missing: ${missingTables.join(', ')}`)
    }

    console.log('Dry run completed successfully.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
