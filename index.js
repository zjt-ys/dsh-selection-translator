/**
 * Host half of the selection-translator bundle.
 * Exposes a `translate` RPC method that the Client calls via host.call('translate', { text }).
 * Making the API call from the Host side avoids browser CORS restrictions.
 */
const API_URL = 'https://index-translate.bilibili.com/v1/chat/completions';
const API_MODEL = 'Index-Translate-35B-A3B';

export function apply() {
  return {
    /**
     * Translate text to Chinese via the Index-Translate API.
     * Called from the Client as: host.call('translate', { text })
     * @param {{ text: string }} args
     * @returns {Promise<{ result?: string, error?: string }>}
     */
    async translate({ text }) {
      try {
        const resp = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Index-Translate-Client/1.0',
          },
          body: JSON.stringify({
            model: API_MODEL,
            messages: [{
              role: 'user',
              content: '请将以下文本翻译为中文，直接输出翻译结果，不要进行任何解释。\n\n' + text,
            }],
          }),
        });
        if (!resp.ok) {
          return { error: `API 返回错误 ${resp.status}: ${resp.statusText}` };
        }
        const data = await resp.json();
        const result = data?.choices?.[0]?.message?.content;
        if (!result) {
          return { error: 'API 返回了空结果' };
        }
        return { result: result.trim() };
      } catch (err) {
        return { error: `请求失败: ${err.message || String(err)}` };
      }
    },
  };
}
