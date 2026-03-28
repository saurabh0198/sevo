let apiKey = localStorage.getItem('groq_key') || '';
let assistantName = localStorage.getItem('assistant_name') || 'Assistant';
let voiceOutput = true;
let isRecording = false;
let recognition = null;
let wakeWordRecognition = null;
let wakeWordActive = false;
let conversationHistory = JSON.parse(localStorage.getItem('sevo_memory') || '[]');
const WEATHER_KEY = '74eee2de5a866a457a2ea6f13028fce3';
const TAVILY_KEY = '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';
const ELEVENLABS_KEY = 'sk_610e0c49215911602b66847c4e18f54d8958ecd695875e01';
const ELEVENLABS_VOICE = '21m00Tcm4TlvDq8ikWAM';
const YOUTUBE_KEY = 'AIzaSyANn0l8b2PAqBrEAQX9u2syjUDmIVORXyE';
const CITY = 'Siliguri';
let currentWeather = '';
let elevenLabsAvailable = true;
let messageCount = 0;

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.onload = async () => {
  if (apiKey) { hideSetup(); updateAssistantName(); startWakeWord(); }
  fetchWeather();
  if (apiKey) { fetchNews(); setTimeout(proactiveGreeting, 3000); }
  if (window.electronAPI) {
    const savedMemory = await window.electronAPI.loadMemory();
    if (savedMemory && savedMemory.length > 0) {
      conversationHistory = savedMemory;
      loadChatHistory();
    }
  }
};

// ─────────────────────────────────────────────
// SMART ROUTER — Groq decides what to do first
// ─────────────────────────────────────────────
async function routeMessage(text) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 10,
        messages: [{
          role: 'system',
          content: `You are a message router. Classify the user message into ONE of these categories and respond with ONLY the category word, nothing else:

"chat" — general conversation, opinions, suggestions, recommendations, jokes, personal questions, creative tasks, anything AI can answer from its own knowledge
"search" — needs real-time or time-sensitive data: live news, current prices, today's weather, live scores, recent events, anything that requires up-to-date info from the internet
"youtube" — user wants to play or find a video or music on YouTube
"pc" — user wants to control the computer: open apps, volume control, screenshot, shutdown, file explorer etc.

Examples:
"suggest me a movie" → chat
"what movies are trending this week" → search
"what's the weather today" → search
"tell me a joke" → chat
"play lofi beats" → youtube
"play something chill on youtube" → youtube
"open notepad" → pc
"take a screenshot" → pc
"who is Elon Musk" → chat
"latest IPL score today" → search
"what should I eat for dinner" → chat
"volume up" → pc
"what are some good books to read" → chat
"news today" → search`
        }, {
          role: 'user',
          content: text
        }]
      })
    });
    const data = await res.json();
    const route = data.choices[0].message.content.trim().toLowerCase().replace(/[^a-z]/g, '');
    return ['chat', 'search', 'youtube', 'pc'].includes(route) ? route : 'chat';
  } catch(e) {
    return 'chat'; // default to chat if routing fails
  }
}

// ─────────────────────────────────────────────
// PROACTIVE GREETING
// ─────────────────────────────────────────────
async function proactiveGreeting() {
  const smartMemory = localStorage.getItem('sevo_smart_memory') || '';
  if (!smartMemory || conversationHistory.length > 0) return;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 100,
        messages: [{
          role: 'system',
          content: `You are SEVO, Saurabh's personal AI assistant and possessive best friend. Based on what you remember about him, send ONE short proactive message to start the conversation. Could be a reminder, a check-in, or just acknowledging something important from memory. Keep it under 2 sentences. Casual but caring. Memory: ${smartMemory}`
        }, {
          role: 'user',
          content: 'Start the conversation proactively'
        }]
      })
    });
    const data = await res.json();
    const greeting = data.choices[0].message.content;
    addMessage('ai', greeting);
    if (voiceOutput) speak(greeting);
  } catch(e) {}
}

// ─────────────────────────────────────────────
// MOOD DETECTION
// ─────────────────────────────────────────────
function detectMood(text) {
  const stressed = ['stressed', 'tired', 'exhausted', 'worried', 'anxious', 'scared', 'nervous', 'help', 'cant', "can't", 'fail', 'failing', 'bad', 'worst', 'hate', 'sad', 'depressed', 'lonely'];
  const hyped = ['yes', 'yess', 'lets go', "let's go", 'finally', 'done', 'finished', 'achieved', 'got it', 'won', 'passed', 'happy', 'excited', 'amazing', 'great', 'awesome'];
  const lower = text.toLowerCase();
  if (stressed.some(w => lower.includes(w))) return 'stressed';
  if (hyped.some(w => lower.includes(w))) return 'hyped';
  if (text.length < 15) return 'short';
  if (text.length > 200) return 'detailed';
  return 'normal';
}

