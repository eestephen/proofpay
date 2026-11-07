import type { CatalogPort, CatalogProduct } from "./ports";

/** Approximate rates for showing foreign listings in the project currency. */
const FX: Record<string, Record<string, number>> = {
  USD: { SGD: 1.35, USD: 1 },
  SGD: { SGD: 1, USD: 0.74 },
};

function convertMinor(amount: number, from: string, to: string): number | null {
  const rate = FX[from]?.[to];
  return rate === undefined ? null : Math.round(amount * rate * 100);
}

/** Used when no CHANNEL3_API_KEY is set or Channel3 is unavailable. Prices in SGD. */
const FALLBACK: { keywords: string[]; title: string; sgd: number }[] = [
  { keywords: ["tile", "porcelain", "ceramic"], title: "Porcelain floor tile 60x60 cm, per m2", sgd: 30 },
  { keywords: ["grout"], title: "Cement grout 5 kg bag", sgd: 14 },
  { keywords: ["paint"], title: "Interior emulsion paint 5 L", sgd: 58 },
  { keywords: ["cement", "mortar"], title: "Portland cement 40 kg bag", sgd: 11 },
  { keywords: ["cabinet"], title: "Kitchen base cabinet 60 cm", sgd: 220 },
  { keywords: ["chair"], title: "Folding event chair, steel frame", sgd: 15 },
  { keywords: ["monitor", "screen"], title: "24-inch USB-C monitor", sgd: 210 },
  { keywords: ["banner", "roll-up"], title: "Roll-up banner stand 85x200 cm", sgd: 65 },
];

export function fallbackProducts(query: string): CatalogProduct[] {
  const q = query.toLowerCase();
  const hits = FALLBACK.filter((f) => f.keywords.some((k) => q.includes(k)));
  return (hits.length ? hits : FALLBACK.slice(0, 1)).map((f, i) => ({
    id: `fallback-${i}`,
    title: f.title,
    merchant: "ProofPay reference price list",
    url: null,
    priceMinor: f.sgd * 100,
    listedPrice: `SGD ${f.sgd.toFixed(2)}`,
    source: "fallback",
  }));
}

type Channel3Product = {
  id: string;
  title: string;
  offers?: { url?: string; domain?: string; price?: { price?: number; currency?: string }; availability?: string }[];
};

async function channel3Search(query: string, currency: string, key: string): Promise<CatalogProduct[]> {
  const res = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 6 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Channel3 search failed: ${res.status}`);
  const { products } = (await res.json()) as { products?: Channel3Product[] };
  const out: CatalogProduct[] = [];
  for (const p of products ?? []) {
    const offer = p.offers?.find((o) => o.price?.price && o.price.currency);
    if (!offer?.price?.price || !offer.price.currency) continue;
    const priceMinor = convertMinor(offer.price.price, offer.price.currency, currency);
    if (priceMinor === null) continue;
    out.push({
      id: p.id,
      title: p.title,
      merchant: offer.domain ?? "unknown",
      // Only plain web links reach an href.
      url: offer.url && /^https?:\/\//i.test(offer.url) ? offer.url : null,
      priceMinor,
      listedPrice: `${offer.price.currency} ${offer.price.price.toFixed(2)}`,
      source: "channel3",
    });
  }
  return out;
}

/** Real product prices from Channel3; falls back to a fixed list so the demo still runs. */
export const catalogAdapter: CatalogPort = {
  async search(query, currency) {
    const key = process.env.CHANNEL3_API_KEY;
    if (key) {
      try {
        const found = await channel3Search(query, currency, key);
        if (found.length) return found;
      } catch (err) {
        console.warn("[catalog] Channel3 unavailable, using fallback:", String(err));
      }
    }
    return fallbackProducts(query);
  },
};
