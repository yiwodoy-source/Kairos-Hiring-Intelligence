# 🚀 n8n Workflow Setup - Interactive Walkthrough

**Current Time:** 2025-12-09 17:39 IST  
**Estimated Time:** 30-45 minutes  
**Your Progress:** 0% ░░░░░░░░░░

---

## 📍 WHERE YOU ARE NOW

✅ You have the n8n workflow JSON file  
✅ You have Serper.dev open in your browser  
⬜ You need to sign up for Serper API  
⬜ You need to set up Google Sheets  
⬜ You need to configure n8n  

---

## 🎯 STEP 1: GET SERPER API KEY (5 minutes)

### Current Status: Serper.dev is open, you're not logged in

### Actions to take:

1. **In your browser (Serper.dev tab):**
   - Click the **"Sign up"** button (top right)
   - OR click **"Get 2,500 free queries"** button

2. **Sign up with Google:**
   - Choose "Sign up with Google" (easiest)
   - Select your Google account
   - Authorize Serper

3. **Get your API key:**
   - After login, you'll be redirected to Dashboard
   - Look for "API Keys" section or menu
   - Click "Create API Key" or copy existing key
   - **IMPORTANT:** Copy this key and paste it below

4. **Save your API key here:**
   ```
   SERPER_API_KEY=_______________________________________________
   ```

### ✅ Checkpoint:
- [ ] I have signed up for Serper.dev
- [ ] I can see my Dashboard
- [ ] I have copied my API key
- [ ] I have pasted it above

---

## 🎯 STEP 2: CREATE GOOGLE SHEET (5 minutes)

### Actions to take:

1. **Open Google Sheets:**
   - Go to: https://sheets.google.com
   - Click "+ Blank" to create new spreadsheet

2. **Name your spreadsheet:**
   - Click "Untitled spreadsheet" at top
   - Rename to: **"Candidate Sourcing Database"**

3. **Rename the sheet:**
   - At the bottom, right-click "Sheet1"
   - Click "Rename"
   - Change to: **"Candidates"**

4. **Add column headers:**
   - In Row 1, add these exact headers (copy-paste):
   
   | A | B | C | D | E | F | G | H | I |
   |---|---|---|---|---|---|---|---|---|
   | name | current_role | company | skills | experience_years | profile_url | email | status | email_sent_date |

5. **Get your Sheet ID:**
   - Look at the URL in your browser
   - It looks like: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
   - Copy the part between `/d/` and `/edit`
   - Example: `1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t`

6. **Save your Sheet ID here:**
   ```
   GOOGLE_SHEET_ID=_______________________________________________
   ```

### ✅ Checkpoint:
- [ ] I have created a Google Sheet
- [ ] I have renamed it to "Candidate Sourcing Database"
- [ ] I have added all column headers
- [ ] I have copied the Sheet ID
- [ ] I have pasted it above

---

## 🎯 STEP 3: IMPORT WORKFLOW TO n8n (3 minutes)

### Prerequisites:
- You need n8n installed and running
- If you don't have n8n, see "Installing n8n" section below

### Actions to take:

1. **Open n8n:**
   - Go to: http://localhost:5678 (or your n8n URL)
   - If not running, start n8n first

2. **Import the workflow:**
   - Click "Workflows" in the left sidebar
   - Click "+ Add workflow" dropdown
   - Select "Import from File"
   - Browse to: `C:\Users\it.support\Downloads\AI-Powered Candidate Sourcing and Personalized Outreach Automation.json`
   - Click "Import"

3. **Verify import:**
   - You should see the workflow canvas with all nodes
   - Check that you see: Manual Trigger, Workflow Configuration, Job Input Details, etc.

### ✅ Checkpoint:
- [ ] n8n is running
- [ ] Workflow is imported
- [ ] I can see all the nodes on the canvas

---

## 🎯 STEP 4: CONFIGURE WORKFLOW NODES (10 minutes)

### 4.1 Update "Workflow Configuration" Node

1. **Click on "Workflow Configuration" node**
2. **Update the values:**
   - `serperApiKey`: Paste your Serper API key from Step 1
   - `companyName`: Enter "Nexus HR AI" (or your company name)
   - `recruiterName`: Enter your name

3. **Click "Execute Node" to test**
4. **Verify output shows your values**

### 4.2 Update "Store Candidates" Node

