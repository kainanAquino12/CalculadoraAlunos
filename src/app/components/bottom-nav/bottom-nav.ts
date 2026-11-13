import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../icon/icon';

/** Navegação fixa na parte de baixo, só no celular (ao alcance do polegar). */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="nc-tabbar" aria-label="Navegação">
      <a routerLink="/" routerLinkActive="nc-tab--on" [routerLinkActiveOptions]="{ exact: true }" class="nc-tab"><app-icon name="home" /> Início</a>
      <a routerLink="/adicionar" routerLinkActive="nc-tab--on" class="nc-tab nc-tab--add" aria-label="Adicionar matéria"><app-icon name="plus" /> Adicionar</a>
      <a routerLink="/" fragment="backup" class="nc-tab"><app-icon name="cloud" /> Backup</a>
    </nav>
  `,
})
export class BottomNavComponent {}
