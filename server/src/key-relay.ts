import { spawn } from 'node:child_process';
import { platform } from 'node:process';

type Decision = 'valid' | 'invalid' | 'none';

interface KeyDefinition {
  macKeyCode: number;
  winSequence: string;
  linuxSequence: string;
}

const FUNCTION_KEYS: Record<string, KeyDefinition> = {
  F1: { macKeyCode: 122, winSequence: '{F1}', linuxSequence: 'F1' },
  F2: { macKeyCode: 120, winSequence: '{F2}', linuxSequence: 'F2' },
  F3: { macKeyCode: 99, winSequence: '{F3}', linuxSequence: 'F3' },
  F4: { macKeyCode: 118, winSequence: '{F4}', linuxSequence: 'F4' },
  F5: { macKeyCode: 96, winSequence: '{F5}', linuxSequence: 'F5' },
  F6: { macKeyCode: 97, winSequence: '{F6}', linuxSequence: 'F6' },
  F7: { macKeyCode: 98, winSequence: '{F7}', linuxSequence: 'F7' },
  F8: { macKeyCode: 100, winSequence: '{F8}', linuxSequence: 'F8' },
  F9: { macKeyCode: 101, winSequence: '{F9}', linuxSequence: 'F9' },
  F10: { macKeyCode: 109, winSequence: '{F10}', linuxSequence: 'F10' },
  F11: { macKeyCode: 103, winSequence: '{F11}', linuxSequence: 'F11' },
  F12: { macKeyCode: 111, winSequence: '{F12}', linuxSequence: 'F12' }
};

const TRIGGER_DELAY_MS = 1600;

/**
 * Combinação aceita: até 3 modificadores conhecidos + F1–F12 ou UMA letra/
 * dígito. A tecla vai interpolada em comandos do PowerShell (SendKeys) e do
 * AppleScript: sem essa lista branca, uma "tecla" como `x');Start-Process
 * calc;('` executava comando arbitrário na máquina do bundle.
 */
const KEY_COMBO_RE = /^(?:(?:ctrl|shift|alt|meta)\+){0,3}(?:f(?:[1-9]|1[0-2])|[a-z0-9])$/i;

function isValidKeyCombo(combo: unknown): combo is string {
  return typeof combo === 'string' && combo.length <= 32 && KEY_COMBO_RE.test(combo.replace(/\s+/g, ''));
}

export class KeyRelay {
  private active = false;
  private roomId: string | null = null;
  private validKey = 'F1';
  private invalidKey = 'F10';
  private lastDecision: Decision = 'none';
  private pendingTimeout: ReturnType<typeof setTimeout> | null = null;

  get isActive() { return this.active; }
  get monitoredRoom() { return this.roomId; }
  get keys() { return { valid: this.validKey, invalid: this.invalidKey }; }

  start(roomId: string, validKey = 'F1', invalidKey = 'F10') {
    if (!isValidKeyCombo(validKey) || !isValidKeyCombo(invalidKey)) {
      throw new Error('invalid_key');
    }
    validKey = validKey.replace(/\s+/g, '');
    invalidKey = invalidKey.replace(/\s+/g, '');
    this.roomId = roomId;
    this.validKey = validKey;
    this.invalidKey = invalidKey;
    this.active = true;
    this.lastDecision = 'none';
    console.log(`[key-relay] Ativo na sala ${roomId} (válido=${this.validKey}, inválido=${this.invalidKey})`);
  }

  stop() {
    this.active = false;
    this.roomId = null;
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    this.lastDecision = 'none';
    console.log('[key-relay] Desativado');
  }

  /** Called by server on every state broadcast */
  onStateUpdate(roomId: string, state: { phase: string; votes: Record<string, string | null> }) {
    if (!this.active || roomId !== this.roomId) return;

    if (state.phase !== 'revealed') {
      if (this.lastDecision !== 'none' && state.phase === 'idle') {
        this.lastDecision = 'none';
      }
      return;
    }

    const votes = Object.values(state.votes ?? {});
    const whiteCount = votes.filter((v) => v === 'white').length;
    const redCount = votes.filter((v) => v === 'red').length;

    let outcome: Decision = 'none';
    if (whiteCount >= 2) outcome = 'valid';
    else if (redCount >= 2) outcome = 'invalid';

    if (outcome === 'none' || outcome === this.lastDecision) return;

    this.lastDecision = outcome;
    this.scheduleKey(outcome);
  }

