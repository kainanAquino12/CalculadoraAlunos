import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav';
import { HeaderComponent } from './components/header/header';
import { AuthService } from './services/auth.service';

/** Elementos que ganham a "ondinha" ao serem tocados. */
const RIPPLE_TARGETS = '.btn, .nc-chip, .nc-iconbtn, .nc-tab';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, BottomNavComponent],
  host: { '(document:click)': 'ripple($event)' },
  template: `
    <app-header />
    <main class="container nc-main">
      <router-outlet />
    </main>
    <footer class="container nc-footer">
      <p>
        Estimativas baseadas no plano de ensino cadastrado: confira notas, recuperação e aprovação nos canais oficiais. Projeto
        independente, não oficial da PUCPR.
      </p>
    </footer>
    @if (auth.entered()) {
      <app-bottom-nav />
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);

  protected ripple(event: MouseEvent): void {
    const el = (event.target as HTMLElement | null)?.closest<HTMLElement>(RIPPLE_TARGETS);
    if (!el || el.hasAttribute('disabled') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const box = el.getBoundingClientRect();
    const size = Math.max(box.width, box.height) * 2;
    // clique por teclado (sem coordenadas): a onda sai do centro
    const x = event.detail === 0 ? box.width / 2 : event.clientX - box.left;
    const y = event.detail === 0 ? box.height / 2 : event.clientY - box.top;

    const wave = document.createElement('span');
    wave.className = 'nc-ripple-fx';
    wave.style.cssText = `width:${size}px;height:${size}px;left:${x - size / 2}px;top:${y - size / 2}px`;
    el.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove(), { once: true });
  }
}
