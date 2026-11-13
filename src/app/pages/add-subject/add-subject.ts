import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Evaluation } from '../../models/evaluation.model';
import { CalcModel, EvaluationGroup, Subject } from '../../models/subject.model';
import { SubjectService } from '../../services/subject.service';
import { fmt, roundTo } from '../../utils/number';

interface Row {
  name: string;
  /** Soma direta e grupos: valor máximo em pontos. Ponderada: peso em %. */
  value: string;
  /** Índice do grupo (modelo por grupos). */
  group: number;
}

interface GroupRow {
  name: string;
  share: string;
}

const num = (s: string): number => (s.trim() === '' ? NaN : Number(s.trim().replace(',', '.')));

const MODEL_INFO: Record<CalcModel, { label: string; hint: string }> = {
  direct: { label: 'Soma direta de pontos', hint: 'Cada avaliação vale uma quantidade de pontos e a nota final é a soma.' },
  weighted: { label: 'Média ponderada', hint: 'Cada avaliação tem uma nota e um peso percentual sobre a nota final.' },
  grouped: { label: 'Grupos ou RAs', hint: 'Avaliações ficam em grupos; cada grupo vale uma parte da nota final.' },
};

@Component({
  selector: 'app-add-subject',
  imports: [FormsModule, RouterLink],
  template: `
    <a routerLink="/" class="nc-back">← Disciplinas</a>
    <header class="nc-page-head">
      <h1 class="nc-page-title">Adicionar matéria</h1>
      <p class="nc-muted">Monte a matéria com as avaliações do plano de ensino. Você pode ajustar depois.</p>
    </header>

    <form class="nc-card nc-form" (ngSubmit)="submit()" novalidate>
      <div class="row g-3">
        <div class="col-12 col-md-6">
          <label class="form-label" for="f-name">Nome da disciplina</label>
          <input id="f-name" name="name" class="form-control" [(ngModel)]="name" autocomplete="off" />
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label" for="f-sem">Semestre</label>
          <input id="f-sem" name="semester" class="form-control" [(ngModel)]="semester" autocomplete="off" />
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label" for="f-target">Meta de aprovação</label>
          <input id="f-target" name="target" class="form-control" inputmode="decimal" [(ngModel)]="target" autocomplete="off" />
        </div>
        <div class="col-12">
          <label class="form-label" for="f-teacher">Professor <span class="nc-muted">(opcional)</span></label>
          <input id="f-teacher" name="teacher" class="form-control" [(ngModel)]="teacher" autocomplete="off" />
        </div>
      </div>

      <fieldset class="nc-fieldset">
        <legend class="nc-h3">Como a nota é calculada?</legend>
        <div class="nc-models">
          @for (m of models; track m) {
            <label class="nc-model" [class.nc-model--on]="model === m">
              <input type="radio" name="model" class="visually-hidden" [value]="m" [(ngModel)]="model" />
              <strong>{{ info[m].label }}</strong>
              <span class="nc-muted nc-small">{{ info[m].hint }}</span>
            </label>
          }
        </div>
      </fieldset>

      @if (model !== 'direct') {
        <div class="row g-3 mt-0">
          <div class="col-6 col-md-3">
            <label class="form-label" for="f-scale">Nota máxima da disciplina</label>
            <input id="f-scale" name="scale" class="form-control" inputmode="decimal" [(ngModel)]="scale" autocomplete="off" />
          </div>
        </div>
      }

      @if (model === 'grouped') {
        <fieldset class="nc-fieldset">
          <legend class="nc-h3">Grupos <span class="nc-muted nc-small">(soma dos pesos = 100%)</span></legend>
          @for (g of groups; track $index; let gi = $index) {
            <div class="nc-row">
              <input class="form-control" [name]="'g-name-' + gi" [(ngModel)]="g.name" placeholder="Nome do grupo" [attr.aria-label]="'Nome do grupo ' + (gi + 1)" autocomplete="off" />
              <div class="input-group nc-row__num">
                <input class="form-control" [name]="'g-share-' + gi" inputmode="decimal" [(ngModel)]="g.share" [attr.aria-label]="'Peso do grupo ' + (gi + 1)" autocomplete="off" />
                <span class="input-group-text">%</span>
              </div>
              <button type="button" class="btn btn-outline-secondary btn-sm" (click)="removeGroup(gi)" [disabled]="groups.length <= 1" [attr.aria-label]="'Remover grupo ' + (gi + 1)">✕</button>
            </div>
          }
          <button type="button" class="btn btn-link btn-sm px-0" (click)="addGroup()">＋ Adicionar grupo</button>
        </fieldset>
      }

      <fieldset class="nc-fieldset">
        <legend class="nc-h3">Avaliações</legend>
        @for (r of rows; track $index; let i = $index) {
          <div class="nc-row" [class.nc-row--4]="model === 'grouped'">
            <input class="form-control" [name]="'r-name-' + i" [(ngModel)]="r.name" placeholder="Ex.: Prova 1" [attr.aria-label]="'Nome da avaliação ' + (i + 1)" autocomplete="off" />
            @if (model === 'grouped') {
              <select class="form-select nc-row__group" [name]="'r-group-' + i" [(ngModel)]="r.group" [attr.aria-label]="'Grupo da avaliação ' + (i + 1)">
                @for (g of groups; track $index; let gi = $index) { <option [ngValue]="gi">{{ g.name || 'Grupo ' + (gi + 1) }}</option> }
              </select>
            }
            <div class="input-group nc-row__num">
              <input class="form-control" [name]="'r-value-' + i" inputmode="decimal" [(ngModel)]="r.value" [placeholder]="model === 'weighted' ? 'Peso' : 'Máx.'" [attr.aria-label]="(model === 'weighted' ? 'Peso' : 'Valor máximo') + ' da avaliação ' + (i + 1)" autocomplete="off" />
              <span class="input-group-text">{{ model === 'weighted' ? '%' : 'pts' }}</span>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm" (click)="removeRow(i)" [disabled]="rows.length <= 1" [attr.aria-label]="'Remover avaliação ' + (i + 1)">✕</button>
          </div>
        }
        <button type="button" class="btn btn-link btn-sm px-0" (click)="addRow()">＋ Adicionar avaliação</button>
        <p class="nc-small nc-muted">{{ totalHint() }}</p>
      </fieldset>

      @if (errors.length) {
        <div class="nc-note nc-note--danger" role="alert">
          <ul class="mb-0 ps-3">@for (e of errors; track e) { <li>{{ e }}</li> }</ul>
        </div>
      }

      <div class="nc-actions">
        <button type="submit" class="btn btn-primary">Salvar matéria</button>
        <a routerLink="/" class="btn btn-outline-secondary">Cancelar</a>
      </div>
    </form>
  `,
})
export class AddSubjectPage {
  private readonly svc = inject(SubjectService);
  private readonly router = inject(Router);

