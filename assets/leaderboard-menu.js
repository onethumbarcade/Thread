(() => {
  const $ = id => document.getElementById(id), api = ThreadLeaderboard;
  let mode = 'daily', currentTrack = ThreadDaily.today(), revision = 0, profileLoaded = false;
  const select = $('board-track-select'), status = $('board-status');
  function fillTracks(chosen = currentTrack) {
    const latest = ThreadDaily.today(), tracks = Array.from({length: Math.min(latest, 24)}, (_, i) => latest - i);
    if (!tracks.includes(chosen)) tracks.push(chosen);
    select.replaceChildren(...tracks.map(n => { const option = document.createElement('option'); option.value = n; option.textContent = `Track #${n}${n === latest ? ' · Today' : ''}`; return option; }));
    select.value = chosen;
  }
  function row(entry) {
    const el = document.createElement('div'); el.className = 'rank' + (entry.isYou ? ' you' : '');
    const rank = document.createElement('b'), name = document.createElement('span'), score = document.createElement('b'), tag = document.createElement('small');
    rank.textContent = entry.rank; name.textContent = entry.name + (entry.isYou ? ' · YOU' : '');
    tag.textContent = '#' + entry.tag + (mode === 'alltime' ? ` · Track #${entry.track}` : '');
    name.appendChild(tag); score.textContent = entry.score.toLocaleString(); el.append(rank, name, score); return el;
  }
  async function loadBoard() {
    const version = ++revision;
    status.textContent = 'Loading worldwide rankings…';
    $('board-entries').setAttribute('aria-busy', 'true');
    $('board-entries').replaceChildren(); $('board-yours').replaceChildren();
    $('board-id').textContent = mode === 'daily' ? `TRACK #${currentTrack}` : 'WORLDWIDE';
    $('board-track-control').hidden = mode !== 'daily';
    $('board-rules').textContent = mode === 'daily' ? 'Best score per player. Archive replays count. New daily track at midnight UTC.' : 'Each player’s highest score across all daily tracks. Custom tracks are unranked.';
    document.querySelectorAll('[data-board]').forEach(button => { const on = button.dataset.board === mode; button.classList.toggle('on', on); button.setAttribute('aria-pressed', on); });
    try {
      await Promise.race([api.flush(), new Promise(resolve => setTimeout(resolve, 1200))]);
      const data = await api.board(mode, currentTrack);
      if (version !== revision) return;
      if (data.entries.length) $('board-entries').replaceChildren(...data.entries.map(row));
      else { const empty = document.createElement('p'); empty.className = 'board-empty'; empty.textContent = 'No scores yet. Play a daily track to set the first score.'; $('board-entries').appendChild(empty); }
      if (data.yours) $('board-yours').appendChild(row(data.yours));
      else { const empty = document.createElement('p'); empty.className = 'board-empty'; empty.textContent = 'Your ranked score will appear here after you finish a daily track.'; $('board-yours').appendChild(empty); }
      status.textContent = `Updated ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · Top 50 players`;
    } catch { if (version === revision) status.textContent = 'Rankings are unavailable right now. Tap Refresh to try again.'; }
    finally { if (version === revision) $('board-entries').setAttribute('aria-busy', 'false'); }
  }
  async function loadProfile() {
    if (profileLoaded) return;
    try { const player = await api.profile(); $('player-name').value = player.name; $('player-tag').textContent = `Player #${player.tag} · Saved in this browser. Clearing browser data creates a new player.`; profileLoaded = true; }
    catch { $('player-tag').textContent = 'Connect to load your player name.'; }
  }
  $('player-name-form').onsubmit = async event => {
    event.preventDefault(); const button = $('save-player-name'); button.disabled = true;
    try { const player = await api.profile($('player-name').value); $('player-name').value = player.name; $('player-name-status').textContent = 'Player name saved.'; await loadBoard(); }
    catch (error) { $('player-name-status').textContent = error.message; }
    finally { button.disabled = false; }
  };
  document.querySelectorAll('[data-board]').forEach(button => button.onclick = () => { mode = button.dataset.board; loadBoard(); });
  select.onchange = () => { currentTrack = Number(select.value); loadBoard(); };
  $('board-refresh').onclick = () => { loadProfile(); loadBoard(); };
  function open(view) {
    if (view !== 'leaderboard') { revision++; return; }
    fillTracks(); loadProfile(); loadBoard();
  }
  globalThis.ThreadLeaderboardMenu = { open };
  const params = new URLSearchParams(location.search), requested = Number(params.get('track'));
  if (params.get('view') === 'leaderboard') {
    if (Number.isSafeInteger(requested) && requested > 0 && requested <= ThreadDaily.today()) currentTrack = requested;
    show('leaderboard');
  }
  api.flush();
})();
