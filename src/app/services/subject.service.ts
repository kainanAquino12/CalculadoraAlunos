import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { CURRENT_SEMESTER } from '../config';
import { DEFAULT_SUBJECTS } from '../data/default-subjects';
import { Grades } from '../models/evaluation.model';
import { ResolvedSubject, Subject } from '../models/subject.model';
import { AuthService } from './auth.service';
import { AppState, StorageService } from './storage.service';
import { GradeCalculatorService, SubjectSummary } from './grade-calculator.service';

const WEIGHT_TOLERANCE = 0.01;
const PERIOD_KEY = 'notacerta:period';
const SEMESTER_RE = /^\d{4}\/[12]$/;

/** "2026/2" → "2026/1" → "2025/2" … */
export function previousSemesters(semester: string, count: number): string[] {
  const m = /^(\d{4})\/([12])$/.exec(semester);
  if (!m) return [];
  let year = Number(m[1]);
  let term = Number(m[2]);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    if (term === 2) term = 1;
    else {
      term = 2;
      year--;
    }
    out.push(`${year}/${term}`);
  }
  return out;
}

/** Mais recente primeiro; períodos fora do formato AAAA/N vão para o fim. */
function compareSemestersDesc(a: string, b: string): number {
  const ok = (s: string) => SEMESTER_RE.test(s);
  if (ok(a) && ok(b)) return b.localeCompare(a);
  return ok(a) ? -1 : ok(b) ? 1 : a.localeCompare(b);
}

/** Estado do app: disciplinas + notas reais + simulações, com persistência automática. */
@Injectable({ providedIn: 'root' })
export class SubjectService {
  private readonly storage = inject(StorageService);
  private readonly calc = inject(GradeCalculatorService);
  private readonly auth = inject(AuthService);

  private readonly state = signal<AppState>(this.storage.load());
  /** Simulações ficam só na memória e nunca se misturam com as notas reais. */
  private readonly simulations = signal<Record<string, Record<string, number>>>({});

  /** `false` quando o navegador não permite salvar (ex.: aba anônima com armazenamento bloqueado). */
  readonly saveFailed = signal(false);

  constructor() {
    // Trocou de conta (entrar/sair): carrega as notas daquela conta.
    effect(() => {
      this.auth.storageKey();
      untracked(() => {
        this.state.set(this.storage.load());
        this.simulations.set({});
      });
    });
  }

  readonly currentSemester = CURRENT_SEMESTER;
  /** Período mostrado no painel (lembrado entre visitas). */
  readonly selectedSemester = signal(this.loadPeriod());

  readonly subjects = computed<ResolvedSubject[]>(() => {
    const s = this.state();
    return [...DEFAULT_SUBJECTS, ...s.customSubjects].map((subject) => this.resolve(subject, s));
  });

  /** Atual + 2 anteriores + qualquer período que tenha matérias. */
  readonly semesters = computed(() => {
    const set = new Set<string>([CURRENT_SEMESTER, ...previousSemesters(CURRENT_SEMESTER, 2), this.selectedSemester()]);
    for (const s of this.subjects()) set.add(s.semester);
    return [...set].sort(compareSemestersDesc);
  });

  readonly visibleSubjects = computed(() => this.subjects().filter((s) => s.semester === this.selectedSemester()));

  readonly summaries = computed<Record<string, SubjectSummary>>(() => {
    const s = this.state();
    const out: Record<string, SubjectSummary> = {};
    for (const subject of this.subjects()) out[subject.id] = this.calc.summarize(subject, s.grades[subject.id] ?? {});
    return out;
  });

  selectSemester(semester: string): void {
    const value = semester.trim();
    if (!value) return;
    this.selectedSemester.set(value);
    try {
      localStorage.setItem(PERIOD_KEY, value);
    } catch {
      /* só vale nesta visita */
    }
  }

  findSubject(id: string): ResolvedSubject | undefined {
    return this.subjects().find((s) => s.id === id);
  }

  gradesOf(id: string): Grades {
    return this.state().grades[id] ?? {};
  }

  simulatedOf(id: string): Grades {
    return this.simulations()[id] ?? {};
  }

  // ── notas reais ──────────────────────────────────────────────

  /** `null` limpa a nota (volta a ser pendente). Zero é uma nota válida. */
  setGrade(subjectId: string, evaluationId: string, value: number | null): void {
    this.update((s) => {
      const grades = { ...(s.grades[subjectId] ?? {}) };
      if (value === null) delete grades[evaluationId];
      else grades[evaluationId] = value;
      return { ...s, grades: { ...s.grades, [subjectId]: grades } };
    });
    // Ao lançar a nota real, a simulação daquela avaliação deixa de ter sentido.
    if (value !== null) this.setSimulation(subjectId, evaluationId, null);
  }

