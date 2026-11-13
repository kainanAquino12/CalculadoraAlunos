import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResolvedSubject } from '../../models/subject.model';
import { Grades } from '../../models/evaluation.model';
import { CanvasAssignment, CanvasCourse, CanvasError, CanvasService, effectiveMax, gradeFromAssignments, ImportResult, nameScore, suggestAssignmentIds } from '../../services/canvas.service';
import { SubjectService } from '../../services/subject.service';
import { fmt } from '../../utils/number';

/** "Importar notas do AVA": liga atividades do Canvas às avaliações e preenche as notas ainda vazias. */
@Component({
  selector: 'app-canvas-import',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="nc-card nc-details-box">
      <summary>Importar notas do AVA</summary>
      <div class="nc-details-box__body">
        @if (!canvas.connection()) {
          <p class="nc-small">Conecte sua conta do AVA para trazer as notas já publicadas.</p>
          <a routerLink="/ava" class="btn btn-outline-primary btn-sm">Conectar ao AVA</a>
        } @else {
          <p class="nc-small nc-muted">Só entram notas que o professor já publicou. Suas notas já lançadas não são trocadas, a menos que você peça.</p>
          <button type="button" class="btn btn-outline-primary btn-sm" [disabled]="busy()" (click)="load()">{{ courses().length ? 'Atualizar do AVA' : 'Buscar no AVA' }}</button>

          @if (error()) {
            <p class="nc-note nc-note--danger" role="alert">{{ error() }}</p>
          }

          @if (courses().length) {
            <div class="nc-setting">
              <label class="form-label" for="ava-course">Disciplina no AVA</label>
              <select id="ava-course" class="form-select" [value]="courseId() ?? ''" (change)="chooseCourse($any($event.target).value)">
                <option value="">Escolha…</option>
                @for (c of courses(); track c.id) {
                  <option [value]="c.id" [selected]="c.id === courseId()">{{ c.name }}</option>
                }
              </select>
            </div>
          }

          @if (courseId() !== null && assignments().length === 0 && !busy()) {
            <p class="nc-small nc-muted">Nenhuma atividade encontrada nessa disciplina.</p>
          }

          @if (assignments().length) {
            <h3 class="nc-h3">Qual atividade vale cada avaliação?</h3>
            @for (row of rows(); track row.id) {
              <div class="nc-import-row">
                <div class="nc-import-row__head">
                  <strong>{{ row.name }}</strong>
                  <span class="nc-small" [class.text-success]="row.result.grade !== null" [class.nc-muted]="row.result.grade === null">
                    @if (row.result.grade !== null) { {{ fmtValue(row.result.grade) }} de {{ fmtValue(row.scale) }} } @else { — }
                  </span>
                </div>
                <details>
                  <summary class="nc-small">Atividades do AVA ({{ row.selected.length }})</summary>
                  @for (a of assignments(); track a.id) {
                    <label class="nc-check nc-check--tight">
                      <input type="checkbox" [checked]="row.selected.includes(a.id)" (change)="toggle(row.id, a.id)" />
                      <span>{{ a.name }} <span class="nc-muted">· {{ a.graded ? fmtValue(a.score ?? 0) + ' / ' + fmtValue(maxOf(a)) : 'sem nota ainda' }}</span></span>
                    </label>
                  }
                </details>
                @if (row.result.grade === null && row.selected.length) {
                  <p class="nc-small nc-muted nc-import-row__why">{{ row.result.reason }}</p>
                } @else if (row.result.grade !== null && row.hasGrade) {
                  <p class="nc-small nc-muted nc-import-row__why">Você já lançou {{ fmtValue(row.current ?? 0) }} aqui.</p>
                }
              </div>
            }

            <label class="nc-check">
              <input type="checkbox" [checked]="overwrite()" (change)="overwrite.set(!overwrite())" />
              <span>Substituir notas que já lancei</span>
            </label>
            <div class="nc-actions">
              <button type="button" class="btn btn-primary btn-sm" [disabled]="applicable() === 0" (click)="apply()">Aplicar {{ applicable() }} {{ applicable() === 1 ? 'nota' : 'notas' }}</button>
            </div>
            @if (done()) {
              <p class="nc-small nc-backup__msg" role="status">{{ done() }}</p>
            }
          }
        }
      </div>
    </details>
  `,
})
export class CanvasImportComponent {
  protected readonly canvas = inject(CanvasService);
  private readonly svc = inject(SubjectService);

  readonly subject = input.required<ResolvedSubject>();
  readonly grades = input.required<Grades>();

  protected readonly courses = signal<CanvasCourse[]>([]);
  protected readonly courseId = signal<number | null>(null);
  protected readonly assignments = signal<CanvasAssignment[]>([]);
  protected readonly selection = signal<Record<string, number[]>>({});
  protected readonly overwrite = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal('');
  protected fmtValue = fmt;
  protected maxOf = effectiveMax;

  protected readonly rows = computed(() => {
    const assignments = this.assignments();
    const grades = this.grades();
    return this.subject().evaluations.map((ev) => {
      const selected = this.selection()[ev.id] ?? [];
      const picked = assignments.filter((a) => selected.includes(a.id));
      const current = typeof grades[ev.id] === 'number' ? (grades[ev.id] as number) : null;
      const result: ImportResult = gradeFromAssignments(ev, picked);
      return { id: ev.id, name: ev.name, scale: ev.scale, selected, result, current, hasGrade: current !== null };
    });
  });

  /** Quantas notas seriam gravadas agora. */
  protected readonly applicable = computed(() => this.rows().filter((r) => r.result.grade !== null && (!r.hasGrade || this.overwrite())).length);

  protected async load(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.done.set('');
    try {
      const courses = await this.canvas.courses();
      this.courses.set(courses);
      const saved = this.canvas.loadLink(this.subject().id);
      const best = saved?.courseId ?? courses.map((c) => ({ c, s: nameScore(this.subject().name, c.name) })).sort((a, b) => b.s - a.s).find((x) => x.s >= 0.6)?.c.id ?? null;
      if (best !== null && courses.some((c) => c.id === best)) await this.openCourse(best);
    } catch (e) {
      this.error.set(e instanceof CanvasError ? e.message : 'Não foi possível buscar no AVA.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async chooseCourse(value: string): Promise<void> {
    if (!value) {
      this.courseId.set(null);
      this.assignments.set([]);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.openCourse(Number(value));
    } catch (e) {
      this.error.set(e instanceof CanvasError ? e.message : 'Não foi possível buscar no AVA.');
    } finally {
      this.busy.set(false);
    }
  }

  protected toggle(evaluationId: string, assignmentId: number): void {
    this.selection.update((s) => {
      const current = s[evaluationId] ?? [];
      return { ...s, [evaluationId]: current.includes(assignmentId) ? current.filter((id) => id !== assignmentId) : [...current, assignmentId] };
    });
    this.done.set('');
  }

  protected apply(): void {
    let count = 0;
    for (const row of this.rows()) {
      if (row.result.grade === null || (row.hasGrade && !this.overwrite())) continue;
      this.svc.setGrade(this.subject().id, row.id, row.result.grade);
      count++;
    }
    const courseId = this.courseId();
    if (courseId !== null) this.canvas.saveLink(this.subject().id, { courseId, evaluations: this.selection() });
    this.done.set(count ? `${count} ${count === 1 ? 'nota importada' : 'notas importadas'}.` : 'Nada novo para importar.');
  }

  private async openCourse(id: number): Promise<void> {
    const assignments = await this.canvas.assignments(id);
    this.courseId.set(id);
    this.assignments.set(assignments);
    const saved = this.canvas.loadLink(this.subject().id);
    const selection: Record<string, number[]> = {};
    for (const ev of this.subject().evaluations) {
      selection[ev.id] = saved?.courseId === id && saved.evaluations[ev.id] ? saved.evaluations[ev.id].filter((aid) => assignments.some((a) => a.id === aid)) : suggestAssignmentIds(ev.name, assignments);
    }
    this.selection.set(selection);
  }
}
