'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSession } from '@/lib/api';
import { assetPath } from '@/lib/paths';

type MenuPanel = 'practice' | 'how' | 'settings';

type Character = {
  id: string;
  name: string;
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
  line: string;
  color: string;
  mood: string;
};

type SpeechRecognitionResultLike = {
  0?: { transcript: string };
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const CHARACTERS: Character[] = [
  { id: 'rookie', name: 'Rookie', hair: '#111820', skin: '#f0aa78', top: '#5c2c84', trim: '#b987ff', pants: '#1d2229', shoes: '#f04b6d', accent: '#9a47ff' },
  { id: 'beanie', name: 'Beanie', hair: '#422014', skin: '#f1a877', top: '#e84863', trim: '#ff95a9', pants: '#2b2f38', shoes: '#ffffff', accent: '#ff5574' },
  { id: 'prof', name: 'Prof', hair: '#7a3d1e', skin: '#ebb07d', top: '#27491e', trim: '#6ea64f', pants: '#26313b', shoes: '#e5e0d2', accent: '#5ee04b' },
  { id: 'blue', name: 'Blue', hair: '#0b5f9e', skin: '#e99b73', top: '#202326', trim: '#ff4f57', pants: '#202326', shoes: '#f1e7d4', accent: '#23b7ff' },
  { id: 'flare', name: 'Flare', hair: '#f1b62f', skin: '#e9a06c', top: '#d16822', trim: '#ffa04b', pants: '#23272e', shoes: '#cfd3da', accent: '#ffb02e' },
  { id: 'violet', name: 'Violet', hair: '#723e8e', skin: '#e7a476', top: '#252832', trim: '#9e58ff', pants: '#171a22', shoes: '#e8e0ff', accent: '#b75cff' },
];

const HECKLERS: Heckler[] = [
  { id: 'skeptic', name: 'Skeptic', line: 'Questions everything.', color: '#61e02d', mood: 'doubt' },
  { id: 'teen', name: 'Bored Teen', line: 'Could not care less.', color: '#22b9f2', mood: 'mid' },
  { id: 'know_it_all', name: 'Know-It-All', line: 'Thinks they know better.', color: '#ffcc25', mood: 'actually' },
  { id: 'classic_heckler', name: 'Classic Heckler', line: 'Brings the roasts.', color: '#ff352d', mood: 'roast' },
  { id: 'nervous', name: 'Nervous One', line: 'Here for moral support.', color: '#a54cff', mood: 'sweat' },
  { id: 'critic', name: 'Critic', line: 'Nothing ever impresses.', color: '#d7d9df', mood: 'review' },
];

const THEMES = [
  { value: 'product_launch', label: 'Product Launch', detail: 'Conference lights and investor impatience.' },
  { value: 'corporate', label: 'Corporate Meeting', detail: 'Boardroom stiffness with passive aggression.' },
  { value: 'standup', label: 'Standup Comedy', detail: 'Comedy cellar pressure and fast crowd turns.' },
  { value: 'stage_show', label: 'Stage Show', detail: 'Theater drama, big spotlight, bigger judgment.' },
];

function PixelAvatar({ character, large = false, entering = false }: { character: Character; large?: boolean; entering?: boolean }) {
  const spriteIndex = Math.max(0, CHARACTERS.findIndex((item) => item.id === character.id));

  return (
    <div
      className={`sprite-shell generated-character ${large ? 'sprite-large' : ''} ${entering ? 'sprite-idle' : ''}`}
      style={{
        ['--sprite-x' as string]: `${spriteIndex * 20}%`,
        ['--character-sheet' as string]: `url("${assetPath('/sprites/stage-fear-characters.png')}")`,
      }}
      aria-label={character.name}
      role="img"
    >
      <span />
    </div>
  );
}

function HecklerFace({ heckler }: { heckler: Heckler }) {
  return (
    <div
      className="heckler-face generated-heckler"
      style={{
        ['--heckler' as string]: heckler.color,
        ['--heckler-img' as string]: `url("${assetPath(`/sprites/heckler-portraits/${heckler.id}.png`)}")`,
      }}
      aria-label={heckler.name}
      role="img"
    >
      <span />
    </div>
  );
}

function SoundGlyph() {
  return <span className="sound-glyph"><i /><b /></span>;
}

function MicGlyph() {
  return <span className="mic-glyph"><i /></span>;
}

export default function HomePage() {
  const router = useRouter();
  const [panel, setPanel] = useState<MenuPanel>('practice');
  const [characterId, setCharacterId] = useState(CHARACTERS[0].id);
  const [theme, setTheme] = useState(THEMES[0].value);
  const [intensity, setIntensity] = useState(3);
  const [topic, setTopic] = useState('');
  const [name, setName] = useState('');
  const [sound, setSound] = useState(true);
  const [crowdNoise, setCrowdNoise] = useState<'low' | 'medium' | 'high'>('medium');
  const [setupOpen, setSetupOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const menuAudioRef = useRef<HTMLAudioElement | null>(null);
  const hoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const selectAudioRef = useRef<HTMLAudioElement | null>(null);

  const selectedCharacter = useMemo(
    () => CHARACTERS.find((character) => character.id === characterId) || CHARACTERS[0],
    [characterId],
  );

  const selectedTheme = THEMES.find((item) => item.value === theme) || THEMES[0];

  useEffect(() => {
    menuAudioRef.current = new Audio(assetPath('/sfx/menu-loop.mp3'));
    menuAudioRef.current.loop = true;
    menuAudioRef.current.volume = 0.42;
    hoverAudioRef.current = new Audio(assetPath('/sfx/ui-hover.mp3'));
    hoverAudioRef.current.volume = 0.38;
    selectAudioRef.current = new Audio(assetPath('/sfx/ui-select.mp3'));
    selectAudioRef.current.volume = 0.5;

    return () => {
      menuAudioRef.current?.pause();
      menuAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!menuAudioRef.current) return;
    if (!sound) {
      menuAudioRef.current.pause();
      return;
    }
    menuAudioRef.current.volume = 0.42;
    menuAudioRef.current.play().catch(() => undefined);
  }, [sound]);

  const playUiSound = (kind: 'hover' | 'select') => {
    if (!sound) return;
    const audio = kind === 'hover' ? hoverAudioRef.current : selectAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => undefined);
  };

  const unlockMenuAudio = () => {
    if (!sound || !menuAudioRef.current) return;
    menuAudioRef.current.play().catch(() => undefined);
  };

  const startTopicCapture = () => {
    setError('');
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      setError('Browser speech capture is unavailable. Type your topic instead.');
      return;
    }

    const recognition = new Speech();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => setListening(true);
    recognition.onerror = () => {
      setListening(false);
      setError('Mic capture stopped. You can type the topic instead.');
    };
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) setTopic(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopTopicCapture = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const beginPractice = async () => {
    if (!name.trim()) {
      setPanel('practice');
      setError('Enter your speaker name.');
      return;
    }
    if (!topic.trim()) {
      setPanel('practice');
      setError('Enter or speak your topic.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const session = await createSession(topic.trim(), theme, intensity, name.trim(), characterId);
      const params = new URLSearchParams({
        id: session.session_id,
        name: name.trim(),
        character: characterId,
        sound: String(sound),
        crowd: crowdNoise,
      });
      router.push(`/stage?${params.toString()}`);
    } catch {
      setError('Backend is not reachable. Start the FastAPI server and try again.');
      setLoading(false);
    }
  };

  const menuItems = [
    { id: 'practice' as const, title: 'Start Practicing', subtitle: 'Step on stage. Face the crowd.', icon: <MicGlyph /> },
    { id: 'how' as const, title: 'What Happens', subtitle: 'Meet the room before you walk in.', icon: <span className="question-glyph">?</span> },
    { id: 'settings' as const, title: 'Sound Check', subtitle: 'Set crowd and audio levels.', icon: <SoundGlyph /> },
  ];

  return (
    <main className="menu-screen" onPointerDown={unlockMenuAudio}>
      <div className="scanlines" />
      <section className="menu-left">
        <div className="brand-lockup" aria-label="Stage Fear">
          <img src={assetPath('/brand/stagefear-logo.png')} alt="Stage Fear" />
        </div>
        <p className="tagline"><b>Practice bold.</b> <strong>Get roasted.</strong> Own the stage.</p>

        <nav className="main-menu" aria-label="Main menu">
          {menuItems.map((item) => (
            <button key={item.id} className={`menu-button ${panel === item.id ? 'is-active' : ''}`} onMouseEnter={() => playUiSound('hover')} onClick={() => {
              playUiSound('select');
              setPanel(item.id);
              setSetupOpen(true);
            }}>
              <span className="menu-icon">{item.icon}</span>
              <span>
                <b>{item.title}</b>
                <small>{item.subtitle}</small>
              </span>
              <em>&gt;</em>
            </button>
          ))}
        </nav>

        <div className="crowd-meter">
          <span className="people-glyph" />
          <span>Crowd Noise:</span>
          <button className={crowdNoise === 'low' ? 'is-selected' : ''} onClick={() => setCrowdNoise('low')}>Low</button>
          <button className={crowdNoise === 'medium' ? 'is-selected' : ''} onClick={() => setCrowdNoise('medium')}>Medium</button>
          <button className={crowdNoise === 'high' ? 'is-selected' : ''} onClick={() => setCrowdNoise('high')}>High</button>
        </div>
      </section>

      <section className="menu-stage">
        <header className="top-controls">
          <button className="sound-toggle" onMouseEnter={() => playUiSound('hover')} onClick={() => { playUiSound('select'); setSound((value) => !value); }}>
            <SoundGlyph /> Sound: <strong>{sound ? 'On' : 'Off'}</strong>
          </button>
          <div className="powered-by"><span>Powered by</span><b>ElevenLabs</b></div>
        </header>

        <div className="theater">
          <div className="rigging" />
          <div className="curtain curtain-left" />
          <div className="curtain curtain-right" />
          <div className="spotlight spotlight-left" />
          <div className="spotlight spotlight-right" />
          <div className="stage-title">Choose Your Character</div>
          <button className="arrow-button arrow-left" onMouseEnter={() => playUiSound('hover')} onClick={() => {
            playUiSound('select');
            const current = CHARACTERS.findIndex((character) => character.id === characterId);
            setCharacterId(CHARACTERS[(current - 1 + CHARACTERS.length) % CHARACTERS.length].id);
          }}>&lt;</button>
          <div className="hero-character">
            <PixelAvatar character={selectedCharacter} large entering />
            <span>{selectedCharacter.name}</span>
          </div>
          <button className="arrow-button arrow-right" onMouseEnter={() => playUiSound('hover')} onClick={() => {
            playUiSound('select');
            const current = CHARACTERS.findIndex((character) => character.id === characterId);
            setCharacterId(CHARACTERS[(current + 1) % CHARACTERS.length].id);
          }}>&gt;</button>
          <div className="stage-floor" />
          <div className="crowd-silhouette" />
        </div>

        <div className="stage-dots" aria-label="Selected character">
          {CHARACTERS.map((character) => (
            <button key={character.id} className={characterId === character.id ? 'is-selected' : ''} onMouseEnter={() => playUiSound('hover')} onClick={() => { playUiSound('select'); setCharacterId(character.id); }} aria-label={character.name} />
          ))}
        </div>

        <section className="heckler-row" aria-label="Six AI hecklers">
          <h2>Meet Your 6 AI Hecklers</h2>
          <div>
            {HECKLERS.map((heckler) => (
              <article key={heckler.id} style={{ ['--heckler' as string]: heckler.color }}>
                <HecklerFace heckler={heckler} />
                <b>{heckler.name}</b>
                <span>{heckler.line}</span>
                <SoundGlyph />
              </article>
            ))}
          </div>
        </section>
      </section>

      {setupOpen && (
        <section className="setup-modal" aria-label="Practice setup">
          <div className="setup-card">
            <button className="modal-close" onClick={() => { playUiSound('hover'); setSetupOpen(false); }}>x</button>
            {panel === 'how' ? (
              <div className="how-panel">
                <h2>What Happens</h2>
                <p>You walk onto a pixel stage, hear the crowd, and start practicing out loud.</p>
                <p>The six hecklers listen for real points in your talk, then interrupt with voiced reactions.</p>
                <p>Your job is to keep going, recover, and get sharper under pressure.</p>
                <p>Use headphones for the cleanest mic pickup and the most natural crowd mix.</p>
              </div>
            ) : panel === 'settings' ? (
              <>
                <h2>Settings</h2>
                <div className="settings-panel">
                  <button className={sound ? 'is-selected' : ''} onClick={() => setSound(true)}>Sound On</button>
                  <button className={!sound ? 'is-selected' : ''} onClick={() => setSound(false)}>Sound Off</button>
                  <button className={crowdNoise === 'low' ? 'is-selected' : ''} onClick={() => setCrowdNoise('low')}>Low Crowd</button>
                  <button className={crowdNoise === 'medium' ? 'is-selected' : ''} onClick={() => setCrowdNoise('medium')}>Medium Crowd</button>
                  <button className={crowdNoise === 'high' ? 'is-selected' : ''} onClick={() => setCrowdNoise('high')}>High Crowd</button>
                </div>
              </>
            ) : (
              <>
                <h2>Start Practicing</h2>
                <div className="panel-grid">
                  <label>
                    <span>Speaker Name</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex" />
                  </label>
                  <label className="topic-box">
                    <span>What are you practicing?</span>
                    <div className="topic-input">
                      <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Pitching my AI startup..." />
                      <button onClick={listening ? stopTopicCapture : startTopicCapture}>{listening ? 'Stop' : 'Mic'}</button>
                    </div>
                  </label>
                  <label className="theme-picker">
                    <span>Room</span>
                    <select value={theme} onChange={(event) => setTheme(event.target.value)}>
                      {THEMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="intensity-control">
                    <span>Heckle Intensity: {intensity}/5</span>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={intensity}
                      style={{ ['--range-fill' as string]: `${((intensity - 1) / 4) * 100}%` }}
                      onChange={(event) => setIntensity(Number(event.target.value))}
                    />
                    <small>{selectedTheme.detail}</small>
                  </label>
                  <button className="start-show" disabled={loading} onClick={beginPractice}>{loading ? 'Opening Stage...' : 'Start Practicing'}</button>
                </div>
              </>
            )}
            {error && <p className="menu-error">{error}</p>}
          </div>
        </section>
      )}

      <footer className="menu-footer">
        <span>Best experienced with a mic and headphones.</span>
      </footer>
    </main>
  );
}
