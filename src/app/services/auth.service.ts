import { computed, inject, Injectable, signal } from '@angular/core';
import { GOOGLE_CLIENT_ID } from '../config';

export interface AuthUser {
  /** Identificador estável da conta Google (campo `sub`). */
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export const SESSION_KEY = 'notacerta:session';
export const GUEST_KEY = 'notacerta:guest';
export const BASE_STORAGE_KEY = 'notacerta:v1';

/** Parte mínima da biblioteca "Google Identity Services" que usamos. */
interface GoogleId {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean; use_fedcm_for_prompt?: boolean }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Lê o payload de um JWT. NÃO verifica a assinatura: serve só para exibir quem entrou (ver README). */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('Resposta de login inválida.');
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function readJson<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Entrada no app: conta Google ou "continuar sem conta". As notas ficam separadas por conta no navegador
 * (a chave do armazenamento muda com o usuário). Não há servidor: nada é enviado a lugar nenhum.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly clientId = inject(GOOGLE_CLIENT_ID);
  private gisPromise: Promise<GoogleId> | null = null;

  readonly user = signal<AuthUser | null>(this.loadSession());
  private readonly guest = signal(this.loadGuest());

  /** Já passou pela tela de entrada (com conta ou sem conta). */
  readonly entered = computed(() => this.user() !== null || this.guest());
  readonly googleConfigured = this.clientId.trim() !== '';

  /** Onde as notas desta pessoa ficam salvas. Sem conta = a chave original (dados antigos preservados). */
  readonly storageKey = computed(() => {
    const u = this.user();
    return u ? `${BASE_STORAGE_KEY}:u:${u.sub}` : BASE_STORAGE_KEY;
  });

  continueAsGuest(): void {
    this.guest.set(true);
    try {
      localStorage.setItem(GUEST_KEY, '1');
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }

  signOut(): void {
    this.user.set(null);
    this.guest.set(false);
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(GUEST_KEY);
    } catch {
      /* ignora */
    }
    window.google?.accounts?.id?.disableAutoSelect();
  }

  /** Valida e guarda a resposta do Google. Lança `Error` com mensagem amigável se algo não bate. */
  acceptCredential(credential: string): AuthUser {
    let p: Record<string, unknown>;
    try {
      p = decodeJwtPayload(credential);
    } catch {
      throw new Error('Não foi possível ler a resposta do Google. Tente de novo.');
    }
    const issuerOk = p['iss'] === 'accounts.google.com' || p['iss'] === 'https://accounts.google.com';
    const expired = typeof p['exp'] === 'number' && p['exp'] * 1000 < Date.now() - 60_000;
    if (!issuerOk || p['aud'] !== this.clientId || expired) throw new Error('O login do Google não pôde ser validado. Tente de novo.');
    if (typeof p['sub'] !== 'string' || typeof p['email'] !== 'string') throw new Error('O Google não informou o e-mail da conta.');
    if (p['email_verified'] === false) throw new Error('O e-mail dessa conta Google não está verificado.');

    const email = p['email'];
    const user: AuthUser = {
      sub: p['sub'],
      email,
      name: typeof p['name'] === 'string' && p['name'] ? p['name'] : email.split('@')[0],
      picture: typeof p['picture'] === 'string' ? p['picture'] : undefined,
    };
    this.user.set(user);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user)); // guardamos o perfil, nunca o token
    } catch {
      /* ignora */
    }
    return user;
  }

  /** Carrega o script do Google (só na tela de entrada) e desenha o botão oficial dentro de `host`. */
  async renderGoogleButton(host: HTMLElement, dark: boolean, onUser: (u: AuthUser) => void, onError: (message: string) => void): Promise<void> {
    if (!this.googleConfigured) return;
    const gis = await this.loadGis();
    gis.initialize({
      client_id: this.clientId,
      auto_select: false,
      callback: (r) => {
        try {
          onUser(this.acceptCredential(r.credential));
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Não foi possível entrar.');
        }
      },
    });
    host.replaceChildren();
    gis.renderButton(host, {
      type: 'standard',
      theme: dark ? 'filled_black' : 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width: Math.min(host.clientWidth || 320, 400),
      locale: 'pt-BR',
    });
  }

  private loadGis(): Promise<GoogleId> {
    const ready = window.google?.accounts?.id;
    if (ready) return Promise.resolve(ready);
    this.gisPromise ??= new Promise<GoogleId>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => {
        const gis = window.google?.accounts?.id;
        gis ? resolve(gis) : reject(new Error('gis'));
      };
      script.onerror = () => {
        this.gisPromise = null;
        reject(new Error('gis'));
      };
      document.head.appendChild(script);
    });
    return this.gisPromise;
  }

  private loadSession(): AuthUser | null {
    const s = readJson<Partial<AuthUser>>(SESSION_KEY);
    return s && typeof s.sub === 'string' && typeof s.email === 'string' && typeof s.name === 'string' ? (s as AuthUser) : null;
  }

  private loadGuest(): boolean {
    try {
      return localStorage.getItem(GUEST_KEY) === '1';
    } catch {
      return false;
    }
  }
}
