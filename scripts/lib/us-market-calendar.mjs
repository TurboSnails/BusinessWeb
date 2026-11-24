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

// Earlier 1 p.m. closes (day after Thanksgiving, July 3 and December 24 on
// regular weekdays), used only when rebuilding older Cboe volume history.
// https://www.nyse.com/publicdocs/nyse/markets/nyse/NYSE_Holidays_and_Early_Closings_Calendar.pdf
export const NYSE_HISTORICAL_SHORT_SESSIONS = Object.freeze([
  '2010-11-26',
  '2011-11-25',
  '2012-07-03', '2012-11-23', '2012-12-24',
  '2013-07-03', '2013-11-29', '2013-12-24',
  '2014-07-03', '2014-11-28', '2014-12-24',
  '2015-11-27', '2015-12-24',
  '2016-11-25',
  '2017-07-03', '2017-11-24',
  '2018-07-03', '2018-11-23', '2018-12-24',
  '2019-07-03', '2019-11-29', '2019-12-24',
  '2020-11-27', '2020-12-24',
  '2021-11-26',
  '2022-11-25',
  '2023-07-03', '2023-11-24',
])
