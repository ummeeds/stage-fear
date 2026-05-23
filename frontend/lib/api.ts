export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

export async function createSession(topic: string, theme: string, intensity: number) {
  const res = await fetch(`${API_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, theme, intensity }),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function getSession(sessionId: string) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Session not found');
  return res.json();
}

export async function startStage(sessionId: string) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/start-stage`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to start stage');
  return res.json();
}

export async function getWelcomeAudio(sessionId: string) {
  const res = await fetch(`${API_URL}/api/sessions/${sessionId}/welcome`);
  if (!res.ok) throw new Error('Welcome audio not available');
  return res.json();
}

export function createWebSocket(sessionId: string): WebSocket {
  return new WebSocket(`${WS_URL}/ws/${sessionId}`);
}
