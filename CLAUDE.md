# Sovereign Prompt — Claude Code Memory File

## What This Project Is
Sovereign Prompt is a B2B SaaS MVP — a privacy-preserving LLM proxy built 
for the Saudi Arabian market. It intercepts LLM requests, redacts sensitive 
data before sending to OpenAI, and re-injects the original data into the 
response. The goal is to help Saudi companies use AI tools without exposing 
sensitive citizen data to foreign servers.

## The Problem It Solves
Companies using ChatGPT are unknowingly sending sensitive Saudi citizen data 
to foreign servers. Sovereign Prompt sits in between and ensures that data 
never leaves the country in a readable form. This aligns with Saudi data 
sovereignty regulations.

## Monorepo Structure
sovereign-prompt/
├── backend/        # Node.js + Express proxy server
├── frontend/       # React + Vite split-screen dashboard
└── CLAUDE.md       # This file

## Tech Stack
- Backend: Node.js, Express, CORS, dotenv, OpenAI SDK
- Frontend: React, Vite, TailwindCSS, Lucide React
- No database yet (uses in-memory Map called tokenVault)

## How to Run the Project
Always run backend and frontend in separate terminal tabs.

Backend (Terminal 1):
cd backend
npm start
Runs on: http://localhost:3001

Frontend (Terminal 2):
cd frontend
npm run dev
Runs on: http://localhost:5173

## What the Backend Does
- Runs an Express server on port 3001
- Has a POST /api/chat endpoint
- Intercepts req.body.prompt before sending to OpenAI
- Redacts: Saudi National IDs, phone numbers, IBANs, emails, 
  passport numbers, and names
- Stores original values in an in-memory Map called tokenVault
- Replaces sensitive data with tokens like [KSA_ID_1], [KSA_ID_2]
- Sends sanitized prompt to OpenAI (or mock response if no API key)
- Re-injects original values into the LLM response before 
  sending to frontend
- Returns three things to frontend:
  1. finalResponse (re-injected string)
  2. sanitizedPayloadSentToLLM (what left the server)
  3. sanitizedResponseFromLLM (what OpenAI sent back)

## What the Frontend Does
- Split-screen dashboard
- Left panel: Chat interface (like ChatGPT)
- Right panel: Dark-mode security terminal showing live redaction logs
- Connected to http://localhost:3001/api/chat

## Redaction Logic
- Regex finds 10-digit numbers starting with 1 or 2
- Luhn check was removed — it incorrectly blocked valid Saudi IDs
- Any matching number is redacted and tokenized
- Tokens format: [KSA_ID_1], [KSA_ID_2], etc.

## Current Status
- Mock LLM mode is active (no real OpenAI key yet)
- Redaction is working and tested
- Frontend dashboard is working and tested

## Known Limitations
- tokenVault is in-memory only — resets every time server restarts
- No user authentication yet
- No database or logging yet
- No real OpenAI key connected yet

## Next Steps (Future Features)
- Connect a real OpenAI API key
- Add a database to persist redaction logs
- Add user authentication for B2B clients
- Add analytics dashboard
- Deploy online for client access
