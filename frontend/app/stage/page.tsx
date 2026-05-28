'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createWebSocket, getSession, getWelcomeAudio } from '@/lib/api';
import { assetPath } from '@/lib/paths';

const StageGame = dynamic(() => import('@/components/StageGame'), { ssr: false });

type Session = {
  id: string;
  topic: string;
  name: string;
  theme: string;
  intensity: number;
  character: string;
  crowd_work?: string[];
};

type Character = {
  id: string;
  hair: string;
  skin: string;
  top: string;
  trim: string;
  pants: string;
  shoes: string;
  accent: string;
};

type Heckler = {
  id: string;
  name: string;
  color: string;
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const CHARACTERS: Character[] = [
  { id: 'rookie', hair: '#111820', skin: '#f0aa78', top: '#5c2c84', trim: '#b987ff', pants: '#1d2229', shoes: '#f04b6d', accent: '#9a47ff' },
  { id: 'beanie', hair: '#422014', skin: '#f1a877', top: '#e84863', trim: '#ff95a9', pants: '#2b2f38', shoes: '#ffffff', accent: '#ff5574' },
  { id: 'prof', hair: '#7a3d1e', skin: '#ebb07d', top: '#27491e', trim: '#6ea64f', pants: '#26313b', shoes: '#e5e0d2', accent: '#5ee04b' },
  { id: 'blue', hair: '#0b5f9e', skin: '#e99b73', top: '#202326', trim: '#ff4f57', pants: '#202326', shoes: '#f1e7d4', accent: '#23b7ff' },
  { id: 'flare', hair: '#f1b62f', skin: '#e9a06c', top: '#d16822', trim: '#ffa04b', pants: '#23272e', shoes: '#cfd3da', accent: '#ffb02e' },
  { id: 'violet', hair: '#723e8e', skin: '#e7a476', top: '#252832', trim: '#9e58ff', pants: '#171a22', shoes: '#e8e0ff', accent: '#b75cff' },
];

const HECKLERS: Heckler[] = [
  { id: 'skeptic', name: 'Skeptic', color: '#61e02d' },
  { id: 'teen', name: 'Bored Teen', color: '#22b9f2' },
  { id: 'know_it_all', name: 'Know-It-All', color: '#ffcc25' },
  { id: 'classic_heckler', name: 'Classic Heckler', color: '#ff352d' },
  { id: 'nervous', name: 'Nervous One', color: '#a54cff' },
  { id: 'critic', name: 'Critic', color: '#d7d9df' },
];

const THEME_NAMES: Record<string, string> = {
  product_launch: 'Product Launch',
  corporate: 'Corporate Meeting',
  standup: 'Standup Comedy',
  stage_show: 'Stage Show',
};

function PixelAvatar({ character, live = false }: { character: Character; live?: boolean }) {
  const spriteIndex = Math.max(0, CHARACTERS.findIndex((item) => item.id === character.id));

  return (
    <div
      className={`sprite-shell sprite-large generated-character stage-avatar ${live ? 'is-live' : ''}`}
      style={{
        ['--sprite-x' as string]: `${spriteIndex * 20}%`,
        ['--character-sheet' as string]: `url("${assetPath('/sprites/stage-fear-characters.png')}")`,
      }}
      aria-label={character.id}
      role="img"
    >
      <span />
    </div>
  );
}

function SoundGlyph() {
  return <span className="sound-glyph"><i /><b /></span>;
}

type ReactionKind = 'boo' | 'cheer' | 'whisper' | 'murmur' | 'laugh';

function playTone(kind: ReactionKind) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const gain = ctx.createGain();
    gain.gain.value = kind === 'boo' ? 0.24 : kind === 'laugh' ? 0.18 : 0.12;
    gain.connect(ctx.destination);

    const notes =
      kind === 'boo' ? [180, 132, 92]
        : kind === 'laugh' ? [330, 390, 360, 420]
          : kind === 'cheer' ? [392, 523, 659, 784]
            : [150, 165, 145, 172];
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const envelope = ctx.createGain();
      const start = ctx.currentTime + index * 0.08;
      osc.type = kind === 'boo' ? 'sawtooth' : kind === 'cheer' ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(frequency, start);
      envelope.gain.setValueAtTime(0.001, start);
      envelope.gain.linearRampToValueAtTime(kind === 'boo' ? 0.28 : 0.16, start + 0.04);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.38);
      osc.connect(envelope);
      envelope.connect(gain);
      osc.start(start);
      osc.stop(start + 0.42);
    });

    setTimeout(() => ctx.close().catch(() => undefined), 1200);
  } catch {}
}

