const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  loadMemory: () => ipcRenderer.invoke('load-memory'),
  saveMemory: (data) => ipcRenderer.invoke('save-memory', data),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  speakElevenLabs: (data) => ipcRenderer.invoke('elevenlabs-speak', data),
  runPC: (cmd) => ipcRenderer.invoke('run-pc', cmd),
  getVolume: () => ipcRenderer.invoke('get-volume'),
  setVolume: (level) => ipcRenderer.invoke('set-volume', level),
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  startGmailAuth: () => ipcRenderer.invoke('gmail-auth'),
  startGoogleAuth: (url) => ipcRenderer.invoke('google-oauth', url),
  onAppClosing: (callback) => ipcRenderer.on('app-closing', callback),
  confirmReadyToClose: () => ipcRenderer.send('ready-to-close'),
})