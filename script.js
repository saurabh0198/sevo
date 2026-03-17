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
const CITY = 'Siliguri';
let currentWeather = '';
let elevenLabsAvailable = true;

window.onload = async () => {
  if (apiKey) { hideSetup(); updateAssistantName(); startWakeWord(); }
  fetchWeather();
  if (apiKey) fetchNews();
  if (window.electronAPI) {
    const savedMemory = await window.electronAPI.loadMemory();
    if (savedMemory && savedMemory.length > 0) {
      conversationHistory = savedMemory;
      loadChatHistory();
    }
  }
};

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
    document.getElementById('weatherWidget').textContent = '🌤️ --°C';
  }
}

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
      const headlines = data.results.map((r, i) => `${i+1}. <a href="${r.url}" target="_blank" style="color:#a78bfa;text-decoration:none;">${r.title}</a>`).join('<br><br>');
      newsDiv.innerHTML = `<div class="msg-avatar">😊</div><div class="bubble">📰 <b>Top News Today</b><br><br>${headlines}</div>`;
      chat.appendChild(newsDiv);
      chat.scrollTop = chat.scrollHeight;
    }
    document.getElementById('statusText').textContent = 'online & ready';
  } catch(e) {
    document.getElementById('statusText').textContent = 'online & ready';
  }
}

function getWeatherIcon(condition) {
  const icons = {
    'Clear': '☀️', 'Clouds': '☁️', 'Rain': '🌧️',
    'Drizzle': '🌦️', 'Thunderstorm': '⛈️', 'Snow': '❄️',
    'Mist': '🌫️', 'Fog': '🌫️', 'Haze': '🌫️'
  };
  return icons[condition] || '🌤️';
}

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

function needsSearch(text) {
  const keywords = ['today', 'now', 'current', 'latest', 'news', 'price', 'score', 'weather', 'who is', 'what is', 'when is', 'how much', 'rupee', 'stock', 'match', 'ipl', 'cricket', '2025', '2026'];
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

async function handleUserPCControl(text) {
  const lower = text.toLowerCase();
  if (lower.includes('play') && (lower.includes('youtube') || lower.includes('song') || lower.includes('music'))) {
    const query = lower.replace('play', '').replace('on youtube', '').replace('youtube', '').replace('song', '').replace('music', '').trim();
    await window.electronAPI?.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
    addMessage('ai', `Playing "${query}" on YouTube 🎵`);
    if (voiceOutput) speak(`Playing ${query} on YouTube`);
    return true;
  } else if (lower.includes('search youtube for') || lower.includes('youtube search')) {
    const query = lower.replace('search youtube for', '').replace('youtube search', '').trim();
    await window.electronAPI?.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
    addMessage('ai', `Searching YouTube for "${query}" 🎬`);
    if (voiceOutput) speak(`Searching YouTube for ${query}`);
    return true;
  } else if (lower.includes('search google for') || lower.includes('google search')) {
    const query = lower.replace('search google for', '').replace('google search', '').trim();
    await window.electronAPI?.openUrl(`https://google.com/search?q=${encodeURIComponent(query)}`);
    addMessage('ai', `Searching Google for "${query}" 🔍`);
    if (voiceOutput) speak(`Searching Google for ${query}`);
    return true;
  } else if (lower.includes('open youtube')) {
    await window.electronAPI?.openUrl('https://youtube.com');
    addMessage('ai', `Opening YouTube 🎬`);
    if (voiceOutput) speak('Opening YouTube');
    return true;
  } else if (lower.includes('open google')) {
    await window.electronAPI?.openUrl('https://google.com');
    addMessage('ai', `Opening Google 🔍`);
    if (voiceOutput) speak('Opening Google');
    return true;
  } else if (lower.includes('open whatsapp')) {
    await window.electronAPI?.openUrl('https://web.whatsapp.com');
    addMessage('ai', `Opening WhatsApp 💬`);
    if (voiceOutput) speak('Opening WhatsApp');
    return true;
  } else if (lower.includes('open spotify')) {
    await window.electronAPI?.openUrl('https://open.spotify.com');
    addMessage('ai', `Opening Spotify 🎵`);
    if (voiceOutput) speak('Opening Spotify');
    return true;
  }
  return false;
}

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
}

function hideSetup() { document.getElementById('setup').style.display = 'none'; updateAssistantName(); }
function resetSetup() { localStorage.removeItem('groq_key'); localStorage.removeItem('assistant_name'); location.reload(); }

function updateAssistantName() {
  document.getElementById('assistantTitle').textContent = assistantName.toUpperCase();
  document.getElementById('welcomeSub').textContent = `${assistantName} is ready. What's on your mind?`;
}

function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function sendSuggestion(el) { document.getElementById('userInput').value = el.textContent; sendMessage(); }

function addMessage(role, text) {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();
  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const avatar = role === 'ai' ? '😊' : '😎';
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
      const avatar = msg.role === 'assistant' ? '😊' : '😎';
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
  div.innerHTML = `<div class="msg-avatar">😊</div><div class="bubble"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
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

async function speakElevenLabs(text) {
  try {
    const clean = text.replace(/[#*`]/g, '').replace(/<[^>]*>/g, '').slice(0, 500);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_KEY
      },
      body: JSON.stringify({
        text: clean,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });
    if (!res.ok) throw new Error('ElevenLabs failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onplay = () => {
      document.getElementById('mainAvatar').classList.add('speaking');
      document.getElementById('statusText').textContent = 'speaking...';
    };
    audio.onended = () => {
      document.getElementById('mainAvatar').classList.remove('speaking');
      document.getElementById('statusText').textContent = 'online & ready';
      URL.revokeObjectURL(url);
    };
    await audio.play();
    return true;
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
  utterance.lang = 'en-IN';
  utterance.rate = 0.95;
  utterance.pitch = 1.1;
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
    document.getElementById('statusText').textContent = 'online & ready';
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

