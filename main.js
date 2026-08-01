const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')
const os = require('os')
const http = require('http')

const memoryPath = path.join(app.getPath('userData'), 'sevo_memory.json')

function loadMemory() {
  try {
    if (fs.existsSync(memoryPath)) {
      return JSON.parse(fs.readFileSync(memoryPath, 'utf8'))
    }
  } catch(e) {}
  return []
}

function saveMemory(data) {
  try {
    fs.writeFileSync(memoryPath, JSON.stringify(data), 'utf8')
  } catch(e) {}
}

ipcMain.handle('load-memory', () => loadMemory())
ipcMain.handle('save-memory', (event, data) => saveMemory(data))

ipcMain.handle('open-url', (event, url) => {
  shell.openExternal(url)
})

ipcMain.handle('minimize-window', () => {
  BrowserWindow.getFocusedWindow()?.minimize()
})

ipcMain.handle('close-window', () => {
  BrowserWindow.getFocusedWindow()?.close()
})

ipcMain.handle('run-pc', (event, cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve({ success: !error, output: stdout || stderr || '' })
    })
  })
})

ipcMain.handle('get-system-info', () => {
  return {
    platform: os.platform(),
    hostname: os.hostname(),
    uptime: Math.floor(os.uptime() / 3600) + ' hours',
    totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
    freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)) + ' GB',
    cpus: os.cpus()[0].model
  }
})

ipcMain.handle('take-screenshot', () => {
  const screenshotPath = path.join(app.getPath('pictures'), `sevo_${Date.now()}.png`)
  exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bitmap = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bitmap.Save('${screenshotPath}') }"`)
  return screenshotPath
})

// ── GMAIL OAuth — local server captures auth code ─────────
let gmailAuthServer = null

ipcMain.handle('gmail-auth', async () => {
  return new Promise(async (resolve, reject) => {
    try {
      if (gmailAuthServer) {
        try { gmailAuthServer.close() } catch(_) {}
        gmailAuthServer = null
        await new Promise(r => setTimeout(r, 500))
      }

      const res = await fetch('https://sevo-backend.onrender.com/api/gmail/auth-url')
      const data = await res.json()
      const authUrl = data.auth_url

      const code = await new Promise((resolveCode, rejectCode) => {
        let resolved = false

        gmailAuthServer = http.createServer((req, res) => {
          try {
            const urlStr = req.url || '/'

            // Ignore favicon requests
            if (urlStr === '/favicon.ico') {
              res.writeHead(404)
              res.end()
              return
            }

            const url = new URL(urlStr, 'http://localhost:8765')
            const code = url.searchParams.get('code')
            const error = url.searchParams.get('error')

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html' })
              res.end(`<h2>Authentication failed: ${error}. You can close this tab.</h2>`)
              if (!resolved) {
                resolved = true
                rejectCode(new Error(`OAuth error: ${error}`))
              }
              return
            }

            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end('<h2>SEVO: Gmail connected. You can close this tab.</h2>')
              if (!resolved) {
                resolved = true
                resolveCode(code)
              }
              return
            }

            // No code in URL yet
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('Waiting for authorization...')
          } catch(err) {
            res.writeHead(500)
            res.end('Error')
          }
        })

        gmailAuthServer.on('error', (err) => {
          if (!resolved) {
            resolved = true
            rejectCode(new Error(`Server error: ${err.message}`))
          }
        })

        // Listen without explicit host to bind on both IPv4 and IPv6
        gmailAuthServer.listen(8765, () => {
          shell.openExternal(authUrl)
        })

        setTimeout(() => {
          if (!resolved) {
            resolved = true
            rejectCode(new Error('OAuth timeout after 2 minutes'))
          }
        }, 120000)
      })

      if (gmailAuthServer) {
        gmailAuthServer.close()
        gmailAuthServer = null
      }

      const tokenRes = await fetch('https://sevo-backend.onrender.com/api/gmail/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      const tokenData = await tokenRes.json()
      if (tokenData.success) {
        resolve('authenticated')
      } else {
        reject(new Error('Token exchange failed'))
      }
    } catch (e) {
      if (gmailAuthServer) {
        try { gmailAuthServer.close() } catch(_) {}
        gmailAuthServer = null
      }
      reject(e)
    }
  })
})

// ── VOICE — msedge-tts (Microsoft Edge Neural TTS) ──────────
// Uses en-US-JennyNeural — warm, female, human-sounding.
// Synthesizes MP3 and returns it as base64 to the frontend.
// Falls back to pyttsx3 only if msedge-tts fails.

const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')

ipcMain.handle('elevenlabs-speak', async (event, { text }) => {
  const clean = text
    .replace(/[#*`]/g, '')
    .replace(/<[^>]*>/g, '')
    .slice(0, 500)
    .trim()

  if (!clean) return { audio: null, content_type: null }

  try {
    // ── Primary: msedge-tts ──────────────────────────────────
    const tts = new MsEdgeTTS()
    await tts.setMetadata(
      'en-US-JennyNeural',
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
    )

    const mp3Data = await new Promise((resolve, reject) => {
      const { audioStream } = tts.toStream(clean)
      const chunks = []

      audioStream.on('data', (chunk) => chunks.push(chunk))
      audioStream.on('close', () => {
        try {
          resolve(Buffer.concat(chunks))
        } catch (e) {
          reject(e)
        }
      })
      audioStream.on('error', reject)
    })

    if (!mp3Data || mp3Data.length === 0) {
      throw new Error('TTS stream returned empty data')
    }

    // Return base64 MP3 to the frontend
    return {
      audio: mp3Data.toString('base64'),
      content_type: 'audio/mpeg'
    }

  } catch (edgeError) {
    // ── Fallback: pyttsx3 (degraded mode — robotic but functional) ──
    console.error('[SEVO Voice] msedge-tts failed, falling back to pyttsx3:', edgeError.message)

    return new Promise((resolve) => {
      const scriptPath = path.join(os.tmpdir(), `sevo_tts_${Date.now()}.py`)
      const pyScript = `
import pyttsx3, sys
text = sys.stdin.read()
e = pyttsx3.init()
voices = e.getProperty('voices')
female = voices[1] if len(voices) > 1 else voices[0]
e.setProperty('voice', female.id)
e.setProperty('rate', 175)
e.setProperty('volume', 1.0)
e.say(text)
e.runAndWait()
`
      fs.writeFileSync(scriptPath, pyScript)
      const child = exec(`python "${scriptPath}"`, { timeout: 20000 }, () => {
        try { fs.unlinkSync(scriptPath) } catch (_) {}
        // Resolve with null audio so frontend knows it was handled natively
        resolve({ audio: null, content_type: null })
      })
      child.stdin.write(clean)
      child.stdin.end()
    })
  }
})

// ── RELIABLE SHUTDOWN SEQUENCE ─────────────────────────────
let mainWindow = null
let isQuitting = false
let closeTimeout = null

ipcMain.on('ready-to-close', () => {
  if (closeTimeout) clearTimeout(closeTimeout)
  isQuitting = true
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
  }
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 820,
    resizable: false,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'SEVO'
  })

  mainWindow.on('close', (event) => {
    event.preventDefault()
    if (!isQuitting) {
      isQuitting = true
      mainWindow.webContents.send('app-closing')
      closeTimeout = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy()
        }
      }, 15000)
    }
  })

  mainWindow.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
