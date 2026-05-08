# 🎯 COMPLETE n8n WORKFLOW SETUP - FULL WALKTHROUGH

**I'll guide you through EVERY step. Just follow along!**

**Time Required:** 20-25 minutes  
**Current Time:** 18:02 IST

---

## 📋 WHAT WE'RE GOING TO DO

1. ✅ Get SerpAPI key (replaces Serper - more reliable!)
2. ✅ Create Google Sheet for candidates
3. ✅ Sign in to n8n
4. ✅ Configure workflow with API key
5. ✅ Connect Google Sheets
6. ✅ Connect Gmail
7. ✅ Update workflow to use SerpAPI
8. ✅ Test and see real candidates!

---

## 🚀 STEP 1: GET SERPAPI KEY (5 minutes)

### You have SerpAPI open in your browser. Now:

**1.1 Click "Register" button** (top right corner)

**1.2 Sign up with Google:**
   - Click "Sign up with Google"
   - Select your Google account
   - Click "Allow" to authorize

**1.3 After login, you'll see your Dashboard**

**1.4 Find your API key:**
   - Look for "Your Private API Key" section
   - It will show something like: `abc123def456ghi789...`
   - **Click the "Copy" button** next to the API key

**1.5 PASTE YOUR API KEY HERE (I'll need this later):**
```
YOUR_SERPAPI_KEY: _______________________________________________
```

**1.6 Verify free tier:**
   - You should see: "100 searches/month free"
   - This is perfect for testing!

✅ **Done? Reply with: "Got SerpAPI key"**

---

## 📊 STEP 2: CREATE GOOGLE SHEET (5 minutes)

**2.1 Open new tab and go to:** https://sheets.google.com

**2.2 Click "+ Blank"** to create new spreadsheet

**2.3 Rename the spreadsheet:**
   - Click "Untitled spreadsheet" at the top
   - Type: **Candidate Sourcing Database**
   - Press Enter

**2.4 Rename the sheet tab:**
   - At the bottom, you'll see "Sheet1"
   - Right-click on it
   - Click "Rename"
   - Type: **Candidates**
   - Press Enter

**2.5 Add column headers:**
   - Click on cell A1
   - Copy this entire line and paste it into A1:
   ```
   name	current_role	company	skills	experience_years	profile_url	email	status	email_sent_date
   ```
   - The columns should spread across A1 to I1

**2.6 Get your Sheet ID:**
   - Look at the URL in your browser
   - It looks like: `https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j/edit`
   - Copy ONLY the part between `/d/` and `/edit`
   - Example: `1a2b3c4d5e6f7g8h9i0j`

**2.7 PASTE YOUR SHEET ID HERE:**
```
YOUR_SHEET_ID: _______________________________________________
```

✅ **Done? Reply with: "Created Google Sheet"**

---

## 🔐 STEP 3: SIGN IN TO n8n (2 minutes)

**3.1 Go to your n8n tab:**
   - URL: https://yiwodo.app.n8n.cloud/workflow/0ra84UrZWY8JwMkd

**3.2 You should see a sign-in page**

**3.3 Enter your credentials:**
   - Email: (your n8n account email)
   - Password: (your n8n password)

**3.4 Click "Sign in"**

**3.5 You should now see your workflow canvas**
   - You'll see many colorful nodes connected together
   - This is your "AI-Powered Candidate Sourcing" workflow

✅ **Done? Reply with: "Signed into n8n"**

---

## ⚙️ STEP 4: CONFIGURE WORKFLOW CONFIGURATION NODE (3 minutes)

**4.1 Find the "Workflow Configuration" node:**
   - It's the second node from the left
   - It's a purple/blue node labeled "Workflow Configuration"

**4.2 Click on it to open**

**4.3 You'll see 3 fields to fill:**

   **Field 1: serperApiKey**
   - Delete the placeholder text
   - Paste your SerpAPI key from Step 1
   - (We'll update the workflow to use SerpAPI later)

   **Field 2: companyName**
   - Delete the placeholder
   - Type: **Nexus HR AI**

   **Field 3: recruiterName**
   - Delete the placeholder
   - Type: **Your Name** (your actual name)

**4.4 Click outside the node** to save

✅ **Done? Reply with: "Configured workflow settings"**

---

## 📗 STEP 5: CONNECT GOOGLE SHEETS (5 minutes)

### Part A: Configure "Store Candidates" Node

**5.1 Find the "Store Candidates" node:**
   - It's a green node in the middle of the workflow
   - Click on it to open

**5.2 Create Google Sheets credential:**
   - Look for "Credential to connect with" dropdown
   - Click on it
   - Click "Create New Credential"
   - Select "Google Sheets OAuth2 API"

**5.3 Authorize Google Sheets:**
   - Click "Connect my account" button
   - A popup window will open
   - **Sign in with your Google account**
   - Click "Allow" to give n8n permission to access Google Sheets
   - The popup will close automatically

**5.4 Save the credential:**
   - Click "Save" button

**5.5 Configure the Sheet:**
   - In "Document" field, click the dropdown
   - Select "By ID"
   - Paste your Sheet ID from Step 2
   - In "Sheet" field, type: **Candidates**

**5.6 Click outside the node** to save

### Part B: Configure "Update Candidate Status" Node

**5.7 Find the "Update Candidate Status" node:**
   - It's another green node near the end of the workflow
   - Click on it to open

**5.8 Use the same credential:**
   - Click "Credential to connect with" dropdown
   - Select the credential you just created (should be listed)

**5.9 Configure the Sheet:**
   - In "Document" field, select "By ID"
   - Paste your Sheet ID from Step 2
   - In "Sheet" field, type: **Candidates**

**5.10 Click outside the node** to save

✅ **Done? Reply with: "Connected Google Sheets"**

---

## 📧 STEP 6: CONNECT GMAIL (3 minutes)

**6.1 Find the "Send Email" node:**
   - It's an orange/red node near the end
   - Click on it to open

**6.2 Create Gmail credential:**
   - Click "Credential to connect with" dropdown
   - Click "Create New Credential"
   - Select "Gmail OAuth2 API"

**6.3 Authorize Gmail:**
   - Click "Connect my account" button
   - A popup window will open
   - **Sign in with your Google account**
   - Click "Allow" to give n8n permission to send emails
   - The popup will close automatically

**6.4 Save the credential:**
   - Click "Save" button

**6.5 IMPORTANT: Disable this node for testing:**
   - Right-click on the "Send Email" node
   - Click "Disable"
   - The node will turn gray
   - This prevents sending real emails during testing

✅ **Done? Reply with: "Connected Gmail"**

---

## 🔧 STEP 7: UPDATE WORKFLOW TO USE SERPAPI (5 minutes)

Since we're using SerpAPI instead of Serper, we need to update the HTTP Request node.

**7.1 Find the "Search Public Profiles" node:**
   - It's an orange node labeled "Search Public Profiles"
   - It's after the "AI Query Builder" node
   - Click on it to open

**7.2 Update the URL:**
   - Find the "URL" field
   - Current value: `https://google.serper.dev/search`
   - **Change it to:** `https://serpapi.com/search`

**7.3 Update the authentication:**
   - Find "Send Headers" section
   - You'll see headers with "X-API-KEY"
   - We need to change this to use query parameters instead

**7.4 Remove the headers:**
   - Click the trash icon next to each header to delete them

**7.5 Add query parameters:**
   - Find "Query Parameters" section
   - Click "Add Parameter"
   - **Parameter 1:**
     - Name: `api_key`
     - Value: `={{ $('Workflow Configuration').first().json.serperApiKey }}`
   - Click "Add Parameter" again
   - **Parameter 2:**
     - Name: `q`
     - Value: `={{ $json.queries[0] }}`
   - Click "Add Parameter" again
   - **Parameter 3:**
     - Name: `engine`
     - Value: `google`

**7.6 Update the body:**
   - Find "Send Body" toggle
   - Turn it OFF (we're using query parameters now)

**7.7 Click outside the node** to save

✅ **Done? Reply with: "Updated to SerpAPI"**

---

## 🎯 STEP 8: CONFIGURE TEST JOB (2 minutes)

**8.1 Find the "Job Input Details" node:**
   - It's the third node from the left
   - Click on it to open

**8.2 Fill in test job details:**

   **Field 1: role**
   - Type: `Senior Backend Engineer`

   **Field 2: skills**
   - Type: `Node.js, Python, AWS, Docker`

   **Field 3: experience**
   - Type: `5+`

   **Field 4: location**
   - Type: `Remote`

**8.3 Click outside the node** to save

✅ **Done? Reply with: "Configured test job"**

---

## 🚀 STEP 9: SAVE AND TEST WORKFLOW (3 minutes)

**9.1 Save the workflow:**
   - Click "Save" button at the top right
   - If prompted for a name, use: "AI Candidate Sourcing - Production"

**9.2 Test the workflow:**
   - Click "Test workflow" button (top right, next to Save)
   - **Watch the magic happen!**

**9.3 What you'll see:**
   - Nodes will execute one by one (left to right)
   - Each node will show a number when it completes
   - Green checkmarks ✓ = success
   - Red X = error
   - **This takes 30-60 seconds - be patient!**

**9.4 Check the results:**
   - Click on each node to see what it did
   - **Important nodes to check:**
     - "AI Query Builder" - should show search queries
     - "Search Public Profiles" - should show Google results
     - "AI Candidate Extractor" - should show candidate data
     - "AI Email Drafter" - should show email drafts

**9.5 Check your Google Sheet:**
   - Go back to your "Candidate Sourcing Database" sheet
   - **You should see candidates added!**
   - Check the data: names, roles, companies, skills

✅ **Done? Reply with: "Workflow tested successfully!"**

---

## 🎉 SUCCESS CRITERIA

After completing all steps, you should have:

- ✅ SerpAPI account with API key
- ✅ Google Sheet with candidate columns
- ✅ n8n workflow configured and connected
- ✅ Google Sheets connected via OAuth
- ✅ Gmail connected via OAuth
- ✅ Workflow updated to use SerpAPI
- ✅ Test execution completed successfully
- ✅ **Real candidates in your Google Sheet!**

---

## 🆘 TROUBLESHOOTING

### "SerpAPI authentication failed"
- Check if API key is copied correctly (no extra spaces)
- Verify you have free credits remaining
- Make sure query parameters are set correctly

### "Google Sheets not found"
- Verify Sheet ID is correct
- Check that sheet name is exactly "Candidates"
- Re-authorize Google Sheets OAuth

### "No candidates found"
- Check if SerpAPI returned results (click "Search Public Profiles" node)
- Try broader search terms
- Verify API key is working

### "OpenAI error"
- n8n free credits may be exhausted
- Add your own OpenAI API key in credentials
- Or wait for credits to refresh

### "Workflow execution timeout"
- Normal for first run (AI is slow)
- Increase timeout in workflow settings
- Try again - subsequent runs are faster

---

## 📊 WHAT'S NEXT?

After successful test:

1. **Review candidates** - Are they relevant?
2. **Add email enrichment** - Use Hunter.io to find emails (see guide)
3. **Enable email sending** - Test with your own email first
4. **Set up scheduling** - Run automatically daily/weekly
5. **Integrate with your app** - Connect to Nexus HR AI

---

## 💬 I'M HERE TO HELP!

As you go through each step, let me know:
- ✅ "Done with Step X" - I'll confirm and guide you to next step
- ❓ "Stuck on Step X" - I'll help you troubleshoot
- 🎉 "All done!" - I'll help you optimize and add features

**START WITH STEP 1: Get your SerpAPI key!** 🚀

---

**Remember:** Take your time, follow each step carefully, and let me know when you complete each one!
