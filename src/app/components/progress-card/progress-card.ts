import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ResolvedSubject } from '../../models/subject.model';
import { SubjectSummary } from '../../services/grade-calculator.service';
import { fmt, fmtCeil, fmtPercent } from '../../utils/number';
import { statusInfo } from '../../utils/status';
import { IconComponent, IconName } from '../icon/icon';
import { ScoreBarComponent } from '../score-bar/score-bar';

interface Message {
  tone: 'good' | 'bad' | 'neutral';
  icon: IconName;
  main: string;
  secondary?: string;
}

/** "Sua situação atual": o essencial em um card — o que já tem, o que falta e uma única mensagem. */
@Component({
  selector: 'app-progress-card',
  imports: [ScoreBarComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nc-card nc-summary" aria-live="polite" aria-labelledby="summary-title">
      <div class="nc-summary__top">
        <h2 id="summary-title" class="nc-h2">Sua situação atual</h2>
        <span class="nc-badge" [class]="'nc-badge nc-badge--' + status().tone">{{ status().label }}</span>
      </div>

      <p class="nc-big">@for (n of [summary().accumulated]; track n) { <span class="nc-bump">{{ fmtValue(n) }}</span> } <span class="nc-big__of">/ {{ fmtValue(summary().finalScale) }}</span></p>
      <p class="nc-eyebrow">Pontos acumulados</p>

      <app-score-bar [accumulated]="summary().accumulated" [total]="summary().finalScale" [target]="summary().target" [tone]="barTone()" />

      <dl class="nc-trio">
        <div><dt>Meta</dt><dd>{{ fmtValue(summary().target) }}</dd></div>
        <div><dt>Faltam</dt><dd [class.nc-trio__warn]="!summary().targetReached">@for (m of [missing()]; track m) { <span class="nc-bump">{{ m }}</span> }</dd></div>
        <div><dt>Disponíveis</dt><dd>@for (p of [summary().pendingMax]; track p) { <span class="nc-bump">{{ fmtValue(p) }}</span> }</dd></div>
      </dl>

      @if (message(); as m) {
        <div class="nc-msg" [class]="'nc-msg nc-msg--' + m.tone">
          <app-icon [name]="m.icon" />
          <div>
            <strong>{{ m.main }}</strong>
            @if (m.secondary) {
              <span>{{ m.secondary }}</span>
            }
          </div>
        </div>
      }

      @if (subject().provisional) {
        <p class="nc-provisional"><app-icon name="info" /> Resultado provisório: a fórmula ainda não foi confirmada.</p>
      }
    </section>
  `,
})
export class ProgressCardComponent {
  readonly subject = input.required<ResolvedSubject>();
  readonly summary = input.required<SubjectSummary>();

  protected readonly status = computed(() => statusInfo(this.summary()));
  protected fmtValue = fmt;
  protected readonly missing = computed(() => fmtCeil(this.summary().missing));

  protected readonly barTone = computed(() => {
    const s = this.summary();
    if (s.targetReached) return 'success' as const;
    return s.achievable ? ('primary' as const) : ('danger' as const);
  });

  protected readonly message = computed<Message | null>(() => {
    const s = this.summary();
    if (s.totalCount === 0) return null;

    if (s.allDone) {
      return s.targetReached
        ? { tone: 'good', icon: 'check-circle', main: 'Todas as notas lançadas: meta de pontos atingida.' }
        : { tone: 'bad', icon: 'alert', main: 'Todas as notas lançadas: a meta de pontos não foi atingida.', secondary: `Faltaram ${fmtCeil(s.missing)} pontos.` };
    }
    if (s.targetReached) return { tone: 'good', icon: 'check-circle', main: 'Você já atingiu a meta de pontos.' };
    if (!s.achievable) {
      return {
        tone: 'bad',
        icon: 'alert',
        main: 'Não é possível alcançar a meta somente com as avaliações restantes.',
        secondary: `O máximo possível é ${fmt(s.maxPossible)}. Confira as regras de recuperação nos canais oficiais.`,
      };
    }

    let secondary: string | undefined;
    if (s.pending.length === 1) {
      const p = s.pending[0];
      secondary = `Em "${p.evaluation.name}" você precisa de pelo menos ${fmt(p.requiredGrade ?? 0)} de ${fmt(p.evaluation.scale)}.`;
    } else if (s.requiredShare !== null) {
      secondary = `Você precisa conquistar pelo menos ${fmtPercent(Math.ceil(s.requiredShare * 10000 - 1e-7) / 10000)} dos pontos restantes.`;
    }
    return { tone: 'good', icon: 'check-circle', main: 'Ainda é possível alcançar sua meta.', secondary };
  });
}
