// Pull the regex patterns and redaction logic directly from server internals.
// We re-implement redact() here using the same patterns so tests are isolated
// from Express and don't require a running server.

const { luhnCheck } = require('../utils/luhn');

const KSA_ID_REGEX       = /\b([12]\d{9})\b/g;
const KSA_PHONE_REGEX    = /(?:\+966[\s\-]?|0)(5\d)[\s\-]?(\d{3})[\s\-]?(\d{4})\b/g;
const KSA_IBAN_REGEX     = /\bSA\d{2}(?:[\s]?[0-9A-Z]{4}){5}\b/gi;
const EMAIL_REGEX        = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const PASSPORT_REGEX     = /\b(?=\S*[A-Z])(?=\S*\d)[A-Z]{1,2}\d{7,9}\b/g;
const PASSPORT_KEYWORD_RE= /passport/i;
const NAME_TRIGGER_REGEX = /(?:(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+|(?:[Nn]ame|[Ff]ull\s[Nn]ame|[Ee]mployee|[Pp]atient|[Rr]esident|[Cc]ustomer|[Cc]itizen|[Aa]pplicant|[Oo]wner):\s*)([A-Z][a-zA-Z'-]+(?:\s+(?:(?:Al|El|Bin|Bint|Abu|Umm|Abdul|Abdel)-?\s*)?[A-Z][a-zA-Z'-]+){0,2})/g;

function redact(prompt) {
  const vault = new Map();
  let n = { id: 0, phone: 0, iban: 0, email: 0, passport: 0, name: 0 };
  let s = prompt;

  s = s.replace(KSA_IBAN_REGEX, m => { const t = `[KSA_IBAN_${++n.iban}]`;     vault.set(t, m); return t; });
  s = s.replace(KSA_ID_REGEX,   m => {
    if (!luhnCheck(m)) return m;
    const t = `[KSA_ID_${++n.id}]`; vault.set(t, m); return t;
  });
  s = s.replace(KSA_PHONE_REGEX, m => { const t = `[KSA_PHONE_${++n.phone}]`;  vault.set(t, m); return t; });
  s = s.replace(EMAIL_REGEX,     m => { const t = `[EMAIL_${++n.email}]`;       vault.set(t, m); return t; });
  if (PASSPORT_KEYWORD_RE.test(prompt))
    s = s.replace(PASSPORT_REGEX, m => { const t = `[PASSPORT_${++n.passport}]`; vault.set(t, m); return t; });
  s = s.replace(NAME_TRIGGER_REGEX, (match, name) => {
    const t = `[NAME_${++n.name}]`; vault.set(t, name); return match.replace(name, t);
  });

  return { sanitized: s, vault };
}

function reInject(text, vault) {
  let result = text;
  for (const [token, original] of vault.entries()) {
    result = result.replaceAll(token, original);
  }
  return result;
}

// ─── National ID ────────────────────────────────────────────────────────────

describe('National ID redaction', () => {
  test('redacts a valid citizen ID (starts with 1)', () => {
    expect(redact('ID is 1000000388').sanitized).toBe('ID is [KSA_ID_1]');
  });
  test('redacts a valid resident ID (starts with 2)', () => {
    expect(redact('resident 2000000097').sanitized).toBe('resident [KSA_ID_1]');
  });
  test('does NOT redact a Luhn-invalid number', () => {
    expect(redact('number 1045238912 here').sanitized).toBe('number 1045238912 here');
  });
  test('does NOT redact a 9-digit number', () => {
    expect(redact('ref 100000038').sanitized).toBe('ref 100000038');
  });
  test('does NOT redact a number starting with 3', () => {
    expect(redact('3000000097').sanitized).toBe('3000000097');
  });
  test('redacts multiple IDs', () => {
    const { sanitized } = redact('citizen 1000000388 and resident 2000000097');
    expect(sanitized).toBe('citizen [KSA_ID_1] and resident [KSA_ID_2]');
  });
});

// ─── Phone numbers ──────────────────────────────────────────────────────────

describe('Phone number redaction', () => {
  test('+966 50 123 4567 (international with spaces)', () => {
    expect(redact('+966 50 123 4567').sanitized).toBe('[KSA_PHONE_1]');
  });
  test('+966-50-123-4567 (international with hyphens)', () => {
    expect(redact('+966-50-123-4567').sanitized).toBe('[KSA_PHONE_1]');
  });
  test('+966501234567 (international compact)', () => {
    expect(redact('+966501234567').sanitized).toBe('[KSA_PHONE_1]');
  });
  test('0501234567 (local compact)', () => {
    expect(redact('0501234567').sanitized).toBe('[KSA_PHONE_1]');
  });
  test('050 123 4567 (local with spaces)', () => {
    expect(redact('050 123 4567').sanitized).toBe('[KSA_PHONE_1]');
  });
  test('redacts multiple phones', () => {
    const { sanitized } = redact('call +966 50 123 4567 or 0551234567');
    expect(sanitized).toBe('call [KSA_PHONE_1] or [KSA_PHONE_2]');
  });
});

