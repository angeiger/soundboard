/// <reference types="vite/client" />
import type { SoundboardApi } from '../../preload'

declare global {
  interface Window {
    api: SoundboardApi
  }
}

export {}
