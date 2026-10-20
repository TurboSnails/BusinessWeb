interface Res {
  setHeader(name: string, value: string): unknown
  status(code: number): Res
  json(body: unknown): unknown
  end(): unknown
}
export default function handler(req: { method?: string; query: Record<string, unknown> }, res: Res): Promise<unknown>
