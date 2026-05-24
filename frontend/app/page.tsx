'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSession } from '@/lib/api';

function playMenuSynth() {
  try {
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.1;
    master.connect(ctx.destination);
    const now = ctx.currentTime;
    [261.63, 329.63, 392.00, 523.25].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t = now + i * 0.08;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.6);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

const THEMES = [
  { value: 'product_launch', label: 'Product Launch', color: '#3498db' },
  { value: 'corporate', label: 'Corporate Meeting', color: '#7f8c8d' },
  { value: 'standup', label: 'Standup Comedy', color: '#e74c3c' },
  { value: 'stage_show', label: 'Stage Show', color: '#9b59b6' },
];

const HECKLE_PREVIEWS = [
  "Oh great, another one...",
  "Is this gonna be good?",
  "I've seen better!",
  "Booooring!",
  "Show us what you got!",
  "This ought to be funny...",
  "Wake me when it's over",
  "I paid for THIS?!",
  "My cat speaks better",
  "Groundbreaking... not.",
  "Who let them on stage?",
  "I want a refund!",
];

function HeckleBubble({ text, x, y, from }: { text: string; x: string; y: string; from: 'left' | 'right' }) {
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      background: '#1a1a2e',
      border: '2px solid #e94560',
      padding: '6px 10px',
      fontSize: 'clamp(7px, 1vw, 9px)',
      fontFamily: "'Press Start 2P', monospace",
      color: '#e94560',
      maxWidth: '120px',
      zIndex: 0,
      animation: 'wind-up 0.3s ease-out forwards, fade-out 2s ease-in 4s forwards',
      pointerEvents: 'none',
      textOverflow: 'ellipsis',
      wordBreak: 'break-word',
    }}>
      {text}
      <div style={{
        position: 'absolute', bottom: '-6px',
        left: from === 'right' ? undefined : '12px',
        right: from === 'right' ? '12px' : undefined,
        width: 0, height: 0,
        borderLeft: from === 'right' ? '6px solid transparent' : '6px solid #e94560',
        borderRight: from === 'right' ? '6px solid #e94560' : '6px solid transparent',
        borderTop: '6px solid transparent',
        borderBottom: from === 'right' ? '6px solid transparent' : 'none',
        transform: from === 'right' ? 'rotate(180deg)' : 'none',
      }} />
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [theme, setTheme] = useState('product_launch');
  const [intensity, setIntensity] = useState(3);
  const [topic, setTopic] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState<'menu' | 'setup'>('menu');
  const [bubbles, setBubbles] = useState<{ id: number; text: string; x: string; y: string; from: 'left' | 'right' }[]>([]);
  const bubbleIdRef = useRef(0);

  useEffect(() => {
    const unlockAudio = () => { playMenuSynth(); document.removeEventListener('click', unlockAudio); };
    document.addEventListener('click', unlockAudio);
    return () => document.removeEventListener('click', unlockAudio);
  }, []);

  useEffect(() => {
    if (screen !== 'menu') return;
    const corners = [
      { x: '2%', y: '5%', from: 'left' as const },
      { x: '50%', y: '5%', from: 'left' as const },
      { x: '2%', y: '30%', from: 'left' as const },
      { x: '55%', y: '20%', from: 'right' as const },
      { x: '2%', y: '55%', from: 'left' as const },
      { x: '55%', y: '50%', from: 'right' as const },
      { x: '5%', y: '75%', from: 'left' as const },
      { x: '50%', y: '70%', from: 'right' as const },
      { x: '10%', y: '15%', from: 'right' as const },
      { x: '60%', y: '60%', from: 'left' as const },
      { x: '5%', y: '45%', from: 'right' as const },
      { x: '45%', y: '40%', from: 'left' as const },
    ];
    const spawn = () => {
      const id = bubbleIdRef.current++;
      const text = HECKLE_PREVIEWS[id % HECKLE_PREVIEWS.length];
      const pos = corners[id % corners.length];
      setBubbles(prev => [...prev.slice(-8), { id, text, x: pos.x, y: pos.y, from: pos.from }]);
    };
    const interval = setInterval(spawn, 2800);
    return () => clearInterval(interval);
  }, [screen]);

  useEffect(() => {
    const cleanup = setInterval(() => {
      setBubbles(prev => prev.filter(b => b.id > bubbleIdRef.current - 15));
    }, 5000);
    return () => clearInterval(cleanup);
  }, []);

  const handleStart = async () => {
    if (!topic.trim()) { setError('Enter your topic first!'); return; }
    if (!name.trim()) { setError('What is your name?'); return; }
    setLoading(true);
    setError('');
    try {
      const session = await createSession(topic, theme, intensity, name);
      router.push(`/stage?id=${session.session_id}&name=${encodeURIComponent(name)}`);
    } catch {
      setError('Connection failed. Is the server running?');
      setLoading(false);
    }
  };

  return (
    <div className="screen grid-bg" style={{ position: 'relative' }}>
      {bubbles.map(b => (
        <HeckleBubble key={b.id} text={b.text} x={b.x} y={b.y} from={b.from} />
      ))}

      {screen === 'menu' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', animation: 'slide-down 0.6s ease-out', zIndex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontFamily: "'Press Start 2P', monospace", color: '#e94560', fontSize: 'clamp(20px, 6vw, 48px)', textShadow: '0 0 20px #e94560', animation: 'pulse-glow 3s ease-in-out infinite', letterSpacing: 4 }}>
              STAGE<br/>FEAR
            </h1>
            <p style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(8px, 1.5vw, 10px)', color: '#666', marginTop: 12 }}>
              FACE THE HECKLERS. OWN THE STAGE.
            </p>
          </div>

          <div style={{ width: 'clamp(60px, 15vw, 80px)', height: 'clamp(60px, 15vw, 80px)', background: '#e94560', clipPath: 'polygon(50% 5%, 95% 95%, 5% 95%)', animation: 'pixel-spin 2s ease-in-out infinite' }} />

          <button className="pixel-btn" onClick={() => setScreen('setup')}
            style={{ fontSize: 'clamp(10px, 2vw, 14px)', padding: 'clamp(10px, 2vw, 14px) clamp(20px, 4vw, 36px)', borderColor: '#e94560', color: '#e94560' }}>
            PRESS START
          </button>

          <p style={{ fontSize: 'clamp(6px, 1vw, 8px)', color: '#333', fontFamily: "'Press Start 2P', monospace", position: 'absolute', bottom: 16 }}>
            POWERED BY ELEVENLABS
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'slide-up 0.5s ease-out', width: '90vw', maxWidth: '500px', padding: 'clamp(12px, 3vw, 24px)', zIndex: 1 }}>
          <h2 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(11px, 2.5vw, 18px)', color: '#f5c518', textAlign: 'center' }}>
            SETUP YOUR SHOW
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(7px, 1vw, 9px)', color: '#666' }}>YOUR NAME</label>
            <input className="pixel-input" placeholder="e.g. Alex" value={name} onChange={e => { setName(e.target.value); setError(''); }} style={{ width: '100%' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(7px, 1vw, 9px)', color: '#666' }}>WHAT WILL YOU TALK ABOUT?</label>
            <input className="pixel-input" placeholder="e.g. My AI startup launch..." value={topic} onChange={e => { setTopic(e.target.value); setError(''); }} style={{ width: '100%' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(7px, 1vw, 9px)', color: '#666' }}>STAGE THEME</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {THEMES.map(t => (
                <button key={t.value} className="pixel-card" onClick={() => setTheme(t.value)}
                  style={{ border: theme === t.value ? `3px solid ${t.color}` : '3px solid #1a1a2e', background: theme === t.value ? `${t.color}22` : '#0a0a0a', padding: 10, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
                  <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(6px, 1vw, 8px)', color: theme === t.value ? t.color : '#555' }}>{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="slider-container" style={{ width: '100%' }}>
            <label style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(7px, 1vw, 9px)', color: '#666' }}>HECKLE INTENSITY: {intensity}/5</label>
            <input type="range" min="1" max="5" value={intensity} onChange={e => setIntensity(Number(e.target.value))} className="pixel-slider" style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 8, color: '#444', fontFamily: "'Press Start 2P', monospace" }}>
              <span>EASY</span><span>BRUTAL</span>
            </div>
          </div>

          {error && <p style={{ color: '#e74c3c', fontSize: 9, fontFamily: "'Press Start 2P', monospace", textAlign: 'center', animation: 'shake 0.3s ease-in-out' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="pixel-btn danger" onClick={() => setScreen('menu')}>BACK</button>
            <button className="pixel-btn success" onClick={handleStart} disabled={loading}
              style={{ background: loading ? '#555' : '#2ecc71', borderColor: loading ? '#555' : '#2ecc71', color: '#0a0a0a' }}>
              {loading ? '...' : 'GO ON STAGE!'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
