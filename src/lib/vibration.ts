/**
 * Feedback sensoriale per Asta Pazza — vibrazione + suono dolce (carillon).
 *
 * Comportamento per piattaforma:
 *  - Android Chrome/Firefox : vibrazione nativa + suono
 *  - iOS Safari             : solo suono (Web Audio API funziona su iOS)
 *  - Desktop                : solo suono
 *
 * IMPORTANTE: questa funzione deve essere chiamata dentro un handler
 * di un evento utente (click/tap), altrimenti iOS blocca l'audio.
 * Nel progetto è già così: auction-started e tiebreak arrivano via Pusher
 * ma il click sul pulsante "Offerta" sblocca il contesto audio in anticipo.
 */

export type FeedbackEvent = 'auction-start' | 'tiebreak-start';

const VIBRATION_PATTERNS: Record<FeedbackEvent, number | number[]> = {
  'auction-start':  [80, 60, 80],
  'tiebreak-start': [150, 80, 150, 80, 150],
};

function triggerVibration(event: FeedbackEvent): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try { navigator.vibrate(VIBRATION_PATTERNS[event]); } catch { /* silenzioso */ }
}

let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_audioCtx) {
    try {
      const Ctx = window.AudioContext
        ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      _audioCtx = new Ctx();
    } catch { return null; }
  }
  return _audioCtx;
}

export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

function playTone(ctx: AudioContext, freq: number, startTime: number, duration: number, peak = 0.18) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();

  osc.type = 'sine';  osc.frequency.value = freq;
  osc2.type = 'sine'; osc2.frequency.value = freq * 2;

  const atk = 0.010, dec = 0.050, sus = peak * 0.55, rel = duration * 0.40;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peak, startTime + atk);
  gain.gain.linearRampToValueAtTime(sus,  startTime + atk + dec);
  gain.gain.setValueAtTime(sus,           startTime + duration - rel);
  gain.gain.linearRampToValueAtTime(0,    startTime + duration);

  gain2.gain.setValueAtTime(0, startTime);
  gain2.gain.linearRampToValueAtTime(peak * 0.22, startTime + atk);
  gain2.gain.linearRampToValueAtTime(0, startTime + duration * 0.55);

  osc.connect(gain).connect(ctx.destination);
  osc2.connect(gain2).connect(ctx.destination);
  osc.start(startTime);  osc.stop(startTime + duration);
  osc2.start(startTime); osc2.stop(startTime + duration * 0.55);
}

function triggerSound(event: FeedbackEvent): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => triggerSound(event)).catch(() => {});
    return;
  }
  const now = ctx.currentTime;
  if (event === 'auction-start') {
    playTone(ctx, 523.25, now,        0.22, 0.18);
    playTone(ctx, 659.25, now + 0.23, 0.26, 0.18);
  } else {
    playTone(ctx, 440.00, now,        0.18, 0.17);
    playTone(ctx, 523.25, now + 0.20, 0.18, 0.17);
    playTone(ctx, 659.25, now + 0.40, 0.24, 0.20);
  }
}

export function vibrate(event: FeedbackEvent): void {
  triggerVibration(event);
  triggerSound(event);
}