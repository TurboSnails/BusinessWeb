// Vercel Cron 专用：/api/market-data/candidate-alerts-digest（?dryRun=1 只返回邮件 JSON 不发信），需 CRON_SECRET。
// 实现在 server/candidate-alerts-digest.ts（TypeScript，和站内共用 src/features/candidates 的规则；Vercel 构建时编译）。
export { default } from '../candidate-alerts-digest.js'
