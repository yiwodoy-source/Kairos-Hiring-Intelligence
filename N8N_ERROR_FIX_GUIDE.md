# 🚨 n8n WORKFLOW ERROR - DIAGNOSTIC & FIX GUIDE

## ERROR MESSAGE:
"The workflow has issues and cannot be executed for that reason. Please fix them first."

## WHAT THIS MEANS:
This error occurs BEFORE the workflow runs. It means there's a configuration problem in one or more nodes.

---

## 🔍 STEP-BY-STEP DIAGNOSTIC

### CHECK 1: Workflow Configuration Node

1. Click on "Workflow Configuration" node
2. Verify these fields have NO placeholder text:
   - `serperApiKey`: Should be `7d9960e190bceaa3baeeb0662ff7e0c05ed170d6`
   - `companyName`: Should be `Nexus HR AI`
   - `recruiterName`: Should be your actual name (NOT placeholder)

**If you see `<__PLACEHOLDER_VALUE__...>` in ANY field, DELETE it and enter the correct value!**

---

### CHECK 2: Store Candidates Node (Google Sheets)

1. Click on "Store Candidates" node
2. Check "Credential to connect with":
   - Should show your Google account email
   - If it says "Select credential" or is empty, you need to select the credential
3. Check "Document" field:
   - Should be set to "By ID"
   - Should contain: `1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0`
   - NO placeholder text like `<__PLACEHOLDER_VALUE__...>`
4. Check "Sheet" field:
   - Should contain: `Candidates`
   - NO placeholder text

---

### CHECK 3: Update Candidate Status Node

1. Click on "Update Candidate Status" node
2. Check "Credential to connect with":
   - Should show your Google account email
   - Must be selected (not empty)
3. Check "Document" field:
   - Should contain: `1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0`
   - NO placeholder text
4. Check "Sheet" field:
   - Should contain: `Candidates`

---

### CHECK 4: Send Email Node (Gmail)

1. Click on "Send Email" node
2. Check "Credential to connect with":
   - Should show your Google account email
   - Must be selected
3. **This node should be DISABLED** (grayed out)
   - If it's not gray, right-click it and click "Disable"

---

### CHECK 5: Job Input Details Node

1. Click on "Job Input Details" node
2. Verify NO placeholder text in any field:
   - `role`: Should have actual job title (e.g., "Senior Backend Engineer")
   - `skills`: Should have actual skills (e.g., "Node.js, Python, AWS")
   - `experience`: Should have value (e.g., "5+")
   - `location`: Should have value (e.g., "Remote")

---

## 🎯 MOST LIKELY ISSUES:

### Issue #1: Placeholder Text Still Present
**Symptom:** Fields still contain `<__PLACEHOLDER_VALUE__...>`  
**Fix:** Delete placeholder and enter actual value

### Issue #2: Credentials Not Selected
**Symptom:** Credential dropdown shows "Select credential" or is empty  
**Fix:** Click dropdown and select the credential you created

### Issue #3: Empty Required Fields
**Symptom:** Required fields are blank  
**Fix:** Fill in all required fields

---

## ✅ HOW TO FIX:

1. **Go through each node** listed above
2. **Click on each node** to open its configuration
3. **Look for RED indicators** or warning icons
4. **Check for placeholder text** (`<__PLACEHOLDER_VALUE__...>`)
5. **Verify credentials are selected** (not just created, but SELECTED)
6. **Save each node** after fixing

---

## 🚀 AFTER FIXING:

1. Click "Save" button (top right)
2. Click "Test workflow" button
3. If you still get errors, tell me which node shows the error

---

## 💡 QUICK FIX CHECKLIST:

- [ ] "Workflow Configuration" - API key entered (no placeholder)
- [ ] "Workflow Configuration" - Company name entered
- [ ] "Workflow Configuration" - Recruiter name entered
- [ ] "Job Input Details" - All 4 fields filled (no placeholders)
- [ ] "Store Candidates" - Credential SELECTED
- [ ] "Store Candidates" - Sheet ID entered (no placeholder)
- [ ] "Store Candidates" - Sheet name = "Candidates"
- [ ] "Update Candidate Status" - Credential SELECTED
- [ ] "Update Candidate Status" - Sheet ID entered
- [ ] "Update Candidate Status" - Sheet name = "Candidates"
- [ ] "Send Email" - Credential SELECTED
- [ ] "Send Email" - Node is DISABLED (grayed out)

---

## 📸 WHAT TO LOOK FOR:

**GOOD (No errors):**
- All fields have actual values
- Credentials show your email address
- No red warning icons
- No placeholder text

**BAD (Has errors):**
- Fields contain `<__PLACEHOLDER_VALUE__...>`
- Credential dropdown says "Select credential"
- Red warning icons on nodes
- Empty required fields

---

## 💬 TELL ME:

After checking all nodes, reply with:
- "Fixed - ready to test" (if you fixed issues)
- "Still seeing error on [node name]" (if stuck)
- "All nodes look correct" (if everything seems fine but still errors)

I'll help you resolve it!
