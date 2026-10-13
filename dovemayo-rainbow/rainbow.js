(() => {
  /* ================= 설정 / 상태 ================= */
  const DURATION = 10;                        // 게임의 EFFECT_DURATION
  const SPEEDS = [0.5, 1, 1.5, 2, 3];         // 게임 속도 배율
  const TIMERS = [1, 2, 3, 5, 10];            // 타이머 가속 배율
  const state = {
    rainbow: true,      // 무한 무지개
    invincible: false,  // 항상 무적
    speedIdx: 1,        // SPEEDS[1] = 1배
    timerIdx: 0         // TIMERS[0] = 1배(가속 없음)
  };
  let currentGame = null;

  /* ================= 게임 인스턴스 패치 ================= */
  function hook(game) {
    if (game.__rainbowHooked) return;
    const proto = Object.getPrototypeOf(game);
    const origTick = proto.tick;
    const origSetBuff = proto.setBuff;
    if (typeof origTick !== 'function' || typeof origSetBuff !== 'function') return;
    game.__rainbowHooked = true;
    game.__comboEnd = 0;
    currentGame = game;

    // 조합 효과(빨강/파랑/보라/주황)의 종료 시각을 직접 기록
    game.setBuff = function (kind, duration) {
      const ok = origSetBuff.call(this, kind, duration);
      if (ok && this.combo) this.__comboEnd = this.age + DURATION;
      return ok;
    };

    game.tick = function (dt) {
      const m = SPEEDS[state.speedIdx];
      const f = TIMERS[state.timerIdx];
      const n = Math.max(1, Math.ceil(m));    // 배속이 높아도 충돌 판정이 뚫리지 않게 쪼개서 실행
      const sub = (dt * m) / n;

      for (let i = 0; i < n && !this.dead; i++) {
        this.debugInvincible = state.invincible;

        // ---- 타이머 가속: 효과 종료 시각을 앞당김 ----
        if (f > 1) {
          const extra = sub * (f - 1);
          if (this.combo) this.__comboEnd -= extra;                       // 조합 효과
          if (this.buff && this.buff.kind && this.buff.kind !== 'rainbow') // 일반 버프
            this.buff.until -= extra;
          if (this.puddles) for (const p of this.puddles) p.until -= extra; // 웅덩이
        }

        // ---- 무한 무지개 ----
        if (state.rainbow) {
          if (this.combo && this.age >= this.__comboEnd) this.combo = null;
          this.buff = { kind: 'rainbow', until: this.age + DURATION + dt * 2 };
          this.graceUntil = Math.max(this.graceUntil || 0, this.buff.until + 1.5);
        }

        origTick.call(this, sub);
      }
    };

    console.log('[Dovemayo Rainbow] 게임 인스턴스 연결됨');
  }

  /* ================= SnakeGame 생성 감지 ================= */
  const origAssign = Object.assign;
  Object.assign = function (target, ...sources) {
    const result = origAssign.apply(Object, arguments);
    try {
      const s = sources[0];
      if (
        s && typeof s === 'object' &&
        'routePlanner' in s && 'obstacles' in s && 'random' in s && 'width' in s &&
        target && typeof target.tick === 'function'
      ) hook(target);
    } catch (e) {}
    return result;
  };

  /* ================= 컨트롤 패널 UI ================= */
  const buttons = {};
  let panel, toast;

  function label(key) {
    switch (key) {
      case 'rainbow':    return `🌈 무한 무지개: ${state.rainbow ? 'ON' : 'OFF'} (R)`;
      case 'speed':      return `⏩ 게임 속도: ${SPEEDS[state.speedIdx]}배 (T)`;
      case 'timer':      return `⏱️ 타이머 가속: ${TIMERS[state.timerIdx]}배 (C)`;
      case 'invincible': return `🛡️ 항상 무적: ${state.invincible ? 'ON' : 'OFF'} (I)`;
    }
  }

  function refreshUI() {
    for (const k in buttons) {
      buttons[k].textContent = label(k);
      const on =
        (k === 'rainbow' && state.rainbow) ||
        (k === 'invincible' && state.invincible) ||
        (k === 'speed' && state.speedIdx !== 1) ||
        (k === 'timer' && state.timerIdx !== 0);
      buttons[k].style.background = on ? '#242424' : '#fff';
      buttons[k].style.color = on ? '#fff' : '#242424';
    }
  }

  function showToast(text) {
    if (!toast) {
      toast = document.createElement('div');
      Object.assign(toast.style, {
        position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
        background: '#282828', color: '#fff', font: '12px Arial,sans-serif',
        padding: '7px 12px', borderRadius: '8px', zIndex: 2147483647,
        pointerEvents: 'none', transition: 'opacity .2s', opacity: '0'
      });
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => (toast.style.opacity = '0'), 1200);
  }

  const actions = {
    rainbow() {
      state.rainbow = !state.rainbow;
      if (!state.rainbow && currentGame) currentGame.buff = { kind: null, until: 0 }; // 끄면 즉시 해제
    },
    speed()      { state.speedIdx = (state.speedIdx + 1) % SPEEDS.length; },
    timer()      { state.timerIdx = (state.timerIdx + 1) % TIMERS.length; },
    invincible() { state.invincible = !state.invincible; }
  };

  function run(key) {
    actions[key]();
    refreshUI();
    showToast(label(key).replace(/ \(.\)$/, ''));
  }

  function buildPanel() {
    if (panel || !document.body) return;
    panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', left: '12px', bottom: '12px', zIndex: 2147483647,
      display: 'flex', flexDirection: 'column', gap: '6px',
      font: '12px Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif',
      userSelect: 'none', touchAction: 'manipulation'
    });

    for (const key of ['rainbow', 'speed', 'timer', 'invincible']) {
      const b = document.createElement('button');
      b.type = 'button';
      Object.assign(b.style, {
        padding: '7px 10px', border: '1px solid #cfcaca', borderRadius: '8px',
        cursor: 'pointer', textAlign: 'left', font: 'inherit',
        boxShadow: '0 1px 3px rgba(0,0,0,.08)'
      });
      b.addEventListener('click', () => run(key));
      b.addEventListener('keydown', (e) => e.preventDefault()); // 버튼 포커스 후 스페이스/엔터 오작동 방지
      buttons[key] = b;
      panel.appendChild(b);
    }

    // 게임이 패널 클릭을 조작 입력으로 받지 않도록 차단
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'touchend', 'touchmove']) {
      panel.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }

    document.body.appendChild(panel);
    refreshUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPanel);
  } else {
    buildPanel();
  }

  /* ================= 단축키 (캡처 단계 + 물리 키 코드) ================= */
  const KEYMAP = { KeyR: 'rainbow', KeyT: 'speed', KeyC: 'timer', KeyI: 'invincible' };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const key = KEYMAP[e.code];
    if (key) run(key);
  }, true);
})();