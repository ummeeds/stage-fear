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

const PIXEL_SPRITES: Record<string, number[][]> = {
  man1: [
    [0,0,1,1,1,1,1,1,0,0],[0,1,2,2,2,2,2,2,1,0],[0,0,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0],[1,1,3,3,3,1,3,3,1,1],[0,1,3,3,3,3,3,3,1,0],
    [0,0,1,3,3,3,3,1,0,0],[0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,4,4,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],
  ],
  man2: [
    [0,0,1,1,1,1,1,1,0,0],[0,1,5,5,5,5,5,5,1,0],[0,0,1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0],[1,1,2,2,2,1,2,2,1,1],[0,1,2,2,2,2,2,2,1,0],
    [0,0,1,2,2,2,2,1,0,0],[0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,4,4,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],
  ],
  man3: [
    [0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,0,0,0],[1,1,3,3,3,1,3,3,1,1],[0,1,3,3,3,3,3,3,1,0],
    [0,0,1,3,3,3,3,1,0,0],[0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,4,4,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],
  ],
  speaker: [
    [0,0,0,1,1,1,1,0,0,0],[0,0,1,3,3,3,3,1,0,0],[0,1,3,3,3,3,3,3,1,0],
    [0,1,3,3,3,3,3,3,1,0],[0,1,1,1,1,1,1,1,1,0],[1,1,2,2,1,1,2,2,1,1],
    [0,0,1,2,2,2,2,1,0,0],[0,0,1,2,2,2,2,1,0,0],[0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,4,4,1,0,0,0],[0,0,0,1,4,4,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],
  ],
};
const PALETTE: Record<number, string> = { 0: 'transparent', 1: '#1a1a2e', 2: '#e94560', 3: '#f5c518', 4: '#f5c518', 5: '#2ecc71' };

