import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dns from 'dns';

// Force IPV4 to avoid ENETUNREACH on some networks
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

// Load env vars
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();

async function migrate() {
    console.log('Connecting to database...');

    if (!process.env.DATABASE_URL) {
        console.error('Error: DATABASE_URL is not defined.');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for many hosted DBs
    });

    try {
        await client.connect();
        console.log('Connected.');

        const migrationFile = path.join(process.cwd(), 'supabase/migrations/20241214000000_add_customer_illustration_columns.sql');
        console.log(`Reading migration file: ${migrationFile}`);

        const sql = fs.readFileSync(migrationFile, 'utf8');

        console.log('Applying migration...');
        await client.query(sql);

        console.log('Migration applied successfully!');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrate();
