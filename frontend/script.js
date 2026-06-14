// script.js — ANKA AI OS frontend
const API = '/api';
const socket = io();

const state = {
  conversationId: null,
  settings: {},
  recognizing: false,
  selectedVoice: null,
  voiceRate: 1.0,
  voicePitch: 1.0,
  availableVoices: [],
  animFrame: null,
  bottomAnimFrame: null
};

// ============= Utility ===================
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

// ============= Clock ====================
function tickClock() {
  const now = new Date();
  $('#clock-time').textContent = now.toLocaleTimeString('tr-TR');
  $('#clock-date').textContent = now.toLocaleDateString('tr-TR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  }).toUpperCase();
}
setInterval(tickClock, 1000); tickClock();

// ============= Navigation ===============
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    $$('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.view;
    $(`#view-${target}`).classList.add('active');
    if (target === 'devices') loadDevices();
    if (target === 'notes') loadNotes();
    if (target === 'settings') loadSettings();
  });
});

// ============= Fire Particles ===================
function spawnParticles(count = 8) {
  const container = $('#fire-particles');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 6 + 3;
    const isBlue = Math.random() > 0.5;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${30 + Math.random() * 40}%;
      background:${isBlue ? '#00e0ff' : '#ff6600'};
      box-shadow: 0 0 ${size*2}px ${isBlue ? '#00e0ff' : '#ff6600'};
      --dur:${0.8 + Math.random() * 1.2}s;
      animation-delay:${Math.random() * 0.5}s;
    `;
    container.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
}
setInterval(() => spawnParticles(5), 600);

// ============= Audio Visualizer (dinleme) ===================
let audioCtx, analyser, micStream, dataArray;

async function startAudioVisualizer() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    // Üst hologram
    $('#listen-hologram').classList.add('active');
    // Alt görselleştirici
    $('#bottom-visualizer').classList.add('active');

    drawVisualizer();
    drawBottomVisualizer();
  } catch (e) {
    console.warn('Mikrofon erişimi yok, görsel simüle ediliyor.');
    simulateVisualizer();
  }
}

function stopAudioVisualizer() {
  if (state.animFrame) cancelAnimationFrame(state.animFrame);
  if (state.bottomAnimFrame) cancelAnimationFrame(state.bottomAnimFrame);
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (audioCtx) audioCtx.close();
  audioCtx = null; analyser = null; micStream = null;
  $('#listen-hologram').classList.remove('active');
  $('#bottom-visualizer').classList.remove('active');
  clearCanvas('audio-visualizer');
  clearCanvas('bottom-canvas');
}

function clearCanvas(id) {
  const canvas = $(`#${id}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawVisualizer() {
  const canvas = $('#audio-visualizer');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  function draw() {
    state.animFrame = requestAnimationFrame(draw);
    let bars;
    if (analyser) {
      analyser.getByteFrequencyData(dataArray);
      bars = Array.from(dataArray.slice(0, 20));
    } else {
      bars = Array.from({length: 20}, () => Math.random() * 200 + 20);
    }
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,5,15,0.3)';
    ctx.fillRect(0, 0, W, H);

    const bw = W / bars.length;
    bars.forEach((v, i) => {
      const h = (v / 255) * (H - 4);
      const grad = ctx.createLinearGradient(0, H, 0, H - h);
      grad.addColorStop(0, '#ff6600');
      grad.addColorStop(1, '#00e0ff');
      ctx.fillStyle = grad;
      ctx.fillRect(i * bw + 1, H - h - 2, bw - 2, h);
    });
    // Scan line
    ctx.strokeStyle = 'rgba(0,224,255,0.4)';
    ctx.lineWidth = 1;
    const scanY = (Date.now() % 1000) / 1000 * H;
    ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(W, scanY); ctx.stroke();
  }
  draw();
}

