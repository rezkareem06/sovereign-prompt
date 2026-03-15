require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
// Saudi National IDs and Iqamas use the Luhn (Mod-10) algorithm.
// Luhn guards against false positives — without it, 10-digit invoice numbers,
// transaction IDs, and routing numbers starting with 1 or 2 would be redacted.
const { luhnCheck } = require('./utils/luhn');

const app = express();
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : '*',
}));
app.use(express.json());

// ---------------------------------------------------------------------------
// Token Vault — in-memory map for this request's redacted IDs
// Key:   token string  e.g. "[KSA_ID_1]"
// Value: original ID   e.g. "1000000388"
// ---------------------------------------------------------------------------
const tokenVault = new Map();

// KSA National IDs: exactly 10 digits, first digit is 1 (Saudi citizen) or 2 (resident)
const KSA_ID_REGEX = /\b([12]\d{9})\b/g;

// KSA Phone numbers — covers all common formats:
//   International : +966 5X XXX XXXX  |  +966-5X-XXX-XXXX  |  +96650XXXXXXX
//   Local         : 05X XXX XXXX       |  05XXXXXXXX
const KSA_PHONE_REGEX = /(?:\+966[\s\-]?|0)(5\d)[\s\-]?(\d{3})[\s\-]?(\d{4})\b/g;

// KSA IBANs: SA + 2 check digits + 20 BBAN digits = 24 characters total
//   With spaces: SA44 2000 0001 2345 6789 1234  (groups of 4)
//   Compact    : SA4420000001234567891234
const KSA_IBAN_REGEX = /\bSA\d{2}(?:[\s]?[0-9A-Z]{4}){5}\b/gi;

// Email addresses
const EMAIL_REGEX = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;

// Passport numbers: 1-2 uppercase letters + 7-9 digits.
//   Saudi: A12345678 (1 letter + 8 digits)
//   Other international formats also captured (UK, US, etc.)
// Requires a keyword anchor ("passport") in the same vicinity to avoid
// false-positives on product codes, reference numbers, etc.
const PASSPORT_REGEX = /\b(?=\S*[A-Z])(?=\S*\d)[A-Z]{1,2}\d{7,9}\b/g;
const PASSPORT_KEYWORD_RE = /passport/i;

// Names: keyword-triggered only — regex cannot safely detect arbitrary names
// without unacceptable false-positive rates on normal text.
// Triggers: titles (Mr/Mrs/Ms/Miss/Dr/Prof) or field labels (Name:, Employee:, etc.)
// Captures 1–3 name parts, including common Arabic particles (Al-, Bin, Bint, Abu, Abdul).
const NAME_TRIGGER_REGEX = /(?:(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+|(?:[Nn]ame|[Ff]ull\s[Nn]ame|[Ee]mployee|[Pp]atient|[Rr]esident|[Cc]ustomer|[Cc]itizen|[Aa]pplicant|[Oo]wner):\s*)([A-Z][a-zA-Z'-]+(?:\s+(?:(?:Al|El|Bin|Bint|Abu|Umm|Abdul|Abdel)-?\s*)?[A-Z][a-zA-Z'-]+){0,2})/g;

// ---------------------------------------------------------------------------
// Redaction — replaces all PII types with typed tokens.
// Order matters: run longer/more specific patterns first to avoid overlap.
// ---------------------------------------------------------------------------
function redactPrompt(prompt) {
  tokenVault.clear();
  let idCounter = 0;
  let phoneCounter = 0;
  let ibanCounter = 0;
  let emailCounter = 0;
  let passportCounter = 0;
  let nameCounter = 0;

  // Pass 1: IBANs (before IDs — IBANs contain digit sequences that could false-match)
  let sanitized = prompt.replace(KSA_IBAN_REGEX, (match) => {
    ibanCounter++;
    const token = `[KSA_IBAN_${ibanCounter}]`;
    tokenVault.set(token, match);
    console.log(`  [REDACT] ${match} → ${token}`);
    return token;
  });

  // Pass 2: National IDs — Luhn validates it's a real ID, not an invoice/transaction number
  sanitized = sanitized.replace(KSA_ID_REGEX, (match) => {
    if (!luhnCheck(match)) return match; // fails checksum — not a real ID, leave it
    idCounter++;
    const token = `[KSA_ID_${idCounter}]`;
    tokenVault.set(token, match);
    console.log(`  [REDACT] ${match} → ${token}`);
    return token;
  });

  // Pass 3: Phone numbers
  sanitized = sanitized.replace(KSA_PHONE_REGEX, (match) => {
    phoneCounter++;
    const token = `[KSA_PHONE_${phoneCounter}]`;
    tokenVault.set(token, match);
    console.log(`  [REDACT] ${match} → ${token}`);
    return token;
  });

  // Pass 4: Email addresses
  sanitized = sanitized.replace(EMAIL_REGEX, (match) => {
    emailCounter++;
    const token = `[EMAIL_${emailCounter}]`;
    tokenVault.set(token, match);
    console.log(`  [REDACT] ${match} → ${token}`);
    return token;
  });

  // Pass 5: Passport numbers — only redact if the word "passport" appears anywhere
  // in the prompt. This prevents false-positives on product codes like "AB1234567".
  if (PASSPORT_KEYWORD_RE.test(prompt)) {
    sanitized = sanitized.replace(PASSPORT_REGEX, (match) => {
      passportCounter++;
      const token = `[PASSPORT_${passportCounter}]`;
      tokenVault.set(token, match);
      console.log(`  [REDACT] ${match} → ${token}`);
      return token;
    });
  }

  // Pass 6: Names — keyword-triggered. Only the name portion (capture group 1)
  // is stored and replaced; the trigger word is preserved in the output.
  sanitized = sanitized.replace(NAME_TRIGGER_REGEX, (match, name) => {
    nameCounter++;
    const token = `[NAME_${nameCounter}]`;
    tokenVault.set(token, name);
    console.log(`  [REDACT] "${name}" → ${token}`);
    return match.replace(name, token);
  });

  return sanitized;
}

