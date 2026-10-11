import React from 'react'
import '../styles/research.css'

export default function CandidateButton({ on, onClick }: { on: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="rn-cand">
      {on ? '✓ 已候选' : '＋ 加入候选'}
    </button>
  )
}