function drawBottomVisualizer() {
  const canvas = $('#bottom-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let phase = 0;

  function draw() {
    state.bottomAnimFrame = requestAnimationFrame(draw);
    let bars;
    if (analyser) {
      analyser.getByteFrequencyData(dataArray);
      bars = Array.from(dataArray.slice(0, 40));
    } else {
      bars = Array.from({length: 40}, (_, i) => Math.abs(Math.sin((i + phase) * 0.4)) * 200 + Math.random() * 40);
    }
    phase += 0.1;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,5,15,0.4)';
    ctx.fillRect(0, 0, W, H);

    // Izgara
    ctx.strokeStyle = 'rgba(0,224,255,0.07)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const bw = W / bars.length;
    bars.forEach((v, i) => {
      const h = (v / 255) * (H * 0.85);
      const cx = i * bw + bw / 2;
      const grad = ctx.createLinearGradient(0, H/2 - h/2, 0, H/2 + h/2);
      grad.addColorStop(0, 'rgba(0,224,255,0.9)');
      grad.addColorStop(0.5, 'rgba(255,102,0,0.8)');
      grad.addColorStop(1, 'rgba(0,224,255,0.9)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - bw/3, H/2 - h/2, bw * 0.6, h);
      // Glow
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#00e0ff';
    });
    ctx.shadowBlur = 0;

    // Merkez çizgi
    ctx.strokeStyle = 'rgba(0,224,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
  }
  draw();
}

function simulateVisualizer() {
  $('#listen-hologram').classList.add('active');
  $('#bottom-visualizer').classList.add('active');
  drawVisualizer();
  drawBottomVisualizer();
}

// ============= Chat =====================
const chatMessages = $('#chat-messages');
const chatInput = $('#chat-input');
const sendBtn = $('#send-btn');
const convoFlow = $('#convo-flow');

function addMessage(role, content, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  wrap.innerHTML = `<div>${escapeHtml(content)}</div><div class="ts">${fmtTime(Date.now())}</div>`;
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const displayName = state.settings.ai_name || 'ANKA';
  if (role === 'user') addConvoFlow(`Sen: ${content.slice(0, 60)}`);
  if (role === 'assistant') addConvoFlow(`${displayName}: ${content.slice(0, 60)}`);

  return wrap;
}

function addConvoFlow(text) {
  if (convoFlow.querySelector('.muted')) convoFlow.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'item';
  item.textContent = text;
  convoFlow.prepend(item);
  while (convoFlow.children.length > 8) convoFlow.removeChild(convoFlow.lastChild);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  addMessage('user', text);

  const typing = addMessage('assistant', 'düşünüyor...');
  typing.classList.add('typing');

  try {
    const data = await api('/chat', {
      method: 'POST',
      body: { conversationId: state.conversationId, message: text }
    });
    state.conversationId = data.conversationId;
    typing.classList.remove('typing');
    typing.querySelector('div').textContent = data.reply;
    if (data.type === 'system' || data.type === 'error') {
      typing.classList.remove('assistant');
      typing.classList.add(data.type);
    }
    // TTS
    speak(data.reply);
  } catch (e) {
    typing.classList.remove('typing');
    typing.querySelector('div').textContent = `Hata: ${e.message}`;
  }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// ============= Voice (Web Speech API) =================
const micBtn = $('#mic-btn');
const voiceStatus = $('#voice-status');
let recognition = null;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'tr-TR';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    voiceStatus.textContent = 'Dinleniyor...';
    micBtn.classList.add('listening');
    $('#phoenix-container').classList.add('listening');
    startAudioVisualizer();
    spawnParticles(15);
  };
  recognition.onend = () => {
    voiceStatus.textContent = 'Hazır';
    micBtn.classList.remove('listening');
    $('#phoenix-container').classList.remove('listening');
    state.recognizing = false;
    stopAudioVisualizer();
  };
  recognition.onerror = (e) => {
    voiceStatus.textContent = 'Hata: ' + e.error;
    stopAudioVisualizer();
    $('#phoenix-container').classList.remove('listening');
  };
  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    chatInput.value = text;
    sendMessage();
  };
}

micBtn.addEventListener('click', () => {
  if (!recognition) {
    alert('Tarayıcınız sesli komutu desteklemiyor.');
    return;
  }
  if (state.recognizing) { recognition.stop(); }
  else { state.recognizing = true; recognition.start(); }
});

