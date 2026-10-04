import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import SectionChrome from './components/SectionChrome'
import NotFound from './pages/NotFound'
import InvestHub from './pages/InvestHub'
import AiStudio from './pages/AiStudio'
import LifeLab from './pages/LifeLab'
import Home from './pages/Home'
import About from './pages/About'
import Pulse from './pages/Pulse'
import Monitor from './pages/Monitor'
import InvestmentPlan2026 from './pages/InvestmentPlan2026'
import InvestmentTargetsPage from './pages/InvestmentTargetsPage'
import LimitUpAnalysis from './pages/LimitUpAnalysis'
import TradingPhilosophy from './pages/TradingPhilosophy'
import SectorRotation from './pages/SectorRotation'
import MainlandInvestmentTargets from './pages/MainlandInvestmentTargets'
import InvestmentStrategy from './pages/InvestmentStrategy'
import FirstBook from './pages/FirstBook'
import MyBooks from './pages/MyBooks'
import ResearchNotes from './pages/ResearchNotes'
import CompanyDetail from './pages/CompanyDetail'
import GridCalculator from './pages/GridCalculator'
import GridRecords from './pages/GridRecords'
import GridRecordDetail from './pages/GridRecordDetail'
import Valuation from './pages/Valuation'
import IndustryLandscape from './pages/IndustryLandscape'

export default function App(): JSX.Element {
  return (
    <div className="app">
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Header />
        <SectionChrome />
        <Routes>
          <Route path="/valuation" element={<Valuation />} />
          <Route path="/" element={<Home />} />
          <Route path="/invest" element={<InvestHub />} />
          <Route path="/ai" element={<AiStudio />} />
          <Route path="/life" element={<LifeLab />} />
          <Route path="/about" element={<About />} />
          <Route path="/pulse" element={<Pulse />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/investment-plan-2026" element={<InvestmentPlan2026 />} />
          <Route path="/investment-targets" element={<InvestmentTargetsPage />} />
          <Route path="/limit-up-analysis" element={<LimitUpAnalysis />} />
          <Route path="/trading-philosophy" element={<TradingPhilosophy />} />
          <Route path="/sector-rotation" element={<SectorRotation />} />
          <Route path="/mainland-investment-targets" element={<MainlandInvestmentTargets />} />
          <Route path="/investment-strategy" element={<InvestmentStrategy />} />
          <Route path="/first-book" element={<MyBooks />} />
          <Route path="/first-book/slow-is-fast" element={<FirstBook />} />
          <Route path="/first-book/:file" element={<FirstBook />} />
          <Route path="/industry-landscape" element={<IndustryLandscape />} />
          <Route path="/research-notes" element={<ResearchNotes />} />
          <Route path="/research-notes/:market/:code" element={<CompanyDetail />} />
          <Route path="/grid-trading" element={<GridCalculator />} />
          <Route path="/grid-trading/records" element={<GridRecords />} />
          <Route path="/grid-trading/records/:recordId" element={<GridRecordDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </BrowserRouter>
    </div>
  )
}
