(() => {
  const seed = document.querySelector("#seed");
  const status = document.querySelector("#track-status");
  const shareButton = document.querySelector("#share-track");
  const entryButton = document.querySelector("#enter-track-code");
  const form = document.querySelector("#track-code-form");
  const input = document.querySelector("#track-code-input");
  const error = document.querySelector("#track-code-error");
  const manual = document.querySelector("#track-share-manual");
  const manualLink = document.querySelector("#track-share-link");
  const currentMix = () => globalThis.ThreadPowerUpMenu?.getMix() || globalThis.ThreadPowerUps?.readMix();

  function clearFeedback() {
    status.textContent = "";
    error.textContent = "";
    input.removeAttribute("aria-invalid");
    manual.hidden = true;
  }

  function setCode(code) {
    seed.textContent = code;
    clearFeedback();
  }

  function closeEntry() {
    form.hidden = true;
    entryButton.setAttribute("aria-expanded", "false");
  }

  setCode(ThreadTracks.newCode());
  document.querySelector("#new-seed").onclick = () => {
    let code;
    do { code = ThreadTracks.newCode(); } while (code === seed.textContent);
    setCode(code);
    closeEntry();
    status.textContent = `New track ${code} ready.`;
  };
  document.querySelector("#play-generated").onclick = () => {
    location.href = ThreadTracks.trackUrl("generated", seed.textContent, location.href, currentMix());
  };
  entryButton.onclick = () => {
    clearFeedback();
    form.hidden = !form.hidden;
    entryButton.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) { input.focus(); input.select(); }
  };
  input.oninput = () => {
    error.textContent = "";
    input.removeAttribute("aria-invalid");
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    const code = ThreadTracks.normalizeCode(input.value);
    if (!code) {
      error.textContent = "Enter four letters or numbers, then four digits, like N3ON-4821.";
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    input.value = code;
    setCode(code);
    closeEntry();
    status.textContent = `Track ${code} loaded. Tap Play This Track.`;
    document.querySelector("#play-generated").focus({ preventScroll: true });
  };
  shareButton.onclick = async () => {
    clearFeedback();
    const code = seed.textContent;
    const url = ThreadTracks.trackUrl("generated", code, location.href, currentMix());
    shareButton.disabled = true;
    try {
      const result = await ThreadTracks.share({
        title: "THREAD track challenge",
        text: `Try my track in THREAD by One Thumb Arcade!\nTrack code: ${code}\nOpen this link to play the same course and power-up mix.`,
        url,
      });
      if (result === "shared") status.textContent = "Track shared.";
      if (result === "copied") status.textContent = "Track link copied. Paste it into a message.";
      if (result === "manual") {
        manual.hidden = false;
        manualLink.value = url;
        status.textContent = "Press and hold the selected link to copy it.";
        manualLink.focus();
        manualLink.select();
      }
    } finally {
      shareButton.disabled = false;
    }
  };
  manualLink.onclick = () => manualLink.select();
})();
