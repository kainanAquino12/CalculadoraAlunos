import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { IconComponent } from '../icon/icon';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeOutside($event)', '(document:keydown.escape)': 'menuOpen.set(false)' },
  template: `
    <header class="nc-header">
      <div class="container nc-header__inner">
        <a routerLink="/" class="nc-brand" aria-label="NotaCerta — página inicial">
          <svg class="nc-logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="#2563EB" />
            <path d="M9 17.5l4.5 4.5L23 11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="nc-brand__name">NotaCerta</span>
        </a>

        @if (auth.entered()) {
          <nav class="nc-nav" aria-label="Navegação principal">
            <a routerLink="/" routerLinkActive="nc-nav__link--on" [routerLinkActiveOptions]="{ exact: true }" class="nc-nav__link"><app-icon name="home" /> Início</a>
            <a routerLink="/" fragment="backup" class="nc-nav__link"><app-icon name="cloud" /> Backup</a>
          </nav>
        }

        <div class="nc-header__right">
          <button type="button" class="nc-iconbtn" (click)="theme.toggle()" [attr.aria-label]="theme.theme() === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'" [attr.title]="theme.theme() === 'dark' ? 'Tema claro' : 'Tema escuro'">
            @if (theme.theme() === 'dark') {
              <app-icon name="sun" />
            } @else {
              <app-icon name="moon" />
            }
          </button>

          @if (auth.entered()) {
            <a routerLink="/adicionar" class="btn btn-primary btn-sm nc-cta"><app-icon name="plus" /> <span>Adicionar matéria</span></a>

            @if (auth.user(); as u) {
              <div class="nc-account">
                <button type="button" class="nc-avatar" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-haspopup="menu" [attr.aria-label]="'Conta de ' + u.email">
                  @if (u.picture && !pictureFailed()) {
                    <img [src]="u.picture" alt="" referrerpolicy="no-referrer" (error)="pictureFailed.set(true)" />
                  } @else {
                    {{ initials() }}
                  }
                </button>
                @if (menuOpen()) {
                  <div class="nc-menu" role="menu">
                    <p class="nc-menu__name">{{ u.name }}</p>
                    <p class="nc-menu__email">{{ u.email }}</p>
                    <button type="button" class="nc-menu__item" role="menuitem" (click)="signOut()">Sair da conta</button>
                  </div>
                }
              </div>
            } @else {
              <a routerLink="/entrar" class="btn btn-outline-secondary btn-sm" (click)="auth.signOut()">Entrar</a>
            }
          }
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly pictureFailed = signal(false);

  protected readonly initials = computed(() => {
    const name = this.auth.user()?.name ?? '';
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase() || '?'
    );
  });

  protected signOut(): void {
    this.menuOpen.set(false);
    this.auth.signOut();
    void this.router.navigateByUrl('/entrar');
  }

  protected closeOutside(event: Event): void {
    if (this.menuOpen() && !(event.target as HTMLElement).closest('.nc-account')) this.menuOpen.set(false);
  }
}
