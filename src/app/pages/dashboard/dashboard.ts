import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../components/icon/icon';
import { SubjectCardComponent } from '../../components/subject-card/subject-card';
import { AuthService } from '../../services/auth.service';
import { SubjectService } from '../../services/subject.service';
import { outcomeOf } from '../../utils/status';

@Component({
  selector: 'app-dashboard',
  imports: [SubjectCardComponent, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nc-hero">
      <div>
        @if (firstName(); as name) {
          <p class="nc-hero__hello">Olá, {{ name }}</p>
        }
        <h1 class="nc-hero__title">Seu semestre, <br /><span class="nc-hero__accent">sem surpresas.</span></h1>
        <p class="nc-hero__sub">Acompanhe suas notas e descubra quanto falta para passar.</p>
      </div>
    </section>

    <section class="nc-stats" aria-label="Resumo do semestre">
      <div class="nc-stat"><span class="nc-stat__icon nc-stat__icon--primary"><app-icon name="book" /></span><span class="nc-stat__n">{{ stats().total }}</span><span class="nc-stat__l">disciplinas</span></div>
      <div class="nc-stat"><span class="nc-stat__icon nc-stat__icon--success"><app-icon name="check-circle" /></span><span class="nc-stat__n">{{ stats().reached }}</span><span class="nc-stat__l">com meta atingida</span></div>
      <div class="nc-stat"><span class="nc-stat__icon nc-stat__icon--primary"><app-icon name="clock" /></span><span class="nc-stat__n">{{ stats().inProgress }}</span><span class="nc-stat__l">em andamento</span></div>
      <div class="nc-stat"><span class="nc-stat__icon nc-stat__icon--danger"><app-icon name="alert" /></span><span class="nc-stat__n">{{ stats().outOfReach }}</span><span class="nc-stat__l">meta fora de alcance</span></div>
    </section>

    @if (svc.saveFailed()) {
      <p class="nc-note nc-note--warning" role="alert">Não foi possível salvar no navegador (armazenamento bloqueado). Suas notas serão perdidas ao fechar a página.</p>
    }

    <h2 class="nc-section-title" id="disciplinas">Minhas disciplinas</h2>
    <div class="nc-grid">
      @for (subject of svc.subjects(); track subject.id) {
        <app-subject-card [subject]="subject" [summary]="svc.summaries()[subject.id]" />
      }
      <a routerLink="/adicionar" class="nc-card nc-add-tile">
        <span class="nc-add-tile__plus"><app-icon name="plus" /></span>
        <strong>Adicionar nova matéria</strong>
        <span class="nc-small">Crie sua própria disciplina e configure as avaliações.</span>
      </a>
    </div>

    <section id="backup" class="nc-backup" aria-labelledby="backup-title">
      <app-icon name="cloud" class="nc-backup__icon" />
      <div class="nc-backup__text">
        <h2 id="backup-title">Backup dos seus dados</h2>
        <p>Suas notas ficam salvas apenas neste navegador. Para levar para outro aparelho, exporte um arquivo e importe lá.</p>
        @if (message()) {
          <p class="nc-backup__msg" [class.text-danger]="messageIsError()" role="status">{{ message() }}</p>
        }
      </div>
      <div class="nc-backup__actions">
        <label class="btn btn-outline-primary btn-sm mb-0">
          <app-icon name="upload" /> Importar backup
          <input type="file" accept="application/json,.json" class="visually-hidden" (change)="importBackup($event)" />
        </label>
        <button type="button" class="btn btn-primary btn-sm" (click)="exportBackup()"><app-icon name="download" /> Exportar backup (.json)</button>
      </div>
    </section>
  `,
})
export class DashboardPage {
  protected readonly svc = inject(SubjectService);
  private readonly auth = inject(AuthService);

  protected readonly firstName = computed(() => this.auth.user()?.name.split(/\s+/)[0] ?? '');

  protected readonly message = signal('');
  protected readonly messageIsError = signal(false);

  protected readonly stats = computed(() => {
    const summaries = this.svc.summaries();
    const subjects = this.svc.subjects();
    const count = { total: subjects.length, reached: 0, inProgress: 0, outOfReach: 0 };
    for (const s of subjects) {
      const outcome = outcomeOf(summaries[s.id]);
      if (outcome === 'reached') count.reached++;
      else if (outcome === 'in-progress') count.inProgress++;
      else count.outOfReach++;
    }
    return count;
  });

  protected exportBackup(): void {
    const blob = new Blob([this.svc.exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notacerta-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.show('Backup exportado.', false);
  }

  protected async importBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!confirm('Importar vai substituir as notas e matérias atuais deste navegador. Continuar?')) {
      input.value = '';
      return;
    }
    try {
      this.svc.importBackup(await file.text());
      this.show('Backup importado com sucesso.', false);
    } catch (e) {
      this.show(e instanceof Error ? e.message : 'Não foi possível importar o arquivo.', true);
    }
    input.value = '';
  }

  private show(text: string, isError: boolean): void {
    this.message.set(text);
    this.messageIsError.set(isError);
  }
}
