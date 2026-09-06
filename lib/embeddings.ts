// Server-only. Never import from a Client Component — the API key must
// never reach the browser bundle.
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
}

async function embed(
  input: string | string[],
  inputType: "query" | "document"
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("Missing VOYAGE_API_KEY");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input,
      model: process.env.VOYAGE_MODEL || "voyage-3",
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Voyage embeddings request failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as VoyageResponse;
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/** Embed a single survey query for retrieval against the knowledge base. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed(text, "query");
  return vector;
}

/** Embed one or more knowledge-base chunks for storage (used by the seed script). */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, "document");
}
