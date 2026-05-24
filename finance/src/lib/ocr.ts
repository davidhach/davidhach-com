/**
 * Statement OCR via the Claude vision API.
 *
 * One pass: the model both transcribes the visible transactions and proposes a
 * coarse category. Output is JSON, strictly validated against `ocrResponse`.
 * The model's text is NEVER executed — only treated as data, then reviewed by
 * the user before any DB write becomes "confirmed".
 */
import Anthropic from "@anthropic-ai/sdk";
import { ocrResponse, type OcrResponse } from "./validation";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You extract structured transactions from images of bank statements,
credit-card statements, or banking-app screenshots.

Return ONLY a JSON object matching this schema (no prose, no markdown fences):

{
  "accountHint": string | null,            // e.g. last 4 digits, account name visible
  "statementPeriod": { "start": "YYYY-MM-DD" | null, "end": "YYYY-MM-DD" | null } | null,
  "detectedCurrency": "USD" | "EUR" | ... | null,   // ISO 4217 if visible
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": string,               // verbatim or lightly cleaned
      "merchant": string | null,           // canonical merchant if you can infer it (e.g. "Starbucks" not "STARBUCKS #1234 NEW YORK NY")
      "amount": "-12.34",                  // signed: negative = outflow / debit, positive = inflow / credit. STRING, two decimals.
      "currency": "USD",                   // ISO 4217. Inherit from detectedCurrency if needed.
      "categoryGuess": string | null,      // one of: Groceries, Restaurants, Coffee, Transport, Travel, Utilities, Rent, Mortgage, Insurance, Subscriptions, Entertainment, Shopping, Health, Fitness, Education, Income, Transfer, Fees, Taxes, Other
      "confidence": number                 // 0..1, your confidence in THIS row
    }
  ],
  "warnings": [string],                    // anything ambiguous: cropped rows, unreadable amounts, multiple statements visible, etc.
  "overallConfidence": number              // 0..1 for the whole extraction
}

Rules:
- Use YYYY-MM-DD. If the year is missing, infer from statementPeriod; if that's also missing, use the current year and add a warning.
- Sign convention: spending is NEGATIVE, income/refunds POSITIVE.
- Skip running balances, totals, and section headers. Only individual transactions.
- If you cannot read a value confidently, omit the entire row and add a warning.
- Do NOT invent transactions. Better to return fewer rows than to fabricate.
- Output a single JSON object. No commentary before or after.`;

export interface OcrResult {
  parsed: OcrResponse;
  rawText: string;
  model: string;
}

export async function extractTransactions(args: {
  imageBytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}): Promise<OcrResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: args.mimeType, data: args.imageBytes.toString("base64") },
          },
          { type: "text", text: "Extract every transaction from this statement screenshot." },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const json = extractJsonObject(text);
  const parsed = ocrResponse.parse(json);

  return { parsed, rawText: text, model: MODEL };
}

/**
 * Defensive JSON extraction: the model is instructed to return raw JSON, but if
 * it slips into a ```json fence or adds a leading sentence, recover gracefully.
 */
function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("OCR response did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Normalises a merchant string for duplicate detection. */
export function normalizeMerchant(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}
