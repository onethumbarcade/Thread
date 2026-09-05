(() => {
  const inputs = [...document.querySelectorAll("[data-power-rate]")];
  if (!inputs.length) return;
  const labels = ["Off", "Rare", "Normal", "Often"];
  const status = document.querySelector("#power-mix-status");
  let mix = ThreadPowerUps.readMix();
  function refresh() {
    inputs.forEach(input => {
      const rate = mix[ThreadPowerUps.kinds.indexOf(input.dataset.powerRate)];
      input.value = rate;
      input.setAttribute("aria-valuetext", labels[Number(rate)]);
      document.querySelector(`#${input.id}-value`).textContent = labels[Number(rate)];
    });
  }
  function save() {
    status.textContent = ThreadPowerUps.saveMix(mix)
      ? "Mix saved for your next generated run. Shared links include this mix."
      : "This device could not save the mix. Play With This Mix will still use it for this run.";
    refresh();
  }
  inputs.forEach(input => input.oninput = () => {
    const values = mix.split("");
    values[ThreadPowerUps.kinds.indexOf(input.dataset.powerRate)] = input.value;
    mix = ThreadPowerUps.normalizeMix(values.join(""));
    save();
  });
  document.querySelector("#reset-power-mix").onclick = () => { mix = ThreadPowerUps.defaultMix; save(); };
  document.querySelector("#play-power-mix").onclick = () => {
    const params = new URLSearchParams(location.search);
    const code = (params.get("mode") === "generated" && params.get("seed")) || document.querySelector("#seed")?.textContent || ThreadTracks.newCode();
    location.href = ThreadTracks.trackUrl("generated", code, location.href, mix);
  };
  globalThis.ThreadPowerUpMenu = { getMix: () => mix };
  refresh();
})();