  protected readonly models: CalcModel[] = ['direct', 'weighted', 'grouped'];
  protected readonly info = MODEL_INFO;

  protected name = '';
  protected semester = '2026/2';
  protected teacher = '';
  protected target = '7';
  protected scale = '10';
  protected model: CalcModel = 'direct';
  protected groups: GroupRow[] = [
    { name: 'Grupo 1', share: '50' },
    { name: 'Grupo 2', share: '50' },
  ];
  protected rows: Row[] = [
    { name: '', value: '', group: 0 },
    { name: '', value: '', group: 0 },
  ];
  protected errors: string[] = [];

  protected addRow(): void {
    this.rows.push({ name: '', value: '', group: 0 });
  }

  protected removeRow(i: number): void {
    if (this.rows.length > 1) this.rows.splice(i, 1);
  }

  protected addGroup(): void {
    this.groups.push({ name: `Grupo ${this.groups.length + 1}`, share: '' });
  }

  protected removeGroup(i: number): void {
    if (this.groups.length <= 1) return;
    this.groups.splice(i, 1);
    for (const r of this.rows) r.group = r.group === i ? 0 : r.group > i ? r.group - 1 : r.group;
  }

  protected totalHint(): string {
    const total = this.rows.reduce((s, r) => s + (Number.isFinite(num(r.value)) ? num(r.value) : 0), 0);
    if (this.model === 'weighted') return `Soma dos pesos: ${fmt(total)}% (precisa ser 100%).`;
    if (this.model === 'direct') return `Total da disciplina: ${fmt(total)} pontos.`;
    return `Soma dos pontos das avaliações: ${fmt(total)}.`;
  }

  protected submit(): void {
    const result = this.build();
    this.errors = result.errors;
    if (!result.subject) return;
    this.svc.addSubject(result.subject);
    void this.router.navigate(['/disciplina', result.subject.id]);
  }