  resetGrades(subjectId: string): void {
    this.update((s) => {
      const grades = { ...s.grades };
      delete grades[subjectId];
      return { ...s, grades };
    });
    this.clearSimulations(subjectId);
  }

  // ── simulações ───────────────────────────────────────────────

  setSimulation(subjectId: string, evaluationId: string, value: number | null): void {
    this.simulations.update((all) => {
      const sims = { ...(all[subjectId] ?? {}) };
      if (value === null) delete sims[evaluationId];
      else sims[evaluationId] = value;
      return { ...all, [subjectId]: sims };
    });
  }

  clearSimulations(subjectId: string): void {
    this.simulations.update((all) => ({ ...all, [subjectId]: {} }));
  }

  // ── configuração por disciplina ──────────────────────────────

  setTarget(subjectId: string, target: number | null): void {
    this.update((s) => {
      const targets = { ...s.targets };
      if (target === null) delete targets[subjectId];
      else targets[subjectId] = target;
      return { ...s, targets };
    });
  }

  setConfirmed(subjectId: string, confirmed: boolean): void {
    this.update((s) => {
      const map = { ...s.confirmed };
      if (confirmed) map[subjectId] = true;
      else delete map[subjectId];
      return { ...s, confirmed: map };
    });
  }

  /** Salva pesos percentuais. Retorna uma mensagem de erro, ou `null` se deu certo. `null` em `percents` restaura o padrão. */
  setWeights(subjectId: string, percents: Record<string, number> | null): string | null {
    if (percents !== null) {
      const values = Object.values(percents);
      if (values.some((v) => !Number.isFinite(v) || v < 0)) return 'Os pesos não podem ser negativos.';
      const total = values.reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > WEIGHT_TOLERANCE) return `Os pesos somam ${total.toFixed(2).replace('.', ',')}%. Eles precisam somar 100%.`;
    }
    this.update((s) => {
      const weights = { ...s.weights };
      if (percents === null) delete weights[subjectId];
      else weights[subjectId] = percents;
      return { ...s, weights };
    });
    return null;
  }

  // ── disciplinas personalizadas ───────────────────────────────

  addSubject(subject: Subject): void {
    this.update((s) => ({ ...s, customSubjects: [...s.customSubjects, { ...subject, custom: true }] }));
  }

  removeSubject(subjectId: string): void {
    this.update((s) => {
      const strip = <T>(m: Record<string, T>): Record<string, T> => {
        const copy = { ...m };
        delete copy[subjectId];
        return copy;
      };
      return {
        ...s,
        customSubjects: s.customSubjects.filter((c) => c.id !== subjectId),
        grades: strip(s.grades),
        weights: strip(s.weights),
        targets: strip(s.targets),
        confirmed: strip(s.confirmed),
      };
    });
    this.clearSimulations(subjectId);
  }

  // ── backup ───────────────────────────────────────────────────

  exportBackup(): string {
    return this.storage.exportJson(this.state());
  }

  /** Substitui os dados atuais pelo conteúdo do backup. Lança `Error` amigável se inválido. */
  importBackup(text: string): void {
    const next = this.storage.parseBackup(text);
    this.simulations.set({});
    this.update(() => next);
  }

  // ── internos ─────────────────────────────────────────────────

  private loadPeriod(): string {
    try {
      const saved = localStorage.getItem(PERIOD_KEY);
      if (saved && SEMESTER_RE.test(saved)) return saved;
    } catch {
      /* ignora */
    }
    return CURRENT_SEMESTER;
  }

  private update(fn: (s: AppState) => AppState): void {
    const next = fn(this.state());
    this.state.set(next);
    this.saveFailed.set(!this.storage.save(next));
  }

  /** Aplica meta, pesos e confirmação escolhidos pelo aluno sobre a definição base da disciplina. */
  private resolve(subject: Subject, s: AppState): ResolvedSubject {
    const target = s.targets[subject.id] ?? subject.target;
    let evaluations = subject.evaluations;
    let weightsCustomized = false;
    let weightsInvalid = false;

    const custom = s.weights[subject.id];
    if (custom && subject.weightsEditable) {
      const complete = subject.evaluations.every((e) => Number.isFinite(custom[e.id]));
      const total = subject.evaluations.reduce((sum, e) => sum + (custom[e.id] ?? 0), 0);
      if (complete && Math.abs(total - 100) <= WEIGHT_TOLERANCE) {
        evaluations = subject.evaluations.map((e) => ({
          ...e,
          weight: custom[e.id],
          maxPoints: (custom[e.id] * subject.finalScale) / 100,
        }));
        weightsCustomized = true;
      } else {
        weightsInvalid = true;
      }
    }

    return {
      ...subject,
      target,
      evaluations,
      provisional: subject.formula.validation === 'pending' && !s.confirmed[subject.id],
      weightsCustomized,
      weightsInvalid,
    };
  }
}
