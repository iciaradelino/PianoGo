let audio: AudioContext | null = null;
// Each key's sound is worked out once; doing it on every press stalls the page.
const buffers = new Map<number, AudioBuffer>();

/** The audio clock notes are scheduled on, or null where there is no audio. */
export function pianoContext() {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  if (!audio) audio = new AudioContext();
  void audio.resume();
  return audio;
}

function frequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function synthesize(context: AudioContext, midi: number) {
  const duration = 1.5;
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const fundamental = frequency(midi);
  const partials = [1, 2, 3, 4, 5];
  const weights = [1, 0.55, 0.28, 0.14, 0.07];

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    let sample = 0;

    for (let partial = 0; partial < partials.length; partial += 1) {
      const harmonic = partials[partial];
      const stretched = fundamental * harmonic * (1 + 0.00015 * harmonic * harmonic);
      const decay = Math.exp(-time * (2.4 + harmonic * 1.8));
      sample += Math.sin(2 * Math.PI * stretched * time) * weights[partial] * decay;
    }

    const hammer = (Math.random() * 2 - 1) * Math.exp(-time * 90) * 0.12;
    data[index] = (sample + hammer) * 0.22;
  }
  return buffer;
}

function bufferFor(context: AudioContext, midi: number) {
  let buffer = buffers.get(midi);
  if (!buffer) {
    buffer = synthesize(context, midi);
    buffers.set(midi, buffer);
  }
  return buffer;
}

/** Works out these keys' sounds ahead, so playing them later starts on time. */
export function preparePianoNotes(midis: number[]) {
  const context = pianoContext();
  if (!context) return;
  for (const midi of midis) bufferFor(context, midi);
}

/**
 * Plays a key now, or at `when` on the audio clock. Returns the sound so a
 * scheduled note can be called off.
 */
export function playPianoNote(midi: number, when = 0) {
  const context = pianoContext();
  if (!context) return null;

  const source = context.createBufferSource();
  source.buffer = bufferFor(context, midi);
  source.connect(context.destination);
  source.start(when);
  return source;
}
