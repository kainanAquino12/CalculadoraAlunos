import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { clamp, fmt } from '../../utils/number';

/** Barra de pontos: sólido = conquistado, claro = simulado, traço = meta. */
@Component({
  selector: 'app-score-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="nc-bar"
      role="progressbar"
      [attr.aria-valuemin]="0"
      [attr.aria-valuemax]="total()"
      [attr.aria-valuenow]="accumulated()"
      [attr.aria-label]="'Pontos acumulados: ' + fmtValue(accumulated()) + ' de ' + fmtValue(total())"
    >
      <div class="nc-bar__fill" [class]="'nc-bar__fill--' + tone()" [style.width.%]="accPct()"></div>
      @if (simPct() > 0) {
        <div class="nc-bar__sim" [style.left.%]="accPct()" [style.width.%]="simPct()"></div>
      }
      @if (target() > 0) {
        <div class="nc-bar__target" [style.left.%]="targetPct()" [title]="'Meta: ' + fmtValue(target())"></div>
      }
    </div>
  `,
})
export class ScoreBarComponent {
  readonly accumulated = input.required<number>();
  readonly total = input.required<number>();
  readonly target = input(0);
  /** Pontos adicionais vindos de simulação (opcional). */
  readonly simulated = input(0);
  readonly tone = input<'primary' | 'success' | 'danger'>('primary');

  protected readonly accPct = computed(() => this.pct(this.accumulated()));
  protected readonly simPct = computed(() => Math.min(this.pct(this.simulated()), 100 - this.accPct()));
  protected readonly targetPct = computed(() => this.pct(this.target()));

  protected fmtValue = fmt;

  private pct(value: number): number {
    return this.total() > 0 ? clamp((value / this.total()) * 100, 0, 100) : 0;
  }
}
