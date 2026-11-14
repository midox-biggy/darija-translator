// Draws a visible mouse pointer that follows the synthetic mouse events the director sends,
// so the recording shows where each click happens.
(() => {
  if (window.__demoCursor) return;
  window.__demoCursor = true;
  // Inside an iframe (the phone frame): report positions to the parent page, which draws the only cursor.
  if (window.top !== window) {
    addEventListener('mousemove', (e) => parent.postMessage({ demoCursor: 'move', x: e.clientX, y: e.clientY }, '*'), true);
    addEventListener('mousedown', (e) => parent.postMessage({ demoCursor: 'down', x: e.clientX, y: e.clientY, button: e.button }, '*'), true);
    return;
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="32" viewBox="0 0 26 32">' +
    '<path d="M2 2 L2 26 L8.5 20 L13 30 L17.5 28 L13 18.5 L22 18.5 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
  function install() {
    if (!document.body || document.getElementById('__demo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML = svg;
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none',
      transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' });
    document.body.appendChild(c);
    const ring = document.createElement('div');
    Object.assign(ring.style, { position: 'fixed', zIndex: 2147483646, pointerEvents: 'none', width: '34px', height: '34px',
      marginLeft: '-17px', marginTop: '-17px', borderRadius: '50%', border: '3px solid #c1272d', opacity: '0',
      transition: 'opacity .35s, transform .35s', transform: 'scale(.4)' });
    document.body.appendChild(ring);
    const last = sessionStorage.getItem('__demo_cursor_pos');
    if (last) c.style.transform = `translate(${last})`;
    addEventListener('mousemove', (e) => {
      const pos = `${e.clientX - 2}px,${e.clientY - 2}px`;
      c.style.transform = `translate(${pos})`;
      try { sessionStorage.setItem('__demo_cursor_pos', pos); } catch {}
    }, true);
    addEventListener('message', (m) => {
      if (!m.data || !m.data.demoCursor) return;
      const frame = [...document.querySelectorAll('iframe')].find((f) => f.contentWindow === m.source);
      if (!frame) return;
      const r = frame.getBoundingClientRect();
      const type = m.data.demoCursor === 'down' ? 'mousedown' : 'mousemove';
      dispatchEvent(new MouseEvent(type, { clientX: r.left + m.data.x, clientY: r.top + m.data.y, button: m.data.button || 0 }));
    });
    addEventListener('mousedown', (e) => {
      ring.style.left = e.clientX + 'px';
      ring.style.top = e.clientY + 'px';
      ring.style.borderColor = e.button === 2 ? '#006233' : '#c1272d';
      ring.style.transition = 'none'; ring.style.opacity = '1'; ring.style.transform = 'scale(.4)';
      requestAnimationFrame(() => { ring.style.transition = 'opacity .45s, transform .45s'; ring.style.opacity = '0'; ring.style.transform = 'scale(1.4)'; });
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
