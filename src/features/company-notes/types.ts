export type CompanyNoteMeta = {
    id: string;
    market: string;
    code: string;
    title: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
};
export type CompanyNote = CompanyNoteMeta & {
    content: string;
};
export type NoteList = {
    items: CompanyNoteMeta[];
    hasMore: boolean;
};
export type NewCompanyNote = {
    id: string;
    market: string;
    code: string;
    title: string;
    content: string;
};
export type NoteUpdate = {
    id: string;
    expectedRevision: number;
    title: string;
    content: string;
};
export const MAX_NOTE_BYTES = 1024 * 1024;
export const validCompany = (market: unknown, code: unknown): boolean => typeof market === 'string' && ['us', 'cn', 'hk', 'adr', 'ndx'].includes(market) && typeof code === 'string' && /^[\w.\-^=]{1,32}$/.test(code);
