
import { Client } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

async function migrate() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing')
        process.exit(1)
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    })

    try {
        await client.connect()
        console.log('Connected to database')

        // Add generation_error column
        await client.query(`
      ALTER TABLE characters 
      ADD COLUMN IF NOT EXISTS generation_error TEXT;
    `)

        console.log('Successfully added generation_error column')
    } catch (error) {
        console.error('Migration failed:', error)
    } finally {
        await client.end()
    }
}

migrate()
