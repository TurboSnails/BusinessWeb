import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Header from './components/Header'
import Footer from './components/Footer'
import SectionChrome from './components/SectionChrome'
import RouteSeo from './components/RouteSeo'
import { CommandPaletteProvider } from './components/CommandPalette'
import { useTrackRecent } from './features/recent-pages/useTrackRecent'
import NotFound from './pages/NotFound'
import InvestHub from './pages/InvestHub'
import AiStudio from './pages/AiStudio'
import LifeLab from './pages/LifeLab'
import Home from './pages/Home'

// 重页面按路由拆包：首屏只下载首页和几个小页面，其余进入时再加载
const About = lazy(() => import('./pages/About'))
const BlogIndex = lazy(() => import('./pages/BlogIndex'))
const BlogArticle = lazy(() => import('./pages/BlogArticle'))
const Pulse = lazy(() => import('./pages/Pulse'))
const Monitor = lazy(() => import('./pages/Monitor'))
const InvestmentPlan2026 = lazy(() => import('./pages/InvestmentPlan2026'))
const InvestmentTargetsPage = lazy(() => import('./pages/InvestmentTargetsPage'))
const LimitUpAnalysis = lazy(() => import('./pages/LimitUpAnalysis'))
const DailyAnalysis = lazy(() => import('./pages/DailyAnalysis'))
const DailyAnalysisLegacy = lazy(() => import('./pages/DailyAnalysisLegacy'))
const TradingPhilosophy = lazy(() => import('./pages/TradingPhilosophy'))
const SectorRotation = lazy(() => import('./pages/SectorRotation'))
const MainlandInvestmentTargets = lazy(() => import('./pages/MainlandInvestmentTargets'))
const InvestmentStrategy = lazy(() => import('./pages/InvestmentStrategy'))
const FirstBook = lazy(() => import('./pages/FirstBook'))
const MyBooks = lazy(() => import('./pages/MyBooks'))
const ResearchNotes = lazy(() => import('./pages/ResearchNotes'))
const CompanyNotes = lazy(() => import('./features/company-notes/CompanyNotes'))
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'))
const GridCalculator = lazy(() => import('./pages/GridCalculator'))
const GridRecords = lazy(() => import('./pages/GridRecords'))
const GridRecordDetail = lazy(() => import('./pages/GridRecordDetail'))
const Valuation = lazy(() => import('./pages/Valuation'))
const ComprehensiveValuation = lazy(() => import('./pages/ComprehensiveValuation'))
const Dcf = lazy(() => import('./pages/Dcf'))
const Candidates = lazy(() => import('./pages/Candidates'))
const Radar = lazy(() => import('./pages/Radar'))
const WatchBoard = lazy(() => import('./pages/WatchBoard'))
const FutureTrends = lazy(() => import('./pages/FutureTrends'))
const SolidStateCompany = lazy(() => import('./pages/SolidStateCompany'))
const FutureTrendCompany = lazy(() => import('./pages/FutureTrendCompany'))
const IndustryLandscape = lazy(() => import('./pages/IndustryLandscape'))
const KnowledgeCenter = lazy(() => import('./pages/KnowledgeCenter'))
const EtfGuide = lazy(() => import('./pages/EtfGuide'))
const BondFundReport = lazy(() => import('./pages/BondFundReport'))
const IndustryEtf = lazy(() => import('./pages/IndustryEtf'))
const Notes = lazy(() => import('./pages/Notes'))
const NoteDetail = lazy(() => import('./pages/NoteDetail'))
const NationalTeam = lazy(() => import('./pages/NationalTeam'))
const AiLabDirection = lazy(() => import('./pages/AiLabDirection'))
const AiLearningPlan = lazy(() => import('./pages/AiLearningPlan'))
const DevTeamGuide = lazy(() => import('./pages/DevTeamGuide'))

function LegacyAiToolsRedirect(): JSX.Element {
  const { search, hash } = useLocation()
  return <Navigate to={`/ai/ai-skills${search}${hash}`} replace />
}

function PageLoading(): JSX.Element {
  return <div role="status" className="container page-loading">加载中…</div>
}

function RecentTracker(): null {
  useTrackRecent()
  return null
}

