// Custom window controls for the frameless Electron window.
// Lives inside the app UI now that the native title bar is gone.
export default function WindowControls() {
  const api = window.api ?? ({} as Window['api'])

  return (
    <div className="win-controls">
      <button
        className="win-btn"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => api.minimizeWindow?.()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <rect x="1" y="5" width="9" height="1" fill="currentColor" />
        </svg>
      </button>

      <button
        className="win-btn"
        title="Maximize"
        aria-label="Maximize"
        onClick={() => api.toggleMaximizeWindow?.()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <rect x="1.5" y="1.5" width="8" height="8" fill="none" stroke="currentColor" />
        </svg>
      </button>

      <button
        className="win-btn win-btn-close"
        title="Close"
        aria-label="Close"
        onClick={() => api.closeWindow?.()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <path d="M1 1 L10 10 M10 1 L1 10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  )
}