1. **Click on "Store Candidates" node**
2. **Configure Google Sheets credential:**
   - Click "Credential to connect with" dropdown
   - Click "Create New Credential"
   - Select "Google Sheets OAuth2 API"
   - Click "Connect my account"
   - **A popup will open - authorize n8n to access Google Sheets**
   - After authorization, click "Save"

3. **Update Sheet ID:**
   - In "Document" field, click the dropdown
   - Select "From list" → "By ID"
   - Paste your Google Sheet ID from Step 2
   - In "Sheet" field, select "Candidates"

4. **Save the node**

### 4.3 Update "Update Candidate Status" Node

1. **Click on "Update Candidate Status" node**
2. **Use same Google Sheets credential:**
   - Click "Credential to connect with" dropdown
   - Select the credential you just created
3. **Update Sheet ID:**
   - Same as above - paste your Sheet ID
   - Select "Candidates" sheet
4. **Save the node**

### 4.4 Configure "Send Email" Node

1. **Click on "Send Email" node**
2. **Configure Gmail credential:**
   - Click "Credential to connect with" dropdown
   - Click "Create New Credential"
   - Select "Gmail OAuth2 API"
   - Click "Connect my account"
   - **A popup will open - authorize n8n to send emails**
   - After authorization, click "Save"

3. **IMPORTANT: Disable this node for now**
   - Right-click the "Send Email" node
   - Select "Disable"
   - This prevents sending actual emails during testing

### ✅ Checkpoint:
- [ ] Workflow Configuration node has my API key and details
- [ ] Google Sheets credential is created and working
- [ ] Both Google Sheets nodes are configured with my Sheet ID
- [ ] Gmail credential is created
- [ ] Send Email node is DISABLED for testing

---

## 🎯 STEP 5: CONFIGURE TEST JOB (2 minutes)

### Actions to take:

1. **Click on "Job Input Details" node**
2. **Enter test job details:**
   ```
   role: "Senior Backend Engineer"
   skills: "Node.js, Python, AWS, Docker"
   experience: "5+"
   location: "Remote"
   ```
3. **Save the node**

### ✅ Checkpoint:
- [ ] Job details are filled in
- [ ] Node is saved

---

## 🎯 STEP 6: RUN YOUR FIRST TEST (5 minutes)

### Actions to take:

1. **Save the workflow:**
   - Click "Save" button (top right)
   - Name it: "AI Candidate Sourcing - Production"

2. **Click "Test workflow" button** (top right)

3. **Watch the execution:**
   - Nodes will execute one by one
   - Green checkmarks ✓ = success
   - Red X = error
   - Click on each node to see the output

