// Portable settings for generated courses. A shared link contains the full setup.
(() => {
  const defaults = { powers: "222222", shapes: "0123", bonuses: "222" };
  const shapeNames = ["Square", "Circle", "Diamond", "Triangle"];
  function normalize(value = {}) {
    return {
      powers: /^[0-3]{6}$/.test(value?.powers) ? value.powers : defaults.powers,
      shapes: /^[0-3]{1,8}$/.test(value?.shapes) ? value.shapes : defaults.shapes,
      bonuses: /^[0-3]{3}$/.test(value?.bonuses) ? value.bonuses : defaults.bonuses,
    };
  }
  function read() {
    try {
      const saved = localStorage.getItem("thread-track-options");
      if (saved) return normalize(JSON.parse(saved));
      return normalize({ ...defaults, powers: localStorage.getItem("thread-power-mix") });
    } catch { return { ...defaults }; }
  }
  function save(value) {
    try { localStorage.setItem("thread-track-options", JSON.stringify(normalize(value))); return true; }
    catch { return false; }
  }
  function fromUrl(params) {
    // Links with settings are self-contained; a bare track code uses local choices.
    const shared = ["powers", "shapes", "bonuses"].some(key => params.has(key));
    const result = shared ? { ...defaults } : read();
    for (const key of Object.keys(defaults)) if (params.has(key)) result[key] = params.get(key);
    return normalize(result);
  }
  function describe(value) {
    const { shapes } = normalize(value);
    return shapes.length === 1
      ? `${shapeNames[+shapes]} every level.`
      : `${shapes.split("").map(shape => shapeNames[+shape]).join(" → ")}. Repeats each level.`;
  }
  function describeFrequencies(value) {
    const options = normalize(value), labels = ["Off", "Rare", "Normal", "Often"];
    const bonuses = ["Growth Orbs", "Fruit", "Bombs"].map((name, i) => `${name}: ${labels[+options.bonuses[i]]}`).join(" · ");
    const powers = new Set(options.powers).size === 1 ? labels[+options.powers[0]] : ["Star", "Blaster", "Magnet", "Slow Motion", "Double Points", "Energy Cell"].map((name, i) => +options.powers[i] ? `${name} ${labels[+options.powers[i]]}` : "").filter(Boolean).join(", ");
    return `${bonuses}. Power-ups: ${powers}.`;
  }
  globalThis.ThreadTrackOptions = { defaults, shapeNames, normalize, read, save, fromUrl, describe, describeFrequencies };
})();
