// Stable daily rules shared by the menu, archive, and game.
(() => {
  const shapeNames = ["SQUARE", "CIRCLE", "DIAMOND", "TRIANGLE"];
  const rotations = [
    [0, 1, 2, 3],
    [1, 0, 3, 2],
    [3],
    [2, 3, 0, 1],
    [1],
    [3, 2, 1, 0],
    [2],
    [0],
  ];
  const plurals = ["squares", "circles", "diamonds", "triangles"];
  // Tracks 1–2 have published scores. Never change their layout or settings.
  const randomizedFrom = 3;
  function randomFor(id, stream) {
    let state = 2166136261;
    for (const ch of `thread-daily-v2:${id}:${stream}`) state = Math.imul(state ^ ch.charCodeAt(0), 16777619);
    return () => {
      let value = state += 0x6d2b79f5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  function randomizedSettings(id) {
    const shapeRandom = randomFor(id, 'shapes'), rates = randomFor(id, 'items');
    const geometry = randomFor(id, 'geometry'), physics = randomFor(id, 'physics');
    const colorRandom = randomFor(id, 'colors');
    const integer = (random, count) => Math.floor(random() * count);
    // One quarter of days use a single shape throughout the entire run.
    const length = shapeRandom() < .25 ? 1 : 2 + integer(shapeRandom, 7);
    const shapes = [integer(shapeRandom, 4)];
    while (shapes.length < length) shapes.push(integer(shapeRandom, 4));
    const bonuses = Array.from({ length: 3 }, () => integer(rates, 4));
    const powers = Array.from({ length: 6 }, () => integer(rates, 4));
    const palette = [0, 1, 2, 3, 4];
    for (let i = palette.length - 1; i > 0; i--) {
      const j = integer(colorRandom, i + 1); [palette[i], palette[j]] = [palette[j], palette[i]];
    }
    return {
      version: 2, shapes,
      options: { shapes: shapes.join(''), bonuses: bonuses.join(''), powers: powers.join('') },
      courseSeed: `daily-v2-${id}`, musicSeed: `daily-v2-${id}`, palette,
      curveStrength: .72 + integer(geometry, 41) / 100,
      curveMemory: .12 + integer(geometry, 34) / 100,
      startSize: 30 + integer(physics, 11),
      // Stay within the ranked server's maximum travel envelope; speed remains uncapped.
      startSpeed: 48 + integer(physics, 7),
      accelerationDistance: 105 + integer(physics, 21),
      levelScore: [16000, 18000, 20000, 22000, 24000][integer(physics, 5)],
    };
  }

  function getTrack(number) {
    const parsed = Number(number);
    const id = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
    const settings = id >= randomizedFrom ? randomizedSettings(id) : {
      version: 1, shapes: rotations[(id - 1) % rotations.length].slice(),
      options: { powers: '222222', bonuses: '222', shapes: rotations[(id - 1) % rotations.length].join('') },
      courseSeed: `daily-${id}`, musicIndex: (id - 1) % 7,
    };
    const shapes = settings.shapes;
    const fixed = new Set(shapes).size === 1;
    return {
      id,
      ...settings,
      startingShape: shapes[0],
      startingShapeName: shapeNames[shapes[0]],
      description: fixed
        ? `All ${plurals[shapes[0]]}, every level. Same course for everyone.`
        : `${shapes.map(shape => shapeNames[shape].toLowerCase()).map(name => name[0].toUpperCase() + name.slice(1)).join(" → ")}. ${settings.version === 1 ? 'A new shape each level.' : 'Repeats across levels.'}`,
      archiveLabel: fixed ? `${shapeNames[shapes[0]]} ONLY` : `${shapeNames[shapes[0]]} START`,
    };
  }

  const timeZone = 'America/Los_Angeles';
  const calendar = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
  function today(now = Date.now()) {
    const parts = Object.fromEntries(calendar.formatToParts(new Date(Number(now))).map(part => [part.type, part.value]));
    // Count Pacific calendar dates, not elapsed 24-hour periods: DST days vary in length.
    const date = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
    return Math.max(1, (date - Date.UTC(2026, 8, 4)) / 86400000 + 1);
  }
  globalThis.ThreadDaily = { getTrack, today, timeZone, randomizedFrom };
})();
