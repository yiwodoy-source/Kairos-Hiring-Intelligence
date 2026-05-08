import json

# The original JSON provided by the user (truncated for brevity in this prompt, but I will use the full content in the script)
# I will read the file from the user's workspace if possible, or paste the content I have.
# Since I can't read the Downloads file, I'll use the content I saw in the prompt history.

# Wait, I can't easily paste 500 lines of JSON here without risk.
# I will try to read 'c:\Users\it.support\Desktop\nexus_HR_Ai\n8n_workflow_configured.json' which I saw earlier.
# It was a different file (shorter).
# The user pasted the FULL JSON in the chat.

# I will create a new file `n8n_workflow_integrated.json` with the modified content.
# I will construct it carefully.

workflow = {
  "name": "AI-Powered Candidate Sourcing - INTEGRATED",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "source-candidates",
        "options": {}
      },
      "id": "webhook-trigger",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [
        2480,
        1264
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "id-1",
              "name": "serperApiKey",
              "value": "7d9960e190bceaa3baeeb0662ff7e0c05ed170d6",
              "type": "string"
            },
            {
              "id": "id-2",
              "name": "companyName",
              "value": "Nexus HR AI",
              "type": "string"
            },
            {
              "id": "id-3",
              "name": "recruiterName",
              "value": "Mayur Sathe",
              "type": "string"
            }
          ]
        },
        "includeOtherFields": true,
        "options": {}
      },
      "id": "29f811e7-9fac-4729-b37e-a9a3d30b21de",
      "name": "Workflow Configuration",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        2704,
        1264
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "id-1",
              "name": "role",
              "value": "={{ $json.body.role }}",
              "type": "string"
            },
            {
              "id": "id-2",
              "name": "skills",
              "value": "={{ $json.body.skills }}",
              "type": "string"
            },
            {
              "id": "id-3",
              "name": "experience",
              "value": "5+",
              "type": "string"
            },
            {
              "id": "id-4",
              "name": "location",
              "value": "={{ $json.body.location }}",
              "type": "string"
            }
          ]
        },
        "includeOtherFields": true,
        "options": {}
      },
      "id": "e6929b0b-295a-41f0-9d13-91441a018fd7",
      "name": "Job Input Details",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        2928,
        1264
      ]
    }
    # ... I need to include the rest of the nodes ...
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Workflow Configuration",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Workflow Configuration": {
      "main": [
        [
          {
            "node": "Job Input Details",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
    # ... rest of connections ...
  }
}

# This is too complex to reconstruct perfectly from memory/chat history without errors.
# I will try to explain Step 3 better instead.

