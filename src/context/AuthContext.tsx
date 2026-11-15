import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch } from '../lib/api';
import { DbUser, UserSession } from '../types/mcloud';

export interface TelemetryNodePoint {
  id: number;
  hostname: string;
  region: string;
  status: string;
  cpuUsagePct: number;
  ramUsagePct: number;
  networkMbps: number;
  timestamp: string;
}

export interface RegisterPasswordInput {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  dbUser: DbUser | null;
  isAuthenticated: boolean;
  sessions: UserSession[];
  loading: boolean;
  authError: string | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  signInWithGoogle: () => Promise<void>;
  registerWithPassword: (input: RegisterPasswordInput) => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  wsConnected: boolean;
  liveTelemetry: TelemetryNodePoint[];
  lastRealtimeEvent: { type: string; payload: unknown } | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('mcloud-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [liveTelemetry, setLiveTelemetry] = useState<TelemetryNodePoint[]>([]);
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<{
    type: string;
    payload: unknown;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const isAuthenticated = Boolean(firebaseUser || dbUser);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('mcloud-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const refreshProfile = async () => {
    try {
      const data = await apiFetch<{ user: DbUser; sessions: UserSession[] }>('/api/auth/me');
      setDbUser(data.user);
      setSessions(data.sessions);
    } catch {
      setDbUser(null);
      setSessions([]);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);
      if (user) {
        try {
          const data = await apiFetch<{ user: DbUser; sessions: UserSession[] }>(
            '/api/auth/me'
          );
          setDbUser(data.user);
          setSessions(data.sessions);
        } catch (err: any) {
          setAuthError(err.message || 'Failed to sync user account');
        }
        setLoading(false);
        return;
      }

      // Check HttpOnly session cookie if no Firebase user is active
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setDbUser(data.user);
          setSessions(data.sessions || []);
        } else {
          setDbUser(null);
          setSessions([]);
        }
      } catch {
        setDbUser(null);
        setSessions([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Connect authenticated WebSocket for live telemetry & event notifications
  useEffect(() => {
    if (!dbUser?.id) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    let cancelled = false;

    const connectWs = async () => {
      try {
        const firebaseToken = firebaseUser ? await firebaseUser.getIdToken() : null;
        if (cancelled) return;
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${proto}//${window.location.host}/ws/telemetry`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) return;
          if (firebaseToken) {
            ws.send(JSON.stringify({ type: 'auth', token: firebaseToken }));
          }
        };
        ws.onclose = () => {
          if (!cancelled) setWsConnected(false);
        };
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'ws:connected') {
              if (!cancelled) setWsConnected(true);
            } else if (msg.type === 'node:telemetry' && Array.isArray(msg.payload)) {
              setLiveTelemetry(msg.payload);
            } else if (msg.type) {
              setLastRealtimeEvent({ type: msg.type, payload: msg.payload });
            }
          } catch {
            // Ignore malformed socket frames
          }
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWs();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [dbUser?.id, firebaseUser]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    await signInWithPopup(auth, googleAuthProvider);
  };

  const registerWithPassword = async (input: RegisterPasswordInput) => {
    setAuthError(null);
    const data = await apiFetch<{
      authenticated: boolean;
      user: DbUser;
      sessions: UserSession[];
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setDbUser(data.user);
    setSessions(data.sessions || []);
  };

  const loginWithPassword = async (email: string, password: string) => {
    setAuthError(null);
    const data = await apiFetch<{
      authenticated: boolean;
      user: DbUser;
      sessions: UserSession[];
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setDbUser(data.user);
    setSessions(data.sessions || []);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    if (auth.currentUser) {
      await signOut(auth).catch(() => {});
    }
    setFirebaseUser(null);
    setDbUser(null);
    setSessions([]);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        isAuthenticated,
        sessions,
        loading,
        authError,
        theme,
        toggleTheme,
        signInWithGoogle,
        registerWithPassword,
        loginWithPassword,
        logout,
        refreshProfile,
        wsConnected,
        liveTelemetry,
        lastRealtimeEvent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
