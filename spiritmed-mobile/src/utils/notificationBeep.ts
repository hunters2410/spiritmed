import { createAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { Vibration } from 'react-native';

/**
 * Generates a tiny WAV file with a two-tone beep (800Hz + 1050Hz) and plays it.
 * Works on both Android and iOS via expo-audio.
 */

// Pre-computed base64 WAV for a clean two-tone notification beep
// 44100 Hz, 16-bit, mono, ~0.35s duration
function generateBeepWav(): string {
  const sampleRate = 22050;
  const duration1 = 0.15; // first beep
  const gap = 0.02;
  const duration2 = 0.15; // second beep
  const totalDuration = duration1 + gap + duration2;
  const numSamples = Math.floor(sampleRate * totalDuration);
  const amplitude = 0.4;

  // Generate PCM samples
  const samples = new Int16Array(numSamples);
  const samplesD1 = Math.floor(sampleRate * duration1);
  const samplesGap = Math.floor(sampleRate * (duration1 + gap));

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let value = 0;

    if (i < samplesD1) {
      // First tone: 800Hz with fade out
      const env = 1 - (i / samplesD1) * 0.7;
      value = Math.sin(2 * Math.PI * 800 * t) * amplitude * env;
    } else if (i >= samplesGap) {
      // Second tone: 1050Hz with fade out
      const localI = i - samplesGap;
      const localLen = numSamples - samplesGap;
      const env = 1 - (localI / localLen) * 0.7;
      value = Math.sin(2 * Math.PI * 1050 * t) * amplitude * env;
    }
    // Gap: silence (value stays 0)

    samples[i] = Math.max(-32768, Math.min(32767, Math.floor(value * 32767)));
  }

  // Build WAV header
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }

  // Convert to base64
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

let cachedBeepUri: string | null = null;

/**
 * Play a notification beep sound + short vibration for incoming chat messages.
 */
export async function playNotificationBeep(): Promise<void> {
  try {
    // Also vibrate briefly
    Vibration.vibrate(100);

    // Generate and cache the beep WAV file
    if (!cachedBeepUri) {
      const base64Wav = generateBeepWav();
      const fileUri = `${FileSystem.cacheDirectory}notification_beep.wav`;
      await FileSystem.writeAsStringAsync(fileUri, base64Wav, {
        encoding: FileSystem.EncodingType.Base64,
      });
      cachedBeepUri = fileUri;
    }

    // Play the sound
    const player = createAudioPlayer(cachedBeepUri);
    player.play();

    // Clean up after playback finishes
    setTimeout(() => {
      try { player.remove(); } catch (_) {}
    }, 1000);
  } catch (err) {
    console.warn('Failed to play notification beep:', err);
    // Fallback: at least vibrate
    Vibration.vibrate(200);
  }
}
