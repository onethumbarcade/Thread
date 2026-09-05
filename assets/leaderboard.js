// The browser stores only its guest credential and retry queue. Rankings live on the server.
(() => {
  const API = 'https://thread-leaderboard.doug-michael-bond.chatgpt.site/api/leaderboard';
  const TOKEN_KEY = 'thread-player-token', QUEUE_KEY = 'thread-ranked-pending';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  let token = read(TOKEN_KEY, '');
  if (!/^[a-f0-9]{64}$/.test(token)) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    write(TOKEN_KEY, token);
  }
  // Only server responses populate the shared best-score view. Device records
  // remain separate, including runs from before global rankings existed.
  const rankedBests = new Map(), listeners = new Set();
  const notify = () => listeners.forEach(listener => listener());
  const rememberBest = (track, score) => rankedBests.set(track, Math.max(rankedBests.get(track) || 0, score));
  function acceptBoard(data) {
    if (data.board !== 'daily' || !Number.isSafeInteger(data.track)) return;
    rememberBest(data.track, data.yours?.score || 0);
    notify();
  }
  async function request(body, query = '') {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
    try {
      const send = globalThis.ThreadNative?.isNative ? ThreadNative.request : fetch;
      const response = await send(API + query, {
        method: body ? 'POST' : 'GET', credentials: 'omit', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let data;
      try { data = await response.json(); } catch { throw new Error('Rankings are temporarily unavailable. Please try again.'); }
      if (!response.ok) { const error = new Error(data.error || 'Rankings are temporarily unavailable.'); error.status = response.status; throw error; }
      return data;
    } catch (error) {
      if (!error.status) error.message = 'Unable to connect. Please try again.';
      throw error;
    } finally { clearTimeout(timer); }
  }
  const pending = () => read(QUEUE_KEY, []).filter(item => item?.body?.action === 'finish' && Date.now() - item.created < 86400000);
  const removePending = id => write(QUEUE_KEY, pending().filter(item => item.body.runId !== id));
  async function sendResult(body) {
    try { const data = await request(body); removePending(body.runId); acceptBoard(data); return data; }
    catch (error) { if (error.status && error.status < 500 && error.status !== 429) removePending(body.runId); throw error; }
  }
  let flushing;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      for (const item of pending()) {
        try { await sendResult(item.body); } catch (error) { if (!error.status || error.status >= 500 || error.status === 429) break; }
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }
  function startRun(track) {
    // Resolve failure into the session so the render loop never sees a rejected promise.
    const rulesVersion = globalThis.ThreadDaily?.getTrack(track).version || 1;
    const session = { track, ready: request({ action: 'start', track, rulesVersion }).catch(error => ({ error })) };
    return session;
  }
  async function finishRun(session, result) {
    if (!session) return { unranked: true };
    const started = await session.ready;
    if (started.error) throw new Error(started.error.status
      ? started.error.message
      : 'Played offline — this run could not join the global leaderboard. Your personal best is saved.');
    const body = { action: 'finish', runId: started.runId, ...result };
    const queue = pending().filter(item => item.body.runId !== body.runId);
    write(QUEUE_KEY, [...queue, { created: Date.now(), body }].slice(-30));
    try { return await sendResult(body); }
    catch (error) {
      if (!error.status || error.status >= 500 || error.status === 429) error.message = 'Score waiting to upload. It will retry when you reconnect or open the leaderboard.';
      throw error;
    }
  }
  async function board(mode, track) {
    const data = await request(null, '?board=' + encodeURIComponent(mode) + '&track=' + encodeURIComponent(track));
    acceptBoard(data); return data;
  }
  let bestRequest;
  async function loadBests(from, to) {
    const key = `${from}:${to}`;
    if (bestRequest?.key === key) return bestRequest.promise;
    const promise = request(null, `?board=personal&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(data => {
      if (!Array.isArray(data.bests) || data.from !== from || data.to !== to) throw new Error('Global scores are unavailable.');
      const results = new Map(data.bests.map(row => [row.track, row.score]));
      for (let track = from; track <= to; track++) rememberBest(track, results.get(track) || 0);
      notify(); return data;
    }).finally(() => { if (bestRequest?.promise === promise) bestRequest = null; });
    bestRequest = { key, promise }; return promise;
  }
  const bestFor = track => rankedBests.get(Number(track));
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  addEventListener('online', flush);
  globalThis.ThreadLeaderboard = { board, startRun, finishRun, flush, loadBests, bestFor, subscribe };
})();