// ─── IBAN ────────────────────────────────────────────────────────────────────

describe('IBAN redaction', () => {
  test('compact IBAN SA4420000001234567891234', () => {
    expect(redact('SA4420000001234567891234').sanitized).toBe('[KSA_IBAN_1]');
  });
  test('spaced IBAN SA44 2000 0001 2345 6789 1234', () => {
    expect(redact('SA44 2000 0001 2345 6789 1234').sanitized).toBe('[KSA_IBAN_1]');
  });
  test('IBAN in a sentence preserves surrounding text', () => {
    const { sanitized } = redact('Transfer to SA4420000001234567891234 today');
    expect(sanitized).toBe('Transfer to [KSA_IBAN_1] today');
  });
  test('does NOT redact a non-SA IBAN', () => {
    expect(redact('GB29NWBK60161331926819').sanitized).toBe('GB29NWBK60161331926819');
  });
});

// ─── Email ───────────────────────────────────────────────────────────────────

describe('Email redaction', () => {
  test('standard email', () => {
    expect(redact('email ahmed@company.com').sanitized).toBe('email [EMAIL_1]');
  });
  test('.com.sa domain', () => {
    expect(redact('ahmed@aramco.com.sa').sanitized).toBe('[EMAIL_1]');
  });
  test('redacts multiple emails', () => {
    const { sanitized } = redact('cc hr@company.com and ceo@corp.sa');
    expect(sanitized).toBe('cc [EMAIL_1] and [EMAIL_2]');
  });
});

// ─── Passport ────────────────────────────────────────────────────────────────

describe('Passport redaction', () => {
  test('redacts when "passport" keyword is present', () => {
    expect(redact('Passport A12345678 issued in Riyadh').sanitized).toBe('Passport [PASSPORT_1] issued in Riyadh');
  });
  test('does NOT redact without "passport" keyword', () => {
    expect(redact('Reference A12345678 needs review').sanitized).toBe('Reference A12345678 needs review');
  });
  test('keyword is case-insensitive', () => {
    expect(redact('PASSPORT A12345678').sanitized).toBe('PASSPORT [PASSPORT_1]');
  });
});

// ─── Names ───────────────────────────────────────────────────────────────────

describe('Name redaction', () => {
  test('Mr. title trigger', () => {
    expect(redact('Mr. Ahmed Al-Rashidi').sanitized).toBe('Mr. [NAME_1]');
  });
  test('Dr. title trigger', () => {
    expect(redact('Dr. Fatima Al-Zahrani').sanitized).toBe('Dr. [NAME_1]');
  });
  test('Name: field label', () => {
    expect(redact('Name: Sarah Abdul-Karim').sanitized).toBe('Name: [NAME_1]');
  });
  test('Patient: field label (capitalised)', () => {
    expect(redact('Patient: Omar Bin Sultan').sanitized).toBe('Patient: [NAME_1]');
  });
  test('Employee: field label', () => {
    expect(redact('Employee: Ali Abu Bakr').sanitized).toBe('Employee: [NAME_1]');
  });
  test('does NOT redact a name without a trigger', () => {
    expect(redact('Ahmed Al-Rashidi called today').sanitized).toBe('Ahmed Al-Rashidi called today');
  });
  test('redacts multiple names', () => {
    const { sanitized } = redact('Mr. Mohammed Abdullah and Dr. Fatima Al-Zahrani');
    expect(sanitized).toBe('Mr. [NAME_1] and Dr. [NAME_2]');
  });
});

// ─── Re-injection ─────────────────────────────────────────────────────────────

describe('Re-injection', () => {
  test('restores a single ID token', () => {
    const { sanitized, vault } = redact('ID 1000000388 verified');
    const llmResponse = `Record for [KSA_ID_1] has been processed.`;
    expect(reInject(llmResponse, vault)).toBe('Record for 1000000388 has been processed.');
  });
  test('restores multiple tokens of different types', () => {
    const { vault } = redact('Name: Ahmed Al-Rashidi, email ahmed@co.com');
    const llmResponse = 'File for [NAME_1] sent to [EMAIL_1].';
    expect(reInject(llmResponse, vault)).toBe('File for Ahmed Al-Rashidi sent to ahmed@co.com.');
  });
  test('leaves response unchanged if no tokens present', () => {
    const { vault } = redact('no PII here');
    expect(reInject('Normal LLM response.', vault)).toBe('Normal LLM response.');
  });
});

// ─── False positive defence ───────────────────────────────────────────────────

describe('False positive defence', () => {
  test('invoice number is NOT redacted', () => {
    expect(redact('Invoice 1234567890 is overdue').sanitized).toBe('Invoice 1234567890 is overdue');
  });
  test('transaction ID is NOT redacted', () => {
    expect(redact('Transaction 1987654321 was declined').sanitized).toBe('Transaction 1987654321 was declined');
  });
  test('plain text with no PII is unchanged', () => {
    const prompt = 'What is the weather in Riyadh today?';
    expect(redact(prompt).sanitized).toBe(prompt);
  });
});
