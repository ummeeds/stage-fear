'use client';
import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getSession, getWelcomeAudio, createWebSocket } from '@/lib/api';

const STAGE_THEMES: Record<string, { bg: string; stage: string; curtain: string; floor: string; spotlight: string }> = {
  product_launch: { bg: '#0a1628', stage: '#1a3a5c', curtain: '#0d2137', floor: '#1a1a2e', spotlight: '#3498db' },
  corporate: { bg: '#1a1a24', stage: '#2c3e50', curtain: '#1a252f', floor: '#2c2c3a', spotlight: '#95a5a6' },
  standup: { bg: '#1a0a0a', stage: '#2c1a1a', curtain: '#8b0000', floor: '#1a1a1a', spotlight: '#e74c3c' },
  stage_show: { bg: '#0a0a1a', stage: '#1a1a3a', curtain: '#4a0e4e', floor: '#2a1a3a', spotlight: '#9b59b6' },
};
const PALETTE: Record<number, string> = { 0: 'transparent', 1: '#1a1a2e', 2: '#e94560', 3: '#f5c518', 4: '#f5c518', 5: '#2ecc71' };

const P_SPEAKER = [
  [0,0,0,1,1,1,1,0,0,0],[0,0,1,3,3,3,3,1,0,0],[0,1,3,3,3,3,3,3,1,0],[0,1,3,3,3,3,3,3,1,0],[0,1,1,1,1,1,1,1,1,0],[1,1,2,2,1,1,2,2,1,1],[0,0,1,2,2,2,2,1,0,0],[0,0,1,2,2,2,2,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],
];
const P_MAN = [
  [0,0,1,1,1,1,1,1,0,0],[0,1,2,2,2,2,2,2,1,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,0,0,0,0,0,0,0],[1,1,3,3,3,1,3,3,1,1],[0,1,3,3,3,3,3,3,1,0],[0,0,1,3,3,3,3,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],
];
const P_MAN2 = [
  [0,0,1,1,1,1,1,1,0,0],[0,1,5,5,5,5,5,5,1,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,0,0,0,0,0,0,0],[1,1,2,2,2,1,2,2,1,1],[0,1,2,2,2,2,2,2,1,0],[0,0,1,2,2,2,2,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],
];
const P_MAN3 = [
  [0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[1,1,3,3,3,1,3,3,1,1],[0,1,3,3,3,3,3,3,1,0],[0,0,1,3,3,3,3,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],
];
const NAMES = [P_MAN, P_MAN2, P_MAN3];

function Pix({ sprite, s = 3, glow = false }: { sprite: number[][]; s?: number; glow?: boolean }) {
  const px = Math.max(2, s);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sprite[0].length}, ${px}px)`, gridTemplateRows: `repeat(${sprite.length}, ${px}px)`, gap: 0, filter: glow ? 'brightness(1.5) drop-shadow(0 0 6px #f5c518)' : 'none', transition: 'filter 0.2s' }}>
      {sprite.flat().map((c, i) => <div key={i} style={{ width: px, height: px, background: PALETTE[c] || (c === 0 ? 'transparent' : '#666') }} />)}
    </div>
  );
}

let globalAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    globalAudioCtx = new AudioContext();
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume();
  }
  return globalAudioCtx;
}

function playSynth(type: 'cheer' | 'heckle' | 'boo', volume = 0.15) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);

    if (type === 'cheer') {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        const t = now + i * 0.1;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.3, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 1.5);
      });
      for (let i = 0; i < 8; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = 800 + Math.random() * 400;
        const t = now + Math.random() * 0.5;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.15, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 0.8);
      }
    } else if (type === 'boo') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(300, now);
      o.frequency.linearRampToValueAtTime(150, now + 0.4);
      g.gain.setValueAtTime(0.2, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      o.connect(g);
      g.connect(master);
      o.start(now);
      o.stop(now + 0.5);
    } else if (type === 'heckle') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = 400;
      g.gain.setValueAtTime(0.1, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.connect(g);
      g.connect(master);
      o.start(now);
      o.stop(now + 0.15);
    }
  } catch (e) {
    console.error('[SFX] error:', e);
  }
}

function playMP3(b64: string | null) {
  if (!b64) { console.log('[MP3] no audio data'); return; }
  try {
    console.log('[MP3] playing audio, length:', b64.length);
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mp3' }));
    const a = new Audio(url);
    a.volume = 0.7;
    a.play().then(() => console.log('[MP3] playing')).catch(e => console.error('[MP3] play error:', e));
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  } catch (e) {
    console.error('[MP3] error:', e);
  }
}

function startCrowdAmbience(intensity: number): () => void {
  try {
    const ctx = getAudioCtx();
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400 + intensity * 100;
    const gain = ctx.createGain();
    gain.gain.value = 0.02 + intensity * 0.005;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    return () => {
      try { source.stop(); } catch {}
    };
  } catch {
    return () => {};
  }
}

function StageContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const sid = sp.get('id');
  const speakerName = sp.get('name') || 'Speaker';

  const [session, setSession] = useState<any>(null);
  const [rec, setRec] = useState(false);
  const [conn, setConn] = useState(false);
  const [hIdx, setHIdx] = useState<number | null>(null);
  const [lastH, setLastH] = useState('');
  const [transcript, setTranscript] = useState<string[]>([]);
  const [crowdWork, setCrowdWork] = useState<string[]>([]);
  const [showCrowd, setShowCrowd] = useState(true);
  const [theme, setTheme] = useState(STAGE_THEMES.product_launch);
  const [speaking, setSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const msRef = useRef<MediaStream | null>(null);
  const transEnd = useRef<HTMLDivElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedRef = useRef(false);
  const crowdStopRef = useRef<(() => void) | null>(null);

  const sendAccumulatedAudio = useCallback(() => {
    if (chunksRef.current.length === 0 || wsRef.current?.readyState !== WebSocket.OPEN) return;
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    chunksRef.current = [];
    const r = new FileReader();
    r.onloadend = () => {
      const b64 = (r.result as string).split(',')[1];
      wsRef.current?.send(JSON.stringify({ type: 'audio_chunk', audio: b64 }));
      console.log('[SEND] sent audio, size:', b64.length);
    };
    r.readAsDataURL(blob);
  }, []);

  useEffect(() => {
    if (!sid || loadedRef.current) return;
    loadedRef.current = true;

    const loadSession = async () => {
      const s = await getSession(sid);
      console.log('[Session] loaded:', s);
      setSession(s);
      setTheme(STAGE_THEMES[s.theme] || STAGE_THEMES.product_launch);
      setCrowdWork(s.crowd_work || []);
      setTimeout(() => {
        playSynth('cheer', 0.3);
        startCrowd(s.intensity || 3);
      }, 100);
      try {
        const w = await getWelcomeAudio(sid);
        console.log('[Welcome] audio:', w.audio ? 'received' : 'none');
        if (w.audio) {
          playMP3(w.audio);
          const a = new Audio('/sfx/crowd-cheer.mp3');
          a.volume = 0.6;
          setTimeout(() => a.play().catch(() => {}), 500);
        }
      } catch (e) {
        console.error('[Welcome] error:', e);
      }
    };
    loadSession();
  }, [sid]);

  useEffect(() => {
    if (!sid) return;
    const ws = createWebSocket(sid); wsRef.current = ws;
    ws.onopen = () => setConn(true);
    ws.onclose = () => setConn(false);
    ws.onmessage = ev => {
      const d = JSON.parse(ev.data);
      console.log('[WS] message type:', d.type, d);
      if (d.type === 'transcript') {
        setTranscript(prev => { const n = [...prev, d.text]; return n.slice(-25); });
        setTimeout(() => transEnd.current?.scrollIntoView({ behavior: 'smooth' }), 30);
      }
      if (d.type === 'heckle') {
        console.log('[WS] heckle received:', d.text, 'audio:', d.audio ? 'present' : 'null');
        setLastH(d.text); setHIdx(d.position);
        setTimeout(() => { setHIdx(null); setLastH(''); }, 3000);
        playMP3(d.audio);
        playSynth('boo', 0.1);
      }
    };
    return () => { ws.close(); stopMic(); };
  }, [sid]);

  const startCrowd = (lvl: number) => {
    if (crowdStopRef.current) return;
    crowdStopRef.current = startCrowdAmbience(lvl);
  };
  const stopCrowd = () => {
    if (crowdStopRef.current) { crowdStopRef.current(); crowdStopRef.current = null; }
  };

  const startMic = useCallback(async () => {
    stopCrowd();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      msRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      mrRef.current = mr;
      sendTimerRef.current = setInterval(sendAccumulatedAudio, 3000);
      setRec(true); setShowCrowd(false); setSpeaking(true);
      playSynth('cheer', 0.3);
    } catch {}
  }, [sendAccumulatedAudio]);

  const stopMic = useCallback(() => {
    mrRef.current?.stop();
    msRef.current?.getTracks().forEach(t => t.stop());
    if (sendTimerRef.current) { clearInterval(sendTimerRef.current); sendTimerRef.current = null; }
    sendAccumulatedAudio();
    chunksRef.current = [];
    setRec(false); setSpeaking(false);
    startCrowd(session?.intensity || 3);
  }, [sendAccumulatedAudio, session?.intensity]);

  const endSession = () => { stopMic(); wsRef.current?.send(JSON.stringify({ type: 'end_session' })); wsRef.current?.close(); stopCrowd(); router.push('/'); };

  return (
    <div className="screen" style={{ background: `linear-gradient(180deg, ${theme.bg} 0%, ${theme.stage} 100%)`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', bottom: '32%', left: '5%', right: '5%', height: 'clamp(50px, 12vw, 100px)', background: `linear-gradient(180deg, ${theme.stage} 0%, ${theme.floor} 100%)`, borderTop: `4px solid ${theme.spotlight}`, boxShadow: `0 0 60px ${theme.spotlight}33`, borderRadius: '8px 8px 0 0', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', width: 'clamp(60px, 20vw, 150px)', height: 3, background: theme.spotlight, boxShadow: `0 0 24px ${theme.spotlight}` }} />
        <div style={{ animation: speaking ? 'pixel-bounce 0.5s ease-in-out infinite' : 'float 2.5s ease-in-out infinite', transform: 'scale(1.8)', filter: 'drop-shadow(0 0 10px #e94560)' }}><Pix sprite={P_SPEAKER} s={4} glow={speaking} /></div>
        <div style={{ position: 'absolute', bottom: 4, fontSize: 7, fontFamily: "'Press Start 2P', monospace", color: '#2ecc71', animation: speaking ? 'pixel-blink 1s infinite' : 'none', opacity: speaking ? 1 : 0 }}>LIVE</div>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 'clamp(16px, 5vw, 40px)', height: '68%', background: `linear-gradient(90deg, ${theme.curtain}, ${theme.curtain}dd)`, zIndex: 15 }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: 'clamp(16px, 5vw, 40px)', height: '68%', background: `linear-gradient(270deg, ${theme.curtain}, ${theme.curtain}dd)`, zIndex: 15 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '32%', background: `linear-gradient(180deg, ${theme.floor}88 0%, #060606 100%)`, zIndex: 5, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 'clamp(2px, 0.5vw, 8px) clamp(4px, 1vw, 12px)', gap: 'clamp(1px, 0.3vw, 4px)' }}>
        {[0, 1, 2].map(row => (
          <div key={row} style={{ display: 'flex', justifyContent: 'space-evenly', opacity: 0.4 + row * 0.25 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(col => {
              const idx = row * 8 + col, s = NAMES[idx % 3];
              return <div key={col} style={{ animation: hIdx === idx ? 'shake 0.1s ease-in-out infinite' : `float ${2.5 + idx * 0.2}s ease-in-out infinite` }}><Pix sprite={s} s={3} glow={hIdx === idx} /></div>;
            })}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)', width: 'clamp(240px, 75vw, 520px)', zIndex: 25 }}>
        <div style={{ background: '#0a0a0add', border: '2px solid #2a2a2a', borderRadius: 4, padding: 'clamp(4px, 1vw, 10px)', maxHeight: 'clamp(80px, 18vh, 150px)', overflowY: 'auto', scrollbarWidth: 'none' }}>
          {transcript.length === 0 ? (
            <div style={{ fontSize: 'clamp(7px, 1vw, 9px)', color: '#333', textAlign: 'center', padding: '12px 0', fontFamily: "'Press Start 2P', monospace" }}>&gt; WAITING...</div>
          ) : (
            transcript.map((line, i) => <div key={i} style={{ fontSize: 'clamp(7px, 1.2vw, 10px)', color: i === transcript.length - 1 ? '#e94560' : '#555', fontFamily: "'Press Start 2P', monospace", padding: '2px 0', lineHeight: 1.8 }}>&gt; {line}</div>)
          )}
          <div ref={transEnd} />
        </div>
      </div>
      {lastH && (
        <div style={{ position: 'absolute', top: '28%', left: '50%', transform: 'translateX(-50%)', zIndex: 35, animation: 'slide-down 0.3s ease-out', pointerEvents: 'none' }}>
          <div style={{ background: '#1a1a2e', border: '2px solid #f5c518', padding: 'clamp(4px, 1vw, 8px) clamp(8px, 2vw, 16px)', fontSize: 'clamp(7px, 1.2vw, 10px)', color: '#f5c518', fontFamily: "'Press Start 2P', monospace", textAlign: 'center', maxWidth: 'clamp(200px, 60vw, 480px)', boxShadow: '0 0 20px #f5c51833' }}>{lastH}</div>
        </div>
      )}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, background: conn ? '#2ecc71' : '#e74c3c', animation: conn ? 'pixel-blink 1.5s infinite' : 'none' }} />
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(5px, 0.7vw, 7px)', color: '#666' }}>{conn ? 'LIVE' : 'OFF'}</span>
        </div>
        <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(5px, 0.7vw, 7px)', color: '#444', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{speakerName}</span>
        <button className="pixel-btn danger" onClick={endSession} style={{ fontSize: 7, padding: '4px 8px', fontFamily: "'Press Start 2P', monospace" }}>EXIT</button>
      </div>
      {showCrowd && crowdWork.length > 0 && (
        <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
          <h3 style={{ fontSize: 'clamp(8px, 1.3vw, 11px)', color: '#f5c518', fontFamily: "'Press Start 2P', monospace" }}>CROWD REACTS</h3>
          {crowdWork.map((m, i) => <div key={i} className="pixel-card" style={{ fontSize: 'clamp(7px, 1vw, 9px)', fontFamily: "'Press Start 2P', monospace", animation: `slide-up 0.4s ease-out ${i * 0.25}s both`, maxWidth: 'clamp(200px, 55vw, 380px)' }}>{m}</div>)}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: '35%', left: '50%', transform: 'translateX(-50%)', zIndex: 30 }}>
        {!rec ? (
          <button className="pixel-btn success" onClick={startMic} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(7px, 1.1vw, 10px)', padding: '10px 20px', background: '#2ecc71', borderColor: '#2ecc71', color: '#0a0a0a', boxShadow: '0 0 30px #2ecc7155', animation: 'pulse-glow 3s ease-in-out infinite' }}>START SPEAKING</button>
        ) : (
          <button className="pixel-btn danger" onClick={stopMic} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(7px, 1.1vw, 10px)', padding: '10px 20px' }}>STOP</button>
        )}
      </div>
      <div style={{ position: 'absolute', top: '50%', right: 'clamp(2px, 0.8vw, 8px)', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 2, zIndex: 20 }}>
        {[5,4,3,2,1].map(lvl => <div key={lvl} style={{ width: 5, height: 10, background: lvl <= (session?.intensity || 3) ? `hsl(${120 - lvl * 25}, 65%, 45%)` : '#1a1a1a', border: '1px solid #2a2a2a', opacity: lvl <= (session?.intensity || 3) ? 1 : 0.3 }} />)}
      </div>
    </div>
  );
}

export default function StagePage() {
  return <Suspense fallback={<div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#444', animation: 'pixel-blink 1s infinite' }}>LOADING...</div></div>}><StageContent /></Suspense>;
}
