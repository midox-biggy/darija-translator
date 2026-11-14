// Runs in every page. When the user selects text, it tells the extension, so the side panel
// (if it is open and "Live selection" is on) can paste and translate it automatically.
(() => {
  let last = '';
  let timer = null;

  function report() {
    const text = window.getSelection()?.toString().trim() ?? '';
    if (!text || text === last || text.length > 5000) return;
    last = text;
    chrome.runtime.sendMessage({ type: 'selection', text }).catch(() => {
      /* extension reloaded or panel closed: ignore */
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(report, 400);
  }

  document.addEventListener('mouseup', schedule);
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift') schedule(); // keyboard selections (Shift + arrows)
  });
})();
