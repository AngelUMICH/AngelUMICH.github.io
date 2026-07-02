// Background sparkle effect: an ion drifts across the page leaving a fading
// trail. After covering a set distance it detonates into a burst of sparks
// weighted toward its direction of travel, then picks a new random heading
// and continues. It dissolves after its third burst.
(function () {
  'use strict';

  var SPARKLE_CONFIG = {
    // Average number of new ions spawned per second. Raise for a busier
    // sky, lower for a calmer one. Tweakable at runtime via window.sparkleConfig.
    frequency: 0.5,
    burstDistance: 260,      // px an ion travels before it detonates
    burstsPerIon: 3,         // ion dissolves after this many detonations
    sparksPerBurst: [10, 16],
    forwardBias: Math.PI * 0.85, // spark angle spread around the ion's heading; smaller = tighter forward cone
    sparkLifetime: 1100,     // ms a burst spark stays visible
    sparkSpeedRange: [30, 110],
    trailLifetime: 400,      // ms a trail dot stays visible
    ionSpeedRange: [160, 260],// px/sec - noticeably faster than the sparks it leaves behind
    color: null              // null = read from the --accent CSS variable
  };

  var STORAGE_KEY = 'sparkle-cascade-enabled';

  var canvas = document.getElementById('sparkle-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var toggleBtn = document.getElementById('sparkle-toggle');

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var width = 0;
  var height = 0;
  var ions = [];
  var sparks = [];
  var enabled = localStorage.getItem(STORAGE_KEY);
  enabled = enabled === null ? true : enabled === 'true';
  var rafId = null;
  var lastFrame = 0;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
      ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
      : { r: 240, g: 234, b: 214 };
  }

  function getAccentRgb() {
    var hex = SPARKLE_CONFIG.color ||
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return hexToRgb(hex);
  }

  function spawnIon() {
    ions.push({
      x: Math.random() * width,
      y: Math.random() * height,
      angle: Math.random() * Math.PI * 2,
      speed: lerp(SPARKLE_CONFIG.ionSpeedRange[0], SPARKLE_CONFIG.ionSpeedRange[1], Math.random()),
      distSinceBurst: 0,
      burstsLeft: SPARKLE_CONFIG.burstsPerIon,
      rgb: getAccentRgb(),
      trail: []
    });
  }

  // Triangular distribution centered on 0: peaks at the ion's heading and
  // tapers off toward the edges of the forward cone, so sparks favor the
  // direction of travel without excluding the occasional side/back spark.
  function biasedOffset(spread) {
    return (Math.random() - Math.random()) * spread;
  }

  function burst(ion) {
    var count = Math.round(lerp(SPARKLE_CONFIG.sparksPerBurst[0], SPARKLE_CONFIG.sparksPerBurst[1], Math.random()));
    // Shared across the whole burst so every spark from this trajectory fades
    // out at roughly the same time, while different bursts still vary.
    var life = SPARKLE_CONFIG.sparkLifetime * (0.7 + Math.random() * 0.6);
    for (var i = 0; i < count; i++) {
      var angle = ion.angle + biasedOffset(SPARKLE_CONFIG.forwardBias);
      var speed = lerp(SPARKLE_CONFIG.sparkSpeedRange[0], SPARKLE_CONFIG.sparkSpeedRange[1], Math.random());
      sparks.push({
        x: ion.x,
        y: ion.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        born: performance.now(),
        life: life,
        radius: lerp(0.6, 2.2, Math.random()),
        rgb: ion.rgb
      });
    }
  }

  function updateIon(ion, dt, now) {
    var dx = Math.cos(ion.angle) * ion.speed * dt;
    var dy = Math.sin(ion.angle) * ion.speed * dt;
    ion.x += dx;
    ion.y += dy;
    ion.distSinceBurst += Math.hypot(dx, dy);

    ion.trail.push({ x: ion.x, y: ion.y, born: now });
    while (ion.trail.length && now - ion.trail[0].born > SPARKLE_CONFIG.trailLifetime) {
      ion.trail.shift();
    }

    if (ion.distSinceBurst >= SPARKLE_CONFIG.burstDistance) {
      burst(ion);
      ion.burstsLeft -= 1;
      ion.distSinceBurst = 0;
      ion.angle = Math.random() * Math.PI * 2;
      if (ion.burstsLeft <= 0) return false;
    }

    return ion.x > -50 && ion.x < width + 50 && ion.y > -50 && ion.y < height + 50;
  }

  function drawIon(ion, now) {
    for (var i = 0; i < ion.trail.length; i++) {
      var pt = ion.trail[i];
      var t = (now - pt.born) / SPARKLE_CONFIG.trailLifetime;
      var alpha = (1 - t) * 0.5;
      var radius = lerp(1.4, 0.3, t);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + ion.rgb.r + ',' + ion.rgb.g + ',' + ion.rgb.b + ',' + alpha + ')';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(ion.x, ion.y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + ion.rgb.r + ',' + ion.rgb.g + ',' + ion.rgb.b + ',0.95)';
    ctx.fill();
  }

  function tick(now) {
    if (!enabled) {
      rafId = null;
      return;
    }
    var dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;

    ctx.clearRect(0, 0, width, height);

    if (Math.random() < SPARKLE_CONFIG.frequency * dt) {
      spawnIon();
    }

    for (var i = ions.length - 1; i >= 0; i--) {
      var ion = ions[i];
      var alive = updateIon(ion, dt, now);
      drawIon(ion, now);
      if (!alive) ions.splice(i, 1);
    }

    for (var j = sparks.length - 1; j >= 0; j--) {
      var s = sparks[j];
      var age = now - s.born;
      if (age > s.life) {
        sparks.splice(j, 1);
        continue;
      }
      var t = age / s.life;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= (1 - Math.min(dt * 1.5, 1));
      s.vy *= (1 - Math.min(dt * 1.5, 1));

      var alpha = (1 - t) * 0.9;
      var radius = Math.max(s.radius * (1 - t * 0.4), 0.2);
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + s.rgb.r + ',' + s.rgb.g + ',' + s.rgb.b + ',' + alpha + ')';
      ctx.fill();
    }

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastFrame = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    ions.length = 0;
    sparks.length = 0;
    ctx.clearRect(0, 0, width, height);
  }

  function setEnabled(value) {
    enabled = value;
    localStorage.setItem(STORAGE_KEY, String(value));
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', String(value));
      toggleBtn.classList.toggle('is-off', !value);
    }
    if (value) start(); else stop();
  }

  window.addEventListener('resize', resize);
  resize();

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      setEnabled(!enabled);
    });
  }

  setEnabled(enabled);

  // Tune the effect live from the console, e.g. sparkleConfig.frequency = 2
  window.sparkleConfig = SPARKLE_CONFIG;
})();
