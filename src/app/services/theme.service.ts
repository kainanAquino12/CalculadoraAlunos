import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const KEY = 'notacerta:theme';
const COLORS: Record<Theme, string> = { light: '#f6f8fb', dark: '#0a0f1c' };

/** Tema claro/escuro. Usa a escolha salva; sem escolha, segue o do sistema. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    this.apply(this.theme(), false);
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.apply(next, true);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* armazenamento bloqueado: o tema só vale nesta visita */
    }
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* ignora */
    }
    return this.doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private apply(theme: Theme, animate: boolean): void {
    const root = this.doc.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-bs-theme', theme);
    this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
    if (animate) {
      root.classList.add('nc-theming');
      setTimeout(() => root.classList.remove('nc-theming'), 400);
    }
  }
}
