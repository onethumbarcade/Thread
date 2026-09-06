// Shared by the title menu and post-game menu; navigation remains with each page.
(() => {
  const panels = {
    options: `
    <div class="guide-head"><button class="back" data-go="home" aria-label="Back">‹</button><div class="guide-title">OPTIONS</div></div>
    <div class="settings"><div><span>Sound Effects</span><small>Orbs, fruit, bombs and level changes</small></div><button class="switch on" data-setting="sfx" aria-label="Toggle sound effects"></button></div>
    <div class="settings"><div><span>Music</span><small>Menu and gameplay soundtracks</small></div><button class="switch on" data-setting="music" aria-label="Toggle music"></button></div>
    <div class="settings"><div><span>Haptics</span><small>Touch feedback on supported devices</small></div><button class="switch on" data-setting="haptics" aria-label="Toggle haptics"></button></div>
    <div class="settings"><div><span>Reduced Motion</span><small>Minimizes pulsing and moving stars</small></div><button class="switch" data-setting="reduced" aria-label="Toggle reduced motion"></button></div>
    <div class="option-actions">
      <div class="option-links"><button class="scoring-link" data-go="scoring"><span aria-hidden="true">ⓘ</span> Scoring Guide</button></div>
      <button class="action" data-go="home">DONE</button>
    </div>
  `,
    scoring: `
    <div class="guide-head"><button class="back" data-go="options" aria-label="Back to options">‹</button><div class="guide-title">SCORING GUIDE</div></div>
    <div class="hero" style="--neon:#45efff"><div class="date">THREADING POINTS</div><h3>STAY CENTERED</h3><p>Your score rises continuously while the laser remains inside the tracker. The closer the laser is to the center, the faster you score.</p></div>
    <div class="board">
      <div class="rank"><b>◎</b><span>Perfect center at 1× speed</span><b>≈52/sec</b></div>
      <div class="rank"><b>◯</b><span>Edge catch at 1× speed</span><b>≈22/sec</b></div>
      <div class="rank"><b>×</b><span>Displayed speed multiplies points</span><b>2× = 2×</b></div>
      <div class="rank"><b>●</b><span>Growth orb + tracker size</span><b>+250</b></div>
      <div class="rank"><b>🍒</b><span>Cherry</span><b>+100</b></div>
      <div class="rank"><b>🍓</b><span>Strawberry</span><b>+125</b></div>
      <div class="rank"><b>🍌</b><span>Banana</span><b>+150</b></div>
      <div class="rank"><b>🍰</b><span>Cake</span><b>+250</b></div>
      <div class="rank"><b>💣</b><span>−35 energy and −8px size</span><b>0 pts</b></div>
      <div class="rank"><b>★</b><span>Invincibility: blocks bombs, energy loss and shrinking</span><b>7 sec</b></div>
      <div class="rank"><b>⚡</b><span>Blaster: automatically shoots approaching bombs</span><b>12 sec</b></div>
      <div class="rank"><b>∩</b><span>Magnet: pulls distant fruit and nearby growth orbs to you</span><b>10 sec</b></div>
      <div class="rank"><b>◷</b><span>Slow motion: course moves at 60% speed</span><b>6 sec</b></div>
      <div class="rank"><b>2×</b><span>Double points: threading, fruit and growth orbs</span><b>10 sec</b></div>
      <div class="rank"><b>+</b><span>Energy cell: instantly restores full health</span><b>100%</b></div>
    </div>
    <div class="holiday">NEW LEVEL EVERY 20,000 POINTS</div>
    <p class="note">Power-ups sit farther off the laser than fruit. Swerve to collect them, then return to the laser to keep scoring. Timed powers can overlap; collecting the same power refreshes its timer. Blasted bombs give no points.</p>
    <p class="note">Maximum scores come from precise centering, surviving higher speed multipliers and taking calculated risks for collectibles.</p>
  `,
    powerups: `
    <div class="guide-head"><button class="back" data-go="generate" aria-label="Back to Generate Track">‹</button><div class="guide-title">TRACK OPTIONS</div></div>
    <p class="mix-intro">Build your own challenge. Choose the shapes and item frequencies, then generate a track to play or share.</p>
    <h3 class="track-section-title">SHAPES</h3>
    <label class="shape-label" for="starting-shape">Starting Shape</label>
    <select class="shape-select" id="starting-shape">${["Square", "Circle", "Diamond", "Triangle"].map((name,i)=>`<option value="${i}">${name}</option>`).join("")}</select>
    <label class="shape-label" for="shape-mode">Shape Changes</label>
    <select class="shape-select" id="shape-mode"><option value="cycle">Change each level</option><option value="fixed">Keep the starting shape</option></select>
    <div id="shape-sequence">
      ${Array.from({length:7},(_,i)=>`<div class="shape-step" data-shape-step="${i}"><label for="next-shape-${i}">Then</label><select class="shape-select" id="next-shape-${i}" data-next-shape="${i}">${["Square", "Circle", "Diamond", "Triangle"].map((name,n)=>`<option value="${n}">${name}</option>`).join("")}</select><button class="shape-remove" data-remove-shape="${i}" aria-label="Remove shape ${i+2}">×</button></div>`).join("")}
      <button class="shape-add" id="add-shape">+ Add Shape</button>
    </div>
    <p class="mix-note" id="shape-summary"></p>
    <h3 class="track-section-title">FRUIT & BONUSES</h3>
    ${[
      ["orb", "◎ Growth Orbs", "Increase the tracker size"],
      ["fruit", "🍒 Fruit & Treats", "Cherries, strawberries, bananas and cake"],
      ["bomb", "💣 Bombs", "Off-track hazards for an extra challenge"],
    ].map(([kind,label,description])=>`<div class="power-mix-row"><label for="bonus-${kind}">${label}<output id="bonus-${kind}-value" for="bonus-${kind}">Normal</output></label><small>${description}</small><input id="bonus-${kind}" data-bonus-rate="${kind}" type="range" min="0" max="3" step="1" value="2" aria-valuetext="Normal"><div class="mix-scale" aria-hidden="true"><span>Off</span><span>Rare</span><span>Normal</span><span>Often</span></div></div>`).join("")}
    <h3 class="track-section-title">POWER-UPS</h3>
    ${[
      ["star", "★ Star", "7 seconds of rainbow invincibility"],
      ["blaster", "⚡ Blaster", "12 seconds of automatic bomb blasting"],
      ["magnet", "∩ Magnet", "10 seconds of fruit and orb attraction"],
      ["slow", "◷ Slow Motion", "6 seconds at 60% course speed"],
      ["double", "2× Double Points", "10 seconds of double scoring"],
      ["energy", "+ Energy Cell", "Instantly restores health to 100%"],
    ].map(([kind, label, description]) => `<div class="power-mix-row"><label for="mix-${kind}">${label}<output id="mix-${kind}-value" for="mix-${kind}">Normal</output></label><small>${description}</small><input id="mix-${kind}" data-power-rate="${kind}" type="range" min="0" max="3" step="1" value="2" aria-valuetext="Normal"><div class="mix-scale" aria-hidden="true"><span>Off</span><span>Rare</span><span>Normal</span><span>Often</span></div></div>`).join("")}
    <p class="mix-note" id="power-mix-status" role="status">Confirm saves this setup. Shared links include every setting; a track code uses your saved setup.</p>
    <div class="mix-actions">
      <button class="mix-reset" id="reset-power-mix">Reset to Default</button>
      <button class="action" id="confirm-power-mix">CONFIRM</button>
    </div>
  `,
  };
  document.querySelectorAll("[data-thread-panel]").forEach((panel) => {
    panel.innerHTML = panels[panel.dataset.threadPanel];
    if (panel.dataset.optionsReturn) {
      panel.querySelectorAll('[data-go="home"]').forEach((button) => {
        button.dataset.go = panel.dataset.optionsReturn;
      });
    }
  });
  document.querySelectorAll("[data-thread-brand]").forEach((header) => {
    header.innerHTML = `
      <a class="thread-menu-brand thread-home-link" href="update-2-preview.html" aria-label="THREAD — title card">THREAD</a>
      <a class="thread-menu-logo thread-home-link" href="update-2-preview.html" aria-label="THREAD — title card"><img src="assets/thread-icon.png" alt="" width="160" height="160"></a>
    `;
  });
})();
