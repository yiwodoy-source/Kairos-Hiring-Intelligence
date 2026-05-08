# Restart and Test Guide

## 1. Configure API Key (CRITICAL)
To get **real** candidate data, you must provide a Serper API key. The system now strictly refuses to generate fake data.

1.  Open `job_sourcing/.env` in your editor.
2.  Add your API key:
    ```
    SERPER_API_KEY=your_actual_api_key_here
    PORT=5000
    FLASK_ENV=development
    ```
    *Get a free key at [serper.dev](https://serper.dev/)*

## 2. Restart Application
Run the restart script to apply changes and restart both servers:

```bash
.\restart_app.bat
```

## 3. Verify Fix
1.  Log in to the app (`mayur` / `mayur`).
2.  Go to **Sourcing**.
3.  Enter a search (e.g., "React Developer", "Bangalore").
4.  **Expected Result:**
    *   **With API Key:** You should see real profiles found on LinkedIn/Indeed. Some fields like Email/Phone might be empty if not publicly visible.
    *   **Without API Key:** You will see **"No candidates found"**. This is intentional to prevent fake data.

## Troubleshooting
If you see "No candidates found" even with an API key:
*   Check the backend logs in the terminal.
*   Ensure the API key is correct and has credits.
*   Try a broader search term.