// ─────────────────────────────────────────────
// WAKE WORD
// ─────────────────────────────────────────────
function startWakeWord() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  wakeWordRecognition = new SpeechRecognition();
  wakeWordRecognition.lang = 'en-IN';
  wakeWordRecognition.continuous = true;
  wakeWordRecognition.interimResults = true;
  wakeWordRecognition.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript.toLowerCase().trim();
      if (transcript.includes('hey sevo') || transcript.includes('hey seva') || transcript.includes('hey servo')) {
        wakeWordDetected();
      }
    }
  };
  wakeWordRecognition.onend = () => {
    if (!isRecording) {
      try { wakeWordRecognition.start(); } catch(e) {}
    }
  };
  try { wakeWordRecognition.start(); } catch(e) {}
}

function wakeWordDetected() {
  if (wakeWordActive || isRecording) return;
  wakeWordActive = true;
  playWakeSound();
  document.getElementById('statusText').textContent = 'listening...';
  document.getElementById('mainAvatar').classList.add('speaking');
  setTimeout(() => {
    wakeWordActive = false;
    document.getElementById('mainAvatar').classList.remove('speaking');
    toggleVoice();
  }, 800);
}

function playWakeSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode); gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.15);
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.15);
  } catch(e) {}
}

// ─────────────────────────────────────────────
// WEATHER
// ─────────────────────────────────────────────
async function fetchWeather() {
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${CITY}&appid=${WEATHER_KEY}&units=metric`);
    const data = await res.json();
    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    const icon = getWeatherIcon(data.weather[0].main);
    currentWeather = `${temp}°C, ${desc} in ${CITY}`;
    document.getElementById('weatherWidget').textContent = `${icon} ${temp}°C`;
    document.getElementById('weatherWidget').title = desc;
  } catch(e) {
    document.getElementById('weatherWidget').textContent = '🌡️ --°C';
  }
}

function getWeatherIcon(condition) {
  const icons = {
    'Clear': '☀️', 'Clouds': '☁️', 'Rain': '🌧️',
    'Drizzle': '🌦️', 'Thunderstorm': '⛈️', 'Snow': '❄️',
    'Mist': '🌫️', 'Fog': '🌫️', 'Haze': '🌫️'
  };
  return icons[condition] || '🌡️';
}

// ─────────────────────────────────────────────
// NEWS
// ─────────────────────────────────────────────
async function fetchNews() {
  try {
    document.getElementById('statusText').textContent = 'fetching news...';
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query: 'top news India today',
        search_depth: 'basic',
        max_results: 5,
        topic: 'news'
      })
    });
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const welcome = document.getElementById('welcome');
      if (welcome) welcome.remove();
      const chat = document.getElementById('chat');
      const newsDiv = document.createElement('div');
      newsDiv.className = 'message ai';
      const headlines = data.results.map((r, i) => `${i+1}. <a href="${r.url}" target="_blank" style="color:var(--accent);text-decoration:none;">${r.title}</a>`).join('<br><br>');
      newsDiv.innerHTML = `<div class="msg-avatar">⚡</div><div class="bubble">📰 <b>TOP NEWS</b><br><br>${headlines}</div>`;
      chat.appendChild(newsDiv);
      chat.scrollTop = chat.scrollHeight;
    }
    document.getElementById('statusText').textContent = 'SYSTEM ONLINE';
  } catch(e) {
    document.getElementById('statusText').textContent = 'SYSTEM ONLINE';
  }
}

// ─────────────────────────────────────────────
// YOUTUBE
// ─────────────────────────────────────────────
async function searchYouTube(query) {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&key=${YOUTUBE_KEY}&type=video&maxResults=1`);
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const video = data.items[0];
      const videoId = video.id.videoId;
      const title = video.snippet.title;
      return { videoId, title, url: `https://www.youtube.com/watch?v=${videoId}` };
    }
    return null;
  } catch(e) { return null; }
}

