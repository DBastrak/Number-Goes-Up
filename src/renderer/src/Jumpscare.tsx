import { useEffect, useRef } from 'react'
import foxyGif from './assets/foxy.gif'
import foxyMp3 from './assets/foxy.mp3'
import './styles/jumpscare.css'

// Rendered into the dedicated full-monitor overlay window (loaded with #jumpscare).
// Plays the gif + sound, then asks the main process to close this window.
export default function Jumpscare() {
  const audioRef = useRef(null)

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = 0
      audio.play().catch(() => {})
    }
  }, [])

  function done() {
    window.api?.closeJumpscare?.()
  }

  // Run for only half the clip: bail out once playback passes the midpoint.
  function onTimeUpdate(e) {
    const audio = e.currentTarget
    if (audio.duration && audio.currentTime >= audio.duration / 2) done()
  }

  return (
    <div className="jumpscare">
      {/* Luminance -> alpha: black pixels become transparent, the bright foxy stays.
          The 2x weights overdrive mid/bright tones toward fully opaque. */}
      <svg width="0" height="0" className="jumpscare-defs">
        <filter id="foxy-key" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    5 5 5 0 0"
          />
        </filter>
      </svg>

      <img className="jumpscare-gif" src={foxyGif} alt="" />
      <audio ref={audioRef} src={foxyMp3} autoPlay onTimeUpdate={onTimeUpdate} onEnded={done} />
    </div>
  )
}
