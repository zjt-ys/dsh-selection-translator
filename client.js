window.__ModuleLoader__.load({
  id: '@local/selection-translator',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useCallback, useRef, useEffect } = React;

    // Package-private JSON RPC to our Host half. The Host owns the full
    // channel list and is the preferred path because it avoids CORS entirely.
    let host;
    try { host = require('host'); } catch { host = null; }

    /** Hard cap mirroring the Host half, so oversized selections fail fast. */
    const MAX_TOTAL = 20000;

    // ── Browser-side fallback channels ───────────────────────────────
    // A browser can only reach endpoints that send permissive CORS headers,
    // so this list is deliberately shorter than the Host's. It exists so the
    // plugin still translates when the Host half is not loaded. The logic
    // mirrors translate-core.js, which the Host half uses.
    const BROWSER_CHANNELS = [
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
          // MyMemory reports failures as translated text, not a status code.
          if (/QUERY LENGTH LIMIT EXCEEDED|INVALID SOURCE LANGUAGE|INVALID TARGET LANGUAGE|MYMEMORY WARNING/i.test(out)) {
            throw new Error(out.slice(0, 80));
          }
          return out.trim();
        },
      },
    ];

    /** Split text into chunks no longer than `limit`, preferring natural breaks. */
    function splitText(text, limit) {
      const chunks = [];
      let rest = text;
      while (rest.length > limit) {
        const window = rest.slice(0, limit);
        let cut = -1;
        cut = window.lastIndexOf('\n\n');
        if (cut > limit * 0.3) {
          chunks.push(rest.slice(0, cut));
          rest = rest.slice(cut).replace(/^\n+/, '');
          continue;
        }
        const sentenceRe = /[。！？；.!?;]\s*/g;
        let m;
        let lastEnd = -1;
        while ((m = sentenceRe.exec(window)) !== null) lastEnd = m.index + m[0].length;
        if (lastEnd > limit * 0.3) {
          chunks.push(rest.slice(0, lastEnd));
          rest = rest.slice(lastEnd);
          continue;
        }
        cut = window.lastIndexOf('\n');
        if (cut > limit * 0.3) {
          chunks.push(rest.slice(0, cut));
          rest = rest.slice(cut).replace(/^\n+/, '');
          continue;
        }
        cut = window.lastIndexOf(' ');
        if (cut > limit * 0.3) {
          chunks.push(rest.slice(0, cut));
          rest = rest.slice(cut + 1);
          continue;
        }
        chunks.push(window);
        rest = rest.slice(limit);
      }
      if (rest.trim()) chunks.push(rest);
      return chunks.filter((c) => c.trim());
    }

    /**
     * Translate with the Host half first, then fall back to a direct browser
     * request. The Host path is preferred because it is not limited by CORS.
     * @returns {Promise<{ result: string, channel?: string, chunks?: number }>}
     */
    async function translateText(text) {
      const attempts = [];

      if (host) {
        try {
          const r = await host.call('translate', { text });
          if (r?.error) throw new Error(r.error);
          if (!r?.result) throw new Error('Host 端返回了空结果');
          return r;
        } catch (err) {
          attempts.push(`Host 端: ${err?.message || String(err)}`);
        }
      } else {
        attempts.push('Host 端: 未加载');
      }

      // Fallback: CORS-friendly channels straight from the browser.
      const failures = [];
      for (const channel of BROWSER_CHANNELS) {
        const chunks = splitText(text, channel.maxChars);
        const parts = [];
        let failed = false;
        for (let i = 0; i < chunks.length; i += 1) {
          try {
            parts.push(await channel.request(chunks[i]));
          } catch (err) {
            failures.push(`${channel.id}: ${err?.message || String(err)}`);
            failed = true;
            break;
          }
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
      }

      throw new Error(
        '翻译失败，所有路径均不可用。\n' + attempts.join('\n')
        + (failures.length ? '\n' + failures.join('\n') : ''),
      );
    }

    // ── Icons ──────────────────────────────────────────────────────
    function TranslateIcon({ size = 16 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size,
        fill: 'none', stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M4 5h7' }),
        h('path', { d: 'M9 3v2c0 4.4-2.7 8.5-7 10' }),
        h('path', { d: 'M5 9c2 2 4.5 3 7 3' }),
        h('path', { d: 'M14 21l4-9 4 9' }),
        h('path', { d: 'M14.8 19h6.4' }),
      );
    }

    function CloseIcon({ size = 16 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size,
        fill: 'none', stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M18 6L6 18' }),
        h('path', { d: 'M6 6l12 12' }),
      );
    }

    function CopyIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size,
        fill: 'none', stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
        h('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }),
      );
    }

    // ── Floating Overlay Component ─────────────────────────────────
    function TranslateOverlay({ result, loading, error, originalText, channel, chunks, onClose }) {
      const [showOriginal, setShowOriginal] = useState(false);
      const [copied, setCopied] = useState(false);

      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [onClose]);

      const handleCopy = useCallback(() => {
        if (result) {
          navigator.clipboard.writeText(result).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }
      }, [result]);

      const overlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)',
      };
      const modalStyle = {
        background: 'var(--dsh-color-bg-elevated, #1e1e2e)',
        border: '1px solid var(--dsh-color-border-default, #313144)',
        borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: 'min(680px, 90vw)', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        color: 'var(--dsh-color-text-primary, #cdd6f4)', fontFamily: 'inherit',
      };
      const headerStyle = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: '1px solid var(--dsh-color-border-default, #313144)',
        fontSize: '15px', fontWeight: 600,
      };
      const bodyStyle = {
        padding: '20px', overflowY: 'auto', flex: 1,
        fontSize: '14px', lineHeight: 1.7,
      };
      const footerStyle = {
        padding: '12px 20px',
        borderTop: '1px solid var(--dsh-color-border-default, #313144)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: '12px',
      };
      const btnStyle = {
        background: 'none', border: 'none',
        color: 'var(--dsh-color-text-secondary, #9399b2)',
        cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
        fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px',
        fontFamily: 'inherit',
      };

      return h('div', { style: overlayStyle, onClick: onClose },
        h('div', { style: modalStyle, onClick: (e) => e.stopPropagation() },
          h('div', { style: headerStyle },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(TranslateIcon, { size: 18 }),
              h('span', null, '翻译结果'),
            ),
            h('button', {
              style: { ...btnStyle, padding: '6px' },
              onClick: onClose, 'aria-label': '关闭',
            }, h(CloseIcon, { size: 18 })),
          ),
          h('div', { style: bodyStyle },
            loading && h('div', {
              style: { display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--dsh-color-text-secondary, #9399b2)' },
            },
              h('div', {
                style: {
                  width: '16px', height: '16px',
                  border: '2px solid var(--dsh-color-border-default, #313144)',
                  borderTopColor: 'var(--dsh-color-accent-primary, #89b4fa)',
                  borderRadius: '50%',
                  animation: 'dsh-translator-spin 0.8s linear infinite',
                },
              }),
              h('span', null, '正在翻译…'),
            ),
            error && h('div', {
              style: {
                color: 'var(--dsh-color-text-error, #f38ba8)',
                background: 'var(--dsh-color-bg-error, rgba(243,139,168,0.1))',
                padding: '12px 16px', borderRadius: '8px', fontSize: '13px',
                whiteSpace: 'pre-wrap',
              },
            }, error),
            !loading && !error && result && h('div', {
              style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
            }, result),
          ),
          !loading && h('div', { style: footerStyle },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
              h('button', {
                style: btnStyle,
                onClick: () => setShowOriginal(!showOriginal),
              }, showOriginal ? '隐藏原文' : '查看原文'),
              result && channel && h('span', {
                style: { color: 'var(--dsh-color-text-tertiary, #6c7086)' },
              }, chunks > 1 ? `${channel} · ${chunks} 段` : channel),
            ),
            h('div', { style: { display: 'flex', gap: '8px' } },
              result && h('button', { style: btnStyle, onClick: handleCopy },
                h(CopyIcon), copied ? '已复制' : '复制'),
              h('span', {
                style: { color: 'var(--dsh-color-text-tertiary, #6c7086)' },
              }, 'Esc 关闭'),
            ),
          ),
          showOriginal && h('div', {
            style: {
              padding: '12px 20px',
              borderTop: '1px solid var(--dsh-color-border-default, #313144)',
              fontSize: '13px', color: 'var(--dsh-color-text-secondary, #9399b2)',
              maxHeight: '200px', overflowY: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
            },
          }, originalText),
        ),
      );
    }

    // ── Main Button Component ──────────────────────────────────────
    function TranslateButton() {
      const [overlay, setOverlay] = useState(null);
      const aliveRef = useRef(true);

      useEffect(() => {
        aliveRef.current = true;
        return () => { aliveRef.current = false; };
      }, []);

      const handleTranslate = useCallback(() => {
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : '';

        if (!text) {
          setOverlay({
            loading: false,
            error: '请先在页面中选中要翻译的文本，再点击翻译按钮。',
            result: null, original: '',
          });
          return;
        }
        if (text.length > MAX_TOTAL) {
          setOverlay({
            loading: false,
            error: `选中文本过长（${text.length} 字符），单次最多 ${MAX_TOTAL} 字符。`,
            result: null, original: '',
          });
          return;
        }

        setOverlay({ loading: true, error: null, result: null, original: text });

        translateText(text)
          .then((r) => {
            if (!aliveRef.current) return;
            setOverlay({
              loading: false, error: null,
              result: r.result, channel: r.channel, chunks: r.chunks,
              original: text,
            });
          })
          .catch((err) => {
            if (!aliveRef.current) return;
            setOverlay({
              loading: false, error: err.message || String(err),
              result: null, original: text,
            });
          });
      }, []);

      const handleClose = useCallback(() => { setOverlay(null); }, []);

      const btnStyle = {
        background: 'none', border: 'none',
        color: 'var(--dsh-color-text-secondary, #9399b2)',
        cursor: 'pointer', padding: '6px 8px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '4px', fontSize: '13px', fontFamily: 'inherit',
        transition: 'color 0.15s',
      };

      return h(React.Fragment, null,
        h('button', {
          style: btnStyle,
          onClick: handleTranslate,
          title: '翻译选中文本为中文',
          'aria-label': '翻译选中文本为中文',
          onMouseEnter: (e) => {
            e.currentTarget.style.color = 'var(--dsh-color-accent-primary, #89b4fa)';
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.color = 'var(--dsh-color-text-secondary, #9399b2)';
          },
        }, h(TranslateIcon, { size: 16 })),
        overlay && h(TranslateOverlay, {
          result: overlay.result, loading: overlay.loading,
          error: overlay.error, originalText: overlay.original,
          channel: overlay.channel, chunks: overlay.chunks,
          onClose: handleClose,
        }),
      );
    }

    // ── Plugin registration ───────────────────────────────────────
    return {
      inject: ['slots'],
      apply(ctx) {
        const styleEl = document.createElement('style');
        styleEl.textContent = '@keyframes dsh-translator-spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(styleEl);

        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'selection-translator',
          order: 50,
          label: '翻译',
        }, TranslateButton));

        ctx.effect(() => () => { styleEl.remove(); });
      },
    };
  },
});
