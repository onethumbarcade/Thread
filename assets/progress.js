// Local milestones belong to the player; daily courses and rankings stay separate.
(() => {
  const key = 'thread-progress-v1';
  const badges = [
    { id: 'first-thread', name: 'First Thread', icon: 'thread', description: 'Finish your first daily run.', target: 1, metric: 'tracks', unit: 'daily run' },
    { id: 'week-of-thread', name: 'Week of Thread', icon: 'streak', description: 'Play the daily track seven days in a row.', target: 7, metric: 'longest', unit: 'days in a row' },
    { id: 'fruit-collector', name: 'Fruit Collector', icon: 'fruit', description: 'Collect 100 fruits across completed runs.', target: 100, metric: 'fruits', unit: 'fruits' },
    { id: 'level-five', name: 'Level Five', icon: 'level', description: 'Reach Level 5 on a daily track.', target: 5, metric: 'level', unit: 'levels' },
    { id: 'archive-explorer', name: 'Archive Explorer', icon: 'archive', description: 'Finish runs on 10 different daily tracks.', target: 10, metric: 'tracks', unit: 'daily tracks' },
  ];
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const days = value => [...new Set(Array.isArray(value) ? value.filter(n => Number.isSafeInteger(n) && n > 0) : [])].sort((a, b) => a - b);
  function streak(played, today) {
    let length = 0, longest = 0, previous = 0;
    for (const day of played.filter(day => day <= today)) {
      length = day === previous + 1 ? length + 1 : 1;
      longest = Math.max(longest, length); previous = day;
    }
    return { current: previous >= today - 1 ? length : 0, longest, playedToday: previous === today };
  }
  function normalize(value = {}) {
    return { version: 1, fruits: count(value?.fruits), maxDailyLevel: count(value?.maxDailyLevel),
      tracks: days(value?.tracks), streakDays: days(value?.streakDays),
      unlocked: Object.fromEntries(badges.filter(b => typeof value?.unlocked?.[b.id] === 'string').map(b => [b.id, value.unlocked[b.id]])),
      recentRuns: Array.isArray(value?.recentRuns) ? value.recentRuns.filter(id => typeof id === 'string').slice(-200) : [] };
  }
  function create({ storage, daily = ThreadDaily, now = () => Date.now() } = {}) {
    let cache, lastRaw, dirty = false;
    const getStorage = () => storage || globalThis.localStorage;
    const metrics = state => ({ tracks: state.tracks.length, fruits: state.fruits, level: state.maxDailyLevel, longest: streak(state.streakDays, daily.today(now())).longest });
    function unlock(state) {
      const totals = metrics(state), earned = [];
      for (const badge of badges) if (!state.unlocked[badge.id] && totals[badge.metric] >= badge.target) {
        state.unlocked[badge.id] = new Date(now()).toISOString();
        earned.push({ id: badge.id, type: 'achievement', title: badge.name, detail: badge.description, icon: badge.icon });
      }
      return earned;
    }
    function persist(state) {
      cache = state;
      try { const raw = JSON.stringify(state); getStorage().setItem(key, raw); lastRaw = raw; dirty = false; }
      catch { dirty = true; }
    }
    function migrate() {
      const state = normalize();
      // Old best scores prove a finished run, but not the day it was played or fruit collected.
      for (let track = 1; track <= daily.today(now()); track++) {
        let score;
        try { score = Number(getStorage().getItem(`thread-daily-${track}`)); } catch { break; }
        if (Number.isFinite(score) && score > 0) {
          state.tracks.push(track);
          const threshold = daily.getTrack(track).levelScore || 20000;
          state.maxDailyLevel = Math.max(state.maxDailyLevel, Math.floor(score / threshold) + 1);
        }
      }
      unlock(state); return state;
    }
    function read() {
      if (cache && dirty) return cache;
      let raw;
      try { raw = getStorage().getItem(key); } catch { dirty = true; return cache ||= migrate(); }
      if (cache && raw === lastRaw) return cache;
      if (raw) {
        try { cache = normalize(JSON.parse(raw)); lastRaw = raw; return cache; } catch {}
      }
      persist(migrate()); return cache;
    }
    function snapshot() {
      const state = read(), totals = metrics(state), current = streak(state.streakDays, daily.today(now()));
      return { streak: current, fruits: state.fruits, completedTracks: state.tracks.length, saved: !dirty,
        achievements: badges.map(badge => ({ ...badge, value: Math.min(badge.target, totals[badge.metric]), unlocked: !!state.unlocked[badge.id], unlockedAt: state.unlocked[badge.id] || null })) };
    }
    function startRun(mode, track) {
      read();
      return { id: globalThis.crypto?.randomUUID?.() || `${now()}-${Math.random().toString(36).slice(2)}`,
        mode, track: mode === 'daily' ? Number(track) : null, startDay: daily.today(now()) };
    }
    function finishRun(run, summary) {
      const state = read(), today = daily.today(now());
      if (!run || typeof run.id !== 'string' || !['daily', 'generated'].includes(run.mode) ||
          !Number.isSafeInteger(run.startDay) || run.startDay < 1 || run.startDay > today ||
          !Number.isFinite(summary?.score) || summary.score < 0 ||
          (run.mode === 'daily' && (!Number.isSafeInteger(run.track) || run.track < 1 || run.track > today)) || state.recentRuns.includes(run.id)) {
        return { events: [], recorded: false, ...snapshot() };
      }
      state.fruits = Math.min(Number.MAX_SAFE_INTEGER, state.fruits + count(summary.fruits));
      let streakMilestone = 0;
      if (run.mode === 'daily') {
        state.tracks = days([...state.tracks, run.track]);
        state.maxDailyLevel = Math.max(state.maxDailyLevel, Math.floor(summary.score / (daily.getTrack(run.track).levelScore || 20000)) + 1);
        if (run.track === run.startDay && !state.streakDays.includes(run.startDay)) {
          state.streakDays = days([...state.streakDays, run.startDay]);
          // A run begun before midnight belongs to that day's streak, even if it ends after midnight.
          const length = streak(state.streakDays, run.startDay).current;
          if ([3, 7, 14, 30, 100, 365].includes(length)) streakMilestone = length;
        }
      }
      state.recentRuns = [...state.recentRuns, run.id].slice(-200);
      const events = unlock(state);
      if (streakMilestone && !(streakMilestone === 7 && events.some(event => event.id === 'week-of-thread'))) {
        events.push({ id: `streak-${run.startDay}-${streakMilestone}`, type: 'streak', title: `${streakMilestone}-day streak!`, detail: 'A daily thread, day after day.', icon: 'streak' });
      }
      persist(state);
      return { events, recorded: true, ...snapshot() };
    }
    return { snapshot, startRun, finishRun };
  }
  globalThis.ThreadProgress = { ...create(), create };
})();
