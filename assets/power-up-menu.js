// Track Options lives in Generate Track; Confirm saves without launching a run.
(() => {
  const inputs = [...document.querySelectorAll("[data-power-rate]")];
  if (!inputs.length) return;
  const bonusInputs = [...document.querySelectorAll("[data-bonus-rate]")];
  const bonusKinds = ["orb", "fruit", "bomb"], labels = ["Off", "Rare", "Normal", "Often"];
  const status = document.querySelector("#power-mix-status");
  const start = document.querySelector("#starting-shape"), mode = document.querySelector("#shape-mode");
  let saved = ThreadTrackOptions.read(), draft, first, changes, next;
  function load(value) {
    draft = ThreadTrackOptions.normalize(value);
    first = draft.shapes[0]; changes = draft.shapes.length > 1;
    next = changes ? draft.shapes.slice(1).split("") : [String((+first + 1) % 4)];
  }
  function options() { return ThreadTrackOptions.normalize({ ...draft, shapes: first + (changes ? next.join("") : "") }); }
  function refresh() {
    for (const [group, key, kinds] of [[inputs, "powers", ThreadPowerUps.kinds], [bonusInputs, "bonuses", bonusKinds]]) {
      group.forEach(input => {
        const rate = draft[key][kinds.indexOf(input.dataset.powerRate || input.dataset.bonusRate)];
        input.value = rate;
        input.setAttribute("aria-valuetext", labels[+rate]);
        document.querySelector(`#${input.id}-value`).textContent = labels[+rate];
      });
    }
    start.value = first; mode.value = changes ? "cycle" : "fixed";
    document.querySelector("#shape-sequence").hidden = !changes;
    for (let i = 0; i < 7; i++) {
      document.querySelector(`[data-shape-step="${i}"]`).hidden = i >= next.length;
      document.querySelector(`#next-shape-${i}`).value = next[i] || "0";
      document.querySelector(`[data-remove-shape="${i}"]`).disabled = next.length === 1;
    }
    document.querySelector("#add-shape").disabled = next.length >= 7;
    document.querySelector("#shape-summary").textContent = ThreadTrackOptions.describe(options());
  }
  function changed() { status.textContent = "Select Confirm to save your custom track settings."; refresh(); }
  for (const [group, key, kinds] of [[inputs, "powers", ThreadPowerUps.kinds], [bonusInputs, "bonuses", bonusKinds]]) {
    group.forEach(input => input.oninput = () => {
      const values = draft[key].split("");
      values[kinds.indexOf(input.dataset.powerRate || input.dataset.bonusRate)] = input.value;
      draft[key] = values.join(""); changed();
    });
  }
  start.onchange = () => { first = start.value; changed(); };
  mode.onchange = () => { changes = mode.value === "cycle"; changed(); };
  for (let i = 0; i < 7; i++) {
    document.querySelector(`#next-shape-${i}`).onchange = event => { next[i] = event.target.value; changed(); };
    document.querySelector(`[data-remove-shape="${i}"]`).onclick = () => { if (next.length > 1) next.splice(i, 1); changed(); };
  }
  document.querySelector("#add-shape").onclick = () => { if (next.length < 7) next.push(String((+next.at(-1) + 1) % 4)); changed(); };
  document.querySelector("#reset-power-mix").onclick = () => {
    load(ThreadTrackOptions.defaults); refresh();
    status.textContent = "Default shape cycle restored. All item and power-up frequencies set to Normal. Select Confirm to save.";
  };
  document.querySelector("#confirm-power-mix").onclick = () => {
    const selected = options();
    if (!ThreadTrackOptions.save(selected)) {
      status.textContent = "This device could not save your settings. Please allow site storage and try Confirm again.";
      return;
    }
    saved = selected;
    status.textContent = "Settings saved. Generate your track, then play or share it.";
    globalThis.ThreadGeneratedTrackMenu?.optionsChanged();
    document.querySelector('#powerups [data-go="generate"]').click();
  };
  globalThis.ThreadPowerUpMenu = { getMix: () => saved.powers, getOptions: () => ({ ...saved }) };
  load(saved); refresh();
})();
