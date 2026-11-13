import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { Evaluation } from '../../models/evaluation.model';
import { GradeCalculatorService } from '../../services/grade-calculator.service';
import { fmt, toInputText } from '../../utils/number';
import { IconComponent } from '../icon/icon';

let nextId = 0;

/** Linha compacta de uma avaliação. Vazio = pendente; "0" = nota zero. Só emite valores válidos. */
@Component({
  selector: 'app-grade-input',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nc-eval" [class.nc-eval--done]="hasGrade() && !simulation()" [class.nc-eval--sim]="simulation()" [class.nc-eval--invalid]="error()">
      <div class="nc-eval__row">
        @if (!simulation()) {
          <span class="nc-eval__state" [class.nc-eval__state--done]="hasGrade()">
            <app-icon [name]="hasGrade() ? 'check' : 'circle'" />
            <span class="visually-hidden">{{ hasGrade() ? 'Concluída' : 'Pendente' }}</span>
          </span>
        }
        <div class="nc-eval__info">
          <div class="nc-eval__title">
            <label class="nc-eval__name" [for]="inputId">{{ evaluation().name }}</label>
            @if (evaluation().description && !simulation()) {
              <button type="button" class="nc-info" (click)="showInfo.set(!showInfo())" [attr.aria-expanded]="showInfo()" [attr.aria-label]="'Sobre ' + evaluation().name">
                <app-icon name="info" />
              </button>
            }
          </div>
          <p class="nc-eval__meta">{{ scaleHint() }}</p>
        </div>
        <div class="nc-eval__field">
          <input
            class="form-control nc-grade"
            [id]="inputId"
            type="text"
            inputmode="decimal"
            enterkeyhint="done"
            autocomplete="off"
            [placeholder]="simulation() ? 'Simular' : '—'"
            [value]="text()"
            [attr.aria-invalid]="error() ? 'true' : null"
            [attr.aria-describedby]="error() ? errorId : null"
            (focus)="$any($event.target).select()"
            (input)="onInput($any($event.target).value)"
          />
        </div>
      </div>
      @if (showInfo()) {
        <p class="nc-eval__desc">{{ evaluation().description }}</p>
      }
      @if (error()) {
        <p class="nc-error" [id]="errorId" role="alert">{{ error() }}</p>
      }
    </div>
  `,
})
export class GradeInputComponent {
  private readonly calc = inject(GradeCalculatorService);

  readonly evaluation = input.required<Evaluation>();
  readonly grade = input<number | null | undefined>(null);
  /** Modo simulação: mesmo campo, sem o indicador de concluída/pendente. */
  readonly simulation = input(false);
  readonly gradeChange = output<number | null>();

  protected readonly inputId = `grade-${nextId++}`;
  protected readonly errorId = `${this.inputId}-error`;
  protected readonly showInfo = signal(false);

  /** Mantém o que o aluno digitou enquanto o valor numérico for o mesmo (ex.: "1," continua "1,"). */
  protected readonly text = linkedSignal<number | null | undefined, string>({
    source: this.grade,
    computation: (grade, previous) => {
      if (previous && this.parse(previous.value) === (grade ?? null)) return previous.value;
      return toInputText(grade);
    },
  });

  protected readonly error = computed(() => {
    const result = this.calc.parseGrade(this.evaluation(), this.text());
    return result.ok ? '' : result.error;
  });

  protected readonly hasGrade = computed(() => {
    const g = this.grade();
    return typeof g === 'number' && Number.isFinite(g);
  });

  protected readonly scaleHint = computed(() => {
    const ev = this.evaluation();
    const points = Math.abs(ev.maxPoints - 1) < 1e-9 ? 'ponto' : 'pontos';
    if (this.simulation()) return `Nota de 0 a ${fmt(ev.scale)}`;
    return Math.abs(ev.scale - ev.maxPoints) < 1e-9
      ? `Vale até ${fmt(ev.maxPoints)} ${points}`
      : `Nota de 0 a ${fmt(ev.scale)} · vale ${fmt(ev.maxPoints)} ${points}`;
  });

  protected onInput(raw: string): void {
    this.text.set(raw);
    const result = this.calc.parseGrade(this.evaluation(), raw);
    // Texto inválido não é emitido: a última nota válida continua salva.
    if (result.ok) this.gradeChange.emit(result.value);
  }

  private parse(raw: string): number | null {
    const r = this.calc.parseGrade(this.evaluation(), raw);
    return r.ok ? r.value : NaN;
  }
}
