export default function handler(req: { method?: string; query: Record<string, unknown> }, res: {
  setHeader(name: string, value: string): unknown
  status(code: number): any
  json(body: unknown): unknown
  end(): unknown
}): Promise<unknown>
