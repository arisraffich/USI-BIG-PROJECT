# USI Platform Setup Guide

## ✅ Completed Steps

1. ✅ Next.js project created
2. ✅ Dependencies installed
3. ✅ Supabase database schema created
4. ✅ Storage buckets created
5. ✅ Project files structure created

## 📝 Required: Create .env.local File

**IMPORTANT:** You need to manually create the `.env.local` file in the project root with your API keys.

Create `/Users/aris/Documents/GitHub/USI Project/usi-platform/.env.local` with this content:

```env
# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# OpenAI (add your key when you have it)
OPENAI_API_KEY=

# Replicate (add your token when you have it)
REPLICATE_API_TOKEN=

# Resend (add your key when you have it)
RESEND_API_KEY=

# Twilio (add your credentials when you have them)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Slack (add your webhook URL when you have it)
SLACK_WEBHOOK_URL=

# Admin Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-to-secure-password

# App Config
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## 🚀 Running the Project

1. **Create the .env.local file** (see above)

2. **Start the development server:**
   ```bash
   cd "/Users/aris/Documents/GitHub/USI Project/usi-platform"
   npm run dev
   ```

3. **Open your browser:**
   - Go to: http://localhost:3000
   - Admin login: http://localhost:3000/admin/login
   - Default credentials (change in .env.local):
     - Username: `admin`
     - Password: `change-this-to-secure-password`

## 📋 Next Steps

The foundation is set up! Next, we need to build:

1. **Project Creation Flow** - File uploads, project creation
2. **Story Parsing** - Parse uploaded story files
3. **Character Identification** - AI-powered character extraction
4. **Character Generation** - Generate character illustrations
5. **Customer Review Pages** - Mobile-responsive review forms
6. **Sketch Generation** - Generate black & white sketches

## 🔧 Project Structure

```
usi-platform/
├── app/
│   ├── admin/          # Admin dashboard pages
│   ├── api/            # API routes
│   └── review/         # Customer review pages (to be created)
├── components/         # React components
├── lib/
│   ├── ai/            # AI service integrations
│   ├── supabase/      # Supabase clients
│   └── utils/         # Utility functions
└── types/             # TypeScript type definitions
```

## 📚 Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)













