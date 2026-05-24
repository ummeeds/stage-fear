'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSession } from '@/lib/api';

const THEMES = [
  { value: 'product_launch', label: 'Product Launch', icon: '🚀' },
  { value: 'corporate', label: 'Corporate Meeting', icon: '💼' },
  { value: 'standup', label: 'Standup Comedy', icon: '🎤' },
  { value: 'stage_show', label: 'Stage Show', icon: '🎭' },
];

// Roblox-style pixel characters (10x12 grid)
const CHARACTERS = [
  {
    id: 'default',
    name: 'Classic',
    colors: { skin: '#ffcc99', shirt: '#6366f1', pants: '#1e293b', shoes: '#334155', hair: '#4a3728' },
    sprite: [
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
    ],
  },
  {
    id: 'ninja',
    name: 'Ninja',
    colors: { skin: '#ffcc99', shirt: '#1e1e2e', pants: '#1e1e2e', shoes: '#0f0f1a', hair: '#1e1e2e' },
    sprite: [
      [0,0,0,0,1,1,1,1,0,0],
      [0,0,0,1,1,1,1,1,1,0],
      [0,0,0,1,2,2,2,2,1,0],
      [0,0,0,1,3,3,3,3,1,0],
      [0,0,0,1,2,2,2,2,1,0],
      [0,0,0,0,1,1,1,1,0,0],
      [0,0,0,0,0,1,1,0,0,0],
      [0,0,4,4,4,4,4,4,4,0],
      [0,0,4,4,4,4,4,4,4,0],
      [0,0,4,4,4,4,4,4,4,0],
      [0,0,0,5,5,5,5,5,0,0],
      [0,0,0,5,0,0,0,5,0,0],
    ],
  },
  {
    id: 'robot',
    name: 'Robot',
    colors: { skin: '#94a3b8', shirt: '#64748b', pants: '#475569', shoes: '#334155', hair: '#64748b' },
    sprite: [
      [0,0,0,0,1,1,1,1,0,0],
      [0,0,0,1,1,1,1,1,1,0],
      [0,0,0,1,2,3,3,2,1,0],
      [0,0,0,1,2,4,4,2,1,0],
      [0,0,0,1,2,2,2,2,1,0],
      [0,0,0,0,1,1,1,1,0,0],
      [0,0,0,0,0,1,1,0,0,0],
      [0,0,4,4,4,4,4,4,4,0],
      [0,0,4,4,4,4,4,4,4,0],
      [0,0,4,4,4,4,4,4,4,0],
      [0,0,0,5,5,5,5,5,0,0],
      [0,0,0,5,0,0,0,5,0,0],
    ],
  },
  {
    id: 'hero',
    name: 'Hero',
    colors: { skin: '#ffcc99', shirt: '#ef4444', pants: '#1e293b', shoes: '#334155', hair: '#f59e0b' },
    sprite: [
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
    ],
  },
];

