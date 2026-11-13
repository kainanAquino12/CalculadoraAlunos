import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResolvedSubject } from '../../models/subject.model';
import { SubjectSummary } from '../../services/grade-calculator.service';
import { fmt, fmtCeil } from '../../utils/number';
import { statusInfo } from '../../utils/status';
import { IconComponent } from '../icon/icon';
import { ScoreBarComponent } from '../score-bar/score-bar';

@Component({
  selector: 'app-subject-card',
  imports: [RouterLink, ScoreBarComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="nc-card nc-subject" [routerLink]="['/disciplina', subject().id]" [attr.aria-label]="subject().name + ': abrir disciplina'">
      <div class="nc-subject__head">
        <div class="min-w-0">
          <h3 class="nc-subject__title">{{ subject().name }}</h3>
          <p class="nc-muted nc-subject__sub">{{ subject().teacher ?? 'Disciplina personalizada' }} · {{ subject().semester }}</p>
        </div>
        <app-icon name="chevron-right" class="nc-subject__go" />
      </div>

      <div class="nc-badges">
        <span class="nc-badge" [class]="'nc-badge nc-badge--' + status().tone">{{ status().label }}</span>
        @if (subject().provisional) {
          <span class="nc-badge nc-badge--warning">Aguardando confirmação da fórmula</span>
        }
      </div>

      <dl class="nc-facts">
        <div><dt>Pontos acumulados</dt><dd>{{ fmtValue(summary().accumulated) }} <span class="nc-muted">/ {{ fmtValue(summary().finalScale) }}</span></dd></div>
        <div><dt>Meta</dt><dd>{{ fmtValue(summary().target) }}</dd></div>
        <div><dt>Faltam</dt><dd>{{ missing() }}</dd></div>
      </dl>

      <div class="nc-subject__bar">
        <app-score-bar [accumulated]="summary().accumulated" [total]="summary().finalScale" [target]="summary().target" [tone]="barTone()" />
        <span class="nc-subject__pct">{{ pct() }}%</span>
      </div>
    </a>
  `,
})
export class SubjectCardComponent {
  readonly subject = input.required<ResolvedSubject>();
  readonly summary = input.required<SubjectSummary>();

  protected readonly status = computed(() => statusInfo(this.summary()));
  protected fmtValue = fmt;

  protected readonly barTone = computed(() => {
    const s = this.summary();
    if (s.targetReached) return 'success' as const;
    return s.achievable ? ('primary' as const) : ('danger' as const);
  });

  protected readonly missing = computed(() => fmtCeil(this.summary().missing));

  protected readonly pct = computed(() => {
    const s = this.summary();
    return s.finalScale > 0 ? Math.floor((s.accumulated / s.finalScale) * 100 + 1e-9) : 0;
  });
}
