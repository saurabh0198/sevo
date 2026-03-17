const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  loadMemory: () => ipcRenderer.invoke('load-memory'),
  saveMemory: (data) => ipcRenderer.invoke('save-memory', data),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  runCommand: (cmd) => ipcRenderer.invoke('run-command', cmd),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot')
})