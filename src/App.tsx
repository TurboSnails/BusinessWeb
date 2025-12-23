import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import About from './pages/About'
import Pulse from './pages/Pulse'

export default function App(): JSX.Element {
  return (
    <div className="app">
      <BrowserRouter basename="/a">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/pulse" element={<Pulse />} />
        </Routes>
        <Footer />
      </BrowserRouter>
    </div>
  )
}