function PixelCharacter({ character, size = 4, selected = false }: { character: typeof CHARACTERS[0]; size?: number; selected?: boolean }) {
  const colorMap: Record<number, string> = {
    0: 'transparent',
    1: character.colors.hair,
    2: character.colors.skin,
    3: character.colors.shirt,
    4: character.colors.shirt,
    5: character.colors.pants,
  };

  return (
    <div className={`relative cursor-pointer transition-all duration-200 ${selected ? 'scale-110' : 'hover:scale-105'}`}>
      {selected && (
        <div className="absolute -inset-2 rounded-lg border-2 border-indigo-500 shadow-lg shadow-indigo-500/30" />
      )}
      <div
        className="pixel-char"
        style={{
          gridTemplateColumns: `repeat(${character.sprite[0].length}, ${size}px)`,
          gridTemplateRows: `repeat(${character.sprite.length}, ${size}px)`,
        }}
      >
        {character.sprite.flat().map((c, i) => (
          <div key={i} style={{ background: colorMap[c] || 'transparent' }} />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [step, setStep] = useState<'title' | 'character' | 'setup'>('title');
  const [character, setCharacter] = useState('default');
  const [theme, setTheme] = useState('product_launch');
  const [intensity, setIntensity] = useState(3);
  const [topic, setTopic] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const audioUnlocked = useRef(false);

  const unlockAudio = () => {
    if (audioUnlocked.current) return;
    try {
      const ctx = new AudioContext();
      ctx.resume();
      ctx.close();
      audioUnlocked.current = true;
    } catch {}
  };

  const handleStart = async () => {
    if (!topic.trim()) { setError('Enter your topic first!'); return; }
    if (!name.trim()) { setError('What is your name?'); return; }
    setLoading(true);
    setError('');
    try {
      const session = await createSession(topic, theme, intensity, name, character);
      router.push(`/stage?id=${session.session_id}&name=${encodeURIComponent(name)}&character=${character}`);
    } catch {
      setError('Connection failed. Is the server running?');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" onClick={unlockAudio}>
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" />
      <div className="fixed inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #6366f1 0%, transparent 50%)' }} />

      <div className="relative z-10 w-full max-w-2xl">
        {step === 'title' && (
          <div className="text-center animate-fade-in">
            <h1 className="pixel-font text-4xl md:text-6xl text-indigo-400 mb-4 tracking-wider" style={{ textShadow: '0 0 30px rgba(99,102,241,0.5)' }}>
              STAGE<br />FEAR
            </h1>
            <p className="text-slate-400 mb-8 text-sm md:text-base">Face the hecklers. Own the stage.</p>
            <button
              onClick={() => setStep('character')}
              className="pixel-font bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/30"
            >
              PRESS START
            </button>
          </div>
        )}

        {step === 'character' && (
          <div className="animate-slide-up">
            <h2 className="pixel-font text-xl text-center text-indigo-400 mb-8">Choose Your Character</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
              {CHARACTERS.map((char) => (
                <div
                  key={char.id}
                  onClick={() => setCharacter(char.id)}
                  className="flex flex-col items-center gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer"
                >
                  <PixelCharacter character={char} size={5} selected={character === char.id} />
                  <span className="text-xs text-slate-400 pixel-font">{char.name}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setStep('title')}
                className="pixel-font bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg transition-all"
              >
                BACK
              </button>
              <button
                onClick={() => setStep('setup')}
                className="pixel-font bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg transition-all"
              >
                NEXT
              </button>
            </div>
          </div>
        )}

        {step === 'setup' && (
          <div className="animate-slide-up bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 md:p-8 border border-slate-700">
            <div className="flex items-center gap-4 mb-6">
              <PixelCharacter character={CHARACTERS.find(c => c.id === character) || CHARACTERS[0]} size={4} />
              <h2 className="pixel-font text-lg text-indigo-400">Setup Your Show</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-2 pixel-font">YOUR NAME</label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 focus:outline-none transition-colors"
                  placeholder="e.g. Alex"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2 pixel-font">WHAT WILL YOU TALK ABOUT?</label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 focus:outline-none transition-colors"
                  placeholder="e.g. My AI startup launch..."
                  value={topic}
                  onChange={e => { setTopic(e.target.value); setError(''); }}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2 pixel-font">STAGE THEME</label>
                <div className="grid grid-cols-2 gap-3">
                  {THEMES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setTheme(t.value)}
                      className={`p-3 rounded-lg border transition-all text-left ${theme === t.value ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-900 hover:border-slate-600'}`}
                    >
                      <span className="text-lg mr-2">{t.icon}</span>
                      <span className="text-xs text-slate-300">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2 pixel-font">HECKLE INTENSITY: {intensity}/5</label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={intensity}
                  onChange={e => setIntensity(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>EASY</span>
                  <span>BRUTAL</span>
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-xs text-center pixel-font animate-shake">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('character')}
                  className="flex-1 pixel-font bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg transition-all"
                >
                  BACK
                </button>
                <button
                  onClick={handleStart}
                  disabled={loading}
                  className="flex-1 pixel-font bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 text-white py-3 rounded-lg transition-all"
                >
                  {loading ? '...' : 'GO ON STAGE!'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
