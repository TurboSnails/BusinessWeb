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

export default function App(): JSX.Element {
  return (
    <div className="app">
      <BrowserRouter basename="/BusinessWeb">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/pulse" element={<Pulse />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/investment-plan-2026" element={<InvestmentPlan2026 />} />
          <Route path="/investment-targets" element={<InvestmentTargetsPage />} />
        </Routes>
        <Footer />
      </BrowserRouter>
    </div>
  )
}
