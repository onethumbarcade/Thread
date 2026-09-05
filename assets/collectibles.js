// Independent seeded streams preserve the course when collectible rates change.
(() => {
  const distance = seconds => 5670 * Math.expm1(seconds / 105);
  const time = y => 105 * Math.log1p(y / 5670);
  const intervals = {
    orb: [null, [16, 24], [8, 12], [4, 6]],
    fruit: [null, [16, 24], [8, 12], [4, 6]],
    bomb: [null, [40, 60], [25, 40], [12, 18]],
  };
  function create(randomFor, mix = "222") {
    const rates = /^[0-3]{3}$/.test(mix) ? mix : "222";
    const streams = Object.keys(intervals).map((kind, i) => {
      const random = randomFor(kind), gap = intervals[kind][+rates[i]];
      return { kind, random, gap, nextY: gap ? distance(gap[0] / 2 + random() * (gap[1] - gap[0]) / 2) : Infinity };
    });
    return { streams, orbs: [], bonuses: [] };
  }
  function extend(state, until) {
    const previousBonuses = state.bonuses.length;
    for (const stream of state.streams) {
      const { kind, random, gap } = stream;
      while (stream.nextY < until) {
        const y = stream.nextY;
        stream.nextY = distance(time(y) + gap[0] + random() * (gap[1] - gap[0]));
        if (kind === "orb") state.orbs.push({ y, collected: false });
        else state.bonuses.push({ y, kind: kind === "bomb" ? "bomb" : ["cherry", "strawberry", "banana", "cake"][Math.floor(random() * 4)],
          side: random() < .5 ? -1 : 1, offset: kind === "bomb" ? 88 + random() * 22 : 62 + random() * 18, collected: false });
      }
    }
    if (state.bonuses.length !== previousBonuses) state.bonuses.sort((a, b) => a.y - b.y);
  }
  globalThis.ThreadCollectibles = { create, extend };
})();
