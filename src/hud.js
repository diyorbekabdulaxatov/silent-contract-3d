// @ts-check
// The in-game HUD: DOM text and buttons over the 3D view. Writes only when a value changes,
// so the browser does not re-layout every frame.

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

export function createHud() {
  const el = {
    root: $('hud'),
    targets: $('hud-targets'),
    wind: $('hud-wind'),
    windArrow: $('hud-wind-arrow'),
    range: $('hud-range'),
    ammo: $('hud-ammo'),
    status: $('hud-status'),
    radio: $('hud-radio'),
    flash: $('hud-flash'),
    zoomWrap: $('zoom-wrap'),
    zoom: /** @type {HTMLInputElement} */ ($('zoom')),
    zoomLabel: $('zoom-label'),
    breath: $('btn-breath'),
    scope: $('btn-scope'),
    fire: $('btn-fire'),
    crosshair: $('crosshair')
  };
  /** @type {Record<string, any>} */
  const last = {};
  let radioTimer = 0;
  let flashTimer = 0;

  function set(key, node, text) {
    if (last[key] === text) return;
    last[key] = text;
    node.textContent = text;
  }

  return {
    el,
    /** @param {boolean} on */
    show(on) {
      el.root.hidden = !on;
    },
    targets(down, total) {
      set('targets', el.targets, down + ' / ' + total);
    },
    /** @param {number} w crosswind in m/s, positive blows right */
    wind(w) {
      set('wind', el.wind, Math.abs(w).toFixed(1) + ' m/s');
      const dir = w >= 0 ? 'right' : 'left';
      if (last.windDir !== dir) {
        last.windDir = dir;
        el.windArrow.textContent = w >= 0 ? '→' : '←';
      }
    },
    /** @param {number | null} m */
    range(m) {
      set('range', el.range, m === null ? '---' : String(Math.round(m)));
    },
    ammo(n, mag, status) {
      set('ammo', el.ammo, n + ' / ' + mag);
      set('status', el.status, status);
    },
    /** @param {string} text */
    say(text) {
      el.radio.textContent = text;
      el.radio.classList.add('on');
      radioTimer = 4 + text.length * 0.045;
    },
    /** @param {string} text @param {'good' | 'bad' | 'plain'} tone */
    flash(text, tone) {
      el.flash.textContent = text;
      el.flash.dataset.tone = tone;
      el.flash.classList.add('on');
      flashTimer = 2.2;
    },
    /** @param {number} level 0..1 @param {boolean} holding @param {boolean} tired */
    breath(level, holding, tired) {
      const p = Math.round(level * 100) / 100;
      if (last.breath !== p) {
        last.breath = p;
        el.breath.style.setProperty('--p', String(p));
      }
      const state = tired ? 'tired' : holding ? 'holding' : '';
      if (last.breathState !== state) {
        last.breathState = state;
        el.breath.dataset.state = state;
      }
    },
    /** @param {boolean} scoped @param {number} zoom */
    scoped(scoped, zoom) {
      if (last.scoped !== scoped) {
        last.scoped = scoped;
        el.zoomWrap.hidden = !scoped;
        el.crosshair.hidden = scoped;
        el.scope.classList.toggle('active', scoped);
        el.root.classList.toggle('scoped', scoped);
      }
      const z = zoom.toFixed(1);
      if (last.zoom !== z) {
        last.zoom = z;
        el.zoom.value = z;
        el.zoomLabel.textContent = z + '×';
      }
    },
    /** @param {boolean} ready */
    fireReady(ready) {
      if (last.fireReady !== ready) {
        last.fireReady = ready;
        el.fire.classList.toggle('cycling', !ready);
      }
    },
    /** @param {number} dt */
    tick(dt) {
      if (radioTimer > 0) {
        radioTimer -= dt;
        if (radioTimer <= 0) el.radio.classList.remove('on');
      }
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) el.flash.classList.remove('on');
      }
    },
    reset() {
      radioTimer = 0;
      flashTimer = 0;
      el.radio.classList.remove('on');
      el.flash.classList.remove('on');
    }
  };
}
