(() => {
  const paths = {
    thread: '<circle cx="16" cy="16" r="9"/><path d="M16 2c-12 8 12 20 0 28"/>',
    streak: '<path d="M18 3c1 7-5 8-2 13 2-1 4-4 4-6 7 8 6 18-4 19C5 28 3 18 9 12c0 5 3 6 4 6-3-7 4-9 5-15Z"/>',
    level: '<path d="m4 23 12-9 12 9M4 14l12-9 12 9"/><path d="M16 19v10"/>',
    archive: '<rect x="5" y="7" width="22" height="22" rx="3"/><path d="M10 3v8m12-8v8M5 15h22m-15 7 3 3 6-6"/>',
  };
  function icon(kind) {
    if (kind === 'fruit') return '<i aria-hidden="true">🍍</i>';
    return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || paths.thread}</svg>`;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag); node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function streakText(value) { return `${value} ${value === 1 ? 'DAY' : 'DAYS'}`; }
  function refresh() {
    const state = ThreadProgress.snapshot(), earned = state.achievements.filter(b => b.unlocked).length;
    const entry = document.querySelector('#achievement-count');
    if (entry) entry.textContent = `${earned} / ${state.achievements.length}`;
    const today = document.querySelector('#daily-streak');
    if (today) {
      today.innerHTML = icon('streak');
      today.append(element('b', '', state.streak.current ? `${state.streak.current}-DAY STREAK` : 'START YOUR STREAK'));
      today.append(element('small', '', state.streak.playedToday ? 'Today complete ✓' : 'Finish today’s daily run'));
    }
    const grid = document.querySelector('#achievement-list');
    if (!grid) return;
    const stats = document.querySelector('#progress-stats');
    stats.replaceChildren(...[
      ['CURRENT STREAK', streakText(state.streak.current)], ['BEST STREAK', streakText(state.streak.longest)], ['UNLOCKED', `${earned} / ${state.achievements.length}`],
    ].map(([label, value]) => { const cell = element('div', 'progress-stat'); cell.append(element('small', '', label), element('b', '', value)); return cell; }));
    document.querySelector('#streak-note').textContent = state.streak.playedToday
      ? 'Today is complete. Come back tomorrow to keep your streak going.'
      : state.streak.current ? 'Finish a run on Today’s Track to keep your streak going.' : 'Start a streak by finishing a run on Today’s Track.';
    const notice = document.querySelector('#progress-save-status');
    notice.textContent = state.saved ? '' : 'Progress could not be saved on this device. Keep this page open and allow storage to save future progress.';
    grid.replaceChildren(...state.achievements.map(badge => {
      const card = element('article', `achievement${badge.unlocked ? ' unlocked' : ''}`);
      const mark = element('div', 'achievement-icon'); mark.innerHTML = icon(badge.icon);
      const body = element('div', 'achievement-body');
      const head = element('div', 'achievement-heading');
      head.append(element('h3', '', badge.name), element('small', 'achievement-state', badge.unlocked ? 'UNLOCKED' : 'LOCKED'));
      const progress = element('progress', 'achievement-progress');
      progress.max = badge.target; progress.value = badge.value;
      progress.setAttribute('aria-label', `${badge.name}: ${badge.value} of ${badge.target} ${badge.unit}`);
      body.append(head, element('p', '', badge.description), progress, element('small', 'achievement-count', `${badge.value.toLocaleString()} / ${badge.target.toLocaleString()} ${badge.unit}`));
      card.append(mark, body); return card;
    }));
  }
  function renderResult(report, { animate = false } = {}) {
    const box = document.querySelector('#result-milestones'), status = document.querySelector('#result-progress-status');
    if (!box) return;
    const state = ThreadProgress.snapshot(), events = Array.isArray(report?.events) ? report.events : [];
    status.textContent = state.saved
      ? state.streak.current ? `${state.streak.current}-day streak${state.streak.playedToday ? ' · Today complete' : ''}` : ''
      : 'Progress could not be saved on this device.';
    box.hidden = events.length === 0;
    box.classList.toggle('celebrate', animate && events.length > 0);
    box.replaceChildren();
    if (!events.length) return;
    box.append(element('div', 'milestone-kicker', events.some(event => event.type === 'achievement') ? 'ACHIEVEMENT UNLOCKED' : 'STREAK MILESTONE'));
    for (const event of events) {
      const row = element('div', 'milestone-row'), mark = element('div', 'milestone-icon'); mark.innerHTML = icon(event.icon);
      const body = element('div', 'milestone-copy'); body.append(element('strong', '', event.title), element('small', '', event.detail));
      row.append(mark, body); box.append(row);
    }
  }
  globalThis.ThreadProgressUI = { refresh, renderResult };
})();
