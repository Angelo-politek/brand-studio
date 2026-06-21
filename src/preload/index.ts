import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '@shared/ipc'
import type { Api } from '@shared/ipc'

const api: Api = {
  app: {
    getPaths: () => ipcRenderer.invoke(IPC.appGetPaths),
    getPythonPort: () => ipcRenderer.invoke(IPC.appGetPythonPort),
    getPythonInfo: () => ipcRenderer.invoke(IPC.appGetPythonInfo),
    getPythonStatus: () => ipcRenderer.invoke(IPC.appGetPythonStatus),
    onPythonStatus: (cb) => {
      const handler = (_e: unknown, info: unknown): void =>
        cb(info as Parameters<typeof cb>[0])
      ipcRenderer.on('python:status', handler)
      return () => ipcRenderer.removeListener('python:status', handler)
    },
    saveBinary: (input) => ipcRenderer.invoke(IPC.appSaveBinary, input),
    openFileDialog: (opts) => ipcRenderer.invoke(IPC.appOpenFileDialog, opts),
    readFile: (absPath) => ipcRenderer.invoke(IPC.appReadFile, absPath),
    openPath: (relativePath) => ipcRenderer.invoke(IPC.appOpenPath, relativePath),
    showInFolder: (relativePath) => ipcRenderer.invoke(IPC.appShowInFolder, relativePath),
    deleteFile: (relativePath) => ipcRenderer.invoke(IPC.appDeleteFile, relativePath)
  },
  brands: {
    list: () => ipcRenderer.invoke(IPC.brandsList),
    get: (id) => ipcRenderer.invoke(IPC.brandsGet, id),
    create: (input) => ipcRenderer.invoke(IPC.brandsCreate, input),
    update: (brand) => ipcRenderer.invoke(IPC.brandsUpdate, brand),
    delete: (id) => ipcRenderer.invoke(IPC.brandsDelete, id)
  },
  assets: {
    list: (query) => ipcRenderer.invoke(IPC.assetsList, query),
    import: (input) => ipcRenderer.invoke(IPC.assetsImport, input),
    update: (asset) => ipcRenderer.invoke(IPC.assetsUpdate, asset),
    delete: (id) => ipcRenderer.invoke(IPC.assetsDelete, id)
  },
  projects: {
    list: (brandId) => ipcRenderer.invoke(IPC.projectsList, brandId),
    get: (id) => ipcRenderer.invoke(IPC.projectsGet, id),
    create: (input) => ipcRenderer.invoke(IPC.projectsCreate, input),
    update: (project) => ipcRenderer.invoke(IPC.projectsUpdate, project),
    delete: (id) => ipcRenderer.invoke(IPC.projectsDelete, id),
    saveThumb: (id, bytes) => ipcRenderer.invoke(IPC.projectsSaveThumb, id, bytes)
  },
  templates: {
    list: (brandId) => ipcRenderer.invoke(IPC.templatesList, brandId),
    get: (id) => ipcRenderer.invoke(IPC.templatesGet, id),
    create: (input) => ipcRenderer.invoke(IPC.templatesCreate, input),
    delete: (id) => ipcRenderer.invoke(IPC.templatesDelete, id),
    saveThumb: (id, bytes) => ipcRenderer.invoke(IPC.templatesSaveThumb, id, bytes)
  },
  exports: {
    list: (query) => ipcRenderer.invoke(IPC.exportsList, query),
    save: (input) => ipcRenderer.invoke(IPC.exportsSave, input)
  },
  planner: {
    list: (brandId) => ipcRenderer.invoke(IPC.plannerList, brandId),
    create: (input) => ipcRenderer.invoke(IPC.plannerCreate, input),
    update: (item) => ipcRenderer.invoke(IPC.plannerUpdate, item),
    delete: (id) => ipcRenderer.invoke(IPC.plannerDelete, id)
  },
  video: {
    list: (brandId) => ipcRenderer.invoke(IPC.videoList, brandId),
    get: (id) => ipcRenderer.invoke(IPC.videoGet, id),
    create: (input) => ipcRenderer.invoke(IPC.videoCreate, input),
    update: (vp) => ipcRenderer.invoke(IPC.videoUpdate, vp),
    delete: (id) => ipcRenderer.invoke(IPC.videoDelete, id),
    saveThumb: (id, bytes) => ipcRenderer.invoke(IPC.videoSaveThumb, id, bytes)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (defined in index.d.ts)
  window.electron = electronAPI
  // @ts-ignore (defined in index.d.ts)
  window.api = api
}
