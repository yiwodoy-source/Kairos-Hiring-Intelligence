# 🎯 n8n WORKFLOW CONFIGURATION - STEP BY STEP

**Your Credentials:**
- Serper API Key: `7d9960e190bceaa3baeeb0662ff7e0c05ed170d6`
- Google Sheet ID: `1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0`

---

## 📍 STEP 3A: CONFIGURE "WORKFLOW CONFIGURATION" NODE

**3A.1** In your n8n workflow canvas, find the **"Workflow Configuration"** node
   - It's the 2nd node from the left
   - Purple/blue colored node

**3A.2** Click on it to open the configuration panel

**3A.3** You'll see 3 fields with placeholder values. Update them:

   **Field 1: serperApiKey**
   - Delete: `<__PLACEHOLDER_VALUE__Serper API Key__>`
   - Paste: `7d9960e190bceaa3baeeb0662ff7e0c05ed170d6`

   **Field 2: companyName**
   - Delete: `<__PLACEHOLDER_VALUE__Your Company Name__>`
   - Type: `Nexus HR AI`

   **Field 3: recruiterName**
   - Delete: `<__PLACEHOLDER_VALUE__Recruiter Name__>`
   - Type: `Your Name` (your actual name)

**3A.4** Click outside the node or press ESC to save

✅ **Reply with: "Configured workflow settings"**

---

## 📍 STEP 3B: CONFIGURE "JOB INPUT DETAILS" NODE

**3B.1** Find the **"Job Input Details"** node
   - It's the 3rd node from the left
   - Right after "Workflow Configuration"

**3B.2** Click on it to open

**3B.3** Update the 4 fields with test job data:

   **Field 1: role**
   - Delete placeholder
   - Type: `Senior Backend Engineer`

   **Field 2: skills**
   - Delete placeholder
   - Type: `Node.js, Python, AWS, Docker, Kubernetes`

   **Field 3: experience**
   - Delete placeholder
   - Type: `5+`

   **Field 4: location**
   - Delete placeholder
   - Type: `Remote`

**3B.4** Click outside the node to save

✅ **Reply with: "Configured job details"**

---

## 📍 STEP 4: CONFIGURE "STORE CANDIDATES" NODE (GOOGLE SHEETS)

**4.1** Find the **"Store Candidates"** node
   - It's a green node in the middle of the workflow
   - Has a Google Sheets icon

**4.2** Click on it to open

**4.3** Configure Google Sheets credential:
   - Look for **"Credential to connect with"** dropdown
   - Click on it
   - Click **"Create New Credential"**
   - Select **"Google Sheets OAuth2 API"**

**4.4** Authorize Google Sheets:
   - Click **"Connect my account"** button
   - A popup window will open
   - **Sign in with your Google account**
   - Click **"Allow"** to give n8n permission
   - The popup will close automatically

**4.5** After authorization, click **"Save"** button

**4.6** Configure the Sheet:
   - In **"Document"** field:
     - Click the dropdown
     - Select **"By ID"**
     - Delete the placeholder: `<__PLACEHOLDER_VALUE__Google Sheet ID for Candidates__>`
     - Paste: `1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0`
   
   - In **"Sheet"** field:
     - Click the dropdown
     - Select **"By Name"**
     - Type: `Candidates`

**4.7** Click outside the node to save

✅ **Reply with: "Connected Store Candidates"**

---

## 📍 STEP 5: CONFIGURE "UPDATE CANDIDATE STATUS" NODE

**5.1** Find the **"Update Candidate Status"** node
   - It's another green Google Sheets node
   - Near the end of the workflow

**5.2** Click on it to open

**5.3** Use the same credential:
   - Click **"Credential to connect with"** dropdown
   - Select the credential you just created (should show your Google account)

**5.4** Configure the Sheet:
   - In **"Document"** field:
     - Select **"By ID"**
     - Delete placeholder
     - Paste: `1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0`
   
   - In **"Sheet"** field:
     - Type: `Candidates`

**5.5** Click outside the node to save

✅ **Reply with: "Connected Update Status"**

