# Children's Book Illustration Project Management Platform
## Final Confirmed Technical Specifications

**Document Version:** Final
**Date:** December 2024
**Status:** ✅ Confirmed and In Development

---

## 1. PROJECT OVERVIEW

### 1.1 Purpose
A web-based project management platform for US Illustrations LLC to streamline the children's book illustration workflow from character identification to sketch approval.

### 1.2 Core Value Proposition
- Automates character identification from stories
- Generates colored character illustrations using AI
- Creates black & white pencil sketches for customer approval
- Reduces manual work from $400/project to ~$8/project in AI costs
- Centralizes customer communication and approvals

### 1.3 User Roles
- **Project Manager (PM):** Single admin account, full access to all features
- **Customer:** Limited access via unique URLs for form input and approvals

---

## 2. TECHNOLOGY STACK (FINAL CONFIRMED)

### 2.1 Frontend
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS (Light mode only - NO dark mode)
- **UI Components:** shadcn/ui
- **State Management:** React Context + useState
- **File Handling:** react-dropzone
- **Animations:** Simple CSS transitions only (NO Framer Motion)

### 2.2 Backend
- **Runtime:** Next.js API Routes (serverless)
- **Database:** Supabase PostgreSQL (NOT Cloudflare D1)
- **Storage:** Supabase Storage (NOT Cloudflare R2)
- **Authentication:** Simple password protection (env variables)

### 2.3 AI Services
- **Character Identification:** OpenAI GPT-5.1 (with medium reasoning)
- **Scene Description Generation:** OpenAI GPT-5.1 (with low reasoning)
- **Character Form Parsing:** OpenAI GPT-5-mini (with none reasoning)
- **Image Generation:** Replicate API (google/nano-banana-pro)

### 2.4 Communication
- **Email:** Gmail SMTP (info@usillustrations.com)
- **SMS:** Quo.com API (formerly OpenPhone)
- **Notifications:** Slack Webhooks

### 2.5 File Parsing
- **PDF Parsing:** pdf-parse library
- **DOCX Parsing:** mammoth library
- **TXT Files:** Direct text extraction

### 2.6 Deployment
- **Platform:** Cloudflare Pages
- **Repository:** GitHub
- **Environment Variables:** Cloudflare dashboard

---

## 3. DATABASE SCHEMA (Supabase PostgreSQL)

### 3.1 Projects Table
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_title VARCHAR(255) NOT NULL,
  author_firstname VARCHAR(100) NOT NULL,
  author_lastname VARCHAR(100) NOT NULL,
  author_email VARCHAR(255) NOT NULL,
  author_phone VARCHAR(20) NOT NULL,
  review_token VARCHAR(32) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  aspect_ratio VARCHAR(20),
  text_integration VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Status values:** 
- draft
- character_review
- character_generation
- character_approval
- sketch_generation
- sketch_ready
- completed
- character_form_pending
- character_generation_complete
- characters_approved
- character_revision_needed

### 3.2 Characters Table
```sql
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255),
  role VARCHAR(255),
  appears_in TEXT[],
  story_role TEXT,
  is_main BOOLEAN DEFAULT FALSE,
  age VARCHAR(50),
  ethnicity VARCHAR(100),
  skin_color VARCHAR(100),
  hair_color VARCHAR(100),
  hair_style VARCHAR(100),
  eye_color VARCHAR(100),
  clothing VARCHAR(255),
  accessories VARCHAR(255),
  special_features TEXT,
  gender VARCHAR(50),
  image_url TEXT,
  form_pdf_url TEXT,
  generation_prompt TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.3 Pages Table
```sql
CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  story_text TEXT NOT NULL,
  scene_description TEXT,
  description_auto_generated BOOLEAN DEFAULT FALSE,
  character_ids UUID[],
  sketch_url TEXT,
  sketch_prompt TEXT,
  illustration_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, page_number)
);
```

### 3.4 Reviews Table
```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  review_type VARCHAR(50),
  feedback TEXT,
  status VARCHAR(50),
  submitted_at TIMESTAMP DEFAULT NOW()
);
```

### 3.5 Storage Buckets (Supabase Storage)
- **project-files:** Public bucket for story files, PDFs
- **character-images:** Public bucket for character illustrations

---

## 4. KEY DECISIONS & CHANGES FROM ORIGINAL SPEC

### 4.1 Technology Changes
- ✅ **Supabase PostgreSQL** instead of Cloudflare D1 (better DX, migrations, proven)
- ✅ **Supabase Storage** instead of Cloudflare R2 (one dashboard, simpler)
- ✅ **OpenAI GPT-4o** instead of GPT-4.5 (actual available model)
- ✅ **OpenAI GPT-4o-mini** for character form parsing (cost-effective)

### 4.2 UI/UX Decisions
- ✅ **Light mode only** - NO dark mode (simpler, unnecessary complexity)
- ✅ **NO Framer Motion** - Simple CSS transitions only (reduces bundle size)
- ✅ **Mobile responsive** - Critical for customer review pages
- ✅ **Modern, clean UI** - Using shadcn/ui components

### 4.3 Implementation Decisions
- ✅ **UUID for review tokens** - Simple and sufficient (not crypto-secure)
- ✅ **Manual retry for errors** - No automatic retry logic
- ✅ **Phase 1 only** - NO coloring feature (sketches only)
- ✅ **Character form parsing** - GPT-4o with direct PDF attachment (simpler, handles scanned PDFs)

### 4.4 File Parsing Approach
- ✅ **PDF:** pdf-parse library (simple, reliable) - for story files
- ✅ **DOCX:** mammoth library (text extraction) - for story files
- ✅ **Character Form PDF:** Direct PDF upload to OpenAI → GPT-4o vision model → JSON structure (no text extraction needed)

---

## 5. CHARACTER FORM PARSING (FINAL APPROACH - DIRECT PDF ATTACHMENT)

### 5.1 Process
1. Upload PDF directly to OpenAI Files API (`/v1/files`)
2. Send file_id to GPT-4o (vision model) with structured prompt
3. GPT-4o analyzes PDF directly (text + images/layout)
4. Return JSON with all character fields
5. Handle "N/A", empty fields, "Illustrator's choice" automatically
6. Clean up uploaded file after processing

### 5.2 GPT Prompt Structure
```
Extract character information from this PDF form and return as JSON.

