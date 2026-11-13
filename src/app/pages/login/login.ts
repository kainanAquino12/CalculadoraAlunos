import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { IconComponent } from '../../components/icon/icon';

/** Tela de entrada: "Continuar com o Google" ou seguir sem conta. */
@Component({
  selector: 'app-login',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nc-login">
      <div class="nc-card nc-login__card">
        <svg class="nc-login__logo" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="#2563EB" />
          <path d="M9 17.5l4.5 4.5L23 11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <h1 class="nc-login__title">Bem-vindo ao NotaCerta</h1>
        <p class="nc-muted nc-login__sub">Saiba quanto falta para passar.</p>

        @if (auth.googleConfigured) {
          <div #googleButton class="nc-login__google" aria-label="Entrar com o Google">
            @if (loading()) {
              <span class="nc-login__loading">Carregando login do Google…</span>
            }
          </div>
          @if (error()) {
            <p class="nc-error nc-login__error" role="alert">{{ error() }}</p>
          }
          <div class="nc-login__or"><span>ou</span></div>
        }

        <button type="button" class="btn nc-login__guest" [class.btn-primary]="!auth.googleConfigured" [class.btn-outline-secondary]="auth.googleConfigured" (click)="continueAsGuest()">
          Continuar sem conta
        </button>

        @if (!auth.googleConfigured) {
          <p class="nc-muted nc-small nc-login__hint"><app-icon name="info" /> O login com Google ainda não foi configurado neste site.</p>
        }

        <p class="nc-muted nc-small nc-login__foot">
          Suas notas ficam salvas só neste navegador. Entrar com o Google serve para guardar as notas de cada pessoa separadamente; o app não envia seus dados a nenhum servidor.
        </p>
      </div>
    </section>
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  private readonly host = viewChild<ElementRef<HTMLElement>>('googleButton');
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    afterNextRender(() => void this.setupGoogle());
  }

  protected continueAsGuest(): void {
    this.auth.continueAsGuest();
    void this.router.navigateByUrl('/');
  }

  private async setupGoogle(): Promise<void> {
    const el = this.host()?.nativeElement;
    if (!el) return;
    try {
      await this.auth.renderGoogleButton(
        el,
        this.theme.theme() === 'dark',
        () => void this.router.navigateByUrl('/'),
        (message) => this.error.set(message),
      );
    } catch {
      this.error.set('Não foi possível carregar o login do Google (verifique a conexão). Você pode continuar sem conta.');
    } finally {
      this.loading.set(false);
    }
  }
}