const REACTION_SFX: Record<ReactionKind, string> = {
  boo: assetPath('/sfx/crowd-boo.mp3'),
  cheer: assetPath('/sfx/crowd-cheer.mp3'),
  whisper: assetPath('/sfx/crowd-whisper.mp3'),
  murmur: assetPath('/sfx/crowd-murmur.mp3'),
  laugh: assetPath('/sfx/crowd-laugh.mp3'),
};

function StageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('id') || '';
  const soundEnabled = searchParams.get('sound') !== 'false';
  const crowdLevel = searchParams.get('crowd') || 'medium';
  const characterId = searchParams.get('character') || 'rookie';

  const [session, setSession] = useState<Session | null>(null);
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<'enter' | 'announce' | 'ready'>('enter');
  const [transcript, setTranscript] = useState<string[]>([]);
  const [activeHeckler, setActiveHeckler] = useState<string | null>(null);
  const [heckle, setHeckle] = useState<{ persona: string; text: string } | null>(null);
  const [crowdWork, setCrowdWork] = useState<string[]>([]);
  const [status, setStatus] = useState('Loading stage...');
  const [effectsVolume, setEffectsVolume] = useState(0.9);
  const [stageCrowdVolume, setStageCrowdVolume] = useState(
    crowdLevel === 'high' ? 0.58 : crowdLevel === 'low' ? 0.24 : 0.42,
  );
  const [micLevel, setMicLevel] = useState(0);
  const [gateState, setGateState] = useState<'idle' | 'quiet' | 'hearing' | 'sent'>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingActiveRef = useRef(false);
  const segmentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentLevelsRef = useRef<number[]>([]);
  const quietSinceRef = useRef<number | null>(null);
  const lastSilenceHeckleRef = useRef(0);
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const loadedRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const character = useMemo(
    () => CHARACTERS.find((item) => item.id === characterId) || CHARACTERS[0],
    [characterId],
  );

  const playMP3 = useCallback((base64Audio?: string | null, onFailed?: () => void) => {
    if (!base64Audio || !soundEnabled) return false;
    try {
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      const audio = new Audio(url);
      audio.volume = effectsVolume;
      const ambience = ambienceRef.current;
      const previousAmbienceVolume = ambience?.volume;
      if (ambience && typeof previousAmbienceVolume === 'number') {
        ambience.volume = Math.min(previousAmbienceVolume, Math.max(0.08, stageCrowdVolume * 0.38));
      }
      const restoreAmbience = () => {
        if (ambience && typeof previousAmbienceVolume === 'number') ambience.volume = previousAmbienceVolume;
      };
      audio.onended = restoreAmbience;
      audio.onerror = () => {
        restoreAmbience();
        onFailed?.();
      };
      audio.play().catch(() => {
        restoreAmbience();
        onFailed?.();
      });
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return true;
    } catch {
      onFailed?.();
      return false;
    }
  }, [effectsVolume, soundEnabled, stageCrowdVolume]);

  const speakFallback = useCallback((text: string, persona?: string) => {
    if (!soundEnabled || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const style = {
      skeptic: { rate: 0.94, pitch: 0.84 },
      teen: { rate: 1.16, pitch: 1.08 },
      know_it_all: { rate: 1.02, pitch: 1.0 },
      classic_heckler: { rate: 1.12, pitch: 0.72 },
      nervous: { rate: 1.22, pitch: 1.28 },
      critic: { rate: 0.88, pitch: 0.72 },
    }[persona || 'classic_heckler'] || { rate: 1.04, pitch: 0.9 };
    utterance.rate = style.rate;
    utterance.pitch = style.pitch;
    utterance.volume = effectsVolume;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [effectsVolume, soundEnabled]);

  const playStageSfx = useCallback((src: string, volume = effectsVolume) => {
    if (!soundEnabled) return false;
    try {
      const audio = new Audio(src);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }, [effectsVolume, soundEnabled]);

  const startAmbience = useCallback(() => {
    if (!soundEnabled || ambienceRef.current) return;
    const audio = new Audio(assetPath('/sfx/crowd-ambience.mp3'));
    audio.loop = true;
    audio.volume = stageCrowdVolume;
    ambienceRef.current = audio;
    audio.play().catch(() => undefined);
  }, [soundEnabled, stageCrowdVolume]);

  const stopAmbience = useCallback(() => {
    ambienceRef.current?.pause();
    ambienceRef.current = null;
  }, []);

  useEffect(() => {
    if (ambienceRef.current) ambienceRef.current.volume = soundEnabled ? stageCrowdVolume : 0;
  }, [soundEnabled, stageCrowdVolume]);

  const sendAudioBlob = useCallback((blob: Blob, mimeType: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || blob.size === 0) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const audio = result.includes(',') ? result.split(',')[1] : result;
      wsRef.current?.send(JSON.stringify({ type: 'audio_chunk', audio, mime_type: mimeType }));
    };
    reader.readAsDataURL(blob);
  }, []);

  const startVoiceMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.18;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const samples = new Uint8Array(analyser.fftSize);
      levelTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const value = (samples[index] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / samples.length);
        segmentLevelsRef.current.push(rms);
        setMicLevel(Math.min(1, rms * 18));
        if (recordingActiveRef.current) {
          const now = Date.now();
          const isHearing = rms > 0.018;
          setGateState(isHearing ? 'hearing' : 'quiet');
          if (isHearing) {
            quietSinceRef.current = null;
          } else {
            quietSinceRef.current ??= now;
            const silentFor = now - quietSinceRef.current;
            if (
              silentFor > 6200
              && now - lastSilenceHeckleRef.current > 11000
              && wsRef.current?.readyState === WebSocket.OPEN
            ) {
              lastSilenceHeckleRef.current = now;
              wsRef.current.send(JSON.stringify({
                type: 'silence_prompt',
                silent_for: Math.round(silentFor / 1000),
              }));
            }
          }
        }
      }, 80);
    } catch {
      analyserRef.current = null;
    }
  }, []);

  const stopVoiceMeter = useCallback(() => {
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    levelTimerRef.current = null;
    analyserRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    segmentLevelsRef.current = [];
    quietSinceRef.current = null;
    lastSilenceHeckleRef.current = 0;
    setMicLevel(0);
    setGateState('idle');
  }, []);

  const segmentHasVoice = useCallback(() => {
    if (!analyserRef.current) return true;
    const levels = segmentLevelsRef.current;
    if (levels.length < 6) return false;
    const max = Math.max(...levels);
    const avg = levels.reduce((total, level) => total + level, 0) / levels.length;
    const activeFrames = levels.filter((level) => level > 0.018).length;
    const hasVoice = max > 0.028 && avg > 0.006 && activeFrames >= 4;
    setGateState(hasVoice ? 'sent' : 'quiet');
    return hasVoice;
  }, []);

  const startRecordingSegment = useCallback(function recordSegment() {
    if (!recordingActiveRef.current || !streamRef.current) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const chunks: Blob[] = [];
    segmentLevelsRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = () => {
      if (chunks.length > 0 && segmentHasVoice()) {
        sendAudioBlob(new Blob(chunks, { type: mimeType }), mimeType);
      }
      if (recordingActiveRef.current) {
        segmentTimeoutRef.current = setTimeout(recordSegment, 120);
      }
    };

    recorder.start();
    segmentTimeoutRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, 3200);
  }, [segmentHasVoice, sendAudioBlob]);

  useEffect(() => {
    if (!sessionId || loadedRef.current) return;
    loadedRef.current = true;

    const load = async () => {
      try {
        const data = await getSession(sessionId);
        setSession(data);
        setCrowdWork(data.crowd_work || []);
        setStatus('Walking on stage...');

        setTimeout(() => {
          setPhase('announce');
          setStatus('Announcer warming up...');
        }, 3050);

        setTimeout(async () => {
          try {
            const welcome = await getWelcomeAudio(sessionId);
            if (welcome.audio && soundEnabled) {
              const audio = new Audio(`data:audio/mpeg;base64,${welcome.audio}`);
              audio.volume = 0.86 * effectsVolume;
              audio.onended = () => {
                setPhase('ready');
                setStatus('Mic check ready.');
                startAmbience();
                playStageSfx(assetPath('/sfx/crowd-cheer.mp3'), Math.min(1, effectsVolume * 0.7)) || (soundEnabled && playTone('cheer'));
              };
              audio.play().catch(() => {
                setPhase('ready');
                setStatus('Mic check ready.');
                startAmbience();
              });
            } else {
              setPhase('ready');
              setStatus('Mic check ready.');
              startAmbience();
            }
          } catch {
            setPhase('ready');
            setStatus('Mic check ready.');
            startAmbience();
          }
        }, 3950);
      } catch {
        setStatus('Session not found.');
      }
    };

    load();
  }, [effectsVolume, playStageSfx, sessionId, soundEnabled, startAmbience]);

  const handleSocketMessage = useCallback((event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === 'transcript') {
        setTranscript((lines) => [...lines, data.text].slice(-14));
        setTimeout(() => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 20);
      }
      if (data.type === 'heckle') {
        const persona = data.persona || 'classic_heckler';
        const reaction = (data.reaction || 'laugh') as ReactionKind;
        setActiveHeckler(persona);
        setHeckle({ persona, text: data.text });
        const startedAudio = playMP3(data.audio, () => speakFallback(data.text, persona));
        if (!startedAudio) speakFallback(data.text, persona);
        const reactionChance = Math.min(0.72, 0.28 + (session?.intensity || 3) * 0.065);
        if (Math.random() < reactionChance) {
          window.setTimeout(() => {
            const sfx = REACTION_SFX[reaction] || REACTION_SFX.laugh;
            const volume = reaction === 'whisper' || reaction === 'murmur'
              ? Math.min(0.34, effectsVolume * 0.28)
              : Math.min(0.48, effectsVolume * 0.42);
            playStageSfx(sfx, volume) || (soundEnabled && playTone(reaction));
          }, 420 + Math.random() * 720);
        }
        setTimeout(() => {
          setActiveHeckler(null);
          setHeckle(null);
        }, 4600);
      }
  }, [effectsVolume, playMP3, playStageSfx, session?.intensity, soundEnabled, speakFallback]);

  const ensureWebSocket = useCallback(() => {
    if (!sessionId) return null;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      wsRef.current.onmessage = handleSocketMessage;
      return wsRef.current;
    }
    const ws = createWebSocket(sessionId);
    ws.onmessage = handleSocketMessage;
    wsRef.current = ws;
    return ws;
  }, [handleSocketMessage, sessionId]);

  useEffect(() => {
    const ws = ensureWebSocket();
    return () => {
      if (!ws) return;
      try {
        ws.close();
      } catch {}
    };
  }, [ensureWebSocket]);

  const startMic = useCallback(async () => {
    try {
      const ws = ensureWebSocket();
      if (!ws) {
        setStatus('Session not ready.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      startVoiceMeter(stream);
      recordingActiveRef.current = true;
      setRecording(true);
      setGateState('quiet');
      setStatus('Live. Keep talking through the interruptions.');
      startAmbience();
      startRecordingSegment();
    } catch {
      setStatus('Mic permission failed.');
      startAmbience();
    }
  }, [ensureWebSocket, startAmbience, startRecordingSegment, startVoiceMeter]);

  const stopMic = useCallback(() => {
    recordingActiveRef.current = false;
    if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
    segmentTimeoutRef.current = null;
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setTimeout(() => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      stopVoiceMeter();
    }, 250);
    setRecording(false);
    setGateState('idle');
    setStatus('Paused. Crowd ambience stays live.');
    startAmbience();
  }, [startAmbience, stopVoiceMeter]);

  const exitStage = () => {
    stopMic();
    stopAmbience();
    wsRef.current?.send(JSON.stringify({ type: 'end_session' }));
    try {
      wsRef.current?.close();
    } catch {}
    router.push('/');
  };

  const activeHecklerName = HECKLERS.find((item) => item.id === activeHeckler)?.name || heckle?.persona.replace(/_/g, ' ');
  const themeTitle = THEME_NAMES[session?.theme || 'product_launch'];
  const characterIndex = Math.max(0, CHARACTERS.findIndex((item) => item.id === character.id));

  return (
    <main className={`live-stage theme-${session?.theme || 'product_launch'}`}>
      <div className="scanlines" />
      <header className="stage-hud">
        <div className="hud-brand">Stage Fear</div>
        <div className="hud-topic">{session?.topic || 'Loading topic'}</div>
        <button onClick={exitStage}>Exit</button>
      </header>

      <section className="stage-scene">
        <StageGame
          characterIndex={characterIndex}
          activeHeckler={activeHeckler}
          recording={recording}
          phase={phase}
          themeTitle={themeTitle}
        />

        {heckle && (
          <div className="heckle-bubble">
            <b>{activeHecklerName}</b>
            <span>{heckle.text}</span>
          </div>
        )}

        {phase !== 'ready' && (
          <div className="announcer-card">
            <b>{status}</b>
            <span>{session?.name || searchParams.get('name') || 'Speaker'} enters the room.</span>
          </div>
        )}

        {phase === 'ready' && crowdWork.length > 0 && transcript.length === 0 && (
          <div className="crowd-work">
            {crowdWork.slice(0, 3).map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
          </div>
        )}
      </section>

      <aside className="transcript-console">
        <header>
          <span>{recording ? 'Realtime STT' : 'Transcript'}</span>
          <b>{recording ? 'Recording' : 'Paused'}</b>
        </header>
        <div>
          {transcript.length === 0 ? <p>&gt; Waiting for your first line...</p> : transcript.map((line, index) => <p key={`${line}-${index}`}>&gt; {line}</p>)}
          <div ref={transcriptEndRef} />
        </div>
      </aside>

      <section className="stage-hecklers">
        {HECKLERS.map((heckler) => (
          <article key={heckler.id} className={activeHeckler === heckler.id ? 'is-active' : ''} style={{ ['--heckler' as string]: heckler.color }}>
            <span>{heckler.name}</span>
            <SoundGlyph />
          </article>
        ))}
      </section>

      <footer className="stage-controls">
        <div>
          <b>{status}</b>
          <span>Intensity {session?.intensity || 3}/5</span>
        </div>
        <div className={`mic-readout is-${gateState}`}>
          <span>{gateState === 'sent' ? 'STT sent' : gateState === 'hearing' ? 'Voice detected' : gateState === 'quiet' ? 'Speak louder' : 'Mic idle'}</span>
          <i>
            <b style={{ width: `${Math.max(4, Math.round(micLevel * 100))}%` }} />
          </i>
        </div>
        <label className="stage-mix">
          <span>Crowd</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={stageCrowdVolume}
            onChange={(event) => setStageCrowdVolume(Number(event.target.value))}
          />
        </label>
        <label className="stage-mix">
          <span>Voices</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={effectsVolume}
            onChange={(event) => setEffectsVolume(Number(event.target.value))}
          />
        </label>
        {phase === 'ready' && (
          <button className={recording ? 'stop' : 'start'} onClick={recording ? stopMic : startMic}>
            {recording ? 'Stop Mic' : 'Start Speaking'}
          </button>
        )}
      </footer>
    </main>
  );
}

export default function StagePage() {
  return (
    <Suspense fallback={<main className="loading-stage">Loading Stage...</main>}>
      <StageContent />
    </Suspense>
  );
}
