// Renderer from app 0.1.2, for installed-WebView comparison only. Never bundled in the game.
      function frame(time) {
        const dt = Math.max(0, Math.min(0.033, (time - previous) / 1000));
        previous = time;
        const g = game || fresh(),
          cx = width / 2,
          top = hudHeight,
          bottom = height - 150,
          ringY = Math.min(height * 0.6, height - 225),
          cr = Math.min(width * 0.4, 190),
          stage = Math.floor(g.score / runOptions.levelScore) + 1,
          s = g.shapeSequence ? g.shapeSequence[(stage - 1) % g.shapeSequence.length] : (stage - 1 + (g.shapeOffset || 0)) % 4,
          z = Math.max(0.74, 1 - (stage - 1) * 0.024),
          sw = [1, 0.92, 0.68, TRIANGLE_REACH][s] * z,
          laser = LASERS[dailyTrack?.palette?.[(stage - 1) % 5] ?? (stage - 1) % 5];
        if (hudLaser !== laser[0]) {
          hudLaser = laser[0];
          hud.style.setProperty("--laser", laser[0]);
          hud.style.setProperty("--laser-soft", laser[0] + "24");
          hud.style.setProperty("--laser-glow", laser[0] + "66");
        }
        if (started && g.running && !gamePaused && appActive) {
          g.elapsed = (g.elapsed || 0) + dt;
          extend(g.nodes, g.distance + height * 2, g.random);
          if (g.collectibles) ThreadCollectibles.extend(g.collectibles, g.distance + height * 2);
          else {
            while (g.pickups.at(-1).y < g.distance + height * 2)
              g.pickups.push({
                y: g.pickups.at(-1).y + 520 + g.pickupRandom() * 220,
                collected: false,
              });
            while (g.bonuses.at(-1).y < g.distance + height * 2)
              g.bonuses.push(
                bonus(g.bonuses.at(-1).y + 300 + g.bonusRandom() * 190, g.bonusRandom),
              );
          }
          ThreadPowerUps.extend(g.powerUps, g.distance + height * 2);
          ThreadPowerUps.tick(g.powerUps, dt);
          const pace = g.powerUps.slow > 0 ? .6 : 1, playDt = dt * pace,
            baseSpeed = (dailyTrack?.startSpeed || 54) + g.distance / (dailyTrack?.accelerationDistance || 105);
          g.speed = baseSpeed * pace;
          g.distance += g.speed * dt;
          const px = cx + cr * Math.sin(angle(g.nodes, g.distance)),
            rx = cx + g.ringOffset,
            off = Math.abs(px - rx),
            reach = g.ringRadius * sw,
            safe = off <= reach - 6;
          for (const item of ThreadPowerUps.collect(g.powerUps, g.distance, g.speed * dt + 3, rx, reach,
            item => ThreadPowerUps.position(item, cx + cr * Math.sin(angle(g.nodes, item.y)), cx, cr))) {
            sound("power");
            buzz([18, 25, 18]);
            const labels = { star: "INVINCIBLE!", blaster: "BLASTER READY!", magnet: "MAGNET ON!", slow: "SLOW MOTION!", double: "DOUBLE POINTS!", energy: "FULL HEALTH!" };
            if (item.kind === "energy") {
              g.energy = 100;
            }
            effect(g, rx, ringY - 45, labels[item.kind], "#baffdf");
          }
          for (const event of ThreadPowerUps.shoot(g.powerUps, {
            dt, bonuses: g.bonuses, distance: g.distance, ringX: rx, ringY,
            range: Math.max(80, Math.min(380, ringY - top - 20)), getX: o => itemX(o, cx, cr, g),
          })) {
            sound(event.kind === "shot" ? "shot" : "blast");
            if (event.kind === "hit") effect(g, event.x, event.y, "ZAP!", "#72f6ff");
          }
          const invincible = g.powerUps.star > 0;
          for (const item of ThreadPowerUps.attract(g.powerUps, [...g.pickups, ...g.bonuses], {
            dt, distance: g.distance, ringX: rx, ringY,
            getX: item => item.kind ? itemX(item, cx, cr, g) : cx + cr * Math.sin(angle(g.nodes, item.y)),
          })) collectReward(g, item.kind || "orb", rx, ringY);
          if (safe) {
            g.energy = Math.min(100, g.energy + 13 * playDt);
            g.score +=
              (22 + (1 - off / Math.max(1, g.ringRadius)) * 30) *
              dt *
              (g.speed / 54) * (g.powerUps.double > 0 ? 2 : 1);
          } else if (!invincible) g.energy -= Math.min(80, 30 + g.distance / 240) * playDt;
          if (!invincible) g.ringRadius = Math.max(
            24,
            g.ringRadius - (0.9 + (baseSpeed / 54 - 1) * 0.58) * playDt,
          );
          for (const p of g.pickups)
            if (!p.resolved && p.magnetX == null && Math.abs(p.y - g.distance) < g.speed * dt + 3) {
              p.resolved = true;
              const orbX = cx + cr * Math.sin(angle(g.nodes, p.y));
              // Orbs collect on contact, independently of laser-centering safety
              // and Star's decorative glow. Use the current, possibly grown size.
              if (Math.abs(orbX - rx) <= g.ringRadius * sw + GROWTH_ORB_RADIUS) {
                p.collected = true;
                collectReward(g, "orb", orbX, ringY);
              }
            }
          for (const o of g.bonuses)
            if (!o.resolved && o.magnetX == null && Math.abs(o.y - g.distance) < g.speed * dt + 3) {
              o.resolved = true;
              const ix = itemX(o, cx, cr, g);
              if (Math.abs(ix - rx) <= reach + 14) {
                o.collected = true;
                if (o.kind === "bomb") {
                  if (invincible) {
                    sound("blast");
                    effect(g, ix, ringY, "BLOCKED", "#ffe66e");
                    continue;
                  }
                  g.energy -= 35;
                  g.ringRadius = Math.max(24, g.ringRadius - 8);
                  g.bombFlash = 1;
                  sound("bomb");
                  buzz([60, 30, 80]);
                  effect(g, ix, ringY, "BOOM", "#ff456b");
                } else {
                  collectReward(g, o.kind, ix, ringY);
                }
              }
            }
          const ns = Math.floor(g.score / runOptions.levelScore) + 1;
          if (ns > g.stage) {
            g.stage = ns;
            sound("level");
            buzz([20, 35, 20]);
            g.flash = 1.5;
            effect(g, cx, ringY - 70, "LEVEL " + ns, laser[0]);
          }
          if (g.energy <= 0) {
            g.energy = 0;
            g.running = false;
            for (const kind of Object.keys(ThreadPowerUps.durations)) g.powerUps[kind] = 0;
            g.powerUps.shots = [];
            stopMusic();
            startMenuMusic();
            const runScore = Math.floor(g.score),
              isBest = runScore > best;
            if (isBest) {
              best = runScore;
              try {
                localStorage.setItem(bestStorageKey, best);
              } catch (e) {}
            }
            showResult(isBest);
            const finishedSession = rankedSession;
            const rankingStatus = document.querySelector("#result-ranking");
            if (finishedSession) {
              rankingStatus.textContent = "Saving your global score…";
              globalThis.ThreadLeaderboard.finishRun(finishedSession, {
                score: runScore, distance: g.distance, duration: g.elapsed,
              }).then(data => {
                if (rankedSession !== finishedSession) return;
                rankingStatus.textContent = data.yours
                  ? `DAILY RANK #${data.yours.rank} · GLOBAL BEST ${data.yours.score.toLocaleString()}`
                  : "Play again to post your first ranked score.";
                rememberResult();
              }).catch(error => {
                if (rankedSession === finishedSession) {
                  rankingStatus.textContent = error.message;
                  rememberResult();
                }
              });
            } else rankingStatus.textContent = "Custom track · Unranked";

            rememberResult(isBest);
          }
        }
        renderer.background(top, [0, 1, 2].map(b => LASERS[dailyTrack?.palette?.[(stage + b) % 5] ?? (stage + b) % 5][0]), time, settings.reduced);
        for (const star of backgroundStars) {
          ctx.globalAlpha = star.opacity;
          ctx.fillStyle = "#c9eaff";
          ctx.beginPath();
          ctx.arc(
            star.x * width,
            (((star.y * height - (settings.reduced ? 0 : g.distance * star.drift)) % height) + height) % height,
            star.radius,
            0,
            TAU,
          );
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        const path = new Path2D();
        let first = true;
        for (let sy = bottom + 20; sy >= top - 20; sy -= 4) {
          const wy = g.distance + (ringY - sy),
            x = cx + cr * Math.sin(angle(g.nodes, wy));
          first ? (path.moveTo(x, sy), (first = false)) : path.lineTo(x, sy);
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = laser[0] + "2d";
        ctx.lineWidth = 21;
        ctx.stroke(path);
        ctx.strokeStyle = laser[0];
        ctx.shadowColor = laser[1];
        ctx.shadowBlur = 17;
        ctx.lineWidth = 5;
        ctx.stroke(path);
        ctx.shadowBlur = 0;
        for (const p of g.pickups) {
          if (p.collected) continue;
          const sy = p.magnetY ?? ringY - (p.y - g.distance);
          if (sy < top - 30 || sy > bottom + 30) continue;
          const x = p.magnetX ?? cx + cr * Math.sin(angle(g.nodes, p.y)),
            pulse = settings.reduced ? 1 : 1 + Math.sin(time * 0.007) * 0.12;
          ctx.save();
          ctx.translate(x, sy);
          ctx.scale(pulse, pulse);
          renderer.sprite("orb", 80, ctx => {
            ctx.fillStyle = "#ffd447";
            ctx.shadowColor = "#ffd447";
            ctx.shadowBlur = 17;
            ctx.beginPath();
            ctx.arc(0, 0, GROWTH_ORB_RADIUS, 0, TAU);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "#fff5b7";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, TAU);
            ctx.stroke();
          });
          ctx.restore();
        }
        for (const o of g.bonuses) {
          if (o.collected) continue;
          const sy = o.magnetY ?? ringY - (o.y - g.distance);
          if (sy < top - 35 || sy > bottom + 35) continue;
          ctx.save();
          ctx.translate(o.magnetX ?? itemX(o, cx, cr, g), sy);
          const p = settings.reduced
            ? 1
            : 1 + Math.sin(time * 0.006 + o.y) * 0.06;
          ctx.scale(p, p);
          renderer.sprite(o.kind, 96, ctx => {
            ctx.font = (o.kind === "bomb" ? 29 : 30) + "px system-ui";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = o.kind === "bomb" ? "#ff345d" : "#8dff9d";
            ctx.shadowBlur = 12;
            ctx.fillText(ICONS[o.kind], 0, 0);
          });
          ctx.restore();
        }
        const currentX = cx + cr * Math.sin(angle(g.nodes, g.distance)),
          ringX = cx + g.ringOffset,
          on = Math.abs(currentX - ringX) <= g.ringRadius * sw - 6;
        for (const item of g.powerUps.items) {
          if (item.collected) continue;
          const sy = ringY - (item.y - g.distance);
          if (sy < top - 30 || sy > bottom + 30) continue;
          const x = ThreadPowerUps.position(item, cx + cr * Math.sin(angle(g.nodes, item.y)), cx, cr);
          ctx.save();
          ctx.translate(x, sy);
          const pulse = settings.reduced ? 1 : 1 + Math.sin(time * .005 + item.y) * .06;
          ctx.scale(pulse, pulse);
          renderer.sprite(item.kind, 96, ctx => {
            ctx.fillStyle = "#0b1430";
            ctx.strokeStyle = { star: "#ffe66e", blaster: "#72f6ff", magnet: "#ff87df", slow: "#baa0ff", double: "#ffbd72", energy: "#86ffb1" }[item.kind];
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 16;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 19, 0, TAU);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = ctx.strokeStyle;
            ctx.shadowBlur = 6;
            if (item.kind === "star") {
              ctx.beginPath();
              for (let point = 0; point < 10; point++) {
                const a = point * Math.PI / 5 - Math.PI / 2, r = point % 2 ? 6 : 14;
                point ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
              }
              ctx.closePath();
              ctx.fill();
            } else if (item.kind === "magnet") {
              ctx.lineWidth = 7;
              ctx.beginPath();
              ctx.moveTo(-8, -9);
              ctx.lineTo(-8, 2);
              ctx.arc(0, 2, 8, Math.PI, 0, true);
              ctx.lineTo(8, -9);
              ctx.stroke();
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(-11.5, -12, 7, 5);
              ctx.fillRect(4.5, -12, 7, 5);
            } else if (item.kind === "slow") {
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(0, 0, 12, 0, TAU);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(0, -8);
              ctx.lineTo(0, 0);
              ctx.lineTo(6, 3);
              ctx.stroke();
            } else if (item.kind === "double") {
              ctx.font = "1000 19px system-ui";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("2×", 0, 1);
            } else if (item.kind === "energy") {
              ctx.lineWidth = 2;
              ctx.strokeRect(-11, -7, 20, 15);
              ctx.fillRect(9, -3, 4, 7);
              ctx.fillRect(-3, -4, 3, 9);
              ctx.fillRect(-6, -1, 9, 3);
            } else {
              // A single ray gun with a grip, energy cell and projecting laser.
              ctx.rotate(-Math.PI / 5);
              ctx.beginPath();
              ctx.moveTo(-12, -7);
              ctx.lineTo(2, -7);
              ctx.lineTo(6, -4);
              ctx.lineTo(12, -4);
              ctx.lineTo(12, 3);
              ctx.lineTo(0, 3);
              ctx.lineTo(-2, 11);
              ctx.lineTo(-8, 11);
              ctx.lineTo(-6, 3);
              ctx.lineTo(-12, 3);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = "#ff66df";
              ctx.fillRect(-9, -5, 7, 5);
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(8, -3, 5, 3);
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(15, -1.5);
              ctx.lineTo(18, -1.5);
              ctx.stroke();
            }
          });
          ctx.restore();
        }
        ctx.save();
        ctx.strokeStyle = "#b8ffff";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#35eaff";
        ctx.shadowBlur = 12;
        for (const shot of g.powerUps.shots) {
          ctx.beginPath();
          ctx.moveTo(shot.x, shot.y);
          ctx.lineTo(shot.x - shot.dx * 20, shot.y - shot.dy * 20);
          ctx.stroke();
        }
        if (g.powerUps.blaster > 0) {
          ctx.fillStyle = "#72f6ff";
          ctx.fillRect(ringX - 14, ringY - g.ringRadius - 10, 7, 18);
          ctx.fillRect(ringX + 7, ringY - g.ringRadius - 10, 7, 18);
        }
        ctx.restore();
        const starActive = g.powerUps.star > 0,
          starPulse = settings.reduced ? .5 : (1 + Math.sin(time * .005)) / 2,
          starHue = settings.reduced ? 0 : (time * .06) % 360;
        let rainbow;
        if (starActive) {
          const span = g.ringRadius * 1.3;
          rainbow = ctx.createLinearGradient(ringX - span, ringY - span, ringX + span, ringY + span);
          for (let band = 0; band <= 6; band++)
            rainbow.addColorStop(band / 6, `hsl(${(starHue + band * 60) % 360} 100% 65%)`);
          // Pulse the outline/glow of the current shape without changing its hitbox.
          ctx.save();
          ctx.strokeStyle = rainbow;
          ctx.lineWidth = 16 + starPulse * 6;
          ctx.globalAlpha = .25 + starPulse * .12;
          ctx.shadowColor = `hsl(${starHue} 100% 65%)`;
          ctx.shadowBlur = 25 + starPulse * 15;
          shape(ringX, ringY, g.ringRadius, s, z);
          ctx.stroke();
          ctx.restore();
        }
        ctx.strokeStyle = starActive ? rainbow : on ? "#ffd447" : "#ff5470";
        ctx.lineWidth = starActive ? 7 + starPulse * 2 : 7;
        ctx.shadowColor = starActive ? `hsl(${starHue} 100% 65%)` : on ? "#ffd447" : "#ff3158";
        ctx.shadowBlur = starActive ? 22 + starPulse * 14 : 18 + (settings.reduced ? 0 : g.flash * 18);
        shape(ringX, ringY, g.ringRadius, s, z);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = starActive ? "#ffffff" : on ? "#fff3a5" : "#ff8da0";
        ctx.beginPath();
        ctx.arc(ringX, ringY, 4, 0, TAU);
        ctx.fill();
        for (const e of g.effects) {
          e.y -= 28 * dt;
          e.life -= dt;
          ctx.globalAlpha = Math.max(0, e.life);
          ctx.fillStyle = e.color;
          ctx.font = "900 18px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(e.text, e.x, e.y);
        }
        ctx.globalAlpha = 1;
        g.effects = g.effects.filter((e) => e.life > 0);
        if (g.bombFlash > 0 && !settings.reduced) {
          ctx.fillStyle = "rgba(255,30,70," + g.bombFlash * 0.16 + ")";
          ctx.fillRect(0, 0, width, height);
          g.bombFlash = Math.max(0, g.bombFlash - dt * 2.2);
        }
        if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 2.3);
        if (started && time - lastHud > 90) {
          lastHud = time;
          level.textContent = stage;
          ring.textContent = Math.round(g.ringRadius);
          speed.textContent = (g.speed / 54).toFixed(1) + "×";
          score.textContent = Math.floor(g.score).toLocaleString();
          energy.style.width = Math.round(g.energy) + "%";
          for (const kind of Object.keys(ThreadPowerUps.durations)) {
            const timer = document.querySelector(`#${kind}-timer`);
            timer.hidden = g.powerUps[kind] <= 0;
            const label = { star: "★ INVINCIBLE", blaster: "⚡ BLASTER", magnet: "∩ MAGNET", slow: "◷ SLOW", double: "2× POINTS" }[kind];
            timer.textContent = `${label} ${Math.ceil(g.powerUps[kind])}s`;
          }
        }
        requestAnimationFrame(frame);
      }
