import type { Api } from './index'

// Make `window.api` (exposed via contextBridge in preload) visible to the renderer.
declare global {
  interface Window {
    api: Api
  }
}

export {}
