'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSession } from '@/lib/api';

const THEMES = [
  { value: 'product_launch', label: 'Product Launch', emoji: 'L', color: '#3498db', desc: 'Pitch your startup to a skeptical crowd' },
  { value: 'corporate', label: 'Corporate Meeting', emoji: 'C', color: '#7f8c8d', desc: 'Present quarterly results to the board' },
  { value: 'standup', label: 'Standup Comedy', emoji: 'S', color: '#e74c3c', desc: 'Test your jokes on a tough crowd' },
  { value: 'stage_show', label: 'Stage Show', emoji: 'T', color: '#9b59b6', desc: 'Perform on the big stage with critics' },
];

function PixelStar({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      width: '16px', height: '16px', position: 'absolute',
      background: 'var(--accent)',
      clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
      animation: 'pixel-blink 2s ease-in-out infinite',
      ...style,
    }} />
  );
}

export default function HomePage() {
  const router = useRouter();
  const [theme, setTheme] = useState('product_launch');
  const [intensity, setIntensity] = useState(3);
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState<'menu' | 'setup'>('menu');

  const handleStart = async () => {
    if (!topic.trim()) {
      setError('Tell us what you are going to talk about!');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await createSession(topic, theme, intensity);
      router.push(`/stage?id=${session.session_id}`);
    } catch (e) {
      setError('Connection failed. Is the server running?');
    }
    setLoading(false);
  };

  return (
    <div className="screen grid-bg" style={{ position: 'relative' }}>
      {[...Array(20)].map((_, i) => (
        <PixelStar key={i} style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 3}s`,
          opacity: 0.3 + Math.random() * 0.3,
        } as React.CSSProperties} />
      ))}

      {screen === 'menu' ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px',
          animation: 'slide-down 0.6s ease-out',
        }}>
          <div style={{ textAlign: 'center' }}>
            <h1 className="pixel-title" style={{ color: 'var(--primary)', animation: 'pulse-glow 3s ease-in-out infinite', fontSize: 'clamp(20px, 6vw, 48px)' }}>
              STAGE<br/>FEAR
            </h1>
            <p className="pixel-subtitle" style={{ marginTop: '16px', fontSize: 'clamp(8px, 2vw, 12px)' }}>
              Face the hecklers. Own the stage.
            </p>
          </div>

          <div style={{
            width: 'clamp(60px, 15vw, 100px)',
            height: 'clamp(60px, 15vw, 100px)',
            position: 'relative',
          }}>
            <div style={{
              width: '100%', height: '100%',
              background: 'var(--primary)',
              clipPath: 'polygon(50% 5%, 95% 95%, 5% 95%)',
              animation: 'pixel-spin 2s ease-in-out infinite',
            }} />
          </div>

          <button className="pixel-btn" onClick={() => setScreen('setup')}
            style={{ fontSize: 'clamp(10px, 2vw, 14px)', padding: 'clamp(10px, 2vw, 16px) clamp(20px, 4vw, 40px)' }}>
            PRESS START
          </button>

          <div style={{ position: 'absolute', bottom: '16px', textAlign: 'center' }}>
            <p className="pixel-subtitle" style={{ fontSize: '8px' }}>
              Powered by ElevenLabs Speech Engine
            </p>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '24px',
          animation: 'slide-up 0.5s ease-out',
          width: '90vw', maxWidth: '500px',
          padding: 'clamp(16px, 3vw, 32px)',
        }}>
          <h2 className="pixel-title" style={{ fontSize: 'clamp(12px, 3vw, 20px)', color: 'var(--accent)' }}>
            SETUP YOUR SHOW
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="pixel-subtitle" style={{ textAlign: 'left' }}>What are you going to talk about?</label>
            <input
              className="pixel-input"
              placeholder="e.g. Launching my AI startup..."
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setError(''); }}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="pixel-subtitle" style={{ textAlign: 'left' }}>Stage Theme</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  className="pixel-card"
                  onClick={() => setTheme(t.value)}
                  style={{
                    border: theme === t.value ? `3px solid ${t.color}` : '3px solid var(--secondary)',
                    background: theme === t.value ? `${t.color}22` : 'var(--surface)',
                    padding: '12px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px', color: t.color }}>{t.emoji}</div>
                  <div style={{ fontSize: '8px', color: theme === t.value ? t.color : 'var(--text-dim)' }}>{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="slider-container" style={{ width: '100%' }}>
            <label className="pixel-subtitle">Heckler Intensity: {intensity}/5</label>
            <input
              type="range" min="1" max="5" value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="pixel-slider"
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '8px', color: 'var(--text-dim)' }}>
              <span>Easy</span>
              <span>Brutal</span>
            </div>
          </div>

          {error && (
            <p style={{ color: 'var(--pixel-red)', fontSize: '10px', textAlign: 'center', animation: 'shake 0.3s ease-in-out' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="pixel-btn danger" onClick={() => setScreen('menu')}>
              BACK
            </button>
            <button className="pixel-btn success" onClick={handleStart} disabled={loading}>
              {loading ? 'LOADING...' : 'GO ON STAGE!'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