  private build(): { subject: Subject | null; errors: string[] } {
    const errors: string[] = [];
    const name = this.name.trim();
    if (!name) errors.push('Informe o nome da disciplina.');
    if (!this.semester.trim()) errors.push('Informe o semestre.');

    const rows = this.rows;
    if (rows.some((r) => !r.name.trim())) errors.push('Dê um nome a todas as avaliações.');
    const values = rows.map((r) => num(r.value));
    if (values.some((v) => !Number.isFinite(v) || v <= 0)) {
      errors.push(this.model === 'weighted' ? 'Informe um peso maior que zero em todas as avaliações.' : 'Informe um valor máximo maior que zero em todas as avaliações.');
    }

    const S = this.model === 'direct' ? values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) : num(this.scale);
    if (this.model !== 'direct' && (!Number.isFinite(S) || S <= 0)) errors.push('Informe a nota máxima da disciplina (por exemplo, 10).');

    const target = num(this.target);
    if (!Number.isFinite(target) || target <= 0) errors.push('Informe uma meta maior que zero.');
    else if (Number.isFinite(S) && S > 0 && target > S + 1e-9) errors.push(`A meta não pode ser maior que a nota máxima (${fmt(S)}).`);

    let evaluations: Evaluation[] = [];
    let groups: EvaluationGroup[] | undefined;

    if (errors.length === 0 || this.model === 'direct' || Number.isFinite(S)) {
      const ids = rows.map((_, i) => `av${i + 1}`);
      if (this.model === 'direct') {
        evaluations = rows.map((r, i) => ({ id: ids[i], name: r.name.trim(), scale: values[i], maxPoints: values[i] }));
      } else if (this.model === 'weighted') {
        const total = values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
        if (Math.abs(total - 100) > 0.01) errors.push(`Os pesos somam ${fmt(total)}%. Eles precisam somar 100%.`);
        evaluations = rows.map((r, i) => ({ id: ids[i], name: r.name.trim(), scale: S, weight: values[i], maxPoints: (values[i] * S) / 100 }));
      } else {
        const shares = this.groups.map((g) => num(g.share));
        if (this.groups.some((g) => !g.name.trim())) errors.push('Dê um nome a todos os grupos.');
        if (shares.some((v) => !Number.isFinite(v) || v <= 0)) errors.push('Informe um peso maior que zero em todos os grupos.');
        const shareTotal = shares.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
        if (Math.abs(shareTotal - 100) > 0.01) errors.push(`Os pesos dos grupos somam ${fmt(shareTotal)}%. Eles precisam somar 100%.`);
        groups = this.groups.map((g, gi) => ({ id: `g${gi + 1}`, name: g.name.trim(), share: shares[gi] / 100 }));
        for (let gi = 0; gi < this.groups.length; gi++) {
          if (!rows.some((r) => r.group === gi)) errors.push(`O grupo "${this.groups[gi].name || gi + 1}" precisa de pelo menos uma avaliação.`);
        }
        const groupTotals = this.groups.map((_, gi) => rows.reduce((s, r, i) => (r.group === gi && Number.isFinite(values[i]) ? s + values[i] : s), 0));
        evaluations = rows.map((r, i) => ({
          id: ids[i],
          name: r.name.trim(),
          group: groups![r.group].id,
          scale: values[i],
          maxPoints: groupTotals[r.group] > 0 ? ((shares[r.group] / 100) * S * values[i]) / groupTotals[r.group] : 0,
        }));
      }
    }

    if (errors.length) return { subject: null, errors };

    const finalScale = roundTo(evaluations.reduce((s, e) => s + e.maxPoints, 0), 9);
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const semester = this.semester.trim();
    const subject: Subject = {
      id: `custom-${slug || 'materia'}-${semester.replace(/[^0-9a-z]/gi, '')}-${Date.now().toString(36)}`,
      name,
      teacher: this.teacher.trim() || undefined,
      semester,
      target,
      finalScale,
      model: this.model,
      evaluations,
      groups,
      weightsEditable: this.model === 'weighted',
      custom: true,
      formula: {
        validation: 'confirmed',
        text:
          this.model === 'direct'
            ? 'Nota final = soma das notas das avaliações'
            : this.model === 'weighted'
              ? 'Nota final = soma de (nota × peso) de cada avaliação'
              : 'Nota do grupo = soma dos pontos do grupo · Nota final = soma das notas dos grupos × peso de cada grupo',
        source: 'Configuração feita pelo próprio aluno.',
        explanation:
          this.model === 'direct'
            ? 'Cada avaliação contribui com uma quantidade de pontos e a nota final é a soma deles.'
            : this.model === 'weighted'
              ? 'Cada avaliação tem um peso sobre a nota final; a nota final é a soma de cada nota multiplicada pelo seu peso.'
              : 'As avaliações formam grupos; cada grupo vale uma parte da nota final.',
        notes: ['Regras criadas por você: confira com o plano de ensino. O app não conhece regras de recuperação ou frequência.'],
      },
    };
    return { subject, errors };
  }
}
