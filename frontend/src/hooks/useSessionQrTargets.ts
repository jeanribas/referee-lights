import { useEffect, useState } from 'react';

import { accessRoom } from '@/lib/api';
import { buildRefHref, isLoopbackHost, resolveAppOrigin, type QrTarget } from '@/lib/ref-links';

type Labels = { left: string; center: string; right: string };

/**
 * Links ATUAIS dos árbitros para mostrar em QR fora do admin (timer, display).
 * Usa a rota de leitura da sala — nunca gera tokens novos, então quem já está
 * conectado continua conectado. Busca de novo a cada abertura (`open`), para
 * refletir um "Gerar novos links" feito no admin nesse meio-tempo.
 */
export function useSessionQrTargets({
  open,
  roomId,
  adminPin,
  labels
}: {
  open: boolean;
  roomId: string | undefined;
  adminPin: string | undefined;
  labels: Labels;
}) {
  const [targets, setTargets] = useState<QrTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loopback, setLoopback] = useState(false);

  useEffect(() => {
    if (!open || !roomId || !adminPin) return;
    let cancelled = false;
    setLoading(true);
    setErrorCode(null);
    const origin = resolveAppOrigin();
    setLoopback(isLoopbackHost(new URL(origin).hostname));
    accessRoom(roomId, adminPin)
      .then((access) => {
        if (cancelled) return;
        setTargets([
          { judge: 'left', label: labels.left, href: buildRefHref(origin, roomId, access.joinQRCodes.left.token, 'left') },
          { judge: 'center', label: labels.center, href: buildRefHref(origin, roomId, access.joinQRCodes.center.token, 'center') },
          { judge: 'right', label: labels.right, href: buildRefHref(origin, roomId, access.joinQRCodes.right.token, 'right') }
        ]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTargets([]);
        setErrorCode(err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' ? err.code : 'request_failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, roomId, adminPin, labels.left, labels.center, labels.right]);

  return { targets, loading, errorCode, loopback };
}
