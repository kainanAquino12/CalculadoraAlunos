import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Evaluation, Grades } from '../../models/evaluation.model';
import { SubjectSummary } from '../../services/grade-calculator.service';
import { ceilTo, fmt, fmtCeil, pointsWord } from '../../utils/number';
import { GradeInputComponent } from '../grade-input/grade-input';
import { IconComponent } from '../icon/icon';
import { ScoreBarComponent } from '../score-bar/score-bar';

const QUICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

/** "Simular minhas próximas notas": fechado por padrão. Notas hipotéticas nunca alteram as notas reais. */
@Component({
  selector: 'app-simulation-panel',
  imports: [GradeInputComponent, ScoreBarComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nc-card nc-sim" aria-labelledby="sim-title">
      <h2 id="sim-title" class="nc-h2">Simular minhas próximas notas</h2>
      <p class="nc-muted nc-small nc-sim__intro">Descubra quanto precisa tirar nas avaliações restantes.</p>

      <button type="button" class="btn btn-outline-primary nc-sim__toggle" [attr.aria-expanded]="open()" aria-controls="sim-body" (click)="open.set(!open())">
        <app-icon name="calculator" /> {{ open() ? 'Fechar simulador' : 'Abrir simulador' }}
      </button>

      @if (open()) {
        <div id="sim-body" class="nc-sim__body">
          @if (evaluations().length === 0) {
            <p class="nc-muted">Todas as avaliações já têm nota, então não há o que simular.</p>
          } @else {
            <p class="nc-muted nc-small">Isso é só uma simulação: suas notas reais não mudam e nada daqui é salvo como nota.</p>

            @for (ev of evaluations(); track ev.id) {
              <div class="nc-sim__row">
                <app-grade-input [evaluation]="ev" [grade]="simulated()[ev.id]" [simulation]="true" (gradeChange)="simChange.emit({ id: ev.id, value: $event })" />
                <div class="nc-chips" role="group" [attr.aria-label]="'Valores rápidos para ' + ev.name">
                  @for (f of fractions; track f) {
                    <button type="button" class="nc-chip" [class.nc-chip--on]="isChosen(ev, f)" (click)="simChange.emit({ id: ev.id, value: quick(ev, f) })">{{ fmtValue(quick(ev, f)) }}</button>
                  }
                </div>
              </div>
            }

            @if (hasSimulation()) {
              <button type="button" class="btn btn-link btn-sm px-0" (click)="cleared.emit()">Restaurar simulação</button>
            }

            @if (hasSimulation() && projected(); as p) {
              <div class="nc-sim__result" aria-live="polite">
                <p class="nc-eyebrow">Nota final projetada</p>
                <p class="nc-big">@for (n of [p.accumulated]; track n) { <span class="nc-bump">{{ fmtValue(n) }}</span> } <span class="nc-big__of">/ {{ fmtValue(p.finalScale) }}</span></p>
                <app-score-bar [accumulated]="base().accumulated" [simulated]="p.accumulated - base().accumulated" [total]="p.finalScale" [target]="p.target" />
                @if (provisional()) {
                  <p class="nc-provisional"><app-icon name="info" /> Projeção provisória: a fórmula ainda não foi confirmada.</p>
                }
                @for (line of resultLines(); track $index) {
                  <p [class]="'nc-line nc-line--' + line.kind">{{ line.text }}</p>
                }
              </div>
            }

            @if (shown(); as s) {
              @if (!s.targetReached && s.requiredShare !== null && s.pending.length > 0) {
                <h3 class="nc-h3">{{ s.pending.length > 1 ? 'Sugestão de distribuição' : 'Nota necessária' }}</h3>
                <ul class="nc-list">
                  @for (p of s.pending; track p.evaluation.id) {
                    <li>
                      <span>{{ p.evaluation.name }}</span>
                      <strong>{{ s.pending.length > 1 ? 'cerca de' : 'pelo menos' }} {{ fmtValue(p.requiredGrade ?? 0) }} <span class="nc-muted">de {{ fmtValue(p.evaluation.scale) }}</span></strong>
                    </li>
                  }
                </ul>
                @if (s.pending.length > 1) {
                  <p class="nc-muted nc-small">É só uma sugestão (o mesmo percentual em cada avaliação), não uma nota mínima obrigatória em cada uma: você pode compensar uma nota menor com outra maior.</p>
                }
              }

              @if (s.scenarios.length > 0) {
                <h3 class="nc-h3">Combinações que levam à meta</h3>
                @for (sc of s.scenarios; track sc.label; let i = $index) {
                  <div class="nc-scenario">
                    <p class="nc-scenario__title">Cenário {{ i + 1 }} <span class="nc-muted">· {{ sc.label }}</span></p>
                    <ul class="nc-list nc-list--tight">
                      @for (it of sc.items; track it.evaluationId) {
                        <li><span>{{ it.name }}</span><strong>{{ fmtValue(it.grade) }} <span class="nc-muted">de {{ fmtValue(it.scale) }}</span></strong></li>
                      }
                    </ul>
                  </div>
                }
              }
            }
          }
        </div>
      }
    </section>
  `,
})
export class SimulationPanelComponent {
  /** Avaliações sem nota real. */
  readonly evaluations = input.required<Evaluation[]>();
  readonly simulated = input.required<Grades>();
  readonly base = input.required<SubjectSummary>();
  readonly projected = input<SubjectSummary | null>(null);
  readonly provisional = input(false);

  readonly simChange = output<{ id: string; value: number | null }>();
  readonly cleared = output<void>();

  protected readonly open = signal(false);
  protected readonly fractions = QUICK_FRACTIONS;
  protected fmtValue = fmt;

  protected readonly hasSimulation = computed(() => this.evaluations().some((e) => typeof this.simulated()[e.id] === 'number'));

  /** Com simulação ativa, tudo é recalculado sobre ela; sem simulação, sobre as notas reais. */
  protected readonly shown = computed(() => (this.hasSimulation() ? this.projected() : null) ?? this.base());

  protected quick(ev: Evaluation, fraction: number): number {
    return ceilTo(ev.scale * fraction, ev.step ?? 0.01);
  }

  protected isChosen(ev: Evaluation, fraction: number): boolean {
    const v = this.simulated()[ev.id];
    return typeof v === 'number' && Math.abs(v - this.quick(ev, fraction)) < 1e-9;
  }

  protected readonly resultLines = computed(() => {
    const p = this.projected();
    if (!p) return [];
    const out: { text: string; kind: 'good' | 'bad' | 'plain' }[] = [];
    if (p.targetReached) {
      out.push({ text: `Com essas notas você alcançaria a meta de ${fmt(p.target)}.`, kind: 'good' });
    } else if (!p.achievable) {
      out.push({ text: `Com essas notas, mesmo tirando o máximo no resto, o limite seria ${fmt(p.maxPossible)}: abaixo da meta de ${fmt(p.target)}.`, kind: 'bad' });
    } else {
      out.push({ text: `Com essas notas ainda faltariam ${fmtCeil(p.missing)} ${pointsWord(p.missing)} para a meta de ${fmt(p.target)}.`, kind: 'plain' });
    }
    return out;
  });
}