function RoutedBoundary({ children }: { children: React.ReactNode }): JSX.Element {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

/** 键盘与读屏用户跳过顶部导航：把焦点移到页面的 main（没有就退到 h1） */
function SkipLink(): JSX.Element {
  return (
    <a
      className="skip-link"
      href="#main-content"
      onClick={e => {
        e.preventDefault()
        const target = document.querySelector<HTMLElement>('main, [role="main"]') ?? document.querySelector<HTMLElement>('h1')
        if (!target) return
        target.setAttribute('tabindex', '-1')
        target.focus()
        target.scrollIntoView()
      }}
    >
      跳到主要内容
    </a>
  )
}

export default function App(): JSX.Element {
  return (
    <div className="app">
      <SkipLink />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <CommandPaletteProvider>
        <RecentTracker />
        <RouteSeo />
        <Header />
        <SectionChrome />
        <RoutedBoundary>
        <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/valuation" element={<Valuation />} />
          <Route path="/invest/comprehensive-valuation" element={<ComprehensiveValuation />} />
          <Route path="/dcf" element={<Dcf />} />
          <Route path="/" element={<Home />} />
          <Route path="/invest" element={<InvestHub />} />
          <Route path="/invest/ai-tools" element={<LegacyAiToolsRedirect />} />
          <Route path="/invest/etf" element={<EtfGuide />} />
          <Route path="/invest/bond-fund-report" element={<BondFundReport />} />
          <Route path="/industry-etf" element={<IndustryEtf />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/:slug" element={<NoteDetail />} />
          <Route path="/invest/national-team" element={<NationalTeam />} />
          <Route path="/ai" element={<AiStudio />} />
          <Route path="/ai/fullstack-roadmap" element={<AiLearningPlan />} />
          <Route path="/ai/dev-team" element={<DevTeamGuide />} />
          <Route path="/ai/:slug" element={<AiLabDirection />} />
          <Route path="/knowledge" element={<KnowledgeCenter />} />
          <Route path="/life" element={<LifeLab />} />
          <Route path="/about" element={<About />} />
          <Route path="/blog" element={<BlogIndex />} />
          <Route path="/blog/:slug" element={<BlogArticle />} />
          <Route path="/pulse" element={<Pulse />} />
          <Route path="/watch" element={<WatchBoard />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/investment-plan-2026" element={<InvestmentPlan2026 />} />
          <Route path="/investment-targets" element={<InvestmentTargetsPage />} />
          <Route path="/limit-up-analysis" element={<LimitUpAnalysis />} />
          <Route path="/daily-analysis" element={<DailyAnalysis />} />
          <Route path="/daily-analysis/legacy" element={<DailyAnalysisLegacy />} />
          <Route path="/trading-philosophy" element={<TradingPhilosophy />} />
          <Route path="/sector-rotation" element={<SectorRotation />} />
          <Route path="/mainland-investment-targets" element={<MainlandInvestmentTargets />} />
          <Route path="/investment-strategy" element={<InvestmentStrategy />} />
          <Route path="/first-book" element={<MyBooks />} />
          <Route path="/first-book/slow-is-fast" element={<FirstBook />} />
          <Route path="/first-book/read/:file" element={<FirstBook />} />
          <Route path="/first-book/:file" element={<FirstBook />} />
          <Route path="/future-trends" element={<FutureTrends />} />
          <Route path="/future-trends/solid-state/:id" element={<SolidStateCompany />} />
          <Route path="/future-trends/company/:id" element={<FutureTrendCompany />} />
          <Route path="/industry-landscape" element={<IndustryLandscape />} />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/radar" element={<Radar />} />
          <Route path="/research-notes" element={<ResearchNotes />} />
          <Route path="/research-notes/company/:market/:code/notes" element={<CompanyNotes />} />
          <Route path="/research-notes/:market/:code" element={<CompanyDetail />} />
          <Route path="/grid-trading" element={<GridCalculator />} />
          <Route path="/grid-trading/records" element={<GridRecords />} />
          <Route path="/grid-trading/records/:recordId" element={<GridRecordDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </RoutedBoundary>
        <Footer />
        </CommandPaletteProvider>
      </BrowserRouter>
    </div>
  )
}
