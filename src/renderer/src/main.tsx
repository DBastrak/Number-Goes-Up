import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Overlay from './Overlay'
import Jumpscare from './Jumpscare'
import { applyStoredTheme } from './utils/theme'
import './styles/global.css'

// The same bundle is loaded by the helper windows with a hash:
//   #overlay   -> the timer pill   #jumpscare -> the full-screen foxy overlay
const hash = window.location.hash
const isOverlay = hash === '#overlay'
const isJumpscare = hash === '#jumpscare'

// The overlay matches the app's colour theme + wallpaper background too; only the foxy
// jumpscare window stays untouched.
if (!isJumpscare) applyStoredTheme()

function Root() {
  if (isJumpscare) return <Jumpscare />
  if (isOverlay) return <Overlay />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
