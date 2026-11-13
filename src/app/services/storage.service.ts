import { inject, Injectable } from '@angular/core';
import { Subject } from '../models/subject.model';
import { AuthService, BASE_STORAGE_KEY } from './auth.service';

/** Tudo o que o aluno configurou. Notas ficam separadas por disciplina (id inclui o semestre) e por id de avaliação. */
export interface AppState {
  version: 1;
  grades: Record<string, Record<string, number>>;
  /** Pesos percentuais personalizados por disciplina/avaliação. */
  weights: Record<string, Record<string, number>>;
  targets: Record<string, number>;
  /** Fórmulas que o aluno marcou como conferidas. */
  confirmed: Record<string, boolean>;
  customSubjects: Subject[];
}

export const STORAGE_KEY = BASE_STORAGE_KEY;
/** Guarda quem herdou as notas feitas sem conta (só a primeira conta a entrar no aparelho herda). */
const CLAIMED_KEY = 'notacerta:guest-claimed';

export function emptyState(): AppState {
  return { version: 1, grades: {}, weights: {}, targets: {}, confirmed: {}, customSubjects: [] };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function numberMap(v: unknown, min = 0): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(v)) for (const [k, n] of Object.entries(v)) if (isNum(n) && n >= min) out[k] = n;
  return out;
}

function nestedNumberMap(v: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (isObj(v)) for (const [k, inner] of Object.entries(v)) out[k] = numberMap(inner);
  return out;
}

function isValidSubject(s: unknown): s is Subject {
  if (!isObj(s)) return false;
  return (
    typeof s['id'] === 'string' &&
    typeof s['name'] === 'string' &&
    isNum(s['target']) &&
    isNum(s['finalScale']) &&
    Array.isArray(s['evaluations']) &&
    s['evaluations'].every(
      (e) => isObj(e) && typeof e['id'] === 'string' && typeof e['name'] === 'string' && isNum(e['scale']) && isNum(e['maxPoints']),
    ) &&
    isObj(s['formula'])
  );
}

/** Aceita apenas o que reconhece; dados inválidos são descartados sem derrubar o resto. */
export function sanitizeState(raw: unknown): AppState {
  const state = emptyState();
  if (!isObj(raw)) return state;
  state.grades = nestedNumberMap(raw['grades']);
  state.weights = nestedNumberMap(raw['weights']);
  state.targets = numberMap(raw['targets']);
  if (isObj(raw['confirmed'])) {
    for (const [k, v] of Object.entries(raw['confirmed'])) if (v === true) state.confirmed[k] = true;
  }
  if (Array.isArray(raw['customSubjects'])) {
    state.customSubjects = raw['customSubjects'].filter(isValidSubject).map((s) => ({ ...s, custom: true }));
  }
  return state;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly auth = inject(AuthService);

  load(): AppState {
    try {
      const key = this.auth.storageKey();
      let text = localStorage.getItem(key);
      if (text === null && key !== STORAGE_KEY) text = this.claimGuestData(key);
      return text ? sanitizeState(JSON.parse(text)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  /** Retorna `false` se o navegador bloqueou o armazenamento. */
  save(state: AppState): boolean {
    try {
      localStorage.setItem(this.auth.storageKey(), JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  /** Na primeira conta que entra no aparelho, aproveita as notas lançadas antes, sem conta. */
  private claimGuestData(accountKey: string): string | null {
    const guest = localStorage.getItem(STORAGE_KEY);
    if (!guest || localStorage.getItem(CLAIMED_KEY)) return null;
    localStorage.setItem(CLAIMED_KEY, accountKey);
    localStorage.setItem(accountKey, guest);
    return guest;
  }

  exportJson(state: AppState): string {
    return JSON.stringify({ app: 'NotaCerta', exportedAt: new Date().toISOString(), ...state }, null, 2);
  }

  /** Lê um backup. Lança `Error` com mensagem amigável se o arquivo não for válido. */
  parseBackup(text: string): AppState {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('O arquivo não é um backup válido do NotaCerta.');
    }
    if (!isObj(data) || data['app'] !== 'NotaCerta' || data['version'] !== 1) {
      throw new Error('O arquivo não é um backup válido do NotaCerta.');
    }
    return sanitizeState(data);
  }
}
