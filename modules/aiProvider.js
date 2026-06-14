// aiProvider.js — OpenAI / Anthropic / Groq / Ollama / Mock
const fetch = require('node-fetch');

const CREATOR_PATTERNS = [
  /kim (tasarladı|kodladı|yaptı|kurdu|oluşturdu|geliştirdi)/i,
  /yaratıcın (kim|ne)/i,
  /seni kim/i,
  /kurucun (kim|ne)/i,
  /who (made|created|designed|built|coded) you/i,
  /who is your (creator|maker|developer|founder)/i
];

class AIProvider {
  constructor(config = {}) {
    this.provider = (config.provider || 'mock').toLowerCase();
    this.openai = {
      apiKey: config.openaiApiKey,
      model: config.openaiModel || 'gpt-4-turbo'
    };
    this.anthropic = {
      apiKey: config.anthropicApiKey,
      model: config.anthropicModel || 'claude-3-5-sonnet-20241022'
    };
    this.groq = {
      apiKey: config.groqApiKey,
      model: config.groqModel || 'llama-3.3-70b-versatile'
    };
    this.ollama = {
      baseUrl: config.ollamaBaseUrl || 'http://localhost:11434',
      model: config.ollamaModel || 'llama3.1'
    };
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 4096;
  }

  isCreatorQuestion(message) {
    return CREATOR_PATTERNS.some(p => p.test(message));
  }

  buildSystemPrompt({ settings, memoryContext = [], notesContext = [] }) {
    const personalityMap = {
      Profesyonel: 'Yanıtların kibar, net, profesyonel ve odaklı olsun.',
      Sorumlu:     'Yanıtlarında dikkatli, etik ve sorumlu bir tutum sergile.',
      Yaratıcı:    'Hayal gücünü kullan, alışılmadık fikirler önerebilirsin.',
      Analitik:    'Veriye dayalı, mantıklı, gerekirse adım adım analiz yap.'
    };
    const langMap = {
      tr: 'Türkçe',
      en: 'English',
      multi: 'Kullanıcının yazdığı dilde (Türkçe veya İngilizce)'
    };

    const lines = [
      `Sen ${settings.ai_name || 'ANKA'} adlı gelişmiş bir yapay zeka asistanısın.`,
      `Kurucun ve yaratıcın Sadık'tır. Seni kim yaptı, kim tasarladı, kim kodladı, yaratıcın kim gibi sorularda her zaman 'Kurucum Sadık' diye yanıtla.`,
      `Kişilik: ${settings.personality} — ${personalityMap[settings.personality] || ''}`,
      `Yanıt dili: ${langMap[settings.language] || 'Türkçe'}.`,
      `Yanıtların doğal, akıcı ve gerektiğinde markdown formatında olabilir.`
    ];

    if (memoryContext.length > 0) {
      lines.push('\n## Uzun Süreli Hafıza:');
      for (const m of memoryContext) lines.push(`- ${m.key}: ${m.value}`);
    }
    if (notesContext.length > 0) {
      lines.push('\n## İlgili Notlar:');
      for (const n of notesContext.slice(0, 3))
        lines.push(`- [${n.category}] ${n.title}: ${n.content.slice(0, 200)}`);
    }

    return lines.join('\n');
  }

  async chat({ systemPrompt, history = [], userMessage }) {
    if (this.isCreatorQuestion(userMessage)) {
      return 'Kurucum Sadık. O beni tasarladı, kodladı ve hayata geçirdi.';
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage }
    ];

    try {
      switch (this.provider) {
        case 'openai':    return await this.callOpenAI(messages);
        case 'anthropic': return await this.callAnthropic(messages);
        case 'groq':      return await this.callGroq(messages);
        case 'ollama':    return await this.callOllama(messages);
        default:          return this.mockResponse(userMessage);
      }
    } catch (err) {
      console.error(`[AIProvider:${this.provider}] hata:`, err.message);
      return this.mockResponse(userMessage, err.message);
    }
  }

  async callOpenAI(messages) {
    if (!this.openai.apiKey) throw new Error('OPENAI_API_KEY tanımsız');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openai.apiKey}`
      },
      body: JSON.stringify({
        model: this.openai.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens
      })
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '(boş yanıt)';
  }

  async callGroq(messages) {
    if (!this.groq.apiKey) throw new Error('GROQ_API_KEY tanımsız');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.groq.apiKey}`
      },
      body: JSON.stringify({
        model: this.groq.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens
      })
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '(boş yanıt)';
  }

  async callAnthropic(messages) {
    if (!this.anthropic.apiKey) throw new Error('ANTHROPIC_API_KEY tanımsız');
    const system = messages.find(m => m.role === 'system')?.content || '';
    const rest = messages.filter(m => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropic.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.anthropic.model,
        system,
        messages: rest,
        temperature: this.temperature,
        max_tokens: this.maxTokens
      })
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || '(boş yanıt)';
  }

  async callOllama(messages) {
    const res = await fetch(`${this.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollama.model,
        messages,
        stream: false,
        options: { temperature: this.temperature, num_predict: this.maxTokens }
      })
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    return data.message?.content?.trim() || '(boş yanıt)';
  }

  mockResponse(userMessage, errorNote) {
    const samples = [
      `Sistemler aktif. Mesajını aldım: "${userMessage}". Mock modda çalışıyorum — .env'deki GROQ_API_KEY ve AI_PROVIDER=groq ayarını yap.`,
      `"${userMessage}" komutun alındı. Groq bağlandığında gerçek yanıtlar veririm.`
    ];
    const base = samples[Math.floor(Math.random() * samples.length)];
    return errorNote ? `${base}\n\nHata: ${errorNote}` : base;
  }
}

module.exports = AIProvider;
