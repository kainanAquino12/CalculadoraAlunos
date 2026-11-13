import { inject, Injectable, signal } from '@angular/core';
import { Evaluation } from '../models/evaluation.model';
import { roundTo } from '../utils/number';
import { AuthService } from './auth.service';

export interface CanvasCourse {
  id: number;
  name: string;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  pointsPossible: number | null;
  /** Nota que o professor já publicou para você; `null` se ainda não saiu. */
  score: number | null;
  graded: boolean;
}

interface Connection {
  host: string;
  token: string;
  userName?: string;
}

/** Atividades do AVA ligadas a cada avaliação do NotaCerta, por disciplina. */
export interface CanvasLink {
  courseId: number;
  evaluations: Record<string, number[]>;
}

export class CanvasError extends Error {}

const CONNECTION_KEY = 'notacerta:canvas';
const LINKS_KEY = 'notacerta:canvas-links';
const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'e', 'a', 'o', 'para', 'com', 'na', 'no']);
const MAX_PAGES = 10;

// ── funções puras (testáveis) ─────────────────────────────────

/** Aceita "pucpr.instructure.com", "https://pucpr.instructure.com/" etc. Retorna só o host, ou `null` se inválido. */
export function normalizeHost(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .split(/[/?#]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** Extrai o caminho da próxima página do cabeçalho `Link` (paginação do Canvas). */
export function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m) {
      try {
        const url = new URL(m[1]);
        return url.pathname + url.search;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t) && (t.length > 1 || /\d/.test(t)));
}

/** Fração (0–1) das palavras de `a` que aparecem em `b`. */
export function nameScore(a: string, b: string): number {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  return ta.length ? ta.filter((t) => tb.has(t)).length / ta.length : 0;
}

/** Identificador da avaliação: o que vem antes do travessão ("TDE 3 — Trabalho de Modelagem" → "tde 3"). */
function evaluationKey(name: string): string {
  return normalizeText(name.split(/\s[—–-]\s/)[0]);
}

/**
 * A atividade do AVA tem o identificador da avaliação, como sequência de palavras ("TDE 3 - Avaliativo - Peso 2,0" casa
 * com "TDE 3", mas "TDE 5 - Peso 3" não). Assim o número do peso não confunde, e textos extras no nome não atrapalham.
 */
export function matchesEvaluation(evaluationName: string, assignmentName: string): boolean {
  const key = evaluationKey(evaluationName);
  return key !== '' && ` ${normalizeText(assignmentName)} `.includes(` ${key} `);
}

/** Atividades sugeridas para a avaliação (o aluno sempre confere e ajusta). */
export function suggestAssignmentIds(evaluationName: string, assignments: CanvasAssignment[]): number[] {
  return assignments.filter((a) => matchesEvaluation(evaluationName, a.name)).map((a) => a.id);
}

/** "Prova 1 - Peso 2,0 - 03/09" → 2. Retorna `null` se o nome não traz peso. */
export function weightFromName(name: string): number | null {
  const m = /peso\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i.exec(name);
  const value = m ? Number(m[1].replace(',', '.')) : NaN;
  return value > 0 ? value : null;
}

/**
 * Quanto vale a atividade na escala em que a nota foi lançada. Professores costumam lançar a nota já na escala do peso
 * (ex.: "Prova 1 - Peso 2,0" com "valor 10 pt" e nota 1,90 = 1,90 de 2,0). Se o nome traz o peso e a nota cabe nele,
 * usa o peso; se a nota passa do peso, ela claramente está na escala do "valor da atividade".
 */
export function effectiveMax(a: Pick<CanvasAssignment, 'name' | 'score' | 'pointsPossible'>): number {
  const weight = weightFromName(a.name);
  if (weight !== null && (a.score === null || a.score <= weight + 1e-9)) return weight;
  return a.pointsPossible ?? 0;
}

export type ImportResult = { grade: number; detail: string } | { grade: null; reason: string };

/**
 * Converte atividades do AVA na nota da avaliação (na escala dela). Várias atividades somam pontos.
 * Só devolve nota se TODAS já foram corrigidas, para não registrar uma nota parcial como se fosse final.
 */
export function gradeFromAssignments(ev: Pick<Evaluation, 'scale'>, assignments: CanvasAssignment[]): ImportResult {
  if (assignments.length === 0) return { grade: null, reason: 'Nenhuma atividade escolhida.' };
  if (assignments.some((a) => !a.graded || a.score === null)) return { grade: null, reason: 'O professor ainda não publicou todas as notas.' };
  const possible = assignments.reduce((s, a) => s + effectiveMax(a), 0);
  if (!(possible > 0)) return { grade: null, reason: 'A atividade não tem pontuação máxima no AVA.' };
  const score = assignments.reduce((s, a) => s + (a.score ?? 0), 0);
  const grade = roundTo(Math.min(score / possible, 1) * ev.scale, 2);
  return { grade, detail: `${score} de ${possible} pontos no AVA` };
}

// ── serviço ────────────────────────────────────────────────────

/**
 * Conexão com o Canvas (AVA) usando o token pessoal do aluno. O token fica só neste navegador: na sessão (padrão)
 * ou no aparelho, se o aluno pedir para lembrar. As consultas passam pela função `/api/canvas` do próprio site,
 * que só repassa a requisição ao AVA e não guarda nada (o AVA não aceita chamadas diretas do navegador).
 */
@Injectable({ providedIn: 'root' })
export class CanvasService {
  private readonly auth = inject(AuthService);
  readonly connection = signal<Connection | null>(this.loadConnection());

  get connected(): boolean {
    return this.connection() !== null;
  }

  /** Testa o token e guarda a conexão. Lança `CanvasError` com mensagem amigável. */
  async connect(hostInput: string, token: string, remember: boolean): Promise<string> {
    const host = normalizeHost(hostInput);
    if (!host) throw new CanvasError('Informe o endereço do AVA, como pucpr.instructure.com.');
    const clean = token.trim();
    if (!clean) throw new CanvasError('Cole o token de acesso.');

    const previous = this.connection();
    this.connection.set({ host, token: clean });
    try {
      const me = (await this.readJson(await this.request('/api/v1/users/self'))) as { name?: string };
      const conn: Connection = { host, token: clean, userName: me.name };
      this.connection.set(conn);
      this.persist(conn, remember);
      return me.name ?? '';
    } catch (e) {
      this.connection.set(previous);
      throw e;
    }
  }

  disconnect(): void {
    this.connection.set(null);
    try {
      sessionStorage.removeItem(CONNECTION_KEY);
      localStorage.removeItem(CONNECTION_KEY);
    } catch {
      /* ignora */
    }
  }

  async courses(): Promise<CanvasCourse[]> {
    const raw = await this.getAll<{ id: number; name?: string }>('/api/v1/courses?enrollment_state=active&enrollment_type=student&per_page=100');
    return raw.filter((c) => c.name).map((c) => ({ id: c.id, name: c.name! }));
  }

  async assignments(courseId: number): Promise<CanvasAssignment[]> {
    type Raw = { id: number; name: string; points_possible: number | null; submission?: { score?: number | null; workflow_state?: string; excused?: boolean } };
    const raw = await this.getAll<Raw>(`/api/v1/courses/${courseId}/assignments?include%5B%5D=submission&per_page=100`);
    return raw.map((a) => {
      const score = typeof a.submission?.score === 'number' ? a.submission.score : null;
      return {
        id: a.id,
        name: a.name,
        pointsPossible: a.points_possible,
        score,
        graded: score !== null && a.submission?.workflow_state === 'graded' && !a.submission?.excused,
      };
    });
  }

  // ── vínculos avaliação ↔ atividades ──

  loadLink(subjectId: string): CanvasLink | null {
    const all = this.readLinks();
    return all[this.linkKey(subjectId)] ?? null;
  }

  saveLink(subjectId: string, link: CanvasLink): void {
    const all = this.readLinks();
    all[this.linkKey(subjectId)] = link;
    try {
      localStorage.setItem(LINKS_KEY, JSON.stringify(all));
    } catch {
      /* ignora */
    }
  }

  // ── internos ──

  private linkKey(subjectId: string): string {
    return `${this.auth.storageKey()}|${subjectId}`;
  }

  private readLinks(): Record<string, CanvasLink> {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(LINKS_KEY) ?? '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, CanvasLink>) : {};
    } catch {
      return {};
    }
  }

  private async getAll<T>(firstPath: string): Promise<T[]> {
    const out: T[] = [];
    let path: string | null = firstPath;
    for (let page = 0; path && page < MAX_PAGES; page++) {
      const res = await this.request(path);
      out.push(...((await this.readJson(res)) as T[]));
      path = parseNextLink(res.headers.get('Link'));
    }
    return out;
  }

  private async readJson(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      throw new CanvasError('O AVA enviou uma resposta inesperada. Confira o endereço do AVA.');
    }
  }

  /**
   * O AVA não libera consultas diretas do navegador (não envia cabeçalhos CORS), então a ponte `/api/canvas`
   * do próprio site é o caminho principal. A chamada direta só é tentada se a ponte não existir (ex.: AVA que libera CORS).
   */
  private async request(path: string): Promise<Response> {
    const conn = this.connection();
    if (!conn) throw new CanvasError('Conecte ao AVA primeiro.');

    const res = (await this.viaBridge(conn, path)) ?? (await this.direct(conn, path));

    if (res.status === 401) throw new CanvasError('O AVA recusou o token (inválido, expirado ou removido). Gere um novo.');
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (typeof body?.error === 'string') throw new CanvasError(body.error);
      if (res.status === 404 && path.startsWith('/api/v1/users/self')) throw new CanvasError('Endereço do AVA não encontrado. Confira o endereço.');
      throw new CanvasError(`O AVA respondeu com erro ${res.status}.`);
    }
    return res;
  }

  /** `null` se a ponte não existe neste ambiente (rede caiu ou a resposta não é JSON, como a página do app). */
  private async viaBridge(conn: Connection, path: string): Promise<Response | null> {
    try {
      const res = await fetch(`/api/canvas?p=${encodeURIComponent(path)}`, { headers: { 'x-canvas-host': conn.host, 'x-canvas-token': conn.token } });
      return (res.headers.get('content-type') ?? '').includes('json') ? res : null;
    } catch {
      return null;
    }
  }

  private async direct(conn: Connection, path: string): Promise<Response> {
    try {
      return await fetch(`https://${conn.host}${path}`, { headers: { Authorization: `Bearer ${conn.token}`, Accept: 'application/json' } });
    } catch {
      throw new CanvasError(
        'Não foi possível falar com o AVA. O AVA bloqueia consultas diretas do navegador e a ponte do site não está ativa aqui: use o site publicado na Vercel ou rode "npm start".',
      );
    }
  }

  private persist(conn: Connection, remember: boolean): void {
    try {
      sessionStorage.removeItem(CONNECTION_KEY);
      localStorage.removeItem(CONNECTION_KEY);
      (remember ? localStorage : sessionStorage).setItem(CONNECTION_KEY, JSON.stringify(conn));
    } catch {
      /* vale só nesta visita */
    }
  }

  private loadConnection(): Connection | null {
    for (const store of [sessionStorage, localStorage]) {
      try {
        const c = JSON.parse(store.getItem(CONNECTION_KEY) ?? 'null') as Partial<Connection> | null;
        if (c && typeof c.host === 'string' && typeof c.token === 'string') return c as Connection;
      } catch {
        /* tenta o próximo */
      }
    }
    return null;
  }
}
