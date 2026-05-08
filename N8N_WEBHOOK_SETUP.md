# How to Connect Your n8n Workflow to Nexus HR AI

Your current workflow uses a **Manual Trigger**, which means it can only be started by clicking buttons in n8n. To let Nexus HR AI trigger it automatically, you need to add a **Webhook**.

## Step 1: Add a Webhook Node
1. Open your workflow in n8n.
2. Delete the **"When clicking 'Test workflow'"** node.
3. Click the **+** button to add a node.
4. Search for **"Webhook"** and select it.
5. Connect the Webhook node to the **"Workflow Configuration"** node.

## Step 2: Configure the Webhook
1. Double-click the Webhook node.
2. Set **HTTP Method** to `POST`.
3. Set **Path** to `source-candidates`.
4. Set **Authentication** to `None` (or configure if needed).
5. Set **Respond** to `Using Respond to Webhook Node` (recommended) or `Immediately`.

## Step 3: Handle the Input
The Nexus HR AI app sends data in this format:
```json
{
  "role": "Senior Developer",
  "skills": "React, Node.js",
  "location": "Remote"
}
```

You need to update your **"Job Input Details"** node to use these values instead of hardcoded ones.
Change the expressions to:
- Role: `{{ $json.body.role }}`
- Skills: `{{ $json.body.skills }}`
- Location: `{{ $json.body.location }}`

## Step 4: Get the URL
1. Save the workflow.
2. Click **"Activate"** (toggle top right).
3. Open the Webhook node again.
4. Click **"Production URL"**.
5. Copy the URL (e.g., `https://yiwodo.app.n8n.cloud/webhook/...`).

## Step 5: Final Verification
1. **Activate the Workflow**: In n8n, toggle the **"Active"** switch (top right) to ON.
2. **Restart the App**: If the app is running, restart the backend to load the new `.env` settings.
3. **Test**: Go to the "Recruitment" tab -> "AI Sourcing" -> Check "Use n8n Workflow" -> Click "Start Discovery".

I have already updated your `backend/.env` file with the Production URL:
`https://yiwodo.app.n8n.cloud/webhook/source-candidates`

If you encounter errors, ensure your Webhook node in n8n has the path set to `source-candidates` and Method `POST`.