function PixelSprite({ name = 'man1', s = 3, glow = false }: { name?: string; s?: number; glow?: boolean }) {
  const sprite = PIXEL_SPRITES[name] || PIXEL_SPRITES.man1;
  const w = sprite[0]?.length || 10, h = sprite.length, px = Math.max(2, s);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${w}, ${px}px)`, gridTemplateRows: `repeat(${h}, ${px}px)`, gap: 0, filter: glow ? 'brightness(1.5) drop-shadow(0 0 6px #f5c518)' : 'none', transition: 'filter 0.2s' }}>
      {sprite.flat().map((c, i) => <div key={i} style={{ width: px, height: px, background: PALETTE[c] || (c === 0 ? 'transparent' : '#666') }} />)}
    </div>
  );
}
function CrowdGuy({ idx, heckling }: { idx: number; heckling: boolean }) {
  return <div style={{ animation: heckling ? 'shake 0.1s ease-in-out infinite' : `float ${2.5 + idx * 0.2}s ease-in-out infinite` }}><PixelSprite name={['man1','man2','man3'][idx % 3]} s={3} glow={heckling} /></div>;
}

function playBeep(type: string) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === 'heckle') { osc.type = 'square'; osc.frequency.setValueAtTime(600, ctx.currentTime); osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.2); gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25); osc.start(); osc.stop(ctx.currentTime + 0.25); }
    else if (type === 'boo') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, ctx.currentTime); gain.gain.setValueAtTime(0.08, ctx.currentTime); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5); osc.start(); osc.stop(ctx.currentTime + 0.5); }
    setTimeout(() => { osc.disconnect(); gain.disconnect(); ctx.close(); }, 600);
  } catch {}
}

function playCrowdSFX(sessionIntensity: number) {
  try {
    const ctx = new AudioContext();
    const masterGain = ctx.createGain(); masterGain.gain.value = 0.3; masterGain.connect(ctx.destination);

    for (let i = 0; i < 8; i++) {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      const t = ctx.currentTime + Math.random() * 0.8;
      osc.type = 'square'; osc.frequency.value = 200 + Math.random() * 600;
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.06, t + 0.05); gain.gain.linearRampToValueAtTime(0, t + 0.15 + Math.random() * 0.3);
      osc.connect(gain); gain.connect(masterGain); osc.start(t); osc.stop(t + 0.3);
    }

    for (let i = 0; i < 12; i++) {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      const t = ctx.currentTime + Math.random() * 1.5;
      osc.type = 'triangle'; osc.frequency.value = 600 + Math.random() * 1200;
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.03, t + 0.03); gain.gain.linearRampToValueAtTime(0, t + 0.08);
      osc.connect(gain); gain.connect(masterGain); osc.start(t); osc.stop(t + 0.1);
    }

    const bose = ctx.createOscillator(); const bgain = ctx.createGain();
    bose.type = 'sawtooth'; bose.frequency.value = 80;
    bgain.gain.setValueAtTime(0, ctx.currentTime); bgain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.5); bgain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
    bose.connect(bgain); bgain.connect(masterGain); bose.start(ctx.currentTime); bose.stop(ctx.currentTime + 1.5);

    setTimeout(() => { bose.disconnect(); bgain.disconnect(); masterGain.disconnect(); ctx.close(); }, 3000);
  } catch {}
}

function playWAV(b64: string | null, fallback = 'heckle') {
  if (!b64) { playBeep(fallback); return; }
  try {
    const bin = atob(b64); const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mp3' }));
    const a = new Audio(url); a.volume = 0.7; a.play().catch(() => {});
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  } catch { playBeep(fallback); }
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
  const ambRef = useRef<AudioContext | null>(null);

  const startAmb = (lvl: number) => {
    if (ambRef.current) return;
    try {
      const ctx = new AudioContext(); const gain = ctx.createGain();
      gain.gain.value = 0.008 + lvl * 0.01; gain.connect(ctx.destination);
      const buf = ctx.createScriptProcessor(4096, 1, 1); let last = 0;
      buf.onaudioprocess = (e) => { const o = e.outputBuffer.getChannelData(0); for (let i = 0; i < 4096; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; o[i] = last * 3; } };
      buf.connect(gain); ambRef.current = ctx;
    } catch {}
  };
  const stopAmb = () => {
    ambRef.current?.close(); ambRef.current = null;
  };

  useEffect(() => {
    if (!sid) return;
    getSession(sid).then(async s => {
      setSession(s);
      setTheme(STAGE_THEMES[s.theme] || STAGE_THEMES.product_launch);
      setCrowdWork(s.crowd_work || []);
      playCrowdSFX(s.intensity);
      try { const w = await getWelcomeAudio(sid); if (w.audio) playWAV(w.audio); } catch {}
    });
  }, [sid]);

  useEffect(() => {
    if (!sid) return;
    const ws = createWebSocket(sid); wsRef.current = ws;
    ws.onopen = () => setConn(true);
    ws.onclose = () => setConn(false);
    ws.onmessage = ev => {
      const d = JSON.parse(ev.data);
      if (d.type === 'transcript') {
        setTranscript(prev => { const n = [...prev, d.text]; return n.slice(-25); });
        setTimeout(() => transEnd.current?.scrollIntoView({ behavior: 'smooth' }), 30);
      }
      if (d.type === 'heckle') {
        setLastH(d.text); setHIdx(d.position);
        setTimeout(() => { setHIdx(null); setLastH(''); }, 3000);
        playWAV(d.audio);
      }
    };
    return () => { ws.close(); stopMic(); stopAmb(); };
  }, [sid]);

  const startMic = useCallback(async () => {
    stopAmb();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      msRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      mr.ondataavailable = e => {
        if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const r = new FileReader();
          r.onloadend = () => { const b64 = (r.result as string).split(',')[1]; wsRef.current?.send(JSON.stringify({ type: 'audio_chunk', audio: b64 })); };
          r.readAsDataURL(e.data);
        }
      };
      mr.start(1200); mrRef.current = mr; setRec(true); setShowCrowd(false); setSpeaking(true);
    } catch {}
  }, []);

  const stopMic = useCallback(() => {
    mrRef.current?.stop(); msRef.current?.getTracks().forEach(t => t.stop());
    setRec(false); setSpeaking(false);
    startAmb(session?.intensity || 3);
  }, [session?.intensity]);

  const endSession = () => { stopMic(); wsRef.current?.send(JSON.stringify({ type: 'end_session' })); wsRef.current?.close(); router.push('/'); };

  return (
    <div className="screen" style={{ background: `linear-gradient(180deg, ${theme.bg} 0%, ${theme.stage} 100%)`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', bottom: '32%', left: '5%', right: '5%', height: 'clamp(50px, 12vw, 100px)', background: `linear-gradient(180deg, ${theme.stage} 0%, ${theme.floor} 100%)`, borderTop: `4px solid ${theme.spotlight}`, boxShadow: `0 0 60px ${theme.spotlight}33`, borderRadius: '8px 8px 0 0', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', width: 'clamp(60px, 20vw, 150px)', height: 3, background: theme.spotlight, boxShadow: `0 0 24px ${theme.spotlight}` }} />
        <div style={{ animation: speaking ? 'pixel-bounce 0.5s ease-in-out infinite' : 'float 2.5s ease-in-out infinite', transform: 'scale(1.8)', filter: 'drop-shadow(0 0 10px #e94560)' }}>
          <PixelSprite name="speaker" s={4} glow={speaking} />
        </div>
        <div style={{ position: 'absolute', bottom: 4, fontSize: 7, fontFamily: "'Press Start 2P', monospace", color: '#2ecc71', animation: speaking ? 'pixel-blink 1s infinite' : 'none', opacity: speaking ? 1 : 0 }}>LIVE</div>
      </div>

      <div style={{ position: 'absolute', top: 0, left: 0, width: 'clamp(16px, 5vw, 40px)', height: '68%', background: `linear-gradient(90deg, ${theme.curtain}, ${theme.curtain}dd)`, zIndex: 15 }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: 'clamp(16px, 5vw, 40px)', height: '68%', background: `linear-gradient(270deg, ${theme.curtain}, ${theme.curtain}dd)`, zIndex: 15 }} />

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '32%', background: `linear-gradient(180deg, ${theme.floor}88 0%, #060606 100%)`, zIndex: 5, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 'clamp(2px, 0.5vw, 8px) clamp(4px, 1vw, 12px)', gap: 'clamp(1px, 0.3vw, 4px)' }}>
        {[0, 1, 2].map(row => (
          <div key={row} style={{ display: 'flex', justifyContent: 'space-evenly', opacity: 0.4 + row * 0.25 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(col => <CrowdGuy key={col} idx={row * 8 + col} heckling={hIdx === row * 8 + col} />)}
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)', width: 'clamp(240px, 75vw, 520px)', zIndex: 25 }}>
        <div style={{ background: '#0a0a0add', border: '2px solid #2a2a2a', borderRadius: 4, padding: 'clamp(4px, 1vw, 10px)', maxHeight: 'clamp(80px, 18vh, 150px)', overflowY: 'auto', scrollbarWidth: 'none' }}>
          {transcript.length === 0 ? (
            <div style={{ fontSize: 'clamp(7px, 1vw, 9px)', color: '#333', textAlign: 'center', padding: '12px 0', fontFamily: "'Press Start 2P', monospace" }}>&gt; WAITING FOR SPEECH...</div>
          ) : (
            transcript.map((line, i) => (
              <div key={i} style={{ fontSize: 'clamp(7px, 1.2vw, 10px)', color: i === transcript.length - 1 ? '#e94560' : '#555', fontFamily: "'Press Start 2P', monospace", padding: '2px 0', lineHeight: 1.8 }}>&gt; {line}</div>
            ))
          )}
          <div ref={transEnd} />
        </div>
      </div>

      {lastH && (
        <div style={{ position: 'absolute', top: '28%', left: '50%', transform: 'translateX(-50%)', zIndex: 35, animation: 'slide-down 0.3s ease-out', pointerEvents: 'none' }}>
          <div style={{ background: '#1a1a2e', border: '2px solid #f5c518', padding: 'clamp(4px, 1vw, 8px) clamp(8px, 2vw, 16px)', fontSize: 'clamp(7px, 1.2vw, 10px)', color: '#f5c518', fontFamily: "'Press Start 2P', monospace", textAlign: 'center', maxWidth: 'clamp(200px, 60vw, 480px)', boxShadow: '0 0 20px #f5c51833' }}>
            {lastH}
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, background: conn ? '#2ecc71' : '#e74c3c', animation: conn ? 'pixel-blink 1.5s infinite' : 'none' }} />
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(5px, 0.7vw, 7px)', color: '#666' }}>{conn ? 'LIVE' : 'OFF'}</span>
        </div>
        <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(5px, 0.7vw, 7px)', color: '#444', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{speakerName || session?.topic || ''}</span>
        <button className="pixel-btn danger" onClick={endSession} style={{ fontSize: 7, padding: '4px 8px', fontFamily: "'Press Start 2P', monospace" }}>EXIT</button>
      </div>

      {showCrowd && crowdWork.length > 0 && (
        <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
          <h3 style={{ fontSize: 'clamp(8px, 1.3vw, 11px)', color: '#f5c518', fontFamily: "'Press Start 2P', monospace" }}>CROWD REACTS</h3>
          {crowdWork.map((m, i) => (
            <div key={i} className="pixel-card" style={{ fontSize: 'clamp(7px, 1vw, 9px)', fontFamily: "'Press Start 2P', monospace", animation: `slide-up 0.4s ease-out ${i * 0.25}s both`, maxWidth: 'clamp(200px, 55vw, 380px)' }}>{m}</div>
          ))}
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
        {[5,4,3,2,1].map(lvl => (
          <div key={lvl} style={{ width: 5, height: 10, background: lvl <= (session?.intensity || 3) ? `hsl(${120 - lvl * 25}, 65%, 45%)` : '#1a1a1a', border: '1px solid #2a2a2a', opacity: lvl <= (session?.intensity || 3) ? 1 : 0.3 }} />
        ))}
      </div>
    </div>
  );
}

export default function StagePage() {
  return (
    <Suspense fallback={<div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#444', animation: 'pixel-blink 1s infinite' }}>LOADING...</div></div>}>
      <StageContent />
    </Suspense>
  );
}
