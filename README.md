# Siddhant Voice - powered by Siddhant

A talk-to-it voice assistant. Frontend (browser) + backend (Python Flask) + API key generator.

```
siddhant-voice-assistant/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

## Run in VS Code

1. Install Python 3.9+ and open the `siddhant-voice-assistant` folder in VS Code.
2. Open the terminal (Ctrl + `) and run:

   ```bash
   cd backend
   python -m venv venv
   # Windows:      venv\Scripts\activate
   # Mac / Linux:  source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Create your settings file:
   - Copy `.env.example` to `.env` (inside `backend/`).
   - Put your Anthropic key in `ANTHROPIC_API_KEY` (get one at https://console.anthropic.com).
   - Choose any `ADMIN_PASSWORD`.

4. Start the server:

   ```bash
   python app.py
   ```

5. Open **http://localhost:5000** in Chrome or Edge.

## Generate your assistant API key

1. Click **Settings**.
2. Under **Generate a new API key**, enter your `ADMIN_PASSWORD` and a name, then click **Generate API key**.
3. The key (starts with `sid-`) is shown once and saved in your browser automatically.
4. Tap the orb, allow the microphone, and talk.

Only a hash of each key is stored (`backend/keys.json`). Delete an entry from that file to revoke a key.

## Notes

- Voice input uses the browser's speech recognition, so use Chrome or Edge. Voice output uses the browser's built-in voices.
- Your Anthropic key stays in the backend `.env` and is never sent to the browser. Do not commit `.env` or `keys.json`.
- Anthropic API usage is billed to your account.
- To change the personality, edit `SYSTEM_PROMPT` in `backend/app.py`.
- To change the model, set `CLAUDE_MODEL` in `.env`.
