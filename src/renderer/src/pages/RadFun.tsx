import { useState } from 'react'
import Bingo from './Bingo'
import Roulette from './Roulette'
import '../styles/radfun.css'

// "RaD Fun" (Raids and Dungeons) — small hub with two toys: LFG Bingo and the
// raid/dungeon roulette wheel.

const SUB_TABS = [
  { id: 'bingo', label: 'Bingo' },
  { id: 'roulette', label: 'Roulette' }
]

export default function RadFun() {
  const [tab, setTab] = useState('bingo')

  return (
    <div className="radfun">
      <nav className="radfun-tabs">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            className={`radfun-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'bingo' && <Bingo />}
      {tab === 'roulette' && <Roulette />}
    </div>
  )
}
