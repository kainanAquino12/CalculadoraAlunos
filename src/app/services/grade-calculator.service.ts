import { Injectable } from '@angular/core';
import { Evaluation, GradeParseResult, Grades } from '../models/evaluation.model';
import { Subject } from '../models/subject.model';
import { ceilTo, clamp, EPS, fmt } from '../utils/number';

export type SubjectStatus = 'in-progress' | 'target-reached' | 'completed' | 'out-of-reach';

/** O que o aluno precisa em uma avaliação pendente (estratégia proporcional). */
export interface PendingGuidance {
  evaluation: Evaluation;
  /** Nota mínima (na escala da avaliação), arredondada para cima. `null` = impossível. */
  requiredGrade: number | null;
  /** Pontos da nota final correspondentes à nota mínima. */
  requiredPoints: number | null;
}

export interface ScenarioItem {
  evaluationId: string;
  name: string;
  grade: number;
  scale: number;
}

export interface Scenario {
  label: string;
  items: ScenarioItem[];
}

export interface GroupSummary {
  id: string;
  name: string;
  points: number;
  maxPoints: number;
  done: number;
  total: number;
  /** Nota do grupo na escala final (só no modelo `grouped`, onde o grupo tem `share`). */
  grade: number | null;
}

export interface SubjectSummary {
  finalScale: number;
  target: number;
  /** Pontos já conquistados na escala final. NÃO é uma média das avaliações feitas. */
  accumulated: number;
  /** Pontos ainda disponíveis nas avaliações sem nota. */
  pendingMax: number;
  /** target − accumulated (pode ser negativo). */
  needed: number;
  /** Pontos que ainda faltam para a meta (nunca negativo). */
  missing: number;
  /** Máximo que ainda é possível alcançar. */
  maxPossible: number;
  /** Fração (0–1) dos pontos pendentes necessária; `null` se não há pendências ou se é impossível. */
  requiredShare: number | null;
  targetReached: boolean;
  achievable: boolean;
  allDone: boolean;
  status: SubjectStatus;
  doneCount: number;
  totalCount: number;
  pending: PendingGuidance[];
  scenarios: Scenario[];
  groups: GroupSummary[];
}

const hasGrade = (g: number | null | undefined): g is number => typeof g === 'number' && Number.isFinite(g);

/**
 * Toda a matemática do app vive aqui — componentes só exibem o resultado.
 * Os métodos são puros (sem estado), então também podem ser usados com `new GradeCalculatorService()`.
 */
@Injectable({ providedIn: 'root' })
export class GradeCalculatorService {
  /** Contribuição (na escala final) de uma nota. */
  pointsFor(ev: Evaluation, grade: number): number {
    if (!(ev.scale > 0) || !Number.isFinite(grade)) return 0;
    return (clamp(grade, 0, ev.scale) / ev.scale) * ev.maxPoints;
  }

  /** Nota (na escala da avaliação) equivalente a certa quantidade de pontos finais. */
  gradeFor(ev: Evaluation, points: number): number {
    if (!(ev.maxPoints > 0)) return 0;
    return (points / ev.maxPoints) * ev.scale;
  }