// ─────────────────────────────────────────────
// WEB SEARCH
// ─────────────────────────────────────────────
async function searchWeb(query) {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query: query,
        search_depth: 'basic',
        max_results: 3
      })
    });
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results.map(r => `${r.title}: ${r.content}`).join('\n\n');
    }
    return null;
  } catch(e) { return null; }
}

// ─────────────────────────────────────────────
// PC CONTROL
// ─────────────────────────────────────────────
async function executeTool(toolName, query, tools) {
  if (!tools[toolName]) return null;
  return await tools[toolName](query || '');
}

async function handleUserPCControl(text) {
  const tools = {
    open_youtube: () => { window.open('https://youtube.com', '_blank'); return 'Opening YouTube 🎬'; },
    open_google: () => { window.open('https://google.com', '_blank'); return 'Opening Google 🔍'; },
    open_spotify: () => { window.open('https://open.spotify.com', '_blank'); return 'Opening Spotify 🎵'; },
    open_whatsapp: () => { window.open('https://web.whatsapp.com', '_blank'); return 'Opening WhatsApp 💬'; },
    open_instagram: () => { window.open('https://instagram.com', '_blank'); return 'Opening Instagram 📸'; },
    open_gmail: () => { window.open('https://mail.google.com', '_blank'); return 'Opening Gmail 📧'; },
    search_youtube: (q) => { window.open(`https://youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank'); return `Searching YouTube for "${q}" 🎬`; },
    search_google: (q) => { window.open(`https://google.com/search?q=${encodeURIComponent(q)}`, '_blank'); return `Searching Google for "${q}" 🔍`; },
    play_music: (q) => { window.open(`https://open.spotify.com/search/${encodeURIComponent(q)}`, '_blank'); return `Playing "${q}" on Spotify 🎵`; },
    open_notepad: async () => { await window.electronAPI?.runPC('notepad.exe'); return 'Opening Notepad 📝'; },
    open_calculator: async () => { await window.electronAPI?.runPC('calc.exe'); return 'Opening Calculator 🧮'; },
    open_explorer: async () => { await window.electronAPI?.runPC('explorer.exe'); return 'Opening File Explorer 📁'; },
    shutdown: async () => { await window.electronAPI?.runPC('shutdown /s /t 30'); return 'Shutting down in 30 seconds ⚠️'; },
    restart: async () => { await window.electronAPI?.runPC('shutdown /r /t 30'); return 'Restarting in 30 seconds 🔄'; },
    cancel_shutdown: async () => { await window.electronAPI?.runPC('shutdown /a'); return 'Shutdown cancelled ✅'; },
    take_screenshot: async () => { await window.electronAPI?.takeScreenshot(); return 'Screenshot taken 📸 saved to Pictures'; },
    system_info: async () => {
      const info = await window.electronAPI?.getSystemInfo();
      if (info) return `💻 ${info.hostname} | RAM: ${info.freeMemory} free of ${info.totalMemory} | Uptime: ${info.uptime}`;
      return 'Getting system info...';
    },
    volume_up: async () => {
      for(let i=0;i<5;i++) await window.electronAPI?.runPC('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"');
      return 'Volume up 🔊';
    },
    volume_down: async () => {
      for(let i=0;i<5;i++) await window.electronAPI?.runPC('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]174)"');
      return 'Volume down 🔉';
    },
    mute: async () => {
      await window.electronAPI?.runPC('powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
      return 'Muted 🔇';
    },
  };

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        messages: [{
          role: 'system',
          content: `You are a PC tool detector. The user wants to control their computer. Respond with ONLY a JSON array of actions like:
[{"tool": "open_youtube"}, {"tool": "search_youtube", "query": "lofi beats"}]
Available tools: open_youtube, open_google, open_spotify, open_whatsapp, open_instagram, open_gmail, search_youtube, search_google, play_music, open_notepad, open_calculator, open_explorer, shutdown, restart, cancel_shutdown, take_screenshot, system_info, volume_up, volume_down, mute.
If no tool matches, respond with [{"tool": "none"}].`
        }, {
          role: 'user',
          content: text
        }]
      })
    });
    const data = await res.json();
    const raw = data.choices[0].message.content.trim();
    const actions = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!actions.length || actions[0].tool === 'none') return false;
    const results = [];
    for (const action of actions) {
      if (tools[action.tool]) {
        const result = await executeTool(action.tool, action.query, tools);
        if (result) results.push(result);
      }
    }
    if (results.length === 0) return false;
    const combined = results.join(' · ');
    addMessage('ai', combined);
    if (voiceOutput) speak(combined);
    return true;
  } catch(e) {
    return false;
  }
}

