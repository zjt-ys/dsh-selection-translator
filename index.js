/**
 * Host half of the selection-translator bundle.
 *
 * Exposes a `translate` RPC method that the Client calls via
 * `host.call('translate', { text })`. Running the request on the Host side
 * avoids browser CORS restrictions entirely, which is why the Host is the
 * preferred path.
 *
 * Channel selection, chunking and fallback live in `./translate-core.js` so
 * the Client half can reuse exactly the same logic when the Host is not
 * available (for example when the package was installed from a snapshot and
 * the Host module generation has not loaded yet).
 */
import {
  HOST_CHANNELS,
  translateWithFallback,
} from './translate-core.js';

/** The largest chunk any channel can take, used to bound total input. */
const MAX_CHUNK = Math.max(...HOST_CHANNELS.map((c) => c.maxChars));
/** Hard cap on accepted input, so the UI can reject absurd selections early. */
const MAX_TOTAL = 20000;

export function apply() {
  return {
    /**
     * Translate text to Chinese.
     * @param {{ text: string }} args
     * @returns {Promise<{ result?: string, channel?: string, chunks?: number, error?: string }>}
     */
    async translate({ text }) {
      if (typeof text !== 'string' || !text.trim()) {
        return { error: '没有可翻译的文本。' };
      }
      if (text.length > MAX_TOTAL) {
        return { error: `文本过长（${text.length} 字符），单次最多 ${MAX_TOTAL} 字符。` };
      }
      try {
        return await translateWithFallback(text.trim(), HOST_CHANNELS, () => {});
      } catch (err) {
        return { error: `翻译失败: ${err && err.message ? err.message : String(err)}` };
      }
    },

    /** Report the channel table so the Client can show limits. */
    channels() {
      return {
        maxTotal: MAX_TOTAL,
        maxChunk: MAX_CHUNK,
        list: HOST_CHANNELS.map((c) => ({ id: c.id, label: c.label, maxChars: c.maxChars })),
      };
    },
  };
}
