// Service worker: owns the right-click menu and the keyboard shortcut, and hands the
// selected text to the side panel.

const MENU_TRANSLATE = 'darija-translate-selection';
const MENU_OPEN = 'darija-open-panel';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_TRANSLATE,
    title: 'Translate "%s" to Darija',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: MENU_OPEN,
    title: 'Open Darija Translator',
    contexts: ['page'],
  });
  // Clicking the toolbar icon also opens the side panel.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // sidePanel.open() must run straight away, while Chrome still counts this as a user gesture.
  openPanel(tab);
  if (info.menuItemId === MENU_TRANSLATE && info.selectionText) {
    handOff(info.selectionText, 'context menu');
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'translate-selection' || !tab) return;
  openPanel(tab);
  try {
    // activeTab lets us read the selection of the current page after the shortcut.
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString(),
    });
    if (result && result.trim()) handOff(result, 'keyboard shortcut');
  } catch (e) {
    // chrome:// pages and the Web Store cannot be scripted; the panel just opens empty.
    console.warn('Cannot read selection:', e.message);
  }
});

function openPanel(tab) {
  if (tab?.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((e) => console.warn(e.message));
  }
}

// The panel may not exist yet (it is still opening), so the text is parked in session
// storage for it to pick up on load, and also sent as a message in case it is already open.
async function handOff(text, origin) {
  const pending = { text: text.trim(), origin, at: Date.now() };
  await chrome.storage.session.set({ pending });
  chrome.runtime.sendMessage({ type: 'translate-text', ...pending }).catch(() => {
    /* panel not open yet: it reads storage.session when it loads */
  });
}
