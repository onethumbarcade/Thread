(() => {
  const $ = id => document.getElementById(id), api = ThreadLeaderboard;
  let currentTrack = ThreadDaily.today(), revision = 0, activeView = 'home';
  const select = $('board-track-select'), status = $('board-status');
  function renderBests() {
    const best = api.bestFor(ThreadDaily.today());
    $('daily-best').textContent = best ? best.toLocaleString() : '—';
    document.querySelectorAll('[data-ranked-best]').forEach(element => {
      const score = api.bestFor(Number(element.dataset.rankedBest));
      element.textContent = score ? score.toLocaleString() : '—';
    });
  }
  function scoreStatus(message) {
    $('archive-score-status').textContent = message;
    $('today-score-status').textContent = message;
  }
  async function loadScores() {
    renderBests(); scoreStatus('Updating global scores…');
    try {
      await Promise.race([api.flush(), new Promise(resolve => setTimeout(resolve, 1200))]);
      const to = ThreadDaily.today();
      await api.loadBests(Math.max(1, to - 23), to);
      scoreStatus('');
    } catch { scoreStatus('Global scores unavailable. Reopen this screen to retry.'); }
  }
  api.subscribe(renderBests);
  function fillTracks(chosen = currentTrack) {
    const latest = ThreadDaily.today(), tracks = Array.from({length: Math.min(latest, 24)}, (_, i) => latest - i);
    if (!tracks.includes(chosen)) tracks.push(chosen);
    select.replaceChildren(...tracks.map(n => { const option = document.createElement('option'); option.value = n; option.textContent = `Track #${n}${n === latest ? ' · Today' : ''}`; return option; }));
    select.value = chosen;
  }
  function row(entry) {
    const el = document.createElement('div'); el.className = 'rank' + (entry.isYou ? ' you' : '');
    const rank = document.createElement('b'), name = document.createElement('span'), score = document.createElement('b');
    rank.textContent = entry.rank;
    name.textContent = entry.isYou ? 'YOU' : 'PLAYER ' + entry.tag;
    score.textContent = entry.score.toLocaleString(); el.append(rank, name, score); return el;
  }
  async function loadBoard() {
    const version = ++revision;
    status.textContent = 'Loading worldwide rankings…';
    $('board-entries').setAttribute('aria-busy', 'true');
    $('board-entries').replaceChildren(); $('board-yours').replaceChildren();
    try {
      await Promise.race([api.flush(), new Promise(resolve => setTimeout(resolve, 1200))]);
      const data = await api.board('daily', currentTrack);
      if (version !== revision) return;
      if (data.entries.length) $('board-entries').replaceChildren(...data.entries.map(row));
      else { const empty = document.createElement('p'); empty.className = 'board-empty'; empty.textContent = 'No scores yet. Play a daily track to set the first score.'; $('board-entries').appendChild(empty); }
      if (data.yours && !data.entries.some(entry => entry.isYou)) $('board-yours').appendChild(row(data.yours));
      else if (!data.yours) { const empty = document.createElement('p'); empty.className = 'board-empty'; empty.textContent = 'Your ranked score will appear here after you finish a daily track.'; $('board-yours').appendChild(empty); }
      $('board-yours').hidden = data.yours && data.entries.some(entry => entry.isYou);
      status.textContent = `Updated ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · Top 50 players`;
    } catch { if (version === revision) status.textContent = 'Rankings are unavailable right now. Tap Refresh to try again.'; }
    finally { if (version === revision) $('board-entries').setAttribute('aria-busy', 'false'); }
  }
  select.onchange = () => { currentTrack = Number(select.value); loadBoard(); };
  $('board-refresh').onclick = loadBoard;
  function open(view) {
    activeView = view;
    if (view === 'today' || view === 'archive') loadScores();
    if (view !== 'leaderboard') { revision++; return; }
    fillTracks(); loadBoard();
  }
  globalThis.ThreadLeaderboardMenu = { open };
  const params = new URLSearchParams(location.search), requested = Number(params.get('track'));
  if (params.get('view') === 'leaderboard') {
    if (Number.isSafeInteger(requested) && requested > 0 && requested <= ThreadDaily.today()) currentTrack = requested;
    show('leaderboard');
  }
  addEventListener('online', () => { if (activeView === 'leaderboard') loadBoard(); else loadScores(); });
  loadScores();
})();
