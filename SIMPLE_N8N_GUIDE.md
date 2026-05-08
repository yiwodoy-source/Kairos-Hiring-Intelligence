# 🎯 VISUAL STEP-BY-STEP GUIDE - n8n Configuration

**I cannot directly configure your n8n cloud account, but I'll show you EXACTLY what to do!**

---

## ⚠️ IMPORTANT: Why I Can't Do It For You

- Your n8n workflow is in **your cloud account** (yiwodo.app.n8n.cloud)
- It requires **your login credentials** to make changes
- I can only **guide you** through the process
- **Good news:** It's very simple - just 3 nodes to configure!

---

## 🎯 WHAT YOU NEED TO DO (10 minutes total)

You only need to configure **3 main nodes**:

1. ✅ **Workflow Configuration** - Add your API key (2 min)
2. ✅ **Store Candidates** - Connect Google Sheets (4 min)
3. ✅ **Update Candidate Status** - Use same Google Sheets (2 min)
4. ✅ **Send Email** - Connect Gmail and disable (2 min)

**Total: 10 minutes of clicking and pasting!**

---

## 📍 NODE 1: WORKFLOW CONFIGURATION (2 minutes)

### What to do:

1. **In your n8n workflow, click on the "Workflow Configuration" node**
   - It's the 2nd purple/blue node from the left
   - You'll see it says "Workflow Configuration"

2. **A panel will open on the right side**

3. **You'll see 3 fields with placeholder text. Replace them:**

   ```
   Field 1: serperApiKey
   OLD: <__PLACEHOLDER_VALUE__Serper API Key__>
   NEW: 7d9960e190bceaa3baeeb0662ff7e0c05ed170d6
   ```

   ```
   Field 2: companyName
   OLD: <__PLACEHOLDER_VALUE__Your Company Name__>
   NEW: Nexus HR AI
   ```

   ```
   Field 3: recruiterName
   OLD: <__PLACEHOLDER_VALUE__Recruiter Name__>
   NEW: [Your Name]
   ```

4. **Click outside the node** or press ESC to save

✅ **DONE!** Node 1 configured.

---

## 📍 NODE 2: STORE CANDIDATES (4 minutes)

### What to do:

1. **Click on the "Store Candidates" node**
   - It's a green node in the middle of the workflow
   - Has a Google Sheets icon

2. **You'll see a configuration panel on the right**

3. **Find "Credential to connect with" dropdown**
   - Click on it
   - Click "Create New Credential"
   - Select "Google Sheets OAuth2 API"

4. **A credential configuration window will open**
   - Click "Connect my account" button
   - **A popup window will appear**
   - Sign in with your Google account
   - Click "Allow" to give n8n permission
   - The popup will close

5. **Click "Save" button**

6. **Now configure the Sheet ID:**
   - Find the "Document" field
   - Click the dropdown
   - Select "By ID"
   - You'll see: `<__PLACEHOLDER_VALUE__Google Sheet ID for Candidates__>`
   - **Delete that and paste:** `1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0`

7. **Configure the Sheet name:**
   - Find the "Sheet" field
   - Type: `Candidates`

8. **Click outside the node** to save

✅ **DONE!** Node 2 configured.

---

## 📍 NODE 3: UPDATE CANDIDATE STATUS (2 minutes)

### What to do:

1. **Click on the "Update Candidate Status" node**
   - It's another green Google Sheets node
   - Near the end of the workflow

2. **Configuration panel opens**

3. **For "Credential to connect with":**
   - Click the dropdown
   - **Select the credential you just created** (it will show your Google account email)

4. **Configure the Sheet ID:**
   - Find "Document" field
   - Select "By ID"
   - Delete placeholder
   - **Paste:** `1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0`

5. **Configure Sheet name:**
   - Type: `Candidates`

6. **Click outside** to save

✅ **DONE!** Node 3 configured.

---

## 📍 NODE 4: SEND EMAIL (2 minutes)

### What to do:

1. **Click on the "Send Email" node**
   - Orange/red node near the end
   - Has Gmail icon

2. **Create Gmail credential:**
   - Click "Credential to connect with"
   - Click "Create New Credential"
   - Select "Gmail OAuth2 API"
   - Click "Connect my account"
   - Sign in with Google
   - Click "Allow"
   - Click "Save"

3. **IMPORTANT: Disable this node**
   - Right-click on the "Send Email" node
   - Click "Disable"
   - The node will turn gray

✅ **DONE!** Node 4 configured.

---

## 🚀 FINAL STEP: SAVE AND TEST (2 minutes)

### What to do:

1. **Click "Save" button** (top right corner)

2. **Click "Test workflow" button** (next to Save)

3. **Wait 30-60 seconds** while it runs

4. **Check your Google Sheet:**
   - Go to: https://docs.google.com/spreadsheets/d/1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0/edit
   - **You should see candidates added!**

✅ **SUCCESS!** You have real candidates!

---

## 📊 QUICK REFERENCE CARD

**Copy these values - you'll need them:**

```
Serper API Key:
7d9960e190bceaa3baeeb0662ff7e0c05ed170d6

Google Sheet ID:
1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0

Sheet Name:
Candidates

Company Name:
Nexus HR AI
```

---

## 🎯 SUMMARY - WHAT TO DO RIGHT NOW

1. Go to your n8n workflow tab
2. Click "Workflow Configuration" node → Paste API key
3. Click "Store Candidates" node → Connect Google Sheets → Paste Sheet ID
4. Click "Update Candidate Status" node → Use same credential → Paste Sheet ID
5. Click "Send Email" node → Connect Gmail → Disable node
6. Click "Save" → Click "Test workflow"
7. Check your Google Sheet for candidates!

**Total time: 10-12 minutes**

---

## 💬 TELL ME WHEN YOU'RE DONE

After you complete the configuration:

- Reply: "Configured and tested"
- Share: How many candidates you found
- Ask: Any questions about the results

I'll help you with the next steps:
- Adding email enrichment
- Enabling email sending
- Scheduling automatic runs
- Integrating with your Nexus HR AI app

---

**START NOW! It's easier than it looks!** 🚀

Just follow the steps above one by one.
