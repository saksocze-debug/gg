// commandParser.js — Slash komutlarını yorumla
class CommandParser {
  constructor({ memory, notes, devices, settings }) {
    this.memory = memory;
    this.notes = notes;
    this.devices = devices;
    this.settings = settings;
  }

  isCommand(text) {
    return typeof text === 'string' && text.trim().startsWith('/');
  }

  // "Hatırla ki ..." veya "remember that ..." örüntüleri
  detectImplicitMemory(text) {
    const trimmed = text.trim();
    const patterns = [
      /^hatırla(?:\s+ki)?[:,\s]+(.+)/i,
      /^remember(?:\s+that)?[:,\s]+(.+)/i
    ];
    for (const p of patterns) {
      const m = trimmed.match(p);
      if (m) return m[1].trim();
    }
    return null;
  }

  async handle(text, { conversationId } = {}) {
    const raw = text.trim();
    const [cmd, ...rest] = raw.slice(1).split(/\s+/);
    const arg = rest.join(' ').trim();

    switch (cmd.toLowerCase()) {
      case 'clear':
        if (conversationId) this.memory.clearConversation(conversationId);
        return { type: 'system', message: 'Kısa süreli hafıza temizlendi.' };

      case 'note': {
        // /note Başlık | İçerik | Kategori
        const parts = arg.split('|').map(s => s.trim());
        if (parts.length < 2) {
          return { type: 'error', message: 'Kullanım: /note Başlık | İçerik | Kategori' };
        }
        const note = this.notes.create({
          title: parts[0],
          content: parts[1],
          category: parts[2] || 'Genel'
        });
        return { type: 'system', message: `Not kaydedildi (#${note.id}): ${note.title}` };
      }

      case 'remind': {
        if (!arg) return { type: 'error', message: 'Kullanım: /remind anahtar = değer' };
        const [k, ...v] = arg.split('=');
        if (!v.length) {
          return { type: 'error', message: 'Format: /remind anahtar = değer' };
        }
        this.memory.remember(k.trim(), v.join('=').trim());
        return { type: 'system', message: `Hatırlandı: ${k.trim()}` };
      }

      case 'devices': {
        const list = this.devices.list();
        const lines = list.map(d =>
          `• ${d.name} (${d.type}) — ${d.status}`
        );
        return { type: 'system', message: `**Bağlı Cihazlar**\n${lines.join('\n') || '(yok)'}` };
      }

      case 'settings': {
        const s = this.settings.getAll();
        return {
          type: 'system',
          message: `**Ayarlar**\n` + Object.entries(s).map(([k,v]) => `• ${k}: ${v}`).join('\n')
        };
      }

      case 'help':
      case 'yardim':
        return {
          type: 'system',
          message:
`**Kullanılabilir Komutlar**
• /clear — kısa hafızayı temizle
• /note Başlık | İçerik | Kategori — not oluştur
• /remind anahtar = değer — uzun hafızaya kaydet
• /devices — bağlı cihazları listele
• /settings — ayarları göster
• /help — bu listeyi göster`
        };

      default:
        return { type: 'error', message: `Bilinmeyen komut: /${cmd}. /help yazabilirsin.` };
    }
  }
}

module.exports = CommandParser;
