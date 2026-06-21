import { ElectronAPI } from '@electron-toolkit/preload'
import type { Api } from '@shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
