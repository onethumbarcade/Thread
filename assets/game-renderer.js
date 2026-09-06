// Cache decorative raster work; gameplay and hitboxes remain in the game loop.
(() => {
  function create(canvas, ctx) {
    let width, height, density, sky, waves, waveKey;
    const sprites = new Map(), period = Math.PI * 2 / .012;
    function surface(w, h) {
      const image = document.createElement('canvas');
      image.width = Math.ceil(w * density); image.height = Math.ceil(h * density);
      const drawing = image.getContext('2d');
      drawing.setTransform(density, 0, 0, density, 0, 0);
      return { image, drawing };
    }
    function resize(w, h, d) {
      width = w; height = h; density = d;
      sprites.clear(); waves = null; waveKey = null;
      sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#02040a'); sky.addColorStop(.58, '#070b17'); sky.addColorStop(1, '#010207');
    }
    function background(top, colors, time, reduced) {
      ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
      const key = top + ':' + colors.join(',');
      if (key !== waveKey) {
        const { image, drawing: c } = surface(width + period + 160, height);
        for (let b = 0; b < 3; b++) {
          c.globalAlpha = .055 + b * .018; c.strokeStyle = colors[b];
          c.lineWidth = 70 + b * 24; c.shadowColor = colors[b]; c.shadowBlur = 40;
          c.beginPath();
          for (let x = 0; x <= width + period + 160; x += 12) {
            const y = top + 80 + b * 170 + Math.sin((x - 80) * .012 + b * 1.7) * 55;
            x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
          }
          c.stroke();
        }
        waves = image; waveKey = key;
      }
      // Translate the cached sine waves at their original speed, without a full-screen blur per frame.
      const shift = reduced ? 0 : (time * .01) % period;
      ctx.drawImage(waves, (80 + shift) * density, 0, width * density, height * density, 0, 0, width, height);
    }
    function sprite(key, size, paint) {
      let image = sprites.get(key);
      if (!image) {
        const surfaceData = surface(size, size), c = surfaceData.drawing;
        c.translate(size / 2, size / 2); paint(c);
        image = surfaceData.image; sprites.set(key, image);
      }
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
    }
    function glowStroke(core, glow, lineWidth, spread, strength = 1, path) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = glow;
      // Soft concentric strokes avoid creating and blurring shadow masks.
      const opacity = [.12, .065, .03, .012];
      for (let layer = 4; layer >= 1; layer--) {
        ctx.globalAlpha = opacity[layer - 1] * strength;
        ctx.lineWidth = lineWidth + spread * layer / 2;
        if (path) ctx.stroke(path); else ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = core; ctx.lineWidth = lineWidth;
      if (path) ctx.stroke(path); else ctx.stroke();
      ctx.restore();
    }
    return { resize, background, sprite, glowStroke };
  }
  globalThis.ThreadRenderer = { create };
})();
