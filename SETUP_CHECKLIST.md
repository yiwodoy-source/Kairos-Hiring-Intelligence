# ✅ n8n WORKFLOW SETUP - QUICK CHECKLIST

Print this or keep it open while you work!

---

## STEP 1: GET SERPAPI KEY ⏱️ 5 min

- [ ] Go to SerpAPI tab (already open)
- [ ] Click "Register"
- [ ] Sign up with Google
- [ ] Copy API key from dashboard
- [ ] Save API key: _______________________

---

## STEP 2: CREATE GOOGLE SHEET ⏱️ 5 min

- [ ] Go to sheets.google.com
- [ ] Create new blank sheet
- [ ] Rename to "Candidate Sourcing Database"
- [ ] Rename Sheet1 to "Candidates"
- [ ] Add headers: name | current_role | company | skills | experience_years | profile_url | email | status | email_sent_date
- [ ] Copy Sheet ID from URL
- [ ] Save Sheet ID: _______________________

---

## STEP 3: SIGN IN TO n8n ⏱️ 2 min

- [ ] Go to n8n tab
- [ ] Enter email and password
- [ ] Click "Sign in"
- [ ] Verify workflow canvas is visible

---

## STEP 4: CONFIGURE WORKFLOW ⏱️ 3 min

- [ ] Click "Workflow Configuration" node
- [ ] Paste SerpAPI key
- [ ] Enter company name: "Nexus HR AI"
- [ ] Enter your name
- [ ] Save

---

## STEP 5: CONNECT GOOGLE SHEETS ⏱️ 5 min

- [ ] Click "Store Candidates" node
- [ ] Create Google Sheets credential
- [ ] Authorize with Google
- [ ] Paste Sheet ID
- [ ] Enter sheet name: "Candidates"
- [ ] Click "Update Candidate Status" node
- [ ] Use same credential
- [ ] Paste Sheet ID
- [ ] Enter sheet name: "Candidates"

---

## STEP 6: CONNECT GMAIL ⏱️ 3 min

- [ ] Click "Send Email" node
- [ ] Create Gmail credential
- [ ] Authorize with Google
- [ ] Right-click node → Disable

---

## STEP 7: UPDATE TO SERPAPI ⏱️ 5 min

- [ ] Click "Search Public Profiles" node
- [ ] Change URL to: https://serpapi.com/search
- [ ] Delete all headers
- [ ] Add query param: api_key = {{ $('Workflow Configuration').first().json.serperApiKey }}
- [ ] Add query param: q = {{ $json.queries[0] }}
- [ ] Add query param: engine = google
- [ ] Turn OFF "Send Body"
- [ ] Save

---

## STEP 8: CONFIGURE TEST JOB ⏱️ 2 min

- [ ] Click "Job Input Details" node
- [ ] role: "Senior Backend Engineer"
- [ ] skills: "Node.js, Python, AWS, Docker"
- [ ] experience: "5+"
- [ ] location: "Remote"
- [ ] Save

---

## STEP 9: TEST WORKFLOW ⏱️ 3 min

- [ ] Click "Save" (top right)
- [ ] Click "Test workflow"
- [ ] Wait 30-60 seconds
- [ ] Check for green checkmarks
- [ ] Open Google Sheet
- [ ] Verify candidates are added!

---

## 🎉 SUCCESS!

You should now have:
- ✅ Candidates in your Google Sheet
- ✅ Workflow running successfully
- ✅ All connections working

---

## 📞 NEED HELP?

Tell me which step you're on and I'll help!

**Total Time: 25-30 minutes**
