'use client';
import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getSession, getWelcomeAudio, createWebSocket } from '@/lib/api';

const STAGE_THEMES: Record<string, { bg: string; stage: string; curtain: string; floor: string; spotlight: string }> = {
  product_launch: { bg: '#0f172a', stage: '#1e3a5f', curtain: '#0c1d33', floor: '#1e293b', spotlight: '#6366f1' },
  corporate: { bg: '#1a1a24', stage: '#2c3e50', curtain: '#1a252f', floor: '#2c2c3a', spotlight: '#94a3b8' },
  standup: { bg: '#1a0a0a', stage: '#2c1a1a', curtain: '#8b0000', floor: '#1a1a1a', spotlight: '#ef4444' },
  stage_show: { bg: '#0a0a1a', stage: '#1a1a3a', curtain: '#4a0e4e', floor: '#2a1a3a', spotlight: '#a855f7' },
};

const CHAR_COLORS: Record<string, { skin: string; shirt: string; pants: string; shoes: string; hair: string }> = {
  default: { skin: '#ffcc99', shirt: '#6366f1', pants: '#1e293b', shoes: '#334155', hair: '#4a3728' },
  ninja: { skin: '#ffcc99', shirt: '#1e1e2e', pants: '#1e1e2e', shoes: '#0f0f1a', hair: '#1e1e2e' },
  robot: { skin: '#94a3b8', shirt: '#64748b', pants: '#475569', shoes: '#334155', hair: '#64748b' },
  hero: { skin: '#ffcc99', shirt: '#ef4444', pants: '#1e293b', shoes: '#334155', hair: '#f59e0b' },
};

const SPEAKER_SPRITE = [
  [0,0,0,0,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,0],
  [0,0,0,1,2,2,2,2,1,0],
  [0,0,0,1,2,3,3,2,1,0],
  [0,0,0,1,2,2,2,2,1,0],
  [0,0,0,0,1,1,1,1,0,0],
  [0,0,0,0,0,1,1,0,0,0],
  [0,0,4,4,4,4,4,4,4,0],
  [0,0,4,4,4,4,4,4,4,0],
  [0,0,4,4,4,4,4,4,4,0],
  [0,0,0,5,5,5,5,5,0,0],
  [0,0,0,5,0,0,0,5,0,0],
];

const CROWD_SPRITE = [
  [0,0,0,0,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,0],
  [0,0,0,1,2,2,2,2,1,0],
  [0,0,0,1,2,3,3,2,1,0],
  [0,0,0,1,2,2,2,2,1,0],
  [0,0,0,0,1,1,1,1,0,0],
  [0,0,0,0,0,1,1,0,0,0],
  [0,0,4,4,4,4,4,4,4,0],
  [0,0,4,4,4,4,4,4,4,0],
  [0,0,4,4,4,4,4,4,4,0],
  [0,0,0,5,5,5,5,5,0,0],
  [0,0,0,5,0,0,0,5,0,0],
];

function Pix({ sprite, colors, size = 3, glow = false, mic = false }: { sprite: number[][]; colors: Record<string, string>; size?: number; glow?: boolean; mic?: boolean }) {
  const colorMap: Record<number, string> = {
    0: 'transparent',
    1: colors.hair,
    2: colors.skin,
    3: colors.shirt,
    4: colors.shirt,
    5: colors.pants,
  };
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        className="pixel-char"
        style={{
          gridTemplateColumns: `repeat(${sprite[0].length}, ${size}px)`,
          gridTemplateRows: `repeat(${sprite.length}, ${size}px)`,
          filter: glow ? `drop-shadow(0 0 8px ${colors.shirt})` : 'none',
        }}
      >
        {sprite.flat().map((c, i) => (
          <div key={i} style={{ background: colorMap[c] || 'transparent' }} />
        ))}
      </div>
      {mic && (
        <div style={{ position: 'absolute', right: -8, top: 12, width: 4, height: 16, background: '#64748b', borderRadius: 2 }}>
          <div style={{ width: 6, height: 6, background: '#94a3b8', borderRadius: '50%', position: 'absolute', top: -3, left: -1 }} />
        </div>
      )}
    </div>
  );
}

let globalAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    globalAudioCtx = new AudioContext();
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

function playBooSound() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, now);
    o.frequency.linearRampToValueAtTime(80, now + 0.5);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    o.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + 0.6);
  } catch {}
}

function playCheerSound() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);
    [523, 659, 784, 1047].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t = now + i * 0.12;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 1.2);
    });
  } catch {}
}

function StageContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const sid = sp.get('id');
  const speakerName = sp.get('name') || 'Speaker';
  const characterId = sp.get('character') || 'default';
  const charColors = CHAR_COLORS[characterId] || CHAR_COLORS.default;

  const [session, setSession] = useState<any>(null);
  const [rec, setRec] = useState(false);
  const [conn, setConn] = useState(false);
  const [hIdx, setHIdx] = useState<number | null>(null);
  const [lastH, setLastH] = useState('');
  const [lastHPersona, setLastHPersona] = useState('');
  const [transcript, setTranscript] = useState<string[]>([]);
  const [crowdWork, setCrowdWork] = useState<string[]>([]);
  const [showCrowd, setShowCrowd] = useState(true);
  const [theme, setTheme] = useState(STAGE_THEMES.product_launch);
  const [speaking, setSpeaking] = useState(false);
  const [stagePhase, setStagePhase] = useState<'entering' | 'spotlight' | 'crowd' | 'ready'>('entering');
  const [welcomeDone, setWelcomeDone] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const msRef = useRef<MediaStream | null>(null);
  const transEnd = useRef<HTMLDivElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedRef = useRef(false);
  const wsInitRef = useRef(false);
  const crowdAudioRef = useRef<HTMLAudioElement | null>(null);
  const crowdStopRef = useRef<(() => void) | null>(null);

  const sendAccumulatedAudio = useCallback(() => {
    if (chunksRef.current.length === 0 || wsRef.current?.readyState !== WebSocket.OPEN) return;
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    chunksRef.current = [];
    const r = new FileReader();
    r.onloadend = () => {
      const b64 = (r.result as string).split(',')[1];
      wsRef.current?.send(JSON.stringify({ type: 'audio_chunk', audio: b64 }));
    };
    r.readAsDataURL(blob);
  }, []);

  // Stage entrance animation sequence
  useEffect(() => {
    if (!sid || loadedRef.current) return;
    loadedRef.current = true;

    const loadSession = async () => {
      const s = await getSession(sid);
      setSession(s);
      setTheme(STAGE_THEMES[s.theme] || STAGE_THEMES.product_launch);
      setCrowdWork(s.crowd_work || []);

      // Phase 1: Character walks on stage (2.5s)
      setTimeout(() => {
        // Phase 2: Spotlight follows (1s)
        setStagePhase('spotlight');
        setTimeout(() => {
          // Phase 3: Crowd reveals (0.8s)
          setStagePhase('crowd');
          setTimeout(() => {
            // Phase 4: Ready - play welcome
            setStagePhase('ready');
            playCheerSound();
            startCrowdAmbience(s.intensity || 3);
          }, 800);
        }, 1000);
      }, 2500);

      // Welcome audio after entrance
      try {
        const w = await getWelcomeAudio(sid);
        if (w.audio) {
          const welcome = new Audio(`data:audio/mp3;base64,${w.audio}`);
          welcome.volume = 0.8;
          welcome.onended = () => {
            setWelcomeDone(true);
            // Play crowd cheer MP3 after welcome
            const cheer = new Audio('/sfx/crowd-cheer.mp3');
            cheer.volume = 0.5;
            cheer.play().catch(() => {});
          };
          welcome.play().catch(() => {});
        }
      } catch (e) {
        console.error('[Welcome] error:', e);
      }
    };
    loadSession();
  }, [sid]);

  // WebSocket connection
  useEffect(() => {
    if (!sid || wsInitRef.current) return;
    wsInitRef.current = true;
    const ws = createWebSocket(sid);
    wsRef.current = ws;
    ws.onopen = () => { setConn(true); };
    ws.onclose = () => { setConn(false); };
    ws.onerror = (e) => console.error('[WS] error:', e);
    ws.onmessage = ev => {
      const d = JSON.parse(ev.data);
      if (d.type === 'transcript') {
        setTranscript(prev => { const n = [...prev, d.text]; return n.slice(-25); });
        setTimeout(() => transEnd.current?.scrollIntoView({ behavior: 'smooth' }), 30);
      }
      if (d.type === 'heckle') {
        setLastH(d.text);
        setLastHPersona(d.persona);
        setHIdx(d.position);
        playMP3(d.audio);
        playBooSound();
        setTimeout(() => { setHIdx(null); setLastH(''); setLastHPersona(''); }, 4000);
      }
    };
    return () => { try { ws.close(); } catch {} };
  }, [sid]);

  const startCrowdAmbience = (intensity: number) => {
    try {
      const audio = new Audio('/sfx/crowd-ambience.mp3');
      audio.loop = true;
      audio.volume = 0.15 + intensity * 0.03;
      audio.play().catch(() => {});
      crowdAudioRef.current = audio;
    } catch {}
  };

  const stopCrowdAmbience = () => {
    if (crowdAudioRef.current) {
      crowdAudioRef.current.pause();
      crowdAudioRef.current = null;
    }
  };

  const startMic = useCallback(async () => {
    stopCrowdAmbience();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      msRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      mrRef.current = mr;
      sendTimerRef.current = setInterval(sendAccumulatedAudio, 2500);
      setRec(true);
      setShowCrowd(false);
      setSpeaking(true);
      // Immediate first heckle
      setTimeout(() => {
        setLastH("Oh great, another one...");
        setLastHPersona("classic_heckler");
        setHIdx(Math.floor(Math.random() * 24));
        playBooSound();
        setTimeout(() => { setHIdx(null); setLastH(''); setLastHPersona(''); }, 4000);
      }, 1000);
    } catch (e) {
      console.error('[Mic] error:', e);
    }
  }, [sendAccumulatedAudio]);

  const stopMic = useCallback(() => {
    mrRef.current?.stop();
    msRef.current?.getTracks().forEach(t => t.stop());
    if (sendTimerRef.current) { clearInterval(sendTimerRef.current); sendTimerRef.current = null; }
    sendAccumulatedAudio();
    chunksRef.current = [];
    setRec(false);
    setSpeaking(false);
    startCrowdAmbience(session?.intensity || 3);
  }, [sendAccumulatedAudio, session?.intensity]);

  const endSession = () => {
    stopMic();
    stopCrowdAmbience();
    wsRef.current?.send(JSON.stringify({ type: 'end_session' }));
    try { wsRef.current?.close(); } catch {}
    router.push('/');
  };

  const playMP3 = (b64: string | null) => {
    if (!b64) return;
    try {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mp3' }));
      const a = new Audio(url);
      a.volume = 0.8;
      a.play().catch(() => {});
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {}
  };

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: `linear-gradient(180deg, ${theme.bg} 0%, ${theme.stage} 100%)` }}>
      {/* Curtains */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '5%', height: '70%', background: `linear-gradient(90deg, ${theme.curtain}, ${theme.curtain}cc)`, zIndex: 15 }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: '5%', height: '70%', background: `linear-gradient(270deg, ${theme.curtain}, ${theme.curtain}cc)`, zIndex: 15 }} />

      {/* Stage */}
      <div style={{ position: 'absolute', bottom: '30%', left: '5%', right: '5%', height: 'clamp(60px, 12vw, 120px)', background: `linear-gradient(180deg, ${theme.stage} 0%, ${theme.floor} 100%)`, borderTop: `4px solid ${theme.spotlight}`, boxShadow: `0 0 80px ${theme.spotlight}33`, borderRadius: '8px 8px 0 0', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Spotlight */}
        {stagePhase !== 'entering' && (
          <div style={{ position: 'absolute', top: -1, left: '50%', width: 'clamp(80px, 25vw, 200px)', height: 4, background: theme.spotlight, boxShadow: `0 0 40px ${theme.spotlight}`, animation: stagePhase === 'spotlight' ? 'spotlight 1s ease-out forwards' : 'none', opacity: stagePhase === 'spotlight' ? 0 : 1, transform: 'translateX(-50%)' }} />
        )}
        {/* Speaker character */}
        <div style={{ animation: stagePhase === 'entering' ? 'walk 2.5s ease-out forwards' : speaking ? 'float 0.5s ease-in-out infinite' : 'float 2.5s ease-in-out infinite', transform: stagePhase === 'entering' ? 'none' : 'scale(2)', filter: `drop-shadow(0 0 ${speaking ? '15px' : '8px'} ${theme.spotlight})` }}>
          <Pix sprite={SPEAKER_SPRITE} colors={charColors} size={4} glow={speaking} mic={stagePhase !== 'entering'} />
        </div>
        {/* LIVE indicator */}
        {speaking && (
          <div style={{ position: 'absolute', bottom: 4, fontSize: 7, fontFamily: "'Press Start 2P', monospace", color: '#22c55e', animation: 'blink 1s infinite' }}>LIVE</div>
        )}
      </div>

      {/* Floor / Crowd area */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%', background: `linear-gradient(180deg, ${theme.floor}88 0%, #060606 100%)`, zIndex: 5, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '4px 8px', gap: 2, opacity: stagePhase === 'crowd' || stagePhase === 'ready' ? 1 : 0, animation: stagePhase === 'crowd' ? 'crowdReveal 0.8s ease-out forwards' : 'none' }}>
        {[0, 1, 2].map(row => (
          <div key={row} style={{ display: 'flex', justifyContent: 'space-evenly', opacity: 0.4 + row * 0.25 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(col => {
              const idx = row * 8 + col;
              const crowdColors = { skin: '#ffcc99', shirt: ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#a855f7'][idx % 5], pants: '#1e293b', shoes: '#334155', hair: '#4a3728' };
              return (
                <div key={col} style={{ animation: hIdx === idx ? 'shake 0.15s ease-in-out infinite' : `float ${2.5 + idx * 0.2}s ease-in-out infinite` }}>
                  <Pix sprite={CROWD_SPRITE} colors={crowdColors} size={2.5} glow={hIdx === idx} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Transcript box */}
      <div style={{ position: 'absolute', top: '6%', left: '50%', transform: 'translateX(-50%)', width: 'clamp(260px, 70vw, 500px)', zIndex: 25 }}>
        <div style={{ background: '#0f172acc', border: '2px solid #334155', borderRadius: 8, padding: '8px 12px', maxHeight: 'clamp(80px, 16vh, 140px)', overflowY: 'auto', scrollbarWidth: 'none' }}>
          {transcript.length === 0 ? (
            <div style={{ fontSize: 9, color: '#475569', textAlign: 'center', padding: '12px 0', fontFamily: "'Press Start 2P', monospace" }}>&gt; WAITING...</div>
          ) : (
            transcript.map((line, i) => (
              <div key={i} style={{ fontSize: 9, color: i === transcript.length - 1 ? '#6366f1' : '#64748b', fontFamily: "'Press Start 2P', monospace", padding: '2px 0', lineHeight: 1.8 }}>
                &gt; {line}
              </div>
            ))
          )}
          <div ref={transEnd} />
        </div>
      </div>

      {/* Heckle display */}
      {lastH && (
        <div style={{ position: 'absolute', top: '24%', left: '50%', transform: 'translateX(-50%)', zIndex: 35, animation: 'slideDown 0.3s ease-out', pointerEvents: 'none' }}>
          <div style={{ background: '#1e293b', border: '2px solid #f59e0b', padding: '8px 16px', fontSize: 10, color: '#f59e0b', fontFamily: "'Press Start 2P', monospace", textAlign: 'center', maxWidth: 'clamp(220px, 55vw, 460px)', boxShadow: '0 0 30px #f59e0b33', borderRadius: 8 }}>
            <div style={{ fontSize: 7, color: '#94a3b8', marginBottom: 4 }}>{lastHPersona.replace(/_/g, ' ')}</div>
            {lastH}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, background: conn ? '#22c55e' : '#ef4444', borderRadius: '50%', animation: conn ? 'blink 1.5s infinite' : 'none' }} />
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#64748b' }}>{conn ? 'LIVE' : 'OFF'}</span>
        </div>
        <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#475569', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{speakerName}</span>
        <button onClick={endSession} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, padding: '4px 10px', background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: 4, cursor: 'pointer' }}>EXIT</button>
      </div>

      {/* Crowd work overlay */}
      {showCrowd && crowdWork.length > 0 && stagePhase === 'ready' && !welcomeDone && (
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
          <h3 style={{ fontSize: 11, color: '#f59e0b', fontFamily: "'Press Start 2P', monospace" }}>CROWD REACTS</h3>
          {crowdWork.map((m, i) => (
            <div key={i} style={{ fontSize: 9, fontFamily: "'Press Start 2P', monospace", animation: `slideUp 0.4s ease-out ${i * 0.3}s both`, maxWidth: 'clamp(220px, 50vw, 360px)', background: '#1e293bcc', border: '1px solid #334155', padding: '8px 12px', borderRadius: 8, color: '#e2e8f0' }}>
              {m}
            </div>
          ))}
        </div>
      )}

      {/* Mic button */}
      {stagePhase === 'ready' && (
        <div style={{ position: 'absolute', bottom: '34%', left: '50%', transform: 'translateX(-50%)', zIndex: 30 }}>
          {!rec ? (
            <button onClick={startMic} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, padding: '12px 24px', background: '#22c55e', border: 'none', color: '#0f172a', borderRadius: 8, cursor: 'pointer', boxShadow: '0 0 40px #22c55e55', animation: 'pulse 2s ease-in-out infinite' }}>
              START SPEAKING
            </button>
          ) : (
            <button onClick={stopMic} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, padding: '12px 24px', background: '#ef4444', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer' }}>
              STOP
            </button>
          )}
        </div>
      )}

      {/* Intensity meter */}
      <div style={{ position: 'absolute', top: '48%', right: 8, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 2, zIndex: 20 }}>
        {[5, 4, 3, 2, 1].map(lvl => (
          <div key={lvl} style={{ width: 6, height: 12, background: lvl <= (session?.intensity || 3) ? `hsl(${120 - lvl * 25}, 65%, 50%)` : '#1e293b', border: '1px solid #334155', borderRadius: 2, opacity: lvl <= (session?.intensity || 3) ? 1 : 0.3 }} />
        ))}
      </div>
    </div>
  );
}

export default function StagePage() {
  return (
    <Suspense fallback={
      <div className="w-full h-screen flex items-center justify-center bg-slate-900">
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#475569', animation: 'blink 1s infinite' }}>LOADING...</div>
      </div>
    }>
      <StageContent />
    </Suspense>
  );
}
