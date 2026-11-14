// cron-auth.js 的类型声明（供 server/*.ts 引用）
export interface CronRequest { method?: string; headers?: Record<string, string | string[] | undefined> }
export interface CronResponse { setHeader(name: string, value: string): unknown; status(code: number): { json(body: unknown): unknown } }
export interface CronLog { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
export function safeEqual(a: unknown, b: unknown): boolean
export function requireCron(req: CronRequest, res: CronResponse, options?: { env?: Record<string, string | undefined>; log?: CronLog; tag?: string }): boolean