// ============= TTS — Çoklu Ses Modeli =================
const VOICE_CATEGORIES = [
  { id: 'auto', label: 'Otomatik', desc: 'Sistem seçer', lang: null },
  { id: 'tr-female', label: 'TR Kadın', desc: 'Türkçe dişi', lang: 'tr-TR', gender: 'female' },
  { id: 'tr-male', label: 'TR Erkek', desc: 'Türkçe erkek', lang: 'tr-TR', gender: 'male' },
  { id: 'en-female', label: 'EN Kadın', desc: 'İngilizce dişi', lang: 'en-US', gender: 'female' },
  { id: 'en-male', label: 'EN Erkek', desc: 'İngilizce erkek', lang: 'en-US', gender: 'male' },
  { id: 'en-gb', label: 'EN-GB', desc: 'İngiliz aksanı', lang: 'en-GB', gender: null },
  { id: 'de', label: 'Almanca', desc: 'Deutsche Stimme', lang: 'de-DE', gender: null },
  { id: 'fr', label: 'Fransızca', desc: 'Voix française', lang: 'fr-FR', gender: null },
];

function loadVoices() {
  state.availableVoices = speechSynthesis.getVoices();
  renderVoiceGrid();
}

function findVoice(cat) {
  const voices = state.availableVoices;
  if (cat.id === 'auto' || !cat.lang) return null;

  let matches = voices.filter(v => v.lang.startsWith(cat.lang.split('-')[0]));
  if (cat.lang.includes('-')) {
    const exact = voices.filter(v => v.lang === cat.lang);
    if (exact.length) matches = exact;
  }
  if (cat.gender && matches.length > 1) {
    const femaleKeywords = ['female','woman','girl','zira','sapi5-f','hazel','susan','eva'];
    const maleKeywords = ['male','man','guy','david','mark','paul','james','alex'];
    if (cat.gender === 'female') {
      const f = matches.filter(v => femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
      if (f.length) return f[0];
    } else {
      const m = matches.filter(v => maleKeywords.some(k => v.name.toLowerCase().includes(k)));
      if (m.length) return m[0];
    }
  }
  return matches[0] || null;
}

function renderVoiceGrid() {
  const grid = $('#voice-model-grid');
  if (!grid) return;
  grid.innerHTML = VOICE_CATEGORIES.map(cat => {
    const voice = findVoice(cat);
    const available = cat.id === 'auto' || !!voice;
    const isActive = state.selectedVoiceId === cat.id;
    return `
      <div class="voice-card ${isActive ? 'active' : ''} ${!available ? 'unavailable' : ''}"
           data-voice-id="${cat.id}" style="${!available ? 'opacity:0.4' : ''}">
        <strong>${cat.label}</strong>
        <span>${cat.desc}</span>
        ${voice ? `<span style="font-size:9px;color:#6a8aa8;display:block;margin-top:2px">${voice.name.slice(0,22)}</span>` : ''}
        <button class="voice-preview-btn" data-voice-id="${cat.id}" ${!available ? 'disabled' : ''}>▶ Önizle</button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.voice-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('voice-preview-btn')) return;
      state.selectedVoiceId = card.dataset.voiceId;
      renderVoiceGrid();
    });
  });
  grid.querySelectorAll('.voice-preview-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      previewVoice(btn.dataset.voiceId);
    });
  });
}

function previewVoice(catId) {
  const cat = VOICE_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;
  const voice = findVoice(cat);
  const u = new SpeechSynthesisUtterance('Merhaba, ben Anka. Kurucum Sadık tarafından tasarlandım.');
  if (voice) u.voice = voice;
  u.rate = state.voiceRate;
  u.pitch = state.voicePitch;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const catId = state.selectedVoiceId || 'auto';
  const cat = VOICE_CATEGORIES.find(c => c.id === catId) || VOICE_CATEGORIES[0];
  const voice = findVoice(cat);
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = state.voiceRate;
  u.pitch = state.voicePitch;
  u.lang = cat.lang || (state.settings.language === 'en' ? 'en-US' : 'tr-TR');
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = loadVoices;
  setTimeout(loadVoices, 500);
}

// ============= Devices ===================
async function loadDevices() {
  const list = await api('/devices');
  renderDevices(list);
}

function renderDevices(list) {
  $('#device-count').textContent = `${list.filter(d => d.status === 'online').length}/${list.length}`;
  const html = list.map(d => `
    <div class="device-row">
      <span class="device-icon">🖥️</span>
      <div class="device-meta">
        <strong>${escapeHtml(d.name)}</strong>
        <small>${escapeHtml(d.type)} · son: ${fmtTime(d.last_seen)}</small>
      </div>
      <span class="device-dot ${d.status}"></span>
    </div>
  `).join('') || '<div class="muted">Cihaz yok.</div>';

  $('#right-devices').innerHTML = html;
  if ($('#devices-list')) $('#devices-list').innerHTML = html;
}

socket.on('devices:update', renderDevices);

socket.on('connect', () => {
  socket.emit('device:register', {
    name: detectDeviceName(),
    type: detectPlatform()
  });
});
setInterval(() => socket.emit('device:heartbeat'), 15_000);

function detectPlatform() {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  return 'Web';
}
function detectDeviceName() {
  return `${detectPlatform()} / ${navigator.platform || 'Browser'}`;
}

// ============= Notes ====================
async function loadNotes() {
  const search = $('#note-search').value.trim();
  const category = $('#note-filter').value;
  const list = await api('/notes?' + new URLSearchParams({ search, category }));
  renderNotes(list);
}

function renderNotes(list) {
  $('#notes-list').innerHTML = list.map(n => `
    <div class="note-card" data-id="${n.id}">
      <div class="actions">
        <button onclick="deleteNote(${n.id})" title="Sil">🗑️</button>
      </div>
      <span class="cat">${escapeHtml(n.category)}</span>
      <h4>${escapeHtml(n.title)}</h4>
      <p>${escapeHtml(n.content)}</p>
    </div>
  `).join('') || '<div class="muted">Henüz not yok.</div>';
}

window.deleteNote = async (id) => {
  if (!confirm('Notu silmek istiyor musun?')) return;
  await api(`/notes/${id}`, { method: 'DELETE' });
  loadNotes();
};

$('#note-new-btn').addEventListener('click', async () => {
  const title = prompt('Başlık:');
  if (!title) return;
  const content = prompt('İçerik:');
  if (!content) return;
  const category = prompt('Kategori (Profesyonel/Sorumlu/Müracaat/Özel/Genel):', 'Genel') || 'Genel';
  await api('/notes', { method: 'POST', body: { title, content, category } });
  loadNotes();
});
$('#note-search').addEventListener('input', () => loadNotes());
$('#note-filter').addEventListener('change', () => loadNotes());

// ============= Settings ==================
async function loadSettings() {
  state.settings = await api('/settings');
  $('#set-ai-name').value = state.settings.ai_name || 'ANKA';
  $('#set-language').value = state.settings.language || 'tr';
  $$('.pers-card').forEach(c => {
    c.classList.toggle('active', c.dataset.value === state.settings.personality);
  });
  renderVoiceGrid();
}

$$('.pers-card').forEach(c => {
  c.addEventListener('click', () => {
    $$('.pers-card').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
  });
});

$('#save-settings').addEventListener('click', async () => {
  const activePers = document.querySelector('.pers-card.active');
  const payload = {
    ai_name: $('#set-ai-name').value.trim() || 'ANKA',
    language: $('#set-language').value,
    personality: activePers ? activePers.dataset.value : 'Profesyonel'
  };
  state.settings = await api('/settings', { method: 'PUT', body: payload });
  alert('Ayarlar kaydedildi.');
});

// Ses hızı / ton
const voiceRateSlider = $('#voice-rate');
const voicePitchSlider = $('#voice-pitch');
if (voiceRateSlider) {
  voiceRateSlider.addEventListener('input', () => {
    state.voiceRate = parseFloat(voiceRateSlider.value);
    $('#voice-rate-label').textContent = `Hız: ${state.voiceRate.toFixed(1)}x`;
  });
}
if (voicePitchSlider) {
  voicePitchSlider.addEventListener('input', () => {
    state.voicePitch = parseFloat(voicePitchSlider.value);
    $('#voice-pitch-label').textContent = `Ton: ${state.voicePitch.toFixed(1)}x`;
  });
}

$('#clear-memory').addEventListener('click', async () => {
  if (!confirm('Tüm uzun süreli hafıza silinecek. Emin misin?')) return;
  await api('/memory', { method: 'DELETE' });
  alert('Hafıza temizlendi.');
});

$('#export-memory').addEventListener('click', async () => {
  const data = await api('/memory/export');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `anka-memory-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============= Init ======================
loadSettings();
loadDevices();