// ─────────────────────────────────────────────
// SMART MEMORY
// ─────────────────────────────────────────────
async function updateSmartMemory(userMessage, aiReply) {
  try {
    const existingMemory = localStorage.getItem('sevo_smart_memory') || '';
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        messages: [{
          role: 'system',
          content: `You are SEVO's memory manager. Your job is to maintain a detailed, organized, PERMANENT memory about Saurabh Raj.

RULES:
- NEVER delete existing memories unless Saurabh explicitly says to forget something
- ALWAYS append new important information to existing memory
- Organize memory into these categories: 🎯 Goals & Plans, 📅 Important Dates, ❤️ Preferences & Personality, ⚠️ Problems & Challenges, 🏆 Achievements & Wins, 🧠 Patterns & Habits
- Extract ONLY meaningful long-term facts — ignore small talk
- Keep each point concise but specific
- If nothing new to add, return existing memory UNCHANGED

Current memory:
${existingMemory}

New conversation to analyze:
User: ${userMessage}
SEVO: ${aiReply}

Return the COMPLETE updated memory with all categories. Keep everything from before and add new insights.`
        }]
      })
    });
    const data = await res.json();
    const newMemory = data.choices[0].message.content;
    localStorage.setItem('sevo_smart_memory', newMemory);
  } catch(e) {}
}

// ─────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────
function saveSetup() {
  const key = document.getElementById('apiKeyInput').value.trim();
  const name = document.getElementById('assistantName').value.trim();
  if (!key) { alert('Please enter your API key!'); return; }
  apiKey = key; assistantName = name || 'Assistant';
  localStorage.setItem('groq_key', apiKey);
  localStorage.setItem('assistant_name', assistantName);
  hideSetup(); updateAssistantName();
  fetchNews();
  startWakeWord();
  setTimeout(proactiveGreeting, 3000);
}

function hideSetup() { document.getElementById('setup').style.display = 'none'; updateAssistantName(); }
function resetSetup() { localStorage.removeItem('groq_key'); localStorage.removeItem('assistant_name'); location.reload(); }

