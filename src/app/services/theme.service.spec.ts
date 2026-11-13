import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  it('alterna entre claro e escuro, aplica no documento e lembra a escolha', () => {
    const svc = TestBed.inject(ThemeService);
    const start = svc.theme();
    svc.toggle();
    const next = start === 'dark' ? 'light' : 'dark';
    expect(svc.theme()).toBe(next);
    expect(document.documentElement.getAttribute('data-theme')).toBe(next);
    expect(document.documentElement.getAttribute('data-bs-theme')).toBe(next);
    expect(localStorage.getItem('notacerta:theme')).toBe(next);

    TestBed.resetTestingModule();
    expect(TestBed.inject(ThemeService).theme()).toBe(next); // restaurado depois de recarregar
  });

  it('respeita o tema salvo mesmo que o sistema prefira outro', () => {
    localStorage.setItem('notacerta:theme', 'dark');
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ignora valor inválido salvo', () => {
    localStorage.setItem('notacerta:theme', 'roxo');
    expect(['light', 'dark']).toContain(TestBed.inject(ThemeService).theme());
  });
});
