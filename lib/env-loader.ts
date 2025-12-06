import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export function ensureEnvVars() {
    // Only run on server
    if (typeof window !== 'undefined') return;

    // Check if critical vars are missing
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.log('Environment variables missing in process.env, attempting to load from .env...');

        try {
            const envPath = path.resolve(process.cwd(), '.env');
            if (fs.existsSync(envPath)) {
                const envConfig = dotenv.parse(fs.readFileSync(envPath));
                for (const k in envConfig) {
                    process.env[k] = envConfig[k];
                }
                console.log('Loaded .env file manually.');
            } else {
                console.warn('.env file not found at:', envPath);
            }
        } catch (error) {
            console.error('Error loading .env file:', error);
        }
    }
}
