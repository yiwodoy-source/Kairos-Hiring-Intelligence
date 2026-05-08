# 🔐 Nexus HR AI - Login Guide

## Login Credentials

```
Username: mayur
Password: mayur
```

## How to Access the Application

### Step 1: Start the Application

**Option A: Use the Batch File**
```bash
# Double-click or run:
start_app.bat
```

**Option B: Manual Start (if batch file doesn't work)**

Open **Command Prompt** (not PowerShell) and run:

```bash
# Terminal 1 - Backend
cd c:\Users\it.support\Desktop\nexus_HR_Ai\backend
npm run dev

# Terminal 2 - Frontend (open new terminal)
cd c:\Users\it.support\Desktop\nexus_HR_Ai
npm run dev
```

### Step 2: Open Browser

Navigate to: **http://localhost:3003**

### Step 3: Login

- **Username**: `mayur`
- **Password**: `mayur`

## Troubleshooting

### "Connection error. Please ensure the backend is running"

**Cause**: Backend server is not running on port 3001

**Solution**:
1. Check if backend terminal shows: `Server running on port 3001`
2. If not, restart backend:
   ```bash
   cd backend
   npm run dev
   ```
3. Wait for "Server running on port 3001" message
4. Refresh browser and try login again

### PowerShell Script Execution Error

**Cause**: PowerShell execution policy blocks npm scripts

**Solution**:
1. Use **Command Prompt** instead of PowerShell
2. Or run as Administrator:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

### Backend Won't Start

**Check**:
1. Node.js is installed: `node --version`
2. Dependencies installed: `cd backend && npm install`
3. Port 3001 is not in use: `netstat -ano | findstr :3001`

### Frontend Won't Start

**Check**:
1. Dependencies installed: `npm install`
2. Port 3003 is not in use: `netstat -ano | findstr :3003`

## After Successful Login

You'll see the Nexus HR AI dashboard with tabs:
- **Dashboard** - Overview and metrics
- **Recruitment** - Job postings and applications
- **Sourcing** - ⭐ **NEW! Candidate sourcing from LinkedIn/Indeed/Naukri**
- **Employees** - Employee management
- **Performance** - Performance reviews
- **AI Assistant** - AI-powered HR assistant

## Using the Candidate Sourcing Feature

1. Click on **"Sourcing"** tab
2. Enter job requirements:
   - Target Role: e.g., "Senior React Developer"
   - Skills: e.g., "React, TypeScript, Node.js"
   - Location: e.g., "Bangalore"
3. Click **"Start Discovery"**
4. View candidates from LinkedIn, Indeed, and Naukri
5. Click **"Add to Pipeline"** to start recruiting!

## Need Help?

- **Documentation**: See `CANDIDATE_SOURCING_GUIDE.md`
- **Backend Logs**: Check the backend terminal window
- **Frontend Logs**: Press F12 in browser → Console tab

---

**Default Admin Credentials**:
- Username: `mayur`
- Password: `mayur`

**Change these in**: `backend/.env` file
```env
ADMIN_USER=your_username
ADMIN_PASSWORD=your_password
```
