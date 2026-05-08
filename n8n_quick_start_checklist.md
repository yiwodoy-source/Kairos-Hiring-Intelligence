# n8n Workflow Quick Start Checklist

## 🎯 Goal
Get your AI-Powered Candidate Sourcing workflow up and running in 30 minutes.

---

## ✅ Phase 1: Essential Setup (15 minutes)

### 1. Import Workflow to n8n
- [ ] Open n8n (http://localhost:5678 or your n8n instance)
- [ ] Go to Workflows → Import from File
- [ ] Select: `AI-Powered Candidate Sourcing and Personalized Outreach Automation.json`
- [ ] Click Import

### 2. Get Serper API Key (5 minutes)
- [ ] Visit: https://serper.dev/
- [ ] Sign up for free account
- [ ] Go to Dashboard → API Keys
- [ ] Copy your API key
- [ ] Paste in Workflow Configuration node → `serperApiKey` field

### 3. Create Google Sheet (3 minutes)
- [ ] Visit: https://sheets.google.com
- [ ] Create new spreadsheet: "Candidate Sourcing Database"
- [ ] Rename Sheet1 to: "Candidates"
- [ ] Add column headers (copy-paste this row):
  ```
  name | current_role | company | skills | experience_years | profile_url | email | status | email_sent_date
  ```
- [ ] Copy Sheet ID from URL (between `/d/` and `/edit`)
- [ ] Paste Sheet ID in both:
  - Store Candidates node → `documentId` field
  - Update Candidate Status node → `documentId` field

### 4. Configure Google Sheets Credentials (3 minutes)
- [ ] In n8n, click on "Store Candidates" node
- [ ] Click "Credential to connect with" dropdown
- [ ] Click "Create New Credential"
- [ ] Select "Google Sheets OAuth2 API"
- [ ] Click "Connect my account"
- [ ] Authorize n8n to access your Google Sheets
- [ ] Save credential
- [ ] Apply same credential to "Update Candidate Status" node

### 5. Configure Gmail Credentials (3 minutes)
- [ ] In n8n, click on "Send Email" node
- [ ] Click "Credential to connect with" dropdown
- [ ] Click "Create New Credential"
- [ ] Select "Gmail OAuth2 API"
- [ ] Click "Connect my account"
- [ ] Authorize n8n to send emails from your Gmail
- [ ] Save credential

### 6. Update Workflow Configuration (1 minute)
- [ ] Click on "Workflow Configuration" node
- [ ] Update these values:
  - `companyName`: "Nexus HR AI" (or your company name)
  - `recruiterName`: "Your Name"

---

## ✅ Phase 2: First Test Run (5 minutes)

### 7. Configure Test Job
- [ ] Click on "Job Input Details" node
- [ ] Fill in test job details:
  ```
  role: "Senior Backend Engineer"
  skills: "Node.js, Python, AWS"
  experience: "5+"
  location: "Remote"
  ```

### 8. Disable Email Sending (for testing)
- [ ] Click on "Send Email" node
- [ ] Click the three dots (⋮) → "Disable"
- [ ] This prevents sending actual emails during testing

### 9. Run Test
- [ ] Click "Test workflow" button (top right)
- [ ] Watch each node execute
- [ ] Check for green checkmarks ✓ on each node

### 10. Verify Results
- [ ] Open your Google Sheet
- [ ] Verify candidates were added
- [ ] Check if data looks correct (name, role, company, skills)

---

## ✅ Phase 3: Email Enrichment (Optional - 10 minutes)

**⚠️ Note:** The workflow will NOT find candidate emails from public searches. You need to add email enrichment.

### Option A: Use Hunter.io (Recommended)
- [ ] Visit: https://hunter.io/
- [ ] Sign up for free account (25 searches/month)
- [ ] Get API key from dashboard
- [ ] Follow instructions in: `n8n_email_enrichment_guide.md`

### Option B: Manual Email Entry
- [ ] Skip email enrichment for now
- [ ] Manually add emails to Google Sheet
- [ ] Re-enable "Send Email" node
- [ ] Test sending emails

---

## ✅ Phase 4: Social Media (Optional - 15 minutes)

### 11. Configure Telegram (Easiest)
- [ ] Open Telegram app
- [ ] Search for: @BotFather
- [ ] Send: `/newbot`
- [ ] Follow instructions to create bot
- [ ] Copy Bot Token
- [ ] Create a channel or group
- [ ] Add your bot as admin
- [ ] Get Chat ID (see guide for details)
- [ ] In n8n, configure Telegram credentials
- [ ] Update "Post to Telegram" node with Chat ID

### 12. Configure LinkedIn (Optional)
- [ ] Follow LinkedIn OAuth setup in main guide
- [ ] ⚠️ Warning: Automated posting may violate LinkedIn ToS

### 13. Configure Twitter/X (Optional)
- [ ] Follow Twitter API setup in main guide
- [ ] Requires Twitter Developer account

### 14. Configure Facebook (Optional)
- [ ] Follow Facebook Graph API setup in main guide
- [ ] Requires Facebook Developer account

---

## ✅ Phase 5: Integration with Nexus HR AI (Optional - 20 minutes)

### 15. Set Up Webhook Trigger
- [ ] In n8n workflow, replace "Manual Trigger" with "Webhook" node
- [ ] Copy webhook URL
- [ ] In your React app, add API call to trigger workflow

### 16. Test Integration
- [ ] From your Nexus HR AI app, trigger the workflow
- [ ] Verify candidates appear in Google Sheet
- [ ] Verify candidates sync back to your app (if configured)

---

## 🎉 Success Criteria

After completing Phase 1 & 2, you should have:
- ✅ Workflow successfully imports and runs
- ✅ Google search queries are generated
- ✅ Candidate profiles are extracted from search results
- ✅ Candidates are stored in Google Sheet
- ✅ Personalized emails are drafted (but not sent yet)

---

## 🚨 Troubleshooting Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| "Serper API error" | Check API key is correct, verify you have credits |
| "Google Sheets not found" | Verify Sheet ID, check OAuth permissions |
| "No candidates found" | Search query too specific, try broader terms |
| "OpenAI error" | n8n free credits may be exhausted, add your own API key |
| "Email node fails" | Expected - candidates don't have emails yet |

---

## 📚 Next Steps

Once basic workflow is running:

1. **Add email enrichment** (see `n8n_email_enrichment_guide.md`)
2. **Enable email sending** (after testing with your own email first)
3. **Set up scheduling** (run automatically daily/weekly)
4. **Configure social media** (if needed)
5. **Integrate with your app** (webhook or API)
6. **Monitor and optimize** (track success rates, adjust queries)

---

## 📞 Need Help?

- **Full Setup Guide:** `n8n_workflow_setup_guide.md`
- **Email Enrichment:** `n8n_email_enrichment_guide.md`
- **Configuration Template:** `n8n_config_template.env`
- **n8n Community:** https://community.n8n.io/

---

**Estimated Time to First Working Workflow:** 20-30 minutes  
**Estimated Time to Production-Ready:** 1-2 hours (with email enrichment)

---

## 🎯 Your Current Status

Mark your progress:

- [ ] Phase 1: Essential Setup (REQUIRED)
- [ ] Phase 2: First Test Run (REQUIRED)
- [ ] Phase 3: Email Enrichment (RECOMMENDED)
- [ ] Phase 4: Social Media (OPTIONAL)
- [ ] Phase 5: App Integration (OPTIONAL)

**Start with Phase 1 & 2 - you can add the rest later!**
