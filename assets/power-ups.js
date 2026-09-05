// Seeded pickup placement and temporary powers, independent of rendering/audio.
(() => {
  const durations = { star: 7, blaster: 12 };
  function pickup(y, kind, random) {
    return { y, kind, side: random() < .5 ? -1 : 1, offset: 92 + random() * 18, collected: false };
  }
  function create(random) {
    return {
      random, items: [pickup(440 + random() * 80, "star", random)],
      scanned: 0, nextKind: "blaster", star: 0, blaster: 0, cooldown: 0, shots: [],
    };
  }
  function extend(state, bonuses) {
    // Put powers before existing bombs; a blaster always has an approaching target.
    for (; state.scanned < bonuses.length; state.scanned++) {
      const bomb = bonuses[state.scanned];
      const y = bomb.y - 260;
      if (bomb.kind !== "bomb" || y < state.items.at(-1).y + 700) continue;
      state.items.push(pickup(y, state.nextKind, state.random));
      state.nextKind = state.nextKind === "blaster" ? "star" : "blaster";
    }
  }
  function position(item, trackX, centerX, range) {
    const offset = Math.min(item.offset, range);
    const x = trackX + item.side * offset;
    // Reflect toward the playable area at bends, preserving the off-track distance.
    return x < centerX - range || x > centerX + range ? trackX - item.side * offset : x;
  }
  function tick(state, dt) {
    state.star = Math.max(0, state.star - dt);
    state.blaster = Math.max(0, state.blaster - dt);
    state.cooldown = Math.max(0, state.cooldown - dt);
  }
  function collect(state, distance, tolerance, ringX, reach, getX) {
    const collected = [];
    for (const item of state.items) {
      if (item.resolved || Math.abs(item.y - distance) >= tolerance) continue;
      item.resolved = true;
      if (Math.abs(getX(item) - ringX) > reach + 10) continue;
      item.collected = true;
      state[item.kind] = durations[item.kind];
      if (item.kind === "blaster") state.cooldown = 0;
      collected.push(item);
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
  globalThis.ThreadPowerUps = { durations, create, extend, position, tick, collect, shoot };
})();
