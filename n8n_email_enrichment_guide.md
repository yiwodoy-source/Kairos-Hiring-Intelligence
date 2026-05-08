# Email Enrichment Node Configuration for n8n Workflow

## Overview
This document explains how to add email enrichment to your n8n workflow to find candidate email addresses.

---

## Problem
The AI Candidate Extractor relies on publicly available Google search results, which rarely include email addresses. To send outreach emails, you need to enrich candidate data with email addresses.

---

## Solution: Add Email Enrichment Node

### Option 1: Hunter.io Integration (Recommended)

**Add this node between "AI Candidate Extractor" and "Store Candidates":**

#### Node Configuration

**Node Name:** Find Email with Hunter.io  
**Node Type:** HTTP Request

**Settings:**
```
Method: GET
URL: https://api.hunter.io/v2/email-finder
Authentication: None (use query parameter)

Query Parameters:
- api_key: {{ $('Workflow Configuration').first().json.hunterApiKey }}
- domain: {{ $json.company.toLowerCase().replace(/\s+/g, '') }}.com
- first_name: {{ $json.name.split(' ')[0] }}
- last_name: {{ $json.name.split(' ').slice(1).join(' ') }}

Options:
- Response Format: JSON
```

**Add to Workflow Configuration Node:**
```javascript
{
  "id": "hunter-api-key",
  "name": "hunterApiKey",
  "value": "<YOUR_HUNTER_API_KEY>",
  "type": "string"
}
```

**Hunter.io Pricing:**
- Free: 25 searches/month
- Starter: $49/month - 500 searches
- Growth: $99/month - 2,500 searches
- Business: $199/month - 10,000 searches

**Sign up:** https://hunter.io/

---

### Option 2: Apollo.io Integration

**Node Name:** Find Email with Apollo.io  
**Node Type:** HTTP Request

**Settings:**
```
Method: POST
URL: https://api.apollo.io/v1/people/match

Headers:
- Content-Type: application/json
- X-Api-Key: {{ $('Workflow Configuration').first().json.apolloApiKey }}

Body (JSON):
{
  "first_name": "{{ $json.name.split(' ')[0] }}",
  "last_name": "{{ $json.name.split(' ').slice(1).join(' ') }}",
  "organization_name": "{{ $json.company }}",
  "reveal_personal_emails": true
}
```

**Apollo.io Pricing:**
- Free: 50 email credits/month
- Basic: $49/month - 500 credits
- Professional: $99/month - 1,000 credits

**Sign up:** https://www.apollo.io/

---

### Option 3: Snov.io Integration

**Node Name:** Find Email with Snov.io  
**Node Type:** HTTP Request

**Settings:**
```
Method: POST
URL: https://api.snov.io/v1/get-emails-from-names

Headers:
- Content-Type: application/json

Body (JSON):
{
  "access_token": "{{ $('Workflow Configuration').first().json.snovApiKey }}",
  "firstName": "{{ $json.name.split(' ')[0] }}",
  "lastName": "{{ $json.name.split(' ').slice(1).join(' ') }}",
  "domain": "{{ $json.company.toLowerCase().replace(/\s+/g, '') }}.com"
}
```

**Snov.io Pricing:**
- Free: 50 credits/month
- Starter: $39/month - 1,000 credits
- Pro: $99/month - 5,000 credits

**Sign up:** https://snov.io/

---

## Implementation Steps

### Step 1: Choose a Service
Pick one of the three options above based on:
- Budget
- Monthly volume needs
- Accuracy requirements (Hunter.io generally has best accuracy)

### Step 2: Get API Key
1. Sign up for your chosen service
2. Navigate to API settings
3. Generate and copy your API key

### Step 3: Add to Workflow Configuration
Update the "Workflow Configuration" node to include your API key:

```javascript
{
  "assignments": {
    "assignments": [
      {
        "id": "id-1",
        "name": "serperApiKey",
        "value": "YOUR_SERPER_KEY",
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
        "value": "Your Name",
        "type": "string"
      },
      {
        "id": "id-4",
        "name": "hunterApiKey",  // or apolloApiKey or snovApiKey
        "value": "YOUR_EMAIL_ENRICHMENT_API_KEY",
        "type": "string"
      }
    ]
  }
}
```

### Step 4: Add HTTP Request Node
1. In n8n workflow editor, click the "+" between "AI Candidate Extractor" and "Store Candidates"
2. Search for "HTTP Request" node
3. Add the node
4. Configure using the settings from your chosen option above

### Step 5: Add Error Handling
Add a "Set" node after the email enrichment to handle cases where email is not found:

**Node Name:** Handle Email Result  
**Node Type:** Set

```javascript
{
  "assignments": {
    "assignments": [
      {
        "id": "email-field",
        "name": "email",
        "value": "={{ $json.data?.email || $json.person?.email || 'not_found@example.com' }}",
        "type": "string"
      },
      {
        "id": "email-confidence",
        "name": "email_confidence",
        "value": "={{ $json.data?.score || $json.confidence || 0 }}",
        "type": "number"
      }
    ]
  },
  "includeOtherFields": true
}
```

### Step 6: Add Conditional Logic
Add an "IF" node to only send emails when confidence is high:

**Node Name:** Check Email Quality  
**Node Type:** IF

```javascript
Conditions:
- {{ $json.email_confidence }} > 70
- {{ $json.email }} != "not_found@example.com"

True branch: Continue to "Send Email"
False branch: Store in Google Sheets with status "Email Not Found"
```

---

## Updated Workflow Flow

```
AI Candidate Extractor
    ↓
Find Email with Hunter.io (or Apollo/Snov)
    ↓
Handle Email Result
    ↓
Check Email Quality (IF node)
    ↓
├─ True → Store Candidates → AI Email Drafter → Send Email → Update Status
└─ False → Store Candidates (with "Email Not Found" status)
```

---

## Alternative: Manual Email Enrichment

If you prefer not to use paid services, you can:

1. **Store candidates without emails**
2. **Manually add emails to Google Sheet**
3. **Create a second workflow** triggered when email is added:

```
Schedule Trigger (every hour)
    ↓
Read Google Sheets (filter: status = "New" AND email != empty)
    ↓
AI Email Drafter
    ↓
Send Email
    ↓
Update Candidate Status
```

---

## Cost Comparison

For 100 candidates/month:

| Service | Cost | Notes |
|---------|------|-------|
| Hunter.io | $49/month | Best accuracy, 500 searches |
| Apollo.io | $49/month | Good for B2B, 500 credits |
| Snov.io | $39/month | Budget option, 1,000 credits |
| Manual | $0 | Time-intensive, requires manual work |

---

## Best Practices

1. **Verify emails before sending:** Use email verification to avoid bounces
2. **Respect privacy:** Only contact candidates who have public profiles
3. **Track confidence scores:** Only send to high-confidence emails (>70%)
4. **Monitor bounce rates:** High bounces may indicate poor email quality
5. **Comply with regulations:** Follow GDPR, CAN-SPAM, and other laws

---

## Testing

1. Test with a small batch (5-10 candidates) first
2. Verify email accuracy manually
3. Check bounce rates after first campaign
4. Adjust confidence threshold as needed

---

**Recommendation:** Start with Hunter.io free tier (25 searches) to test accuracy before committing to a paid plan.
