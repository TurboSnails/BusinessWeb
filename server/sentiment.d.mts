export interface SentimentSnapshot {
  equityPC: number | null
  spxPC: number | null
  pcDate: string | null
  vix: number | null
  vix3m: number | null
  vixDate: string | null
  gexBn: number | null
  gexDate: string | null
  goldSilver: number | null
  goldSilverDate: string | null
  warnings: string[]
}
export function parseCboe(body: unknown): { equityPC: number | null; spxPC: number | null }
export function parseGexCsv(text: string): { date: string; gexBn: number } | null
export function recentDates(now?: Date, n?: number): string[]
export function buildSentiment(fetchImpl?: (url: string, init?: RequestInit) => Promise<unknown>, now?: Date): Promise<SentimentSnapshot>
export function sentimentMiddleware(req: unknown, res: unknown, next: () => void): Promise<void>