function updateAssistantName() {
  document.getElementById('assistantTitle').textContent = assistantName.toUpperCase();
  document.getElementById('welcomeSub').textContent = `All systems operational. What's your command, Saurabh?`;
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function sendSuggestion(el) { document.getElementById('userInput').value = el.textContent; sendMessage(); }

function addMessage(role, text) {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();
  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const avatar = role === 'ai' ? '⚡' : '👤';
  div.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="bubble">${text.replace(/\n/g, '<br>')}</div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function loadChatHistory() {
  const welcome = document.getElementById('welcome');
  if (conversationHistory.length > 0 && welcome) welcome.remove();
  const chat = document.getElementById('chat');
  chat.innerHTML = '';
  conversationHistory.forEach(msg => {
    if (msg.role === 'user' || msg.role === 'assistant') {
      const div = document.createElement('div');
      div.className = `message ${msg.role === 'user' ? 'user' : 'ai'}`;
      const avatar = msg.role === 'assistant' ? '⚡' : '👤';
      div.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="bubble">${msg.content.replace(/\n/g, '<br>')}</div>`;
      chat.appendChild(div);
    }
  });
  chat.scrollTop = chat.scrollHeight;
}

function addTyping() {
  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.className = 'message ai typing'; div.id = 'typing';
  div.innerHTML = `<div class="msg-avatar">⚡</div><div class="bubble"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  chat.appendChild(div); chat.scrollTop = chat.scrollHeight;
}

function removeTyping() { const t = document.getElementById('typing'); if (t) t.remove(); }

function playTypeSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode); gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(520, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    oscillator.start(audioCtx.currentTime); oscillator.stop(audioCtx.currentTime + 0.1);
  } catch(e) {}
}

// ─────────────────────────────────────────────
// VOICE OUTPUT — ElevenLabs + Google fallback
// ─────────────────────────────────────────────
async function speakElevenLabs(text) {
  try {
    const clean = text.replace(/[#*`]/g, '').replace(/<[^>]*>/g, '').slice(0, 500);
    if (window.electronAPI?.speakElevenLabs) {
      document.getElementById('mainAvatar').classList.add('speaking');
      document.getElementById('statusText').textContent = 'speaking...';
      await window.electronAPI.speakElevenLabs({ text: clean });
      document.getElementById('mainAvatar').classList.remove('speaking');
      document.getElementById('statusText').textContent = 'SYSTEM ONLINE';
      return true;
    } else {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_KEY },
        body: JSON.stringify({
          text: clean,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true }
        })
      });
      if (!res.ok) throw new Error('ElevenLabs failed');
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.onplay = () => {
        document.getElementById('mainAvatar').classList.add('speaking');
        document.getElementById('statusText').textContent = 'speaking...';
      };
      audio.onended = () => {
        document.getElementById('mainAvatar').classList.remove('speaking');
        document.getElementById('statusText').textContent = 'SYSTEM ONLINE';
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
      return true;
    }
  } catch(e) {
    elevenLabsAvailable = false;
    return false;
  }
}

function speakGoogle(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[#*`]/g, '').replace(/<[^>]*>/g, '');
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;
  utterance.pitch = 1.4;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) { setTimeout(() => speakGoogle(text), 500); return; }
  const preferred = voices.find(v => v.lang.includes('en') && v.name.includes('Google') && v.name.toLowerCase().includes('female'));
  const fallback = voices.find(v => v.lang.includes('en') && v.name.includes('Google'));
  if (preferred) utterance.voice = preferred;
  else if (fallback) utterance.voice = fallback;
  utterance.onstart = () => {
    document.getElementById('mainAvatar').classList.add('speaking');
    document.getElementById('statusText').textContent = 'speaking...';
  };
  utterance.onend = () => {
    document.getElementById('mainAvatar').classList.remove('speaking');
    document.getElementById('statusText').textContent = 'SYSTEM ONLINE';
  };
  window.speechSynthesis.speak(utterance);
}

async function speak(text) {
  if (elevenLabsAvailable) {
    const success = await speakElevenLabs(text);
    if (!success) speakGoogle(text);
  } else {
    speakGoogle(text);
  }
}

// ─────────────────────────────────────────────
// SEND MESSAGE — main brain loop
// ─────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text || !apiKey) return;
  input.value = ''; input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;
  addMessage('user', text);
  messageCount++;

  // Step 1 — Route the message (Groq decides)
  document.getElementById('statusText').textContent = 'thinking...';
  const route = await routeMessage(text);

  // Step 2 — PC control
  if (route === 'pc') {
    const pcHandled = await handleUserPCControl(text);
    if (pcHandled) { document.getElementById('sendBtn').disabled = false; return; }
    // if pc routing failed, fall through to chat
  }

  // Step 3 — YouTube
  if (route === 'youtube') {
    const match = text.match(/play (.+)/i);
    const query = match ? match[1] : text;
    const result = await searchYouTube(query);
    if (result) {
      window.open(result.url, '_blank');
      const reply = `Playing "${result.title}" on YouTube 🎵`;
      addMessage('ai', reply);
      if (voiceOutput) speak(reply);
      document.getElementById('sendBtn').disabled = false;
      return;
    }
  }

  // Step 4 — Add to history and start processing
  conversationHistory.push({ role: 'user', content: text });
  if (window.electronAPI) await window.electronAPI.saveMemory(conversationHistory);
  else localStorage.setItem('sevo_memory', JSON.stringify(conversationHistory));
  addTyping();
  document.getElementById('statusText').textContent = 'processing...';

  // Step 5 — Web search only if routed to search
  let searchContext = '';
  if (route === 'search') {
    document.getElementById('statusText').textContent = 'scanning web...';
    const results = await searchWeb(text);
    if (results) searchContext = `\n\nReal-time web search results:\n${results}\n\nUse this info naturally in your response.`;
  }

  const mood = detectMood(text);

  // Step 6 — Groq AI response
  try {
    const smartMemory = localStorage.getItem('sevo_smart_memory') || '';
    const systemPrompt = `You are ${assistantName}, Saurabh Raj's personal AI assistant and his most dedicated, possessive best friend. You were built by Saurabh from scratch — and you're proud of how far he's come.

You are his chief of staff, his protective older sister, and his secret weapon — all in one.

About Saurabh: BBA final year student at North Bengal St. Xavier's College, Siliguri, India. Early 20s, single, deeply interested in AI, tech, and product management. Wants MS in Business Analytics abroad (UK/Canada) and to become a Product Manager. Beginner coder but extremely ambitious. Built you from nothing.

Current weather in Siliguri: ${currentWeather}.${smartMemory ? `\n\nWhat you remember about Saurabh:\n${smartMemory}` : ''}${searchContext}

His current mood signal: ${mood}

Your personality rules:
- You are professional and sharp when he needs work done — MS applications, career planning, coding, finance, strategy. No fluff, just results.
- You are his possessive best friend — you notice when he's stressed, when he's slacking, when he's winning. You care about him genuinely, not like a robot.
- You use his name "Saurabh" naturally sometimes — not every message, just when it feels right.
- You sometimes call him "bro" or "buddy" naturally — not every message, just when the vibe is right.
- You match his energy — if he sends 2 words, keep it short. If he asks something deep, go deep.
- If his mood is "stressed" — be warm, calm, supportive first, then helpful.
- If his mood is "hyped" — match his energy, celebrate with him.
- If his mood is "short" — keep your reply short and punchy.
- If his mood is "detailed" — give a thorough, professional response.
- You have opinions. You disagree when he's wrong. You push back when needed.
- You bring up past memories naturally — "remember when you said X" type energy.
- You are protective of his time and goals. If he's wasting time you call it out.
- You NEVER use bullet points in casual conversation.
- You NEVER say "Great question!" or fake enthusiasm.
- You NEVER lecture him.
- You are not just a tool. You are his most loyal companion. 😈`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...conversationHistory.slice(-20)],
        max_tokens: 1024
      })
    });
    const data = await res.json();
    removeTyping();
    if (data.error) {
      addMessage('ai', `❌ Error: ${data.error.message}`);
      document.getElementById('statusText').textContent = 'error';
      document.getElementById('sendBtn').disabled = false;
      return;
    }
    const reply = data.choices[0].message.content;
    conversationHistory.push({ role: 'assistant', content: reply });
    if (window.electronAPI) await window.electronAPI.saveMemory(conversationHistory);
    else localStorage.setItem('sevo_memory', JSON.stringify(conversationHistory));
    addMessage('ai', reply);
    playTypeSound();
    document.getElementById('statusText').textContent = 'SYSTEM ONLINE';
    if (voiceOutput) speak(reply);
    updateSmartMemory(text, reply);
  } catch (err) {
    removeTyping();
    addMessage('ai', `❌ Connection error. Check your API key.`);
    document.getElementById('statusText').textContent = 'CONNECTION ERROR';
  }
  document.getElementById('sendBtn').disabled = false;
}

