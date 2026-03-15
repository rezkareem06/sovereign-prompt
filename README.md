# Sovereign Prompt

A privacy-preserving LLM proxy built for the Saudi Arabian market. Intercepts prompts containing sensitive PII, redacts it before it reaches OpenAI, then re-injects the original data into the response — so your data never leaves your network in plaintext.

Built as an MVP to demonstrate PDPL (Personal Data Protection Law) compliance for enterprise LLM adoption.

---

## How It Works

```
User Prompt  →  Proxy intercepts  →  PII redacted  →  OpenAI (sanitized)
                                                              ↓
Final Response  ←  PII re-injected  ←  Proxy intercepts  ←  LLM Response
```

The UI shows all three stages in real-time in the Security Terminal panel.

---

## PII Types Detected

| Token | Type | Detection Method |
|---|---|---|
| `[KSA_ID_X]` | Saudi National ID | 10-digit number starting with 1 or 2 |
| `[KSA_PHONE_X]` | Phone number | `+966 5X` or `05X` formats |
| `[KSA_IBAN_X]` | IBAN | `SA` + 2 check digits + 20 BBAN chars |
| `[EMAIL_X]` | Email address | Standard `local@domain.tld` |
| `[PASSPORT_X]` | Passport number | 1-2 letters + 7-9 digits (requires "passport" keyword) |
| `[NAME_X]` | Full name | Keyword-triggered: after `Mr/Mrs/Dr`, `Name:`, `Employee:`, etc. |

---

## Project Structure

```
MyFirstProject/
├── backend/               # Node.js + Express proxy server
│   ├── server.js          # Main server, redaction & re-injection logic
│   ├── utils/
│   │   └── luhn.js        # Luhn algorithm utility
│   ├── __tests__/
│   │   ├── luhn.test.js       # Luhn unit tests
│   │   └── redaction.test.js  # All PII types, re-injection, false positives
│   ├── .env.example       # Copy to .env and add your OpenAI key
│   └── package.json
├── frontend/              # React + Vite dashboard
│   ├── src/
│   │   ├── App.jsx        # Split-screen UI (chat + security terminal)
│   │   ├── main.jsx
│   │   └── index.css
│   ├── vercel.json        # Vercel deployment config
│   └── package.json
├── .gitignore
└── package.json           # Root scripts for running both servers
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- An OpenAI API key (optional — runs in Mock Mode without one)

### 1. Install dependencies

```bash
# From the project root
npm run install:all
```

Or individually:
```bash
cd backend && npm install
cd frontend && npm install
```

### 2. Configure environment (optional)

```bash
cd backend
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

Without a key the server runs in **Mock Mode** — the redaction pipeline works fully, but responses come from a local mock instead of GPT-4o. Useful for demos and development.

### 3. Start the servers

Open two terminal tabs:

**Terminal 1 — Backend (port 3001):**
```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend (port 5173):**
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**

---

## Deploying for a Live Demo

Recommended: **Railway** (backend) + **Vercel** (frontend). Both have free tiers.

### Backend → Railway

1. Connect your GitHub repo at **railway.app**
2. Set root directory to `backend`
3. Add environment variables:
   - `OPENAI_API_KEY` — your OpenAI key
   - `ALLOWED_ORIGIN` — your Vercel frontend URL (locks down CORS)
4. Generate a public domain under Settings → Networking

### Frontend → Vercel

1. Import your GitHub repo at **vercel.com**
2. Set root directory to `frontend`
3. Add environment variable:
   - `VITE_API_URL` — your Railway backend URL + `/api/chat`
4. Deploy

---

## Test Prompts

**All six PII types in one prompt:**
```
employee: Ahmed Al-Rashidi, ID 1000000388, passport A12345678,
IBAN SA4420000001234567891234, +966 50 123 4567, ahmed@company.com.sa
```

**Names via title:**
```
Please update the records for Mr. Mohammed Abdullah and Dr. Fatima Al-Zahrani.
```

**Multiple IDs:**
```
Transfer the case from citizen 1000000388 to resident 2000000097.
```

**Passport (keyword required):**
```
Passport A12345678 was issued in Riyadh on 01/01/2020.
```

---

## Mock Mode vs Live Mode

| | Mock Mode | Live Mode |
|---|---|---|
| Requires API key | No | Yes |
| Response prefix | `[MOCK LLM]` | Natural language |
| Redaction pipeline | Fully functional | Fully functional |
| Response time | Instant | 1–3 seconds |
| Cost | Free | ~$0.01/request (gpt-4o) |

---

## Testing

The backend has a full Jest test suite covering all PII types, the Luhn algorithm, re-injection, and false positive defence.

### Run the tests

```bash
cd backend
npm test
```

### What's covered — 44 tests across 9 suites

| Suite | Tests | What it verifies |
|---|---|---|
| **Luhn algorithm** | 9 | Valid IDs pass, invalid/fake IDs fail, edge cases |
| **National ID** | 6 | Luhn gate, wrong length/prefix ignored |
| **Phone numbers** | 6 | All 5 formats (`+966` spaces, hyphens, compact, local) |
| **IBAN** | 4 | Compact, spaced, in-sentence, non-SA IBANs ignored |
| **Email** | 3 | Standard, `.com.sa` domains, multiple addresses |
| **Passport** | 3 | Keyword required, case-insensitive keyword match |
| **Names** | 7 | All title/field triggers, Arabic particles, no false positives |
| **Re-injection** | 3 | Single token, multiple types, no-token passthrough |
| **False positives** | 3 | Invoice/transaction IDs left untouched |

### Test files

```
backend/
└── __tests__/
    ├── luhn.test.js       # Luhn algorithm unit tests
    └── redaction.test.js  # All PII types, re-injection, false positives
```

---

## Architecture Notes

- **Token Vault** — an in-memory `Map` keyed by token (e.g. `[KSA_ID_1]`), storing the original PII value. Cleared on every request.
- **Redaction order** — IBANs → IDs → Phones → Emails → Passports → Names. Order prevents digit sequences inside IBANs from matching the ID pattern first.
- **Passport guard** — passport numbers are only redacted when the word "passport" appears in the prompt, preventing false positives on product codes and reference numbers.
- **Name detection** — keyword-triggered only (titles and field labels). Pure regex on arbitrary names produces too many false positives.
