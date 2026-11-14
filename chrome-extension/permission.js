const state = document.getElementById('state');
navigator.mediaDevices.getUserMedia({ audio: true })
  .then((stream) => {
    stream.getTracks().forEach((t) => t.stop());
    state.textContent = 'Microphone allowed. You can close this tab and go back to the side panel.';
  })
  .catch((e) => {
    state.classList.add('error');
    state.textContent = 'Microphone blocked (' + e.name + '). Allow it from the lock icon in the address bar, then reload this page.';
  });
