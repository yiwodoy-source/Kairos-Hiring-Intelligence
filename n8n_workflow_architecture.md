# n8n Workflow Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI-POWERED CANDIDATE SOURCING WORKFLOW                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              WORKFLOW TRIGGER                                │
└─────────────────────────────────────────────────────────────────────────────┘

    [Manual Trigger] ──────────────────────────────────────────────────────┐
         │                                                                  │
         │                                                                  │
         ▼                                                                  │
    ┌─────────────────────┐                                                │
    │ Workflow Config     │  ← Serper API Key                              │
    │ - Company Name      │  ← Company Name                                │
    │ - Recruiter Name    │  ← Recruiter Name                              │
    └─────────────────────┘                                                │
         │                                                                  │
         │                                                                  │
         ▼                                                                  │
    ┌─────────────────────┐                                                │
    │ Job Input Details   │  ← Role (e.g., "Senior Backend Engineer")      │
    │ - Role              │  ← Skills (e.g., "Node.js, AWS, Python")       │
    │ - Skills            │  ← Experience (e.g., "5+")                      │
    │ - Experience        │  ← Location (e.g., "Remote")                    │
    │ - Location          │                                                 │
    └─────────────────────┘                                                │
         │                                                                  │
         │                                                                  │
         ├──────────────────────────────────┬─────────────────────────────┘
         │                                  │
         │ BRANCH 1: CANDIDATE SOURCING     │ BRANCH 2: SOCIAL MEDIA
         │                                  │
         ▼                                  ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                         BRANCH 1: CANDIDATE SOURCING                         │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────┐
    │ AI Query Builder    │  ← OpenAI GPT-4.1-mini
    │ (AI Agent)          │  ← Query Output Parser (JSON)
    │                     │
    │ Generates:          │
    │ - Boolean queries   │
    │ - LinkedIn filters  │
    │ - GitHub searches   │
    └─────────────────────┘
         │
         │ Output: ["query1", "query2", "query3"]
         ▼
    ┌─────────────────────┐
    │ Search Public       │  ← Serper API (Google Search)
    │ Profiles            │  ← API Key from config
    │ (HTTP Request)      │
    │                     │
    │ Searches:           │
    │ - LinkedIn profiles │
    │ - GitHub profiles   │
    │ - Tech blogs        │
    └─────────────────────┘
         │
         │ Output: Search results with URLs, snippets
         ▼
    ┌─────────────────────┐
    │ AI Candidate        │  ← OpenAI GPT-4.1-mini
    │ Extractor           │  ← Candidate Output Parser (JSON)
    │ (AI Agent)          │
    │                     │
    │ Extracts:           │
    │ - Name              │
    │ - Current role      │
    │ - Company           │
    │ - Skills array      │
    │ - Experience years  │
    │ - Profile URL       │
    └─────────────────────┘
         │
         │ Output: Array of candidate objects
         │
         │ ⚠️ MISSING: Email addresses (not in public search)
         │
         ▼
    ┌─────────────────────┐
    │ [OPTIONAL]          │  ← Hunter.io / Apollo.io / Snov.io
    │ Email Enrichment    │  ← API Key from config
    │ (HTTP Request)      │
    │                     │
    │ Finds:              │
    │ - Email address     │
    │ - Confidence score  │
    └─────────────────────┘
         │
         │ Output: Candidate + email + confidence
         ▼
    ┌─────────────────────┐
    │ Store Candidates    │  ← Google Sheets API
    │ (Google Sheets)     │  ← OAuth2 credentials
    │                     │
    │ Saves to sheet:     │
    │ - All candidate data│
    │ - Status: "New"     │
    └─────────────────────┘
         │
         │ Output: Stored candidates with row IDs
         ▼
    ┌─────────────────────┐
    │ AI Email Drafter    │  ← OpenAI GPT-4.1-mini
    │ (AI Agent)          │  ← Email Output Parser (JSON)
    │                     │
    │ Generates:          │
    │ - Subject line      │
    │ - Personalized body │
    │ - Call-to-action    │
    └─────────────────────┘
         │
         │ Output: { subject: "...", body: "..." }
         ▼
    ┌─────────────────────┐
    │ Send Email          │  ← Gmail API
    │ (Gmail)             │  ← OAuth2 credentials
    │                     │
    │ Sends:              │
    │ - To: candidate     │
    │ - From: recruiter   │
    │ - Personalized msg  │
    └─────────────────────┘
         │
         │ Output: Email sent confirmation
         ▼
    ┌─────────────────────┐
    │ Update Candidate    │  ← Google Sheets API
    │ Status              │  ← Updates same sheet
    │ (Google Sheets)     │
    │                     │
    │ Updates:            │
    │ - Status: "Sent"    │
    │ - Date: timestamp   │
    └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        BRANCH 2: SOCIAL MEDIA POSTING                        │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────┐
    │ AI Social Media     │  ← OpenAI GPT-4.1-mini
    │ Post Generator      │  ← Social Media Output Parser (JSON)
    │ (AI Agent)          │
    │                     │
    │ Generates:          │
    │ - LinkedIn post     │
    │ - Twitter/X post    │
    │ - Facebook post     │
    │ - Telegram post     │
    └─────────────────────┘
         │
         │ Output: { linkedin_post, twitter_post, facebook_post, telegram_post }
         │
         ├──────────┬──────────┬──────────┬──────────┐
         │          │          │          │          │
         ▼          ▼          ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │LinkedIn│ │Twitter │ │Facebook│ │Telegram│
    │  API   │ │  API   │ │  API   │ │  API   │
    └────────┘ └────────┘ └────────┘ └────────┘
         │          │          │          │
         │          │          │          │
         └──────────┴──────────┴──────────┘
                     │
                     ▼
              [Job Posted on
               Social Media]

┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA FLOW SUMMARY                                 │
└─────────────────────────────────────────────────────────────────────────────┘

INPUT:
  Job Details (role, skills, experience, location)

PROCESSING:
  1. Generate Boolean search queries (AI)
  2. Search Google for candidate profiles (Serper API)
  3. Extract candidate data from results (AI)
  4. Enrich with email addresses (Hunter.io/Apollo/Snov)
  5. Store in Google Sheets
  6. Generate personalized emails (AI)
  7. Send emails via Gmail
  8. Update candidate status
  
  Parallel:
  9. Generate social media posts (AI)
  10. Post to LinkedIn, Twitter, Facebook, Telegram

OUTPUT:
  - Candidates stored in Google Sheets
  - Personalized emails sent
  - Job posted on social media

┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL DEPENDENCIES                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐
│ APIs & Services     │
├─────────────────────┤
│ ✓ OpenAI API       │ ← AI language model (GPT-4.1-mini)
│ ✓ Serper API       │ ← Google search results
│ ✓ Google Sheets    │ ← Candidate database
│ ✓ Gmail API        │ ← Email sending
│ ○ Hunter.io        │ ← Email enrichment (optional)
│ ○ Apollo.io        │ ← Email enrichment (optional)
│ ○ Snov.io          │ ← Email enrichment (optional)
│ ○ LinkedIn API     │ ← Social posting (optional)
│ ○ Twitter API      │ ← Social posting (optional)
│ ○ Facebook API     │ ← Social posting (optional)
│ ○ Telegram Bot API │ ← Social posting (optional)
└─────────────────────┘

Legend:
  ✓ = Required for basic functionality
  ○ = Optional / Recommended

┌─────────────────────────────────────────────────────────────────────────────┐
│                            COST ESTIMATION                                   │
└─────────────────────────────────────────────────────────────────────────────┘

For 100 candidates/month:

┌──────────────────┬─────────────┬──────────────────────────────┐
│ Service          │ Cost        │ Notes                        │
├──────────────────┼─────────────┼──────────────────────────────┤
│ Serper API       │ FREE        │ 100 searches/month free      │
│ OpenAI API       │ ~$2-5       │ Using n8n free credits first │
│ Google Sheets    │ FREE        │ Included with Google account │
│ Gmail            │ FREE        │ 500 emails/day limit         │
│ Hunter.io        │ $49/month   │ For email enrichment         │
│ LinkedIn         │ FREE        │ Manual posting recommended   │
│ Twitter          │ FREE        │ Free tier available          │
│ Facebook         │ FREE        │ Free API access              │
│ Telegram         │ FREE        │ Bot API is free              │
├──────────────────┼─────────────┼──────────────────────────────┤
│ TOTAL (minimal)  │ ~$50/month  │ With email enrichment        │
│ TOTAL (no email) │ ~$5/month   │ Manual email entry           │
└──────────────────┴─────────────┴──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATION POINTS                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Your Nexus HR AI App ←──────────────────────────────────────┐
         │                                                    │
         │ Option 1: Webhook Trigger                         │
         ├───────────────────────────────────────────────────┤
         │ POST /webhook/candidate-sourcing                  │
         │ Body: { role, skills, experience, location }      │
         │                                                    │
         │ Option 2: n8n API                                 │
         ├───────────────────────────────────────────────────┤
         │ POST /api/v1/workflows/{id}/execute               │
         │ Headers: { X-N8N-API-KEY: "..." }                 │
         │                                                    │
         │ Option 3: Shared Database                         │
         ├───────────────────────────────────────────────────┤
         │ PostgreSQL (instead of Google Sheets)             │
         │ Direct database access from both apps             │
         │                                                    │
         └───────────────────────────────────────────────────┘
                              │
                              ▼
                      n8n Workflow Executes
                              │
                              ▼
                    Candidates Stored in DB
                              │
                              ▼
              Your App Displays Candidates in UI

┌─────────────────────────────────────────────────────────────────────────────┐
│                          SUCCESS METRICS                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Track these KPIs:

1. Candidates Found per Search: 10-50 (depends on query)
2. Email Match Rate: 60-80% (with Hunter.io)
3. Email Delivery Rate: 95%+ (avoid bounces)
4. Email Open Rate: 20-30% (industry average)
5. Response Rate: 5-10% (good for cold outreach)
6. Cost per Candidate: ~$0.50-1.00 (with email enrichment)

┌─────────────────────────────────────────────────────────────────────────────┐
│                       WORKFLOW EXECUTION TIME                                │
└─────────────────────────────────────────────────────────────────────────────┘

Estimated time per execution:

1. AI Query Builder: 3-5 seconds
2. Search Public Profiles: 2-3 seconds
3. AI Candidate Extractor: 5-10 seconds
4. Email Enrichment (per candidate): 1-2 seconds
5. Store Candidates: 1-2 seconds
6. AI Email Drafter (per candidate): 3-5 seconds
7. Send Email (per candidate): 1-2 seconds
8. Update Status: 1-2 seconds

Total for 10 candidates: ~2-3 minutes
Total for 50 candidates: ~8-12 minutes

┌─────────────────────────────────────────────────────────────────────────────┐
│                          NEXT STEPS                                          │
└─────────────────────────────────────────────────────────────────────────────┘

1. ✅ Import workflow to n8n
2. ✅ Configure Serper API key
3. ✅ Set up Google Sheets
4. ✅ Configure Gmail OAuth
5. ✅ Run first test
6. ⚠️ Add email enrichment (recommended)
7. ○ Configure social media (optional)
8. ○ Integrate with your app (optional)
9. ○ Set up scheduling (optional)
10. ○ Monitor and optimize

Start with steps 1-5, then expand based on your needs!
```