4. **Expected results:**
   - ✅ Manual Trigger: Executes
   - ✅ Workflow Configuration: Shows your config
   - ✅ Job Input Details: Shows job details
   - ✅ AI Query Builder: Generates search queries
   - ✅ Search Public Profiles: Returns Google results
   - ✅ AI Candidate Extractor: Extracts candidates
   - ✅ Store Candidates: Saves to Google Sheet
   - ✅ AI Email Drafter: Generates email drafts
   - ⚠️ Send Email: DISABLED (won't execute)
   - ⚠️ Update Candidate Status: May skip if email disabled

5. **Check your Google Sheet:**
   - Open your "Candidate Sourcing Database" sheet
   - You should see candidates added!
   - Check: names, roles, companies, skills

### ✅ Checkpoint:
- [ ] Workflow executed without errors
- [ ] I can see candidates in my Google Sheet
- [ ] Candidate data looks reasonable (real names, companies)

---

## 🎯 STEP 7: REVIEW RESULTS (5 minutes)

### What to check:

1. **In your Google Sheet:**
   - How many candidates were found? (Typical: 5-20)
   - Do they match the job requirements?
   - Are the skills relevant?
   - Are profile URLs valid?

2. **In n8n - Click "AI Email Drafter" node:**
   - Review the generated emails
   - Are they personalized?
   - Do they mention candidate's skills?
   - Is the tone professional?

3. **Check for missing data:**
   - ⚠️ **Email addresses:** Probably empty or missing
   - This is NORMAL - public searches don't include emails
   - You'll need email enrichment (next step)

### ✅ Checkpoint:
- [ ] Candidates look relevant to the job
- [ ] Email drafts are personalized and professional
- [ ] I understand that emails are missing (expected)

---

## 🎯 NEXT STEPS: WHAT'S MISSING?

### ⚠️ Critical: Email Addresses

Your workflow is working, but candidates don't have email addresses. You have 3 options:

### Option 1: Add Email Enrichment (Recommended)
- **Cost:** $49/month (Hunter.io - 500 searches)
- **Time:** 15 minutes to set up
- **Accuracy:** 60-80% email match rate
- **See:** `n8n_email_enrichment_guide.md`

### Option 2: Manual Email Entry (Free)
- **Cost:** $0
- **Time:** 5-10 minutes per candidate
- **Accuracy:** 100% (you verify manually)
- **Process:**
  1. Look up candidates on LinkedIn
  2. Find their email (LinkedIn, company website, etc.)
  3. Add to Google Sheet manually
  4. Create second workflow to send emails

### Option 3: Use LinkedIn InMail Instead
- **Cost:** LinkedIn Premium/Recruiter Lite ($99/month)
- **Time:** Manual outreach
- **Accuracy:** 100% delivery (in-platform messaging)
- **Process:** Export candidates, reach out via LinkedIn

---

## 🎯 OPTIONAL: SOCIAL MEDIA POSTING

Your workflow also has a social media posting branch. To enable:

### Telegram (Easiest - 10 minutes)
1. Open Telegram, search for @BotFather
2. Send `/newbot` and follow instructions
3. Create a channel/group and add your bot
4. Get Chat ID (see guide)
5. Configure in n8n

### LinkedIn, Twitter, Facebook (Advanced - 30+ minutes each)
- Requires developer accounts
- OAuth setup
- May violate ToS for automated posting
- **Recommendation:** Post manually or use scheduling tools like Buffer/Hootsuite

---

## 🎯 OPTIONAL: INTEGRATE WITH YOUR APP

You can trigger this workflow from your Nexus HR AI application:

### Option A: Webhook Trigger (Easiest)
1. In n8n, replace "Manual Trigger" with "Webhook" node
2. Copy webhook URL
3. In your React app (`SourcingView.tsx`), add:
   ```typescript
   const triggerSourcing = async (jobData) => {
     await fetch('YOUR_WEBHOOK_URL', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(jobData)
     });
   };
   ```

### Option B: Shared Database (Advanced)
1. Replace Google Sheets with PostgreSQL
2. Use same database as your Nexus HR AI app
3. Candidates appear directly in your app

---

## 📊 YOUR SETUP STATUS

Update this as you complete each step:

- [ ] ✅ STEP 1: Serper API key obtained
- [ ] ✅ STEP 2: Google Sheet created
- [ ] ✅ STEP 3: Workflow imported to n8n
- [ ] ✅ STEP 4: All nodes configured
- [ ] ✅ STEP 5: Test job configured
- [ ] ✅ STEP 6: First test run successful
- [ ] ✅ STEP 7: Results reviewed
- [ ] ⬜ NEXT: Email enrichment added
- [ ] ⬜ NEXT: Email sending enabled
- [ ] ⬜ NEXT: Social media configured
- [ ] ⬜ NEXT: Integrated with app

---

## 🆘 TROUBLESHOOTING

### "Serper API authentication failed"
- Check if API key is correct (no extra spaces)
- Verify you have remaining credits (check Serper dashboard)
- Make sure you're using the correct key format

### "Google Sheets not found"
- Verify Sheet ID is correct
- Check OAuth authorization is complete
- Make sure sheet name is exactly "Candidates"

### "No candidates found"
- Search query might be too specific
- Try broader skills (e.g., "Python" instead of "Python 3.11")
- Check Serper results - are there actual search results?

### "OpenAI API error"
- n8n free credits may be exhausted
- Add your own OpenAI API key in credentials
- Or wait for credits to refresh

### "Workflow execution timeout"
- Normal for first run (AI models are slow)
- Subsequent runs will be faster
- Increase timeout in workflow settings if needed

---

## 📞 NEED HELP?

I'm here to assist you! Let me know:
- Which step you're on
- What error you're seeing
- What you need help with

**Reference Documents:**
- `n8n_quick_start_checklist.md` - Quick reference
- `n8n_workflow_setup_guide.md` - Detailed guide
- `n8n_email_enrichment_guide.md` - Email setup
- `n8n_workflow_architecture.md` - Technical overview

---

**Let's get started! Begin with STEP 1: Sign up for Serper.dev** 🚀