  private scheduleKey(outcome: Decision) {
    const keyCombo = outcome === 'valid' ? this.validKey : this.invalidKey;

    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
    }

    console.log(`[key-relay] Decisão: ${outcome}. Enviando ${keyCombo} em ${TRIGGER_DELAY_MS}ms...`);

    this.pendingTimeout = setTimeout(async () => {
      this.pendingTimeout = null;
      try {
        await sendKeyCombo(keyCombo);
        console.log(`[key-relay] Tecla ${keyCombo} enviada.`);
      } catch (err) {
        console.error(`[key-relay] Falha ao enviar ${keyCombo}:`, err);
      }
    }, TRIGGER_DELAY_MS);
  }
}

/** Parse combo like "Ctrl+Shift+F1" and send via OS */
async function sendKeyCombo(combo: string): Promise<void> {
  // Try simple function key first
  const simpleDef = FUNCTION_KEYS[combo.toUpperCase()];
  if (simpleDef) {
    return sendSimpleKey(simpleDef);
  }

  // Parse combo: Ctrl+Alt+Shift+Key
  const parts = combo.split('+').map(p => p.trim());
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());

  switch (platform) {
    case 'win32':
      return sendWinCombo(modifiers, key);
    case 'darwin':
      return sendMacCombo(modifiers, key);
    default:
      return sendLinuxCombo(modifiers, key);
  }
}

async function sendSimpleKey(def: KeyDefinition): Promise<void> {
  switch (platform) {
    case 'darwin':
      return runCommand('osascript', ['-e', `tell application "System Events" to key code ${def.macKeyCode}`]);
    case 'win32':
      return runCommand('powershell', [
        '-NoLogo', '-NoProfile', '-Command',
        `$wshell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 50; $wshell.SendKeys('${def.winSequence}')`
      ]);
    default:
      return runCommand('xdotool', ['key', def.linuxSequence]);
  }
}

function sendWinCombo(modifiers: string[], key: string): Promise<void> {
  // WScript.Shell SendKeys: ^ = Ctrl, + = Shift, % = Alt
  let seq = '';
  for (const m of modifiers) {
    if (m === 'ctrl') seq += '^';
    else if (m === 'shift') seq += '+';
    else if (m === 'alt') seq += '%';
  }
  const fk = FUNCTION_KEYS[key.toUpperCase()];
  seq += fk ? fk.winSequence : key.toLowerCase();
  return runCommand('powershell', [
    '-NoLogo', '-NoProfile', '-Command',
    `$wshell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 50; $wshell.SendKeys('${seq}')`
  ]);
}

function sendMacCombo(modifiers: string[], key: string): Promise<void> {
  const fk = FUNCTION_KEYS[key.toUpperCase()];
  const modStr = modifiers.map(m => {
    if (m === 'ctrl') return 'control down';
    if (m === 'shift') return 'shift down';
    if (m === 'alt') return 'option down';
    if (m === 'meta') return 'command down';
    return '';
  }).filter(Boolean).join(', ');
  const using = modStr ? ` using {${modStr}}` : '';
  const keyPart = fk ? `key code ${fk.macKeyCode}` : `keystroke "${key.toLowerCase()}"`;
  return runCommand('osascript', ['-e', `tell application "System Events" to ${keyPart}${using}`]);
}

function sendLinuxCombo(modifiers: string[], key: string): Promise<void> {
  const fk = FUNCTION_KEYS[key.toUpperCase()];
  const parts = modifiers.map(m => {
    if (m === 'ctrl') return 'ctrl';
    if (m === 'shift') return 'shift';
    if (m === 'alt') return 'alt';
    if (m === 'meta') return 'super';
    return m;
  });
  parts.push(fk ? fk.linuxSequence : key);
  return runCommand('xdotool', ['key', parts.join('+')]);
}

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', (err) => reject(err));
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
  });
}
