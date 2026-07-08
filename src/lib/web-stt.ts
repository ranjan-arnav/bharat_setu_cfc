export type WebSttSession = {
  stop: () => void;
  cancel: () => void;
  done: Promise<string>;
};

type ActiveCapture = {
  stop: () => void;
  cancel: () => void;
  done: Promise<Blob>;
};

function normalizeLanguage(language: string): string {
  const lang = (language || 'en').trim();
  if (!lang) return 'en-IN';
  if (lang.includes('-')) return lang;
  return `${lang}-IN`;
}

function getFileMetaForBlob(blob: Blob): { name: string; type: string } {
  const type = blob.type || 'audio/webm';
  if (type.includes('wav')) return { name: 'voice.wav', type: 'audio/wav' };
  if (type.includes('ogg')) return { name: 'voice.ogg', type: 'audio/ogg; codecs=opus' };
  if (type.includes('mp4') || type.includes('m4a')) return { name: 'voice.m4a', type: 'audio/m4a' };
  return { name: 'voice.webm', type: 'audio/webm' };
}

async function transcribeAudioBlob(blob: Blob, language: string): Promise<string> {
  const formData = new FormData();
  const meta = getFileMetaForBlob(blob);

  formData.append(
    'audio',
    new File([blob], meta.name, {
      type: meta.type,
      lastModified: Date.now(),
    })
  );
  formData.append('language', normalizeLanguage(language));

  const response = await fetch('/api/stt', {
    method: 'POST',
    body: formData,
  });

  const rawBody = await response.text();
  const contentType = response.headers.get('content-type') || '';

  let payload: { text?: string; error?: string; message?: string } = {};
  if (contentType.includes('application/json')) {
    try {
      payload = JSON.parse(rawBody) as { text?: string; error?: string; message?: string };
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || `STT failed (${response.status}).`);
  }

  const text = (payload.text || '').trim();
  if (!text) {
    throw new Error(payload.error || payload.message || 'No speech recognized.');
  }

  return text;
}

function encodeWavMono(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

async function startWavCapture(maxDurationMs: number): Promise<ActiveCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioContext = new AudioContext();
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let settled = false;
  let cancelled = false;
  let timeoutId: number | null = null;

  const cleanup = async () => {
    try {
      scriptProcessor.disconnect();
      source.disconnect();
    } catch {
      // noop
    }
    stream.getTracks().forEach((track) => track.stop());
    try {
      await audioContext.close();
    } catch {
      // noop
    }
  };

  const finalize = async (): Promise<Blob> => {
    if (settled) {
      throw new Error('cancelled');
    }

    settled = true;

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }

    await cleanup();

    if (cancelled) {
      throw new Error('cancelled');
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (!totalLength) {
      throw new Error('No speech detected. Please try again.');
    }

    const merged = new Float32Array(totalLength);
    let cursor = 0;
    for (const chunk of chunks) {
      merged.set(chunk, cursor);
      cursor += chunk.length;
    }

    return encodeWavMono(merged, audioContext.sampleRate);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    scriptProcessor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    timeoutId = window.setTimeout(() => {
      void finalize().then(resolve).catch(reject);
    }, maxDurationMs);
  });

  const stop = () => {
    void finalize().catch(() => undefined);
  };

  const cancel = () => {
    cancelled = true;
    void finalize().catch(() => undefined);
  };

  return { stop, cancel, done };
}

async function startMediaRecorderCapture(maxDurationMs: number, mimeType?: string): Promise<ActiveCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  let cancelled = false;
  let settled = false;

  const stopTracks = () => {
    stream.getTracks().forEach((track) => track.stop());
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      stopTracks();
      reject(new Error('Microphone recording failed.'));
    };

    recorder.onstop = () => {
      if (settled) return;
      stopTracks();

      if (cancelled) {
        settled = true;
        reject(new Error('cancelled'));
        return;
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      if (!blob.size) {
        settled = true;
        reject(new Error('No speech detected. Please try again.'));
        return;
      }

      settled = true;
      resolve(blob);
    };

    recorder.start();
  });

  const timeout = window.setTimeout(() => {
    if (recorder.state === 'recording') {
      recorder.stop();
    }
  }, maxDurationMs);

  const stop = () => {
    window.clearTimeout(timeout);
    if (recorder.state === 'recording') {
      recorder.stop();
    }
  };

  const cancel = () => {
    cancelled = true;
    stop();
  };

  return { stop, cancel, done };
}

export async function startAzureSttCapture(language: string, maxDurationMs = 7000): Promise<WebSttSession> {
  if (typeof window === 'undefined') {
    throw new Error('Voice capture is available only in browser.');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone is not supported in this browser.');
  }

  const oggMimeTypes = ['audio/ogg;codecs=opus', 'audio/ogg'];

  const selectedOggMimeType = typeof MediaRecorder !== 'undefined'
    ? oggMimeTypes.find((mime) => {
      try {
        return MediaRecorder.isTypeSupported(mime);
      } catch {
        return false;
      }
    })
    : undefined;

  const activeCapture = selectedOggMimeType
    ? await startMediaRecorderCapture(maxDurationMs, selectedOggMimeType)
    : await startWavCapture(maxDurationMs);

  const done = activeCapture.done.then((blob) => transcribeAudioBlob(blob, language));

  return {
    stop: activeCapture.stop,
    cancel: activeCapture.cancel,
    done,
  };
}
