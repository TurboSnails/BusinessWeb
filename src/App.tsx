import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
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

export default function App(): JSX.Element {
  // 开发环境检测：如果 URL 包含 /BusinessWeb，使用 basename
  const getBasename = () => {
    if (process.env.NODE_ENV === 'production') {
      return '/BusinessWeb'
    }
    // 开发环境：检查当前路径
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/BusinessWeb')) {
      return '/BusinessWeb'
    }
    return ''
  }

  return (
    <div className="app">
      <BrowserRouter basename={getBasename()}>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/pulse" element={<Pulse />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/investment-plan-2026" element={<InvestmentPlan2026 />} />
          <Route path="/investment-targets" element={<InvestmentTargetsPage />} />
          <Route path="/limit-up-analysis" element={<LimitUpAnalysis />} />
          <Route path="/trading-philosophy" element={<TradingPhilosophy />} />
          <Route path="/sector-rotation" element={<SectorRotation />} />
          <Route path="/mainland-investment-targets" element={<MainlandInvestmentTargets />} />
        </Routes>
        <Footer />
      </BrowserRouter>
    </div>
  )
}
