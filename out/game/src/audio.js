// Synthesised sound for DAWNWISP: every effect is a small WebAudio patch, so the
// game ships no audio files and makes no network request. The context is created
// on the first user gesture (browsers block audio before one); every call is a
// no-op until then, which also keeps headless screenshot runs silent.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let padNodes = null;

  function ensure() {
    if (ctx || muted) return false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    unlock() {
      if (ensure() && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (ctx && !padNodes) this.startPad();
    },
    startPad() {
      if (!ctx || padNodes) return;
      try {
        const gain = ctx.createGain();
        gain.gain.value = 0.045;
        gain.connect(master);
        const oscs = [110, 164.81, 220].map((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = i === 0 ? 'sine' : 'triangle';
          osc.frequency.value = freq;
          osc.detune.value = i * 4 - 4;
          osc.connect(gain);
          osc.start();
          return osc;
        });
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.02;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        lfo.start();
        padNodes = { gain, oscs, lfo };
      } catch {
        padNodes = null;
      }
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    cleanse(combo) {
      const base = 520 + Math.min(combo, 12) * 36;
      tone(base, 0.16, 'sine', 0.22, base * 1.6);
      tone(base * 2, 0.1, 'triangle', 0.08, base * 2.4);
    },
    ember() {
      tone(880, 0.09, 'sine', 0.1, 1320);
    },
    hit() {
      tone(160, 0.25, 'sawtooth', 0.25, 60);
      noise(0.18, 0.2, 900);
    },
    nova() {
      tone(90, 0.6, 'sine', 0.4, 720);
      noise(0.5, 0.3, 2400);
      tone(1440, 0.3, 'sine', 0.12, 240);
    },
    upgrade() {
      [523.25, 659.25, 783.99].forEach((f, i) => {
        setTimeout(() => tone(f, 0.22, 'triangle', 0.16), i * 70);
      });
    },
    waveStart() {
      tone(392, 0.3, 'triangle', 0.14, 523.25);
    },
    boss() {
      tone(98, 0.9, 'sawtooth', 0.22, 49);
      tone(147, 0.9, 'sawtooth', 0.14, 73.5);
      noise(0.7, 0.14, 500);
    },
    gameOver() {
      [392, 311.13, 233.08, 155.56].forEach((f, i) => {
        setTimeout(() => tone(f, 0.5, 'triangle', 0.16), i * 180);
      });
    },
    victory() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        setTimeout(() => tone(f, 0.5, 'triangle', 0.16), i * 120);
      });
    },
    click() {
      tone(660, 0.06, 'sine', 0.12, 880);
    },
  };
}