---

## 📍 STEP 6: CONFIGURE "SEND EMAIL" NODE (GMAIL)

**6.1** Find the **"Send Email"** node
   - It's an orange/red node near the end
   - Has a Gmail icon

**6.2** Click on it to open

**6.3** Configure Gmail credential:
   - Click **"Credential to connect with"** dropdown
   - Click **"Create New Credential"**
   - Select **"Gmail OAuth2 API"**

**6.4** Authorize Gmail:
   - Click **"Connect my account"** button
   - A popup window will open
   - **Sign in with your Google account**
   - Click **"Allow"** to give n8n permission to send emails
   - The popup will close automatically

**6.5** After authorization, click **"Save"** button

**6.6** IMPORTANT: Disable this node for testing:
   - Right-click on the **"Send Email"** node
   - Click **"Disable"**
   - The node will turn gray/inactive
   - This prevents sending real emails during testing

**6.7** Click outside to close

✅ **Reply with: "Connected Gmail and disabled"**

---

## 📍 STEP 7: SAVE THE WORKFLOW

**7.1** Click the **"Save"** button at the top right of the screen

**7.2** If prompted for a name, use: `AI Candidate Sourcing - Production`

**7.3** Wait for the save confirmation

✅ **Reply with: "Workflow saved"**

---

## 📍 STEP 8: TEST THE WORKFLOW! 🎉

**8.1** Click the **"Test workflow"** button (top right, next to Save)

**8.2** Watch the execution:
   - Nodes will execute one by one (left to right)
   - Each node will show a number badge when it completes
   - Green checkmarks ✓ = success
   - Red X = error
   - **This takes 30-60 seconds - be patient!**

**8.3** Monitor the execution:
   - You'll see nodes lighting up as they execute
   - Watch for any red error indicators

**8.4** After execution completes:
   - Click on each node to see what it did
   - Check these important nodes:
     - **"AI Query Builder"** - should show search queries
     - **"Search Public Profiles"** - should show Google results
     - **"AI Candidate Extractor"** - should show candidate data
     - **"Store Candidates"** - should show "success"
     - **"AI Email Drafter"** - should show email drafts

**8.5** Check your Google Sheet:
   - Go to: https://docs.google.com/spreadsheets/d/1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0/edit
   - You should see candidates added!
   - Check the data: names, roles, companies, skills

✅ **Reply with: "Workflow tested - [number] candidates found!"**

---

## 🎉 SUCCESS CRITERIA

After completing all steps, you should have:

- ✅ Workflow Configuration node with Serper API key
- ✅ Job Input Details node with test job
- ✅ Google Sheets connected via OAuth
- ✅ Gmail connected via OAuth (disabled for testing)
- ✅ Workflow saved
- ✅ Test execution completed successfully
- ✅ **Real candidates in your Google Sheet!**

---

## 🆘 TROUBLESHOOTING

### "Serper API authentication failed"
- Check if API key is copied correctly (no extra spaces)
- Verify: `7d9960e190bceaa3baeeb0662ff7e0c05ed170d6`

### "Google Sheets not found"
- Verify Sheet ID: `1TE8Sdj6yJG7k1bE2iBPEiQoAln5dMOe3g1VAE3bhlR0`
- Check sheet name is exactly: `Candidates`
- Re-authorize Google Sheets OAuth

### "No candidates found"
- Check if Serper returned results (click "Search Public Profiles" node)
- Try broader search terms
- Verify API key is working

### "OpenAI error"
- n8n free credits may be exhausted
- Add your own OpenAI API key in credentials

---

## 📊 WHAT'S NEXT?

After successful test:

1. **Review candidates** - Are they relevant to the job?
2. **Add email enrichment** - Use Hunter.io to find emails
3. **Enable email sending** - Test with your own email first
4. **Set up scheduling** - Run automatically daily/weekly
5. **Integrate with your app** - Connect to Nexus HR AI

---

**START WITH STEP 3A NOW!** 🚀

Configure the "Workflow Configuration" node with your Serper API key.

Let me know when you complete each step!
