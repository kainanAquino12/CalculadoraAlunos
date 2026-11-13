import { InjectionToken } from '@angular/core';

/**
 * Client ID do "Login com o Google" (Google Cloud Console → APIs e serviços → Credenciais → ID do cliente OAuth,
 * tipo "Aplicativo da Web"). Ele é público (não é segredo), então pode ficar no código.
 * Deixe vazio para esconder o botão do Google (o app continua funcionando no modo sem conta).
 * Passo a passo no README.
 */
export const GOOGLE_CLIENT_ID_VALUE = '';

export const GOOGLE_CLIENT_ID = new InjectionToken<string>('GOOGLE_CLIENT_ID', {
  providedIn: 'root',
  factory: () => GOOGLE_CLIENT_ID_VALUE,
});
