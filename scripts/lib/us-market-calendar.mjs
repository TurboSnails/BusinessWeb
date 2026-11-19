// NYSE Group's preceding calendars cover historical dates no longer on the current page.
// https://ir.theice.com/press/news-details/2023/NYSE-Group-Announces-2024-2025-and-2026-Holiday-and-Early-Closings-Calendar/default.aspx
// https://ir.theice.com/press/news-details/2024/NYSE-Group-Announces-2025-2026-and-2027-Holiday-and-Early-Closings-Calendar/default.aspx
export const NYSE_SHORT_SESSIONS_SOURCE = 'https://www.nyse.com/trade/hours-calendars'

export const NYSE_SHORT_SESSIONS = Object.freeze([
  '2024-07-03', '2024-11-29', '2024-12-24',
  '2025-07-03', '2025-11-28', '2025-12-24',
  '2026-11-27', '2026-12-24',
  '2027-11-26',
  '2028-07-03', '2028-11-24',
])
