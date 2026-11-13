import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GradeInputComponent } from '../../components/grade-input/grade-input';
import { CanvasImportComponent } from '../../components/canvas-import/canvas-import';
import { IconComponent } from '../../components/icon/icon';
import { ProgressCardComponent } from '../../components/progress-card/progress-card';
import { SimulationPanelComponent } from '../../components/simulation-panel/simulation-panel';
import { Evaluation } from '../../models/evaluation.model';
import { WeightProfile } from '../../models/subject.model';
import { GradeCalculatorService, GroupSummary } from '../../services/grade-calculator.service';
import { SubjectService } from '../../services/subject.service';
import { fmt, toInputText } from '../../utils/number';

interface Section {
  id: string;
  title: string;
  badge: string;
  evaluations: Evaluation[];
  sum: GroupSummary | null;
}

@Component({
  selector: 'app-subject-details',
  imports: [RouterLink, GradeInputComponent, ProgressCardComponent, SimulationPanelComponent, IconComponent, CanvasImportComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (subject(); as subj) {
      <a routerLink="/" class="nc-back"><app-icon name="arrow-left" /> Disciplinas</a>

      <header class="nc-page-head">
        <h1 class="nc-page-title">{{ subj.name }}</h1>
        <p class="nc-muted nc-page-sub">{{ subj.teacher ?? 'Disciplina personalizada' }} · {{ subj.semester }} · Meta: {{ fmtValue(subj.target) }}</p>
      </header>

      @if (subj.provisional) {
        <div class="nc-banner" role="status">
          <app-icon name="info" />
          <p><strong>Fórmula aguardando confirmação.</strong> O plano de ensino tem pontos ambíguos, então os resultados são provisórios. Veja "Como minha nota é calculada?" abaixo.</p>
          <button type="button" class="btn btn-sm nc-btn-soft" (click)="svc.setConfirmed(subj.id, true)">Já conferi</button>
        </div>
      }
      @if (subj.weightsInvalid) {
        <p class="nc-note nc-note--danger" role="alert">Os pesos salvos para esta disciplina não somam 100% e foram ignorados. Ajuste-os em "Ajustes da disciplina".</p>
      }

      <div class="nc-details">
        <div class="nc-details__summary">
          <app-progress-card [subject]="subj" [summary]="summary()!" />
        </div>

        <section class="nc-details__evals" aria-labelledby="evals-title">
          <h2 id="evals-title" class="nc-h2">Minhas avaliações</h2>
          <p class="nc-muted nc-small nc-evals__sub">Preencha suas notas. O restante é calculado automaticamente.</p>

          @for (sec of sections(); track sec.id) {
            <div class="nc-ra">
              @if (sec.title) {
                <div class="nc-ra__head">
                  @if (sec.badge) { <span class="nc-ra__tag">{{ sec.badge }}</span> }
                  <h3 class="nc-ra__title">{{ sec.title }}</h3>
                  @if (sec.sum) {
                    <span class="nc-ra__pts">{{ fmtValue(sec.sum.points) }} / {{ fmtValue(sec.sum.maxPoints) }}</span>
                  }
                </div>
                @if (sec.sum?.grade !== null && sec.sum?.grade !== undefined) {
                  <p class="nc-ra__note">Nota do grupo até agora: {{ fmtValue(sec.sum!.grade!) }} de {{ fmtValue(subj.finalScale) }}</p>
                }
              }
              @for (ev of sec.evaluations; track ev.id) {
                <app-grade-input [evaluation]="ev" [grade]="grades()[ev.id]" (gradeChange)="svc.setGrade(subj.id, ev.id, $event)" />
              }
            </div>
          }
          <p class="nc-muted nc-small">Zero é uma nota; campo vazio significa pendente. Tudo é salvo automaticamente neste dispositivo.</p>
        </section>

        <div class="nc-details__sim">
          <app-simulation-panel
            [evaluations]="pendingEvaluations()"
            [simulated]="sims()"
            [base]="summary()!"
            [projected]="projected()"
            [provisional]="subj.provisional"
            (simChange)="svc.setSimulation(subj.id, $event.id, $event.value)"
            (cleared)="svc.clearSimulations(subj.id)"
          />
        </div>
      </div>

      <app-canvas-import [subject]="subj" [grades]="grades()" />

      <details class="nc-card nc-details-box">
        <summary>Como minha nota é calculada?</summary>
        <div class="nc-details-box__body">
          <p>{{ subj.formula.explanation }}</p>
          <table class="table table-sm nc-table">
            <thead><tr><th scope="col">Avaliação</th><th scope="col" class="text-end">Vale até</th>@if (subj.model !== 'direct') { <th scope="col" class="text-end">Peso</th> }</tr></thead>
            <tbody>
              @for (ev of subj.evaluations; track ev.id) {
                <tr><td>{{ ev.name }}</td><td class="text-end">{{ fmtValue(ev.maxPoints) }}</td>@if (subj.model !== 'direct') { <td class="text-end">{{ fmtValue(ev.maxPoints / subj.finalScale * 100) }}%</td> }</tr>
              }
            </tbody>
          </table>
          <p class="nc-small"><strong>Fórmula no plano:</strong> <code>{{ subj.formula.text }}</code></p>
          <p class="nc-small nc-muted">Fonte: {{ subj.formula.source }}</p>
          @if (subj.formula.notes.length) {
            <h3 class="nc-h3">Divergências e limites</h3>
            <ul class="nc-small">
              @for (note of subj.formula.notes; track $index) { <li>{{ note }}</li> }
            </ul>
          }
        </div>
      </details>

      <details class="nc-card nc-details-box">
        <summary>Ajustes da disciplina</summary>
        <div class="nc-details-box__body">
          <div class="nc-setting">
            <label class="form-label" for="target">Meta de nota</label>
            <input id="target" class="form-control" type="text" inputmode="decimal" [value]="targetText(subj.target)" (change)="onTarget($any($event.target).value)" />
            @if (targetError()) { <p class="nc-error" role="alert">{{ targetError() }}</p> }
            <p class="nc-muted nc-small">Padrão: 7,00. A meta tem que ficar entre 0 e {{ fmtValue(subj.finalScale) }}.</p>
          </div>

          @if (subj.weightsEditable) {
            <div class="nc-setting">
              <h3 class="nc-h3">Ajustar pesos</h3>
              @if (subj.formula.profiles?.length) {
                <div class="nc-chips">
                  @for (p of subj.formula.profiles; track p.id) {
                    <button type="button" class="nc-chip nc-chip--wide" [class.nc-chip--on]="profileActive(subj.evaluations, p)" (click)="applyProfile(subj.id, p)">{{ p.label }}</button>
                  }
                </div>
              }
              @for (ev of subj.evaluations; track ev.id) {
                <div class="nc-weight-row">
                  <label [for]="'w-' + ev.id">{{ ev.name }}</label>
                  <div class="input-group input-group-sm">
                    <input [id]="'w-' + ev.id" class="form-control" type="text" inputmode="decimal" [value]="weightText(ev)" (input)="onWeight(ev.id, $any($event.target).value)" />
                    <span class="input-group-text">%</span>
                  </div>
                </div>
              }
              <p class="nc-small" [class.text-danger]="Math.abs(weightTotal(subj.evaluations) - 100) > 0.01">Soma dos pesos: {{ fmtValue(weightTotal(subj.evaluations)) }}% (precisa ser 100%)</p>
              @if (weightError()) { <p class="nc-error" role="alert">{{ weightError() }}</p> }
              <div class="nc-actions">
                <button type="button" class="btn btn-primary btn-sm" (click)="saveWeights(subj.id, subj.evaluations)">Aplicar pesos</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" (click)="resetWeights(subj.id)">Restaurar padrão</button>
              </div>
            </div>
          }

          @if (subj.formula.validation === 'pending' && !subj.provisional) {
            <div class="nc-setting">
              <p class="nc-small">Você marcou a fórmula desta disciplina como confirmada.</p>
              <button type="button" class="btn btn-outline-secondary btn-sm" (click)="svc.setConfirmed(subj.id, false)">Voltar para "aguardando confirmação"</button>
            </div>
          }

          <div class="nc-setting nc-actions">
            <button type="button" class="btn btn-outline-danger btn-sm" (click)="resetGrades(subj.id)">Limpar notas desta matéria</button>
            @if (subj.custom) {
              <button type="button" class="btn btn-danger btn-sm" (click)="remove(subj.id, subj.name)">Excluir matéria</button>
            }
          </div>
        </div>
      </details>
    } @else {
      <section class="nc-card nc-empty">
        <h1 class="nc-h2">Disciplina não encontrada</h1>
        <p class="nc-muted">Ela pode ter sido excluída ou o link está incorreto.</p>
        <a routerLink="/" class="btn btn-primary">Voltar às disciplinas</a>
      </section>
    }
  `,
})
export class SubjectDetailsPage {
  /** Vem da rota (`/disciplina/:id`). */
  readonly id = input.required<string>();

  protected readonly svc = inject(SubjectService);
  private readonly calc = inject(GradeCalculatorService);
  private readonly router = inject(Router);

  protected readonly Math = Math;
  protected fmtValue = fmt;

  protected readonly subject = computed(() => this.svc.findSubject(this.id()));
  protected readonly grades = computed(() => this.svc.gradesOf(this.id()));
  protected readonly sims = computed(() => this.svc.simulatedOf(this.id()));

  protected readonly summary = computed(() => {
    const s = this.subject();
    return s ? this.calc.summarize(s, this.grades()) : null;
  });

  protected readonly pendingEvaluations = computed<Evaluation[]>(() => {
    const s = this.subject();
    if (!s) return [];
    const grades = this.grades();
    return s.evaluations.filter((e) => typeof grades[e.id] !== 'number');
  });

  protected readonly projected = computed(() => {
    const s = this.subject();
    const sims = this.sims();
    if (!s || !this.pendingEvaluations().some((e) => typeof sims[e.id] === 'number')) return null;
    return this.calc.project(s, this.grades(), sims);
  });

  protected readonly sections = computed<Section[]>(() => {
    const s = this.subject();
    const summary = this.summary();
    if (!s || !summary) return [];
    if (!s.groups?.length) return [{ id: 'all', title: '', badge: '', evaluations: s.evaluations, sum: null }];
    const known = new Set(s.groups.map((g) => g.id));
    // "RA1 · Páginas estáticas" vira a etiqueta "RA1" + o título.
    const sections: Section[] = s.groups.map((g) => {
      const [badge, ...rest] = g.name.split(' · ');
      return {
        id: g.id,
        title: rest.length ? rest.join(' · ') : g.name,
        badge: rest.length ? badge : '',
        evaluations: s.evaluations.filter((e) => e.group === g.id),
        sum: summary.groups.find((x) => x.id === g.id) ?? null,
      };
    });
    const rest = s.evaluations.filter((e) => !e.group || !known.has(e.group));
    if (rest.length) sections.push({ id: 'rest', title: 'Outras avaliações', badge: '', evaluations: rest, sum: null });
    return sections.filter((sec) => sec.evaluations.length > 0);
  });

  // ── meta ──
  protected readonly targetError = signal('');

  protected targetText(value: number): string {
    return toInputText(value);
  }

  protected onTarget(raw: string): void {
    const s = this.subject();
    if (!s) return;
    const value = Number(raw.trim().replace(',', '.'));
    if (raw.trim() === '' || !Number.isFinite(value) || value <= 0 || value > s.finalScale) {
      this.targetError.set(`Digite uma meta entre 0 e ${fmt(s.finalScale)}.`);
      return;
    }
    this.targetError.set('');
    this.svc.setTarget(s.id, value);
  }

  // ── pesos ──
  private readonly weightDraft = signal<Record<string, string>>({});
  protected readonly weightError = signal('');

  protected weightText(ev: Evaluation): string {
    return this.weightDraft()[ev.id] ?? toInputText(ev.weight ?? 0);
  }

  protected onWeight(evId: string, raw: string): void {
    this.weightDraft.update((d) => ({ ...d, [evId]: raw }));
    this.weightError.set('');
  }

  protected weightValue(ev: Evaluation): number {
    const text = this.weightText(ev).trim().replace(',', '.');
    return text === '' ? NaN : Number(text);
  }

  protected weightTotal(evs: Evaluation[]): number {
    const total = evs.reduce((sum, e) => sum + this.weightValue(e), 0);
    return Number.isFinite(total) ? total : 0;
  }

  protected saveWeights(subjectId: string, evs: Evaluation[]): void {
    const percents: Record<string, number> = {};
    for (const ev of evs) percents[ev.id] = this.weightValue(ev);
    const error = this.svc.setWeights(subjectId, percents);
    this.weightError.set(error ?? '');
    if (!error) this.weightDraft.set({});
  }

  protected applyProfile(subjectId: string, profile: WeightProfile): void {
    this.weightDraft.set({});
    this.weightError.set(this.svc.setWeights(subjectId, profile.percents) ?? '');
  }

  protected profileActive(evs: Evaluation[], profile: WeightProfile): boolean {
    return evs.every((e) => Math.abs((e.weight ?? NaN) - (profile.percents[e.id] ?? NaN)) < 1e-9);
  }

  protected resetWeights(subjectId: string): void {
    this.weightDraft.set({});
    this.weightError.set(this.svc.setWeights(subjectId, null) ?? '');
  }

  // ── ações ──
  protected resetGrades(subjectId: string): void {
    if (confirm('Limpar todas as notas lançadas nesta matéria? Essa ação não pode ser desfeita.')) {
      this.svc.resetGrades(subjectId);
    }
  }

  protected remove(subjectId: string, name: string): void {
    if (confirm(`Excluir "${name}" e todas as suas notas?`)) {
      this.svc.removeSubject(subjectId);
      void this.router.navigateByUrl('/');
    }
  }
}
