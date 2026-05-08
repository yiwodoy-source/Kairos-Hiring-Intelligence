# 🔧 n8n WORKFLOW - EXACT FIX STEPS

**Good news:** Your Google Sheet exists and you have free OpenAI credits!

Now let's fix the configuration issues.

---

## 🎯 FIX #1: RECONNECT GOOGLE SHEETS CREDENTIAL (5 minutes)

The error "Requested entity was not found" means the credential needs to be reconnected.

### **Step-by-Step:**

1. **In your n8n workflow, click on "Store Candidates" node**
   - The green Google Sheets node
   - Configuration panel will open on the right

2. **Find "Credential to connect with" dropdown**
   - It currently shows "Google Sheets account"
   - Click on it

3. **Click the pencil/edit icon** next to the credential name
   - This opens the credential editor

4. **Click "Reconnect" or "Reauthorize" button**
   - A Google sign-in popup will appear
   - Sign in with the SAME Google account that owns the sheet
   - Click "Allow" to grant ALL permissions
   - The popup will close

5. **Click "Save" button** in the credential editor

6. **Back in the node configuration:**
   - The credential should now show as connected
   - Click outside the node to save

7. **Repeat for "Update Candidate Status" node:**
   - Click on that node
   - Use the SAME credential (should already be selected)
   - If not, select it from the dropdown

✅ **Test:** Click the "Test step" button in the node to verify it works

---

## 🎯 FIX #2: CONNECT OPENAI TO AI NODES (10 minutes)

You have "n8n free OpenAI API credits" - now we need to connect them to the AI nodes.

### **Understanding the Structure:**

Each AI Agent node needs an "OpenAI Chat Model" node connected to it. Looking at your workflow:

- **AI Query Builder** → needs OpenAI Chat Model
- **AI Candidate Extractor** → needs OpenAI Chat Model1
- **AI Email Drafter** → needs OpenAI Chat Model2
- **AI Social Media Post Generator** → needs OpenAI Chat Model3

### **Step-by-Step for EACH AI node:**

#### **For "AI Query Builder" node:**

1. **Click on "AI Query Builder" node**
   - Configuration panel opens

2. **Scroll down to find "Model" or "Language Model" section**
   - You should see a connection point or dropdown

3. **Look for "OpenAI Chat Model" node** on the canvas
   - It should be near the AI Query Builder
   - It's a separate small node

4. **Click on the "OpenAI Chat Model" node**
   - Configuration panel opens

5. **In the OpenAI Chat Model configuration:**
   - Find "Credential to connect with"
   - Click the dropdown
   - Select "n8n free OpenAI API credits"
   - Click outside to save

6. **Verify the connection:**
   - There should be a line connecting "OpenAI Chat Model" to "AI Query Builder"
   - If not, drag from the connection point to connect them

#### **Repeat for the other 3 AI nodes:**

- **AI Candidate Extractor** → Connect "OpenAI Chat Model1"
- **AI Email Drafter** → Connect "OpenAI Chat Model2"  
- **AI Social Media Post Generator** → Connect "OpenAI Chat Model3"

For each one:
1. Click the OpenAI Chat Model node
2. Select "n8n free OpenAI API credits" credential
3. Save

---

## 🎯 FIX #3: VERIFY ALL CONNECTIONS

### **Check these connections exist:**

```
Manual Trigger → Workflow Configuration → Job Input Details

Job Input Details → AI Query Builder
                 ↓
            OpenAI Chat Model (with credential)
                 ↓
         Search Public Profiles
                 ↓
         AI Candidate Extractor
                 ↓
            OpenAI Chat Model1 (with credential)
                 ↓
          Store Candidates (with Google credential)
                 ↓
           AI Email Drafter
                 ↓
            OpenAI Chat Model2 (with credential)
                 ↓
             Send Email
                 ↓
       Update Candidate Status (with Google credential)
```

---

## 🎯 FIX #4: DISABLE SEND EMAIL NODE (1 minute)

To prevent sending real emails during testing:

1. **Close any open configuration panels**
2. **Find the "Send Email" node** on the canvas (orange Gmail icon)
3. **Right-click on the node itself** (not the panel)
4. **Click "Disable"** from the menu
5. **The node will turn gray** - that's correct!

---

## 🎯 FIX #5: SAVE AND TEST (2 minutes)

1. **Click "Save" button** (top right)
2. **Click "Execute workflow" button** (big red button at bottom)
3. **Wait 30-60 seconds** for execution
4. **Watch the nodes:**
   - They should light up one by one
   - Green checkmarks = success
   - Red X = error

---

## ✅ SUCCESS CHECKLIST

After completing all fixes, verify:

- [ ] "Store Candidates" node - Google credential reconnected
- [ ] "Update Candidate Status" node - Same Google credential
- [ ] "OpenAI Chat Model" - Has "n8n free OpenAI API credits"
- [ ] "OpenAI Chat Model1" - Has "n8n free OpenAI API credits"
- [ ] "OpenAI Chat Model2" - Has "n8n free OpenAI API credits"
- [ ] "OpenAI Chat Model3" - Has "n8n free OpenAI API credits"
- [ ] "Send Email" node - Disabled (gray)
- [ ] Workflow saved
- [ ] Workflow executed without errors

---

## 🆘 IF YOU STILL GET ERRORS

### **Google Sheets Error:**

If you still get "entity not found":
1. Go to your Google Sheet
2. Click "Share" button
3. Make sure the email address from your n8n Google credential has "Editor" access
4. Click "Done"
5. Try the workflow again

### **OpenAI Error:**

If you get "model not found" or similar:
1. Click on the OpenAI Chat Model node
2. Check the "Model" dropdown
3. Make sure it's set to "gpt-4.1-mini" or "gpt-3.5-turbo"
4. Save and try again

### **Other Errors:**

Take a screenshot of the error and send it to me!

---

## 🎯 QUICK SUMMARY

**What you need to do:**

1. **Reconnect Google Sheets credential** (2 clicks)
2. **Connect OpenAI credentials to 4 AI model nodes** (4 × 2 clicks = 8 clicks)
3. **Disable Send Email node** (1 right-click)
4. **Save and Execute** (2 clicks)

**Total: About 15 minutes of work!**

---

**Start with FIX #1 (Google Sheets) and let me know when you're done!** 🚀
