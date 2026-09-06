(() => {
  const api = ThreadLeaderboard, $ = id => document.getElementById(id), pageSize = 20;
  const list = $('archive-list'), status = $('archive-score-status');
  let active = false, sort = 'recent', page = 0, revision = 0, visible = [];
  function played(track) {
    if (api.hasPlayed(track) || api.bestFor(track) > 0) return true;
    try { return Number(localStorage.getItem('thread-daily-attempts-' + track)) > 0 || Number(localStorage.getItem('thread-daily-' + track)) > 0; }
    catch { return false; }
  }
  function tracks() {
    const all = Array.from({length: ThreadDaily.today()}, (_, index) => ThreadDaily.today() - index);
    return sort === 'unplayed' ? all.filter(track => !played(track)).concat(all.filter(played)) : all;
  }
  function renderRows() {
    list.replaceChildren(...visible.map(track => {
      const row = document.createElement('div'); row.className = 'row' + (track === ThreadDaily.today() ? ' today' : '');
      row.setAttribute('role', 'row'); row.dataset.track = track;
      const number = document.createElement('strong'), best = document.createElement('span'), rank = document.createElement('span'), action = document.createElement('div');
      for (const cell of [number, best, rank, action]) cell.setAttribute('role', 'cell');
      number.textContent = '#' + track;
      best.className = 'best'; best.textContent = api.bestFor(track) ? api.bestFor(track).toLocaleString() : '—';
      rank.className = 'global-rank'; rank.textContent = api.rankFor(track) ? '#' + api.rankFor(track).toLocaleString() : '—';
      const play = document.createElement('a'); play.className = 'archive-play'; play.href = `index.html?mode=daily&track=${track}`;
      play.textContent = played(track) ? 'REPLAY' : 'PLAY'; play.setAttribute('aria-label', `${played(track) ? 'Replay' : 'Play'} track ${track}`);
      action.appendChild(play); row.append(number, best, rank, action); return row;
    }));
  }
  function renderPage() {
    const ordered = tracks(), count = Math.max(1, Math.ceil(ordered.length / pageSize));
    page = Math.min(page, count - 1); visible = ordered.slice(page * pageSize, (page + 1) * pageSize);
    renderRows();
    $('archive-page').textContent = `Page ${page + 1} of ${count}`;
    $('archive-prev').disabled = page === 0; $('archive-next').disabled = page === count - 1;
    for (const [id, mode] of [['archive-recent', 'recent'], ['archive-unplayed', 'unplayed']]) {
      $(id).classList.toggle('on', sort === mode); $(id).setAttribute('aria-pressed', String(sort === mode));
    }
  }
  async function open() {
    const version = ++revision;
    renderPage(); status.textContent = 'Updating global ranks…'; list.setAttribute('aria-busy', 'true');
    let historyAvailable = true;
    try {
      await Promise.race([api.flush(), new Promise(resolve => setTimeout(resolve, 1200))]);
      try { await api.loadPlayed(); } catch { historyAvailable = false; }
      if (version !== revision || !active) return;
      renderPage();
      await api.loadBestsFor(visible);
      if (version !== revision || !active) return;
      renderRows();
      status.textContent = historyAvailable ? '' : 'Played history unavailable. Showing tracks played on this device.';
    } catch {
      if (version === revision && active) status.textContent = 'Global ranks unavailable. Reopen this screen to retry.';
    } finally { if (version === revision) list.setAttribute('aria-busy', 'false'); }
  }
  function choose(mode) { sort = mode; page = 0; open(); }
  $('archive-recent').onclick = () => choose('recent');
  $('archive-unplayed').onclick = () => choose('unplayed');
  function turnPage(direction) {
    if (direction < 0 ? $('archive-prev').disabled : $('archive-next').disabled) return;
    page += direction; open(); $('archive').scrollIntoView({block:'start'});
  }
  $('archive-prev').onclick = () => turnPage(-1);
  $('archive-next').onclick = () => turnPage(1);
  api.subscribe(() => { if (active) renderRows(); });
  globalThis.ThreadTrackArchive = { open, setActive(value) {
    active = value;
    if (active) open(); else { revision++; list.setAttribute('aria-busy', 'false'); }
  } };
})();
