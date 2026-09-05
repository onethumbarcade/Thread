// Seeded pickup placement and temporary powers, independent of rendering/audio.
(() => {
  const kinds = ["star", "blaster", "magnet", "slow", "double", "energy"];
  const durations = { star: 7, blaster: 12, magnet: 10, slow: 6, double: 10 };
  const defaultMix = "222222";
  // Base course speed is 54 + distance / 105. Space pickups by travel time so
  // later, faster levels don't turn rare rewards into a constant stream.
  const courseTime = y => 105 * Math.log1p(y / 5670);
  const courseDistance = seconds => 5670 * Math.expm1(seconds / 105);
  // One shared, bounded cadence prevents enabling more kinds from flooding the
  // course. The highest setting determines spacing; rates weight the selection.
  // Seconds refer to normal course travel, so slow motion stretches the gaps.
  const cadence = [null,
    { first: [24, 32], gap: [40, 60] },
    { first: [16, 22], gap: [25, 40] },
    { first: [12, 16], gap: [12, 18] },
  ];
  function normalizeMix(value) { return /^[0-3]{6}$/.test(String(value)) ? String(value) : defaultMix; }
  function readMix() { if (globalThis.ThreadTrackOptions) return ThreadTrackOptions.read().powers; try { return normalizeMix(localStorage.getItem("thread-power-mix")); } catch { return defaultMix; } }
  function saveMix(value) { if (globalThis.ThreadTrackOptions) return ThreadTrackOptions.save({ ...ThreadTrackOptions.read(), powers: normalizeMix(value) }); try { localStorage.setItem("thread-power-mix", normalizeMix(value)); return true; } catch { return false; } }
  function pickup(y, kind, random) {
    return { y, kind, side: random() < .5 ? -1 : 1, offset: 92 + random() * 18, collected: false };
  }
  function create(random, mix = defaultMix) {
    const rates = Object.fromEntries(kinds.map((kind, i) => [kind, Number(normalizeMix(mix)[i])]));
    const timing = cadence[Math.max(...Object.values(rates))];
    const between = range => range[0] + random() * (range[1] - range[0]);
    return {
      random, rates, timing, between, items: [], nextY: timing ? courseDistance(between(timing.first)) : Infinity,
      star: 0, blaster: 0, magnet: 0, slow: 0, double: 0, cooldown: 0, shots: [],
    };
  }
  function extend(state, horizon) {
    if (!state.timing) return;
    const candidates = kinds.filter(kind => state.rates[kind] > 0);
    const total = candidates.reduce((sum, kind) => sum + state.rates[kind], 0);
    // Extend in course order, independent of viewport and generation batch size.
    const until = typeof horizon === "number" ? horizon : (horizon.at(-1)?.y || 0) - 260;
    while (state.nextY < until) {
      const y = state.nextY;
      state.nextY = courseDistance(courseTime(y) + state.between(state.timing.gap));
      let roll = state.random() * total, kind = candidates.at(-1);
      for (const candidate of candidates) {
        roll -= state.rates[candidate];
        if (roll < 0) { kind = candidate; break; }
      }
      state.items.push(pickup(y, kind, state.random));
    }
  }
  function position(item, trackX, centerX, range) {
    const offset = Math.min(item.offset, range);
    const x = trackX + item.side * offset;
    // Reflect toward the playable area at bends, preserving the off-track distance.
    return x < centerX - range || x > centerX + range ? trackX - item.side * offset : x;
  }
  function tick(state, dt) {
    for (const kind of Object.keys(durations)) state[kind] = Math.max(0, state[kind] - dt);
    state.cooldown = Math.max(0, state.cooldown - dt);
  }
  function collect(state, distance, tolerance, ringX, reach, getX) {
    const collected = [];
    for (const item of state.items) {
      if (item.resolved || Math.abs(item.y - distance) >= tolerance) continue;
      item.resolved = true;
      if (Math.abs(getX(item) - ringX) > reach + 10) continue;
      item.collected = true;
      if (durations[item.kind]) state[item.kind] = durations[item.kind];
      if (item.kind === "blaster") state.cooldown = 0;
      collected.push(item);
    }
    return collected;
  }
  function attract(state, items, { dt, distance, ringX, ringY, getX }) {
    const collected = [];
    for (const item of items) {
      if (item.resolved || item.collected || item.kind === "bomb") continue;
      const x = getX(item), y = ringY - (item.y - distance);
      if (item.magnetX == null) {
        if (state.magnet <= 0 || item.y < distance || item.y - distance > 160 || Math.abs(x - ringX) > 170) continue;
        item.magnetX = x;
        item.magnetY = y;
      }
      const pull = 1 - Math.exp(-12 * dt);
      item.magnetX += (ringX - item.magnetX) * pull;
      item.magnetY += (ringY - item.magnetY) * pull;
      if (Math.hypot(item.magnetX - ringX, item.magnetY - ringY) < 16) {
        item.collected = item.resolved = true;
        collected.push(item);
      }
    }
    return collected;
  }
  function shoot(state, { dt, bonuses, distance, ringX, ringY, range, getX }) {
    const events = [];
    if (state.blaster > 0 && state.cooldown <= 0) {
      const targeted = new Set(state.shots.map(shot => shot.target));
      const target = bonuses.find(bomb => bomb.kind === "bomb" && !bomb.resolved && !bomb.collected &&
        bomb.y > distance && bomb.y - distance <= range && !targeted.has(bomb));
      if (target) {
        state.shots.push({ x: ringX, y: ringY - 12, dx: 0, dy: -1, target });
        state.cooldown = .28;
        events.push({ kind: "shot" });
      }
    }
    state.shots = state.shots.filter(shot => {
      if (shot.target.resolved || shot.target.collected) return false;
      const x = getX(shot.target), y = ringY - (shot.target.y - distance);
      const dx = x - shot.x, dy = y - shot.y, length = Math.hypot(dx, dy);
      if (length <= 720 * dt + 14) {
        shot.target.collected = shot.target.resolved = shot.target.blasted = true;
        events.push({ kind: "hit", x, y });
        return false;
      }
      shot.dx = dx / length;
      shot.dy = dy / length;
      shot.x += shot.dx * 720 * dt;
      shot.y += shot.dy * 720 * dt;
      return true;
    });
    return events;
  }
  globalThis.ThreadPowerUps = { kinds, durations, defaultMix, normalizeMix, readMix, saveMix, create, extend, position, tick, collect, attract, shoot };
})();