  /** Valida o texto digitado. Vazio = pendente; "0" = nota zero. */
  parseGrade(ev: Pick<Evaluation, 'scale'>, raw: string): GradeParseResult {
    const text = raw.trim();
    if (text === '') return { ok: true, value: null };
    if (text.startsWith('-')) return { ok: false, error: 'A nota não pode ser negativa.' };
    if (!/^(\d+[.,]?\d*|[.,]\d+)$/.test(text)) return { ok: false, error: 'Digite um número, como 7,5.' };
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value)) return { ok: false, error: 'Digite um número, como 7,5.' };
    if (value > ev.scale + EPS) return { ok: false, error: `Essa avaliação vale no máximo ${fmt(ev.scale)}.` };
    return { ok: true, value };
  }

  /** Notas reais têm prioridade; simuladas só preenchem o que está pendente. */
  merge(real: Grades, simulated: Grades): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const [id, v] of Object.entries(simulated)) if (hasGrade(v)) out[id] = v;
    for (const [id, v] of Object.entries(real)) if (hasGrade(v)) out[id] = v;
    return out;
  }

  summarize(subject: Subject, grades: Grades): SubjectSummary {
    const evs = subject.evaluations;
    const target = Number.isFinite(subject.target) ? subject.target : 0;

    let accumulated = 0;
    let pendingMax = 0;
    let doneCount = 0;
    const pendingEvs: Evaluation[] = [];
    for (const ev of evs) {
      const g = grades[ev.id];
      if (hasGrade(g)) {
        accumulated += this.pointsFor(ev, g);
        doneCount++;
      } else {
        pendingMax += ev.maxPoints;
        pendingEvs.push(ev);
      }
    }

    const finalScale = evs.reduce((s, e) => s + e.maxPoints, 0);
    const needed = target - accumulated;
    const targetReached = needed <= EPS;
    const missing = targetReached ? 0 : needed;
    const maxPossible = accumulated + pendingMax;
    const achievable = maxPossible >= target - EPS;
    const allDone = evs.length > 0 && pendingEvs.length === 0;
    const requiredShare =
      !targetReached && achievable && pendingMax > EPS ? clamp(missing / pendingMax, 0, 1) : null;

    let status: SubjectStatus;
    if (allDone) status = 'completed';
    else if (targetReached) status = 'target-reached';
    else if (!achievable) status = 'out-of-reach';
    else status = 'in-progress';

    const pending: PendingGuidance[] = pendingEvs.map((ev) => {
      if (targetReached) return { evaluation: ev, requiredGrade: 0, requiredPoints: 0 };
      if (requiredShare === null) return { evaluation: ev, requiredGrade: null, requiredPoints: null };
      const requiredGrade = Math.min(ceilTo(requiredShare * ev.scale, ev.step ?? 0.01), ev.scale);
      return { evaluation: ev, requiredGrade, requiredPoints: this.pointsFor(ev, requiredGrade) };
    });

    return {
      finalScale,
      target,
      accumulated,
      pendingMax,
      needed,
      missing,
      maxPossible,
      requiredShare,
      targetReached,
      achievable,
      allDone,
      status,
      doneCount,
      totalCount: evs.length,
      pending,
      scenarios: status === 'in-progress' ? this.buildScenarios(pendingEvs, missing, requiredShare) : [],
      groups: this.summarizeGroups(subject, grades),
    };
  }

  /** Resumo considerando também as notas simuladas (as reais prevalecem). */
  project(subject: Subject, real: Grades, simulated: Grades): SubjectSummary {
    return this.summarize(subject, this.merge(real, simulated));
  }

  /** Combinações de notas que, de fato, levam à meta, sem ultrapassar o máximo de nenhuma avaliação. */
  private buildScenarios(pendingEvs: Evaluation[], missing: number, share: number | null): Scenario[] {
    if (pendingEvs.length < 2 || share === null || missing <= EPS) return [];

    const toItems = (pointsById: Map<string, number>): ScenarioItem[] =>
      pendingEvs.map((ev) => {
        const pts = pointsById.get(ev.id) ?? 0;
        const grade = pts <= EPS ? 0 : Math.min(ceilTo(this.gradeFor(ev, pts), ev.step ?? 0.01), ev.scale);
        return { evaluationId: ev.id, name: ev.name, grade, scale: ev.scale };
      });

    const greedy = (order: Evaluation[]): Map<string, number> => {
      const m = new Map<string, number>();
      let remaining = missing;
      for (const ev of order) {
        const pts = Math.min(ev.maxPoints, remaining);
        m.set(ev.id, pts);
        remaining -= pts;
      }
      return m;
    };

    const balanced = new Map(pendingEvs.map((ev) => [ev.id, ev.maxPoints * share] as [string, number]));
    const byMax = [...pendingEvs].sort((a, b) => b.maxPoints - a.maxPoints);

    const candidates: [string, Map<string, number>][] = [
      ['Equilibrado: o mesmo percentual em cada avaliação', balanced],
      ['Concentrando nas avaliações de maior valor', greedy(byMax)],
      ['Concentrando nas avaliações de menor valor', greedy([...byMax].reverse())],
    ];

    const seen = new Set<string>();
    const scenarios: Scenario[] = [];
    for (const [label, pts] of candidates) {
      const items = toItems(pts);
      const total = items.reduce((s, it) => {
        const ev = pendingEvs.find((e) => e.id === it.evaluationId)!;
        return s + this.pointsFor(ev, it.grade);
      }, 0);
      if (total < missing - EPS) continue; // segurança: nunca sugerir algo que não fecha a meta
      const key = items.map((i) => i.grade).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      scenarios.push({ label, items });
    }
    return scenarios;
  }

  private summarizeGroups(subject: Subject, grades: Grades): GroupSummary[] {
    return (subject.groups ?? []).map((group) => {
      const evs = subject.evaluations.filter((e) => e.group === group.id);
      let points = 0;
      let done = 0;
      for (const ev of evs) {
        const g = grades[ev.id];
        if (hasGrade(g)) {
          points += this.pointsFor(ev, g);
          done++;
        }
      }
      const share = group.share ?? 0;
      return {
        id: group.id,
        name: group.name,
        points,
        maxPoints: evs.reduce((s, e) => s + e.maxPoints, 0),
        done,
        total: evs.length,
        grade: subject.model === 'grouped' && share > 0 ? points / share : null,
      };
    });
  }
}
