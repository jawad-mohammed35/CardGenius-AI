import type { CardRating } from "./study-session";

let context: AudioContext | undefined;

export async function playRatingSound(rating: CardRating, volume: number) {
  if (!volume) return;
  try {
    context ??= new AudioContext();
    if (context.state !== "running") await context.resume();
    const now = context.currentTime;
    const notes = rating === "known" ? [523.25, 659.25] : [440, 392];
    for (const [index, pitch] of notes.entries()) {
      const start = now + index * 0.065;
      const tone = context.createOscillator();
      const envelope = context.createGain();
      tone.type = "sine";
      tone.frequency.value = pitch;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.1 * volume / 100, start + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      tone.connect(envelope).connect(context.destination);
      tone.start(start);
      tone.stop(start + 0.13);
      tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
    }
  } catch {
    // Study interactions still work if the device or browser blocks playback.
  }
}
