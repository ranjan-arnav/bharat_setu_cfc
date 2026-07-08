import { NextResponse } from 'next/server';

type SearchDoc = {
  id?: string;
  commodity?: string;
  crop?: string;
  market?: string;
  mandi?: string;
  district?: string;
  state?: string;
  modalPrice?: number | string;
  modal_price?: number | string;
  minPrice?: number | string;
  min_price?: number | string;
  maxPrice?: number | string;
  max_price?: number | string;
  updatedAt?: string;
  date?: string;
};

const FALLBACK = [
  { id: 'fb-1', commodity: 'Wheat', market: 'Karnal Mandi', state: 'Haryana', modalPrice: 2425, minPrice: 2360, maxPrice: 2490 },
  { id: 'fb-2', commodity: 'Paddy', market: 'Ludhiana Mandi', state: 'Punjab', modalPrice: 2280, minPrice: 2210, maxPrice: 2350 },
  { id: 'fb-3', commodity: 'Onion', market: 'Lasalgaon', state: 'Maharashtra', modalPrice: 1850, minPrice: 1720, maxPrice: 1970 },
  { id: 'fb-4', commodity: 'Tomato', market: 'Kolar APMC', state: 'Karnataka', modalPrice: 1420, minPrice: 1260, maxPrice: 1580 },
  { id: 'fb-5', commodity: 'Soybean', market: 'Indore Mandi', state: 'Madhya Pradesh', modalPrice: 4620, minPrice: 4480, maxPrice: 4750 },
];

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function mapDoc(doc: SearchDoc, index: number) {
  return {
    id: doc.id || `doc-${index}`,
    commodity: doc.commodity || doc.crop || 'Unknown',
    market: doc.market || doc.mandi || doc.district || 'Unknown Market',
    state: doc.state || 'India',
    modalPrice: toNumber(doc.modalPrice ?? doc.modal_price) ?? 0,
    minPrice: toNumber(doc.minPrice ?? doc.min_price),
    maxPrice: toNumber(doc.maxPrice ?? doc.max_price),
    updatedAt: doc.updatedAt || doc.date || undefined,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || 'wheat').trim();
    const state = String(body?.state || '').trim();
    const top = Math.min(Math.max(Number(body?.top || 10), 1), 25);

    const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
    const apiKey = process.env.AZURE_SEARCH_API_KEY;
    const indexName = process.env.AZURE_SEARCH_MANDI_INDEX || process.env.AZURE_SEARCH_INDEX;

    if (!endpoint || !apiKey || !indexName) {
      const rows = FALLBACK.filter((row) =>
        `${row.commodity} ${row.market} ${row.state}`.toLowerCase().includes(query.toLowerCase())
      ).slice(0, top);
      return NextResponse.json({ rows: rows.length ? rows : FALLBACK.slice(0, top), source: 'fallback' });
    }

    if (!endpoint) {
      return NextResponse.json({ success: true, analysis: 'Price data is currently unavailable. Using standard local estimates.' });
    }

    const url = `${endpoint.replace(/\/$/, '')}/indexes/${indexName}/docs/search?api-version=2023-11-01`;
    const searchBody: Record<string, unknown> = {
      search: query || '*',
      top,
      queryType: 'simple',
      searchMode: 'all',
    };

    if (state) {
      searchBody.filter = `state eq '${state.replace(/'/g, "''")}'`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Azure Search failed: ${response.status} ${text}`);
    }

    const json = await response.json();
    const docs = Array.isArray(json?.value) ? (json.value as SearchDoc[]) : [];
    const rows = docs.map(mapDoc).filter((row) => row.modalPrice > 0);

    if (!rows.length) {
      const fallback = FALLBACK.filter((row) =>
        `${row.commodity} ${row.market} ${row.state}`.toLowerCase().includes(query.toLowerCase())
      ).slice(0, top);
      return NextResponse.json({ rows: fallback.length ? fallback : FALLBACK.slice(0, top), source: 'fallback' });
    }

    return NextResponse.json({ rows, source: 'azure-search' });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Mandi search failed',
      },
      { status: 500 }
    );
  }
}
