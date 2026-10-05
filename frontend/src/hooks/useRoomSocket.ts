import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import { getWsUrl } from '@/lib/config';
import { reportClientError } from '@/lib/error-report';
import { AppState, CardValue, ClientRole, LegendConfig, VoteValue } from '@/types/state';
import type { AppLocale } from '@/lib/i18n/config';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

// Estado da conexão da tela atual, para o aviso global de conexão perdida
// (ConnectionLost no _app): qualquer tela de sala avisa quando cai.
type ConnectionSnapshot = { active: boolean; status: ConnectionStatus; error: string | null };
let connectionSnapshot: ConnectionSnapshot = { active: false, status: 'disconnected', error: null };
const connectionListeners = new Set<() => void>();
function publishConnection(next: ConnectionSnapshot) {
  connectionSnapshot = next;
  for (const l of connectionListeners) l();
}
export const connectionStore = {
  subscribe(listener: () => void) {
    connectionListeners.add(listener);
    return () => connectionListeners.delete(listener);
  },
  get: () => connectionSnapshot,
  getServer: () => connectionSnapshot
};

interface UseRoomSocketResult {
  status: ConnectionStatus;
  state: AppState | null;
  sendVote: (vote: VoteValue) => void;
  sendCard: (card: CardValue) => void;
  ready: () => void;
  release: () => void;
  clear: () => void;
  timerStart: () => void;
  timerStop: () => void;
  timerReset: () => void;
  timerSet: (seconds: number) => void;
  intervalSet: (seconds: number) => void;
  intervalStart: () => void;
  intervalStop: () => void;
  intervalReset: () => void;
  intervalShow: () => void;
  intervalHide: () => void;
  changeLocale: (locale: AppLocale) => void;
  setLegendConfig: (config: LegendConfig) => void;
  error: string | null;
}

interface UseRoomSocketOptions {
  roomId?: string;
  adminPin?: string;
  refereeToken?: string;
}

export function useRoomSocket(role: ClientRole, options: UseRoomSocketOptions = {}): UseRoomSocketResult {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Só depois do client:register aceito o servidor reconhece este socket.
  // Antes disso (ou com a conexão caída) nada é enviado: o socket.io guarda
  // eventos offline e os manda na reconexão ANTES do register, e o servidor
  // os recusava — um voto tocado durante a queda sumia em silêncio.
  const registeredRef = useRef(false);
  const requirementsRef = useRef(false);

  useEffect(() => {
    publishConnection({ active: requirementsRef.current, status, error });
  }, [status, error]);
  useEffect(() => () => publishConnection({ active: false, status: 'disconnected', error: null }), []);
  const { roomId, adminPin, refereeToken } = options;

  useEffect(() => {
    const requirementsMet = canConnect(role, { roomId, adminPin, refereeToken });
    requirementsRef.current = requirementsMet;
    if (!requirementsMet) {
      setStatus('disconnected');
      setState(null);
      setError(null);
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(getWsUrl(), {
      transports: ['websocket'],
      autoConnect: false
    });

    const registerPayload: RegistrationPayload = {
      role,
      roomId: roomId!,
      pin: adminPin,
      token: refereeToken,
      host: typeof window !== 'undefined' ? window.location.hostname : ''
    };

    let failedAttempts = 0;
    socket.on('connect', () => {
      failedAttempts = 0;
      registeredRef.current = false;
      socket.emit('client:register', registerPayload, (response: AckResponse) => {
        if ('error' in response) {
          setError(response.error);
          socket.disconnect();
          return;
        }
        registeredRef.current = true;
        setStatus('connected');
        setError(null);
      });
    });

    socket.on('disconnect', () => {
      registeredRef.current = false;
      setStatus('disconnected');
    });

    socket.on('connect_error', (err: Error) => {
      setStatus('disconnected');
      setError(err.message);
      failedAttempts += 1;
      // Uma falha isolada é rede oscilando; cinco seguidas é tela sem servidor.
      if (failedAttempts === 5) {
        reportClientError({ kind: 'socket_connect_loop', message: `${role}: ${err.message}` });
      }
    });

    socket.on('state:update', (snapshot: AppState) => {
      setState(snapshot);
    });

    setStatus('connecting');
    socket.connect();
    socketRef.current = socket;

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role, roomId, adminPin, refereeToken]);

  const send = useMemo(() => {
    return (event: string, payload?: unknown) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected || !registeredRef.current) return;
      socket.emit(event, payload); // fire-and-forget for simplicidade
    };
  }, []);

  const sendVote = (vote: VoteValue) => {
    send('ref:vote', { vote });
  };

  const sendCard = (card: CardValue) => {
    send('ref:card', { card });
  };

  const ready = () => send('admin:ready');
  const release = () => send('admin:release');
  const clear = () => send('admin:clear');
  const timerStart = () => send('timer:command', { action: 'start' });
  const timerStop = () => send('timer:command', { action: 'stop' });
  const timerReset = () => send('timer:command', { action: 'reset' });
  const timerSet = (seconds: number) => send('timer:command', { action: 'set', seconds });
  const intervalSet = (seconds: number) => send('interval:command', { action: 'set', seconds });
  const intervalStart = () => send('interval:command', { action: 'start' });
  const intervalStop = () => send('interval:command', { action: 'stop' });
  const intervalReset = () => send('interval:command', { action: 'reset' });
  const intervalShow = () => send('interval:command', { action: 'show' });
  const intervalHide = () => send('interval:command', { action: 'hide' });
  const changeLocale = (locale: AppLocale) => send('locale:change', { locale });
  const setLegendConfig = (config: LegendConfig) => send('legend:config', { config });

  return {
    status,
    state,
    sendVote,
    sendCard,
    ready,
    release,
    clear,
    timerStart,
    timerStop,
    timerReset,
    timerSet,
    intervalSet,
    intervalStart,
    intervalStop,
    intervalReset,
    intervalShow,
    intervalHide,
    changeLocale,
    setLegendConfig,
    error
  };
}

function canConnect(
  role: ClientRole,
  options: { roomId?: string; adminPin?: string; refereeToken?: string }
) {
  if (!options.roomId) {
    return false;
  }

  if (role === 'admin' || role === 'display') {
    return Boolean(options.adminPin);
  }

  return Boolean(options.refereeToken);
}

type RegistrationPayload = {
  role: ClientRole;
  roomId: string;
  pin?: string;
  token?: string;
  host?: string;
};

type AckResponse = { ok: true } | { error: string };
