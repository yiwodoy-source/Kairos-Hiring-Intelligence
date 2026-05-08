# 🚨 FIX: "No columns found in Google Sheets" Error

## WHAT THIS ERROR MEANS:
n8n can connect to your Google Sheet, but it cannot find the column headers in Row 1.

---

## ✅ SOLUTION: FIX YOUR GOOGLE SHEET HEADERS

### **STEP 1: Open Your Google Sheet**

Go to: https://docs.google.com/spreadsheets/d/1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0/edit

### **STEP 2: Verify Sheet Name**

Look at the bottom of the Google Sheet:
- You should see a tab labeled **"Candidates"**
- If you see "Sheet1" or any other name, **rename it to "Candidates"**

**How to rename:**
1. Right-click on the sheet tab at the bottom
2. Click "Rename"
3. Type: `Candidates` (exactly, case-sensitive)
4. Press Enter

### **STEP 3: Check Row 1 Has Headers**

**Row 1 (the very first row) MUST have these exact column headers:**

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| name | current_role | company | skills | experience_years | profile_url | email | status | email_sent_date |

**IMPORTANT:**
- Headers must be in **Row 1** (not Row 2 or below)
- Headers must be **lowercase**
- Headers must have **no extra spaces** before or after
- Headers must be **exactly as shown above**

### **STEP 4: Add Headers if Missing**

If Row 1 is empty or has different headers:

1. **Click on cell A1**
2. **Type:** `name`
3. **Press Tab** (moves to B1)
4. **Type:** `current_role`
5. **Press Tab** (moves to C1)
6. **Type:** `company`
7. **Continue for all 9 columns:**
   - D1: `skills`
   - E1: `experience_years`
   - F1: `profile_url`
   - G1: `email`
   - H1: `status`
   - I1: `email_sent_date`

**OR Copy-Paste This (Easier):**

1. Click on cell A1
2. Copy this entire line:
   ```
   name	current_role	company	skills	experience_years	profile_url	email	status	email_sent_date
   ```
3. Paste it into A1
4. The columns should automatically spread across A1 to I1

### **STEP 5: Verify Headers Are Correct**

**Check for these common mistakes:**

❌ **WRONG:**
- `Name` (capital N)
- ` name` (space before)
- `name ` (space after)
- Headers in Row 2
- Missing columns

✅ **CORRECT:**
- `name` (lowercase, no spaces)
- All 9 columns present
- In Row 1

### **STEP 6: Save and Test**

1. **The sheet auto-saves** (you'll see "All changes saved in Drive")
2. **Go back to your n8n workflow**
3. **Click on "Store Candidates" node**
4. **Click "Refresh fields" or "Fetch columns"** (if available)
5. **You should now see the column names appear!**

---

## 🎯 COMMON ISSUES & FIXES

### Issue #1: "Sheet name doesn't match"
**Error:** n8n is looking for "Candidates" but your sheet is named "Sheet1"
**Fix:** Rename the sheet tab to exactly "Candidates"

### Issue #2: "Headers in wrong row"
**Error:** Headers are in Row 2 or below
**Fix:** Move headers to Row 1, delete any empty rows above

### Issue #3: "Extra spaces in headers"
**Error:** Headers have spaces like " name" or "name "
**Fix:** Delete and retype headers without spaces

### Issue #4: "Wrong column names"
**Error:** Using different names like "Name" or "candidate_name"
**Fix:** Use exact names from the list above

### Issue #5: "Missing columns"
**Error:** Only some columns are present
**Fix:** Add all 9 columns in the exact order

---

## 📋 VERIFICATION CHECKLIST

After fixing, verify:

- [ ] Sheet tab at bottom is named "Candidates" (exact spelling)
- [ ] Row 1 has headers (not Row 2 or below)
- [ ] All 9 column headers are present
- [ ] Headers are lowercase
- [ ] No extra spaces in headers
- [ ] Headers are in order: name, current_role, company, skills, experience_years, profile_url, email, status, email_sent_date

---

## 🔄 AFTER FIXING THE SHEET

### **In n8n workflow:**

1. **Click on "Store Candidates" node**
2. **In the configuration panel, look for:**
   - "Columns" section
   - "Mapping" section
   - "Refresh" or "Reload" button
3. **Click the refresh button** to reload columns from the sheet
4. **You should now see all 9 column names!**

### **If you still don't see columns:**

1. **Close the node configuration**
2. **Click "Save" in the workflow**
3. **Refresh the browser page** (F5)
4. **Click on "Store Candidates" node again**
5. **The columns should now appear**

---

## 🎯 QUICK FIX SUMMARY

**Most common cause:** Headers are not in Row 1 or sheet is not named "Candidates"

**Quick fix:**
1. Open Google Sheet
2. Make sure sheet tab is named "Candidates"
3. Put headers in Row 1
4. Use exact column names (lowercase, no spaces)
5. Refresh n8n node

---

## 💬 TELL ME:

After fixing the sheet, reply with:
- "Fixed - columns now showing!" ✅
- "Still no columns - screenshot attached" ❌
- "Need help with [specific issue]" ❓

I'll help you resolve it!