Extract these exact fields (use null if field is missing, empty, or says "N/A"):
- name, age, ethnicity, skin_color, hair_color, hair_style, 
  eye_color, clothing, accessories, special_features, gender

Rules:
- If field says "N/A", "n/a", "N.A.", return null
- If field says "Illustrator's choice", return that exact text
- If field is blank/empty, return null
- Keep original text exactly as written
```

### 5.3 Model Settings
- **Model:** gpt-4o (vision model required for PDF processing)
- **Temperature:** 0 (for consistency)
- **Response Format:** JSON object
- **Cost:** ~$0.01-0.05 per form (5-50x more expensive than text extraction, but simpler and handles scanned PDFs better)

### 5.4 Advantages
- ✅ No pdf-parse library needed
- ✅ Simpler code (one step instead of two)
- ✅ Handles scanned PDFs better (vision model sees layout)
- ✅ Works even if text extraction would fail
- ⚠️ Higher cost (~10-50x more expensive than text extraction)

---

## 6. IMPLEMENTATION PRIORITY

### Phase 1: Foundation ✅ COMPLETE
1. ✅ Project setup (Next.js, Tailwind, shadcn/ui)
2. ✅ Supabase database schema
3. ✅ Supabase storage buckets
4. ✅ Authentication (password-protected admin)
5. ✅ Admin login and dashboard

### Phase 2: Project Creation (IN PROGRESS)
1. Project creation form
2. File uploads (main character image, form PDF, story file)
3. Backend processing and file storage

### Phase 3: Story & Character Processing
1. Story parsing (PDF/DOCX/TXT)
2. Character form PDF parsing
3. Character identification (GPT-4o)
4. Character generation (Replicate)

### Phase 4: Customer Workflow
1. Customer review pages (mobile-responsive)
2. Character approval flow
3. Email/SMS notifications

### Phase 5: Sketch Generation
1. Sketch generation API
2. Sketch editing/regeneration
3. Bulk download

---

## 7. ENVIRONMENT VARIABLES

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# Replicate
REPLICATE_API_TOKEN=

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=info@usillustrations.com
SMTP_PASSWORD=your-gmail-app-password

# SMS (Quo.com)
QUO_API_KEY=
QUO_PHONE_NUMBER=

# Slack
SLACK_WEBHOOK_URL=

# Admin Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=

# App Config
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 8. PROJECT STRUCTURE

```
usi-platform/
├── app/
│   ├── admin/              # Admin dashboard pages
│   │   ├── layout.tsx      # Auth-protected layout
│   │   └── dashboard/      # Project list
│   ├── login/              # Login page (outside admin)
│   ├── review/             # Customer review pages (to be created)
│   └── api/                # API routes
├── components/
│   └── ui/                 # shadcn/ui components
├── lib/
│   ├── ai/                 # OpenAI, Replicate integrations
│   ├── supabase/           # Supabase clients
│   └── utils/              # File parsing, prompts, etc.
└── types/                  # TypeScript definitions
```

---

## 9. KEY FEATURES SPECIFICATIONS

### 9.1 Project Creation
- Form fields: Book title, author info (firstname, lastname, email, phone)
- File uploads: Main character image, character form PDF, story file
- Auto-generate unique review_token (UUID)
- Upload files to Supabase Storage
- Parse character form PDF
- Trigger story parsing and character identification

### 9.2 Story Parsing
- Support PDF, DOCX, TXT formats
- Parse by "Illustration X" pattern
- Extract story text and descriptions
- Auto-generate missing scene descriptions with GPT-4o

### 9.3 Character Identification
- Use GPT-4o to analyze full story
- Identify important characters (exclude background/generic)
- Extract: name/role, page appearances, story role
- Create character records in database

### 9.4 Character Generation
- Use Replicate nano-banana-pro model
- Reference main character image
- Build prompts from character details
- Remove metadata from generated images
- Store in Supabase Storage

### 9.5 Customer Review Flow
- Unique URL: `/review/{token}`
- Mobile-responsive design
- Character form input page
- Character image approval page
- Email + SMS notifications

### 9.6 Sketch Generation
- Black & white pencil sketches only
- Aspect ratio selection (8:10, 8.5:8.5, 8.5:11)
- Text integration option (separate vs integrated)
- Use Replicate nano-banana-pro
- Bulk download functionality

---

## 10. ERROR HANDLING

- **Manual retry only** - No automatic retry logic
- User-initiated regeneration/retry
- Clear error messages
- Fallback to manual processes if needed

---

## 11. DEPLOYMENT

- **Hosting:** Cloudflare Pages
- **Database:** Supabase (managed PostgreSQL)
- **Storage:** Supabase Storage
- **CI/CD:** GitHub → Cloudflare Pages
- **Environment Variables:** Set in Cloudflare dashboard

---

## 12. NOTES

- Phase 2 (colored illustrations) is NOT included in initial build
- Focus is on sketch generation workflow only
- All customer-facing pages must be mobile-responsive
- Keep UI simple and clean - no unnecessary animations
- Use light mode only throughout the application

---

**End of Document**

