/**
 * Populates public.knowledge_base with the sample dataset in seed-data.ts.
 * Run with: npm run seed
 * Requires SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL and
 * VOYAGE_API_KEY to be set in .env.local (dotenv loads it below).
 */
import { config } from "dotenv";
import path from "path";
import fs from "fs";

const envPath = path.resolve(process.cwd(), ".env.local");
console.log("Looking for env file at:", envPath);
console.log("File exists at that path:", fs.existsSync(envPath));

const result = config({ path: envPath });
if (result.error) {
  console.error("dotenv failed to parse the file:", result.error);
} else {
  console.log("Loaded keys:", Object.keys(result.parsed ?? {}));
}

import { createAdminClient } from "../lib/supabase/admin";
import { embedDocuments } from "../lib/embeddings";
import { SEED_ENTRIES } from "./seed-data";

const BATCH_SIZE = 8;
// Voyage's free tier (no payment method on file) allows 3 requests per
// minute. Spacing batches 21s apart keeps us comfortably under that even
// with a couple of retries.
const DELAY_BETWEEN_BATCHES_MS = 21_000;
const MAX_RETRIES = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedWithRetry(texts: string[]): Promise<number[][]> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await embedDocuments(texts);
    } catch (err: any) {
      const is429 = String(err.message).includes("429");
      if (!is429 || attempt === MAX_RETRIES) throw err;
      const backoff = 15_000 * attempt;
      console.log(
        `Rate limited (attempt ${attempt}/${MAX_RETRIES}) — waiting ${
          backoff / 1000
        }s before retrying...`
      );
      await sleep(backoff);
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const supabase = createAdminClient();
  console.log(`Seeding ${SEED_ENTRIES.length} knowledge base entries...`);

  for (let i = 0; i < SEED_ENTRIES.length; i += BATCH_SIZE) {
    const batch = SEED_ENTRIES.slice(i, i + BATCH_SIZE);
    const embeddings = await embedWithRetry(batch.map((e) => e.body));

    const rows = batch.map((entry, j) => ({
      domain: entry.domain,
      content_type: entry.content_type,
      title: entry.title,
      body: entry.body,
      url: entry.url ?? null,
      provider: entry.provider ?? null,
      is_free: entry.is_free,
      price_usd: entry.price_usd ?? null,
      skill_level: entry.skill_level ?? null,
      format: entry.format ?? null,
      tags: entry.tags ?? [],
      embedding: embeddings[j],
    }));

    const { error } = await supabase.from("knowledge_base").insert(rows);
    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      process.exit(1);
    }
    console.log(
      `Inserted ${Math.min(i + BATCH_SIZE, SEED_ENTRIES.length)}/${
        SEED_ENTRIES.length
      }`
    );

    const isLastBatch = i + BATCH_SIZE >= SEED_ENTRIES.length;
    if (!isLastBatch) {
      console.log(
        `Waiting ${DELAY_BETWEEN_BATCHES_MS / 1000}s before the next batch...`
      );
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
