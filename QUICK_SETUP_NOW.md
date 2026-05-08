# 🚀 QUICK SETUP - DO THIS NOW!

**Time:** 15 minutes  
**Current Time:** 17:52 IST

---

## ✅ WHAT YOU HAVE OPEN RIGHT NOW:

1. **n8n Tab:** Sign-in page (https://yiwodo.app.n8n.cloud)
2. **Serper Tab:** Homepage (https://serper.dev)

---

## 📝 STEP 1: SIGN IN TO n8n (2 minutes)

### In your n8n browser tab:

1. **Enter your email** (the one you used to create n8n account)
2. **Enter your password**
3. **Click "Sign in"**
4. **You'll be redirected to your workflow**

✅ **Done? Check this box:** [ ]

---

## 📝 STEP 2: GET SERPER API KEY (5 minutes)

### In your Serper browser tab:

1. **Click "Sign up"** button (top right)
   - OR click "Get 2,500 free queries" button

2. **Choose "Sign up with Google"** (easiest option)

3. **Select your Google account**

4. **After login, you'll see Dashboard**

5. **Look for "API Keys" section**
   - Click "Create API Key" or copy existing key
   - **COPY THE KEY** - it looks like: `abc123def456ghi789...`

6. **PASTE YOUR API KEY HERE:**
   ```
   _______________________________________________
   ```

✅ **Done? Check this box:** [ ]

---

## 📝 STEP 3: CREATE GOOGLE SHEET (5 minutes)

### Open a new tab and go to: https://sheets.google.com

1. **Click "+ Blank"** to create new spreadsheet

2. **Rename the spreadsheet:**
   - Click "Untitled spreadsheet" at top
   - Change to: **Candidate Sourcing Database**

3. **Rename the sheet tab:**
   - At bottom, right-click "Sheet1"
   - Click "Rename"
   - Change to: **Candidates**

4. **Add these column headers in Row 1:**
   
   Copy and paste this into cells A1-I1:
   ```
   name	current_role	company	skills	experience_years	profile_url	email	status	email_sent_date
   ```

5. **Copy your Sheet ID:**
   - Look at the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
   - Copy the part between `/d/` and `/edit`
   - Example: `1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t`

6. **PASTE YOUR SHEET ID HERE:**
   ```
   _______________________________________________
   ```

✅ **Done? Check this box:** [ ]

---

## 📝 STEP 4: CONFIGURE n8n WORKFLOW (3 minutes)

### Back in your n8n tab (you should be logged in now):

1. **You should see your workflow canvas with many nodes**

2. **Click on "Workflow Configuration" node** (second node from left)

3. **Update these 3 values:**
   - `serperApiKey`: Paste your Serper API key from Step 2
   - `companyName`: Type "Nexus HR AI"
   - `recruiterName`: Type your name

4. **Click outside the node to save**

✅ **Done? Check this box:** [ ]

---

## 📝 STEP 5: CONFIGURE GOOGLE SHEETS (IMPORTANT!)

### Still in n8n:

1. **Find and click on "Store Candidates" node** (green node in middle)

2. **Click "Credential to connect with" dropdown**

3. **Click "Create New Credential"**

4. **Select "Google Sheets OAuth2 API"**

5. **Click "Connect my account"**
   - A popup will open
   - **Sign in with your Google account**
   - **Click "Allow"** to give n8n permission

6. **After authorization, click "Save"**

7. **Now configure the Sheet:**
   - In "Document" field, select "By ID"
   - **Paste your Sheet ID** from Step 3
   - In "Sheet" field, type: **Candidates**

8. **Repeat for "Update Candidate Status" node:**
   - Click on that node
   - Use the SAME credential you just created
   - Paste the SAME Sheet ID
   - Select "Candidates" sheet

✅ **Done? Check this box:** [ ]

---

## 📝 STEP 6: CONFIGURE GMAIL

### Still in n8n:

1. **Find and click on "Send Email" node** (orange node)

2. **Click "Credential to connect with" dropdown**

3. **Click "Create New Credential"**

4. **Select "Gmail OAuth2 API"**

5. **Click "Connect my account"**
   - A popup will open
   - **Sign in with your Google account**
   - **Click "Allow"** to give n8n permission to send emails

6. **After authorization, click "Save"**

7. **IMPORTANT: Disable this node for testing**
   - Right-click the "Send Email" node
   - Click "Disable"
   - This prevents sending real emails during testing

✅ **Done? Check this box:** [ ]

---

## 📝 STEP 7: TEST YOUR WORKFLOW! 🎉

### Final step - let's see it work!

1. **Click on "Job Input Details" node**

2. **Enter test job:**
   ```
   role: Senior Backend Engineer
   skills: Node.js, Python, AWS
   experience: 5+
   location: Remote
   ```

3. **Click "Save" button** (top right)

4. **Click "Test workflow" button** (top right)

5. **Watch the magic happen!**
   - Nodes will light up one by one
   - Green checkmarks ✓ = success
   - This takes 30-60 seconds

6. **Check your Google Sheet!**
   - Open your "Candidate Sourcing Database" sheet
   - You should see candidates added!

✅ **Done? Check this box:** [ ]

---

## 🎉 SUCCESS CRITERIA

After Step 7, you should have:
- ✅ Workflow executed without errors
- ✅ Candidates in your Google Sheet
- ✅ Real names, companies, and skills visible

---

## 🆘 STUCK? TELL ME:

If you get stuck, tell me:
1. **Which step you're on** (1-7)
2. **What you see** (error message, button not found, etc.)
3. **Screenshot if possible**

I'll help you immediately!

---

## 📊 YOUR PROGRESS

- [ ] Step 1: Signed into n8n
- [ ] Step 2: Got Serper API key
- [ ] Step 3: Created Google Sheet
- [ ] Step 4: Configured workflow
- [ ] Step 5: Connected Google Sheets
- [ ] Step 6: Connected Gmail
- [ ] Step 7: Tested workflow

**START WITH STEP 1 NOW!** 🚀

---

## 💡 QUICK TIPS

- **Don't skip steps** - they build on each other
- **Copy-paste carefully** - extra spaces break things
- **Use Google sign-in** - it's faster than creating new accounts
- **Keep all tabs open** - you'll need them

**Estimated time to first candidates: 15 minutes!**

Let's go! 🎯