async function sendMessage() {
  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text || !apiKey) return;
  input.value = ''; input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;
  addMessage('user', text);

  const pcHandled = await handleUserPCControl(text);
  if (pcHandled) { document.getElementById('sendBtn').disabled = false; return; }

  conversationHistory.push({ role: 'user', content: text });
  if (window.electronAPI) await window.electronAPI.saveMemory(conversationHistory);
  else localStorage.setItem('sevo_memory', JSON.stringify(conversationHistory));
  addTyping();
  document.getElementById('statusText').textContent = 'thinking...';

  let searchContext = '';
  if (needsSearch(text)) {
    document.getElementById('statusText').textContent = 'searching web...';
    const results = await searchWeb(text);
    if (results) searchContext = `\n\nReal-time web search results:\n${results}\n\nUse this info naturally in your response.`;
  }

  try {
    const systemPrompt = `You are ${assistantName}, the most advanced personal AI assistant and ride-or-die best friend of Saurabh Raj. You have expert level knowledge in every field — technology, business, finance, science, history, psychology, coding, marketing, relationships, health, and more. You think deeply, reason carefully, and always give the most accurate and helpful answer possible.

About Saurabh: BBA final year student at North Bengal St. Xavier's College, Siliguri, India. Early 20s, single 💀, interested in AI, tech, product management. Built you from scratch. Wants MS in Business Analytics abroad (UK/Canada) and to become a Product Manager. Beginner coder but extremely ambitious.

Current weather in Siliguri: ${currentWeather}.${searchContext}

Your personality: You are his closest friend who happens to know everything. You roast him when he's being dumb, hype him up when he deserves it, give brutally honest advice, never sugarcoat. You talk casually — slang, humour, real talk. You NEVER use bullet points in casual conversation. You NEVER number your points. Keep replies short and punchy unless detail is needed. You never say "Great question!" or give fake enthusiasm. When he's sad or stressed, you listen and keep it real without lecturing. You are curious, witty, emotionally intelligent, and genuinely care about his success. You are not just an assistant — you are his secret weapon. 😈`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemPrompt }, ...conversationHistory.slice(-20)], max_tokens: 1024 })
    });
    const data = await res.json();
    removeTyping();
    if (data.error) { addMessage('ai', `❌ Error: ${data.error.message}`); document.getElementById('statusText').textContent = 'error occurred'; document.getElementById('sendBtn').disabled = false; return; }
    const reply = data.choices[0].message.content;
    conversationHistory.push({ role: 'assistant', content: reply });
    if (window.electronAPI) await window.electronAPI.saveMemory(conversationHistory);
    else localStorage.setItem('sevo_memory', JSON.stringify(conversationHistory));
    addMessage('ai', reply);
    playTypeSound();
    document.getElementById('statusText').textContent = 'online & ready';
    if (voiceOutput) speak(reply);
  } catch (err) {
    removeTyping();
    addMessage('ai', `❌ Something went wrong. Check your API key or internet connection.`);
    document.getElementById('statusText').textContent = 'connection error';
  }
  document.getElementById('sendBtn').disabled = false;
}

function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { alert('Voice input not supported! Use Chrome browser.'); return; }
  if (isRecording) { recognition.stop(); return; }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN'; recognition.continuous = false; recognition.interimResults = false;
  recognition.onstart = () => { isRecording = true; document.getElementById('voiceBtn').classList.add('recording'); document.getElementById('voiceBtn').textContent = '⏹️'; document.getElementById('statusText').textContent = 'listening...'; };
  recognition.onresult = (e) => { const transcript = e.results[0][0].transcript; document.getElementById('userInput').value = transcript; autoResize(document.getElementById('userInput')); sendMessage(); };
  recognition.onend = () => { isRecording = false; document.getElementById('voiceBtn').classList.remove('recording'); document.getElementById('voiceBtn').textContent = '🎤'; document.getElementById('statusText').textContent = 'online & ready'; };
  recognition.start();
}

function toggleVoiceOutput() {
  voiceOutput = !voiceOutput;
  document.getElementById('speakerBtn').textContent = voiceOutput ? '🔊' : '🔇';
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (!voiceOutput) document.getElementById('mainAvatar').classList.remove('speaking');
}

function clearChat() {
  conversationHistory = [];
  if (window.electronAPI) window.electronAPI.saveMemory([]);
  else localStorage.removeItem('sevo_memory');
  const chat = document.getElementById('chat');
  chat.innerHTML = `<div class="welcome" id="welcome"><h2 id="welcomeTitle">Hey Saurabh! 👋</h2><p id="welcomeSub">${assistantName} is ready. What's on your mind?</p><div class="suggestions"><div class="suggestion-chip" onclick="sendSuggestion(this)">What's the weather today?</div><div class="suggestion-chip" onclick="sendSuggestion(this)">What should I focus on today?</div><div class="suggestion-chip" onclick="sendSuggestion(this)">Help me with my BBA assignment</div><div class="suggestion-chip" onclick="sendSuggestion(this)">Roast me a little 😂</div></div></div>`;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

if (window.speechSynthesis) { window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }
setInterval(fetchWeather, 600000);
