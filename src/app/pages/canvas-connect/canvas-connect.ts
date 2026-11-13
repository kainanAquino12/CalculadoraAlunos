import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../components/icon/icon';
import { CanvasError, CanvasService } from '../../services/canvas.service';

/** Conectar ao AVA (Canvas) com o token pessoal do aluno. */
@Component({
  selector: 'app-canvas-connect',
  imports: [FormsModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/" class="nc-back"><app-icon name="arrow-left" /> Disciplinas</a>
    <header class="nc-page-head">
      <h1 class="nc-page-title">Notas do AVA</h1>
      <p class="nc-muted nc-page-sub">Traga as notas já publicadas no Canvas em vez de digitar.</p>
    </header>

    @if (canvas.connection(); as conn) {
      <section class="nc-card nc-ava">
        <div class="nc-msg nc-msg--good">
          <app-icon name="check-circle" />
          <div>
            <strong>Conectado ao AVA</strong>
            <span>{{ conn.host }}@if (conn.userName) { · {{ conn.userName }} }</span>
          </div>
        </div>
        <p class="nc-small nc-muted">Abra uma disciplina e use <strong>"Importar notas do AVA"</strong> para escolher quais atividades correspondem a cada avaliação.</p>
        <div class="nc-actions">
          <a routerLink="/" class="btn btn-primary">Ir para as disciplinas</a>
          <button type="button" class="btn btn-outline-danger" (click)="canvas.disconnect()">Desconectar e apagar o token</button>
        </div>
      </section>
    } @else {
      <form class="nc-card nc-form nc-ava" (ngSubmit)="connect()" novalidate>
        <div>
          <label class="form-label" for="ava-host">Endereço do AVA</label>
          <input id="ava-host" name="host" class="form-control" [(ngModel)]="host" placeholder="suaescola.instructure.com" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <p class="nc-muted nc-small">É o começo do endereço que você usa para entrar no AVA.</p>
        </div>
        <div>
          <label class="form-label" for="ava-token">Token de acesso</label>
          <input id="ava-token" name="token" class="form-control" type="password" [(ngModel)]="token" autocomplete="off" spellcheck="false" />
        </div>
        <label class="nc-check">
          <input type="checkbox" name="remember" [(ngModel)]="remember" />
          <span>Lembrar neste aparelho <span class="nc-muted">(sem marcar, o token é esquecido ao fechar a aba)</span></span>
        </label>

        @if (error()) {
          <p class="nc-note nc-note--danger" role="alert">{{ error() }}</p>
        }
        <div class="nc-actions">
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Conectando…' : 'Conectar' }}</button>
        </div>
      </form>

      <details class="nc-card nc-details-box">
        <summary>Como gerar o token</summary>
        <div class="nc-details-box__body">
          <ol class="nc-small">
            <li>No AVA: <strong>Conta → Configurações</strong>.</li>
            <li>Em <strong>Integrações aprovadas</strong>, clique em <strong>"+ Novo token de acesso"</strong>.</li>
            <li>Finalidade: <strong>NotaCerta</strong>. Defina uma data de expiração curta (por exemplo, o fim do semestre).</li>
            <li>Copie o token (ele só aparece uma vez) e cole acima.</li>
          </ol>
          <p class="nc-small"><strong>Cuidado:</strong> o token dá acesso à sua conta inteira do AVA. Crie um só para o NotaCerta, nunca o compartilhe e apague-o em "Integrações aprovadas" quando não precisar mais.</p>
        </div>
      </details>
    }

    <p class="nc-muted nc-small nc-ava__foot">
      O token fica só neste navegador. As consultas passam pelo próprio site apenas para repassar a requisição ao AVA (ele não aceita chamadas diretas do navegador), sem guardar nada. O app só <em>lê</em> suas notas publicadas; nunca altera nada no AVA.
    </p>
  `,
})
export class CanvasConnectPage {
  protected readonly canvas = inject(CanvasService);

  protected host = '';
  protected token = '';
  protected remember = false;
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async connect(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.canvas.connect(this.host, this.token, this.remember);
      this.token = ''; // some do campo assim que é guardado
    } catch (e) {
      this.error.set(e instanceof CanvasError ? e.message : `Não foi possível conectar (${e instanceof Error ? e.message : 'erro desconhecido'}).`);
    } finally {
      this.busy.set(false);
    }
  }
}
