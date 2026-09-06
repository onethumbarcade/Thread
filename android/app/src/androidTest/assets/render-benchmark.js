// Installed-WebView comparison only. This file is never bundled in the game.
window.threadOptimizedFrame = frame;
window.threadPerfResults = [];
window.threadSampleRenderer = function (label, render) {
  game = fresh(runSeed, 0, null);
  game.distance = 2200; game.powerUps.star = 60;
  game.energy = 100; game.running = true; started = true;
  gamePaused = false; appActive = true;
  settings.music = false; settings.sfx = false; settings.haptics = false;
  stopMusic(); stopMenuMusic();
  previous = performance.now();
  const began = previous, intervals = [], work = [];
  let last, done = false;
  frame = function (time) {
    if (done) { requestAnimationFrame(frame); return; }
    game.energy = 100;
    const distance = game.distance + game.speed * Math.min(.033, (time - previous) / 1000);
    game.ringOffset = Math.min(width * .4, 190) * Math.sin(angle(game.nodes, distance));
    const start = performance.now();
    render(time);
    const elapsed = performance.now() - start;
    if (last && time - began >= 2000) { intervals.push(time - last); work.push(elapsed); }
    last = time;
    if (time - began >= 8000) {
      const stats = values => {
        const sorted = values.slice().sort((a, b) => a - b);
        return { mean: values.reduce((a,b) => a+b,0)/values.length, p95: sorted[Math.floor(sorted.length*.95)] };
      };
      threadPerfResults.push({label,frames:intervals.length,frameMs:stats(intervals),workMs:stats(work),
        width,height,pixelRatio:devicePixelRatio,canvasWidth:canvas.width,canvasHeight:canvas.height});
      done = true;
    }
  };
};
