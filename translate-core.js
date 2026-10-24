/**
 * Shared translation channels, used by both the Host half (index.js) and the
 * Client half (client.js) so either side can translate on its own.
 *
 * Each channel is a free public endpoint. Channels are listed in priority
 * order; a caller that fails on one channel moves to the next. Keeping this
 * logic identical on both sides means the Client can still translate when the
 * Host half is not loaded, and the Host still works when the browser is
 * blocked by CORS.
 *
 * Note on CORS: the Host half avoids it entirely. The Client half can only use
 * channels whose endpoints send permissive CORS headers, which is why the
 * Client list is ordered independently of the Host list.
 */

/** Channels that work from a browser (CORS-friendly), in priority order. */
export const CLIENT_CHANNELS = [
  {
    id: 'mymemory',
    label: 'MyMemory',
    maxChars: 480,
    async request(text) {
      const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const looksChinese = cjk / Math.max(1, text.length) > 0.3;
      const pair = looksChinese ? 'zh-CN|en' : 'en|zh-CN';
      const url = 'https://api.mymemory.translated.net/get?q='
        + encodeURIComponent(text) + '&langpair=' + encodeURIComponent(pair);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const out = data?.responseData?.translatedText;
      if (!out) throw new Error('空结果');
      // MyMemory reports failures as translated text, not as a status code.
      if (/QUERY LENGTH LIMIT EXCEEDED|INVALID SOURCE LANGUAGE|INVALID TARGET LANGUAGE|MYMEMORY WARNING/i.test(out)) {
        throw new Error(out.slice(0, 80));
      }
      return out.trim();
    },
  },
];

/** Channels usable from Node (no CORS concern), in priority order. */
export const HOST_CHANNELS = [
  {
    id: 'bilibili',
    label: 'Bilibili Index-Translate',
    maxChars: 900,
    async request(text) {
      const resp = await fetch('https://index-translate.bilibili.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SelectionTranslator/1.0',
        },
        body: JSON.stringify({
          model: 'Index-Translate-35B-A3B',
          messages: [{
            role: 'user',
            content: '请将以下文本翻译为中文，直接输出翻译结果，不要进行任何解释。\n\n' + text,
          }],
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const out = data?.choices?.[0]?.message?.content;
      if (!out || !out.trim()) throw new Error('空结果');
      return out.trim();
    },
  },
  {
    id: 'youdao',
    label: '有道翻译',
    maxChars: 900,
    async request(text) {
      const url = 'https://aidemo.youdao.com/trans?q=' + encodeURIComponent(text)
        + '&from=Auto&to=zh-CHS';
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SelectionTranslator/1.0' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const code = String(data?.errorCode ?? '');
      if (code !== '0') throw new Error(`errorCode ${code}`);
      const out = Array.isArray(data?.translation) ? data.translation.join('') : '';
      if (!out.trim()) throw new Error('空结果');
      return out.trim();
    },
  },
  {
    id: 'mymemory',
    label: 'MyMemory',
    maxChars: 480,
    async request(text) {
      const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const looksChinese = cjk / Math.max(1, text.length) > 0.3;
      const pair = looksChinese ? 'zh-CN|en' : 'en|zh-CN';
      const url = 'https://api.mymemory.translated.net/get?q='
        + encodeURIComponent(text) + '&langpair=' + encodeURIComponent(pair);
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SelectionTranslator/1.0' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const out = data?.responseData?.translatedText;
      if (!out) throw new Error('空结果');
      if (/QUERY LENGTH LIMIT EXCEEDED|INVALID SOURCE LANGUAGE|INVALID TARGET LANGUAGE|MYMEMORY WARNING/i.test(out)) {
        throw new Error(out.slice(0, 80));
      }
      return out.trim();
    },
  },
];

/**
 * Split text into chunks no longer than `limit`, preferring to break at a
 * paragraph break, then a sentence end, then whitespace, then anywhere.
 * @param {string} text
 * @param {number} limit
 * @returns {string[]}
 */
export function splitText(text, limit) {
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = -1;
    // 1. paragraph break
    cut = window.lastIndexOf('\n\n');
    if (cut > limit * 0.3) {
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^\n+/, '');
      continue;
    }
    // 2. sentence end (CJK or Latin punctuation)
    const sentenceRe = /[。！？；.!?;]\s*/g;
    let m;
    let lastEnd = -1;
    while ((m = sentenceRe.exec(window)) !== null) lastEnd = m.index + m[0].length;
    if (lastEnd > limit * 0.3) {
      chunks.push(rest.slice(0, lastEnd));
      rest = rest.slice(lastEnd);
      continue;
    }
    // 3. single newline
    cut = window.lastIndexOf('\n');
    if (cut > limit * 0.3) {
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^\n+/, '');
      continue;
    }
    // 4. whitespace
    cut = window.lastIndexOf(' ');
    if (cut > limit * 0.3) {
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut + 1);
      continue;
    }
    // 5. hard cut
    chunks.push(window);
    rest = rest.slice(limit);
  }
  if (rest.trim()) chunks.push(rest);
  return chunks.filter((c) => c.trim());
}

/**
 * Translate using the first channel that succeeds for every chunk.
 * @param {string} text
 * @param {Array} channels
 * @param {(msg: string) => void} report
 * @returns {Promise<{ result?: string, channel?: string, chunks?: number, error?: string }>}
 */
export async function translateWithFallback(text, channels, report) {
  const failures = new Map();

  // Each channel is attempted as the primary for the whole text. A channel
  // that fails partway through has its partial output discarded, so the
  // result never mixes translation styles from different engines.
  for (const channel of channels) {
    const chunks = splitText(text, channel.maxChars);
    const parts = [];
    let failed = false;

    for (let i = 0; i < chunks.length; i += 1) {
      if (chunks.length > 1) {
        report(`正在翻译 ${i + 1}/${chunks.length} 段（${channel.label}）…`);
      }
      let attempt = 0;
      let ok = false;
      while (attempt < 2 && !ok) {
        attempt += 1;
        try {
          parts.push(await channel.request(chunks[i]));
          ok = true;
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          failures.set(channel.id, msg);
          if (attempt >= 2) {
            failed = true;
            break;
          }
          // Short pause before the retry: rate limits often clear quickly.
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
      if (failed) break;
      // Be gentle between chunks to avoid tripping rate limits.
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    if (!failed && parts.length === chunks.length && parts.length > 0) {
      return {
        result: parts.join('\n\n'),
        channel: channel.label,
        chunks: chunks.length,
      };
    }
    report(`通道 ${channel.label} 不可用，正在切换…`);
  }

  const detail = [...failures.entries()]
    .map(([id, msg]) => `${id}: ${msg}`)
    .join('；');
  return { error: `所有翻译通道均失败。${detail || '请稍后重试。'}` };
}