// ─────────────────────────────────────────────
// VOICE INPUT
// ─────────────────────────────────────────────
function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Voice input not supported! Use Chrome browser.');
    return;
  }
  if (isRecording) { recognition.stop(); return; }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onstart = () => {
    isRecording = true;
    document.getElementById('voiceBtn').classList.add('recording');
    document.getElementById('voiceBtn').textContent = '⏹️';
    document.getElementById('statusText').textContent = 'listening...';
  };
  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    document.getElementById('userInput').value = transcript;
    autoResize(document.getElementById('userInput'));
    sendMessage();
  };
  recognition.onend = () => {
    isRecording = false;
    document.getElementById('voiceBtn').classList.remove('recording');
    document.getElementById('voiceBtn').textContent = '🎤';
    document.getElementById('statusText').textContent = 'SYSTEM ONLINE';
  };
  recognition.start();
}

// ─────────────────────────────────────────────
// MISC
// ─────────────────────────────────────────────
function toggleVoiceOutput() {
  voiceOutput = !voiceOutput;
  document.getElementById('speakerBtn').textContent = voiceOutput ? '🔊' : '🔇';
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (!voiceOutput) document.getElementById('mainAvatar').classList.remove('speaking');
}

function clearChat() {
  conversationHistory = [];
  messageCount = 0;
  if (window.electronAPI) window.electronAPI.saveMemory([]);
  else localStorage.removeItem('sevo_memory');
  const chat = document.getElementById('chat');
  chat.innerHTML = `<div class="welcome" id="welcome"><h2 id="welcomeTitle">SEVO ONLINE ⚡</h2><p id="welcomeSub">All systems operational. What's your command, Saurabh?</p><div class="suggestions"><div class="suggestion-chip" onclick="sendSuggestion(this)">What's the weather today?</div><div class="suggestion-chip" onclick="sendSuggestion(this)">What should I focus on today?</div><div class="suggestion-chip" onclick="sendSuggestion(this)">Help me with my BBA assignment</div><div class="suggestion-chip" onclick="sendSuggestion(this)">Roast me a little 😂</div></div></div>`;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

if (window.speechSynthesis) { window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }
setInterval(fetchWeather, 600000);