// ---------------------------------------------------------------------------
// Re-injection — replaces tokens in LLM response with original values
// ---------------------------------------------------------------------------
function reInjectResponse(response) {
  let result = response;
  for (const [token, original] of tokenVault.entries()) {
    result = result.replaceAll(token, original);
    console.log(`  [REINJECT] ${token} → ${original}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Mock LLM response (used when OPENAI_API_KEY is not set)
// Deliberately echoes the first token so re-injection can be demonstrated.
// ---------------------------------------------------------------------------
function buildMockResponse(sanitizedPrompt) {
  const hasId       = /\[KSA_ID_\d+\]/.test(sanitizedPrompt);
  const hasPhone    = /\[KSA_PHONE_\d+\]/.test(sanitizedPrompt);
  const hasIban     = /\[KSA_IBAN_\d+\]/.test(sanitizedPrompt);
  const hasEmail    = /\[EMAIL_\d+\]/.test(sanitizedPrompt);
  const hasPassport = /\[PASSPORT_\d+\]/.test(sanitizedPrompt);
  const hasName     = /\[NAME_\d+\]/.test(sanitizedPrompt);

  const parts = [];
  if (hasName)     parts.push(`The file for [NAME_1] has been retrieved.`);
  if (hasId)       parts.push(`Their national ID [KSA_ID_1] has been verified.`);
  if (hasPassport) parts.push(`Passport [PASSPORT_1] is valid.`);
  if (hasIban)     parts.push(`Payment to [KSA_IBAN_1] has been queued.`);
  if (hasPhone)    parts.push(`A confirmation SMS will be sent to [KSA_PHONE_1].`);
  if (hasEmail)    parts.push(`A receipt will be emailed to [EMAIL_1].`);

  if (parts.length > 0) {
    return `[MOCK LLM] Request received. ${parts.join(' ')} All data processed in accordance with PDPL compliance requirements.`;
  }
  return `[MOCK LLM] I have received your message: "${sanitizedPrompt}". How can I assist you further?`;
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'A non-empty "prompt" string is required.' });
  }

  console.log('\n─────────────────────────────────────────');
  console.log('[REQUEST] Raw prompt received:');
  console.log(' ', prompt);

  // Step 1: Redact
  const sanitizedPayloadSentToLLM = redactPrompt(prompt);
  console.log('[SANITIZED] Payload to be sent to LLM:');
  console.log(' ', sanitizedPayloadSentToLLM);

  // Step 2: Call LLM (or mock)
  let sanitizedResponseFromLLM;

  if (!process.env.OPENAI_API_KEY) {
    console.log('[LLM] No API key found — using Mock Mode.');
    sanitizedResponseFromLLM = buildMockResponse(sanitizedPayloadSentToLLM);
  } else {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [{ role: 'user', content: sanitizedPayloadSentToLLM }],
      });
      sanitizedResponseFromLLM = completion.choices[0].message.content;
    } catch (err) {
      console.error('[LLM ERROR]', err.message);
      return res.status(502).json({ error: `OpenAI API error: ${err.message}` });
    }
  }

  console.log('[LLM RESPONSE] Raw response from LLM:');
  console.log(' ', sanitizedResponseFromLLM);

  // Step 3: Re-inject original values
  const finalResponse = reInjectResponse(sanitizedResponseFromLLM);
  console.log('[FINAL] Re-injected response to client:');
  console.log(' ', finalResponse);
  console.log('─────────────────────────────────────────\n');

  // Step 4: Return all three payloads for the security terminal
  res.json({
    finalResponse,
    sanitizedPayloadSentToLLM,
    sanitizedResponseFromLLM,
  });
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║        Sovereign Prompt — Backend        ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(` Server  : http://localhost:${PORT}`);
  console.log(` OpenAI  : ${process.env.OPENAI_API_KEY ? '✓ API key loaded' : '⚠  No key — Mock Mode active'}`);
  console.log(` Model   : ${process.env.OPENAI_MODEL || 'gpt-4o (default)'}\n`);
});
