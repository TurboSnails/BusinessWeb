export type ResolvedLink = { target: string; label: string; path?: string; status: string }
export function resolveLinks(content: string, source: string, notes: {path:string;title?:string}[]): ResolvedLink[]
