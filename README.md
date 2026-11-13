# NotaCerta — Saiba quanto falta para passar

Aplicação web (Angular 22 + TypeScript + Bootstrap 5) para acompanhar notas e descobrir a nota mínima necessária nas próximas avaliações. Sem backend, sem login: os dados ficam no `localStorage` do navegador.

> Projeto independente. Os cálculos são estimativas baseadas nos planos de ensino cadastrados; confira notas, recuperação e aprovação nos canais oficiais.

## Executar

```bash
npm install
npm start          # http://localhost:4200 (sobe também a ponte do AVA)
npm test           # testes unitários e de interface (Vitest)
npm run build      # saída em dist/notacerta/browser
```

## Publicar na Vercel

O repositório já tem `vercel.json` (build, pasta de saída e rewrite para rotas do Angular). Importe o repositório na Vercel e publique, ou use `npx vercel`.

## Estrutura

```
src/app/
  models/      Evaluation, Subject (tipos)
  data/        default-subjects.ts  ← as 5 disciplinas, com fontes e divergências
  services/    grade-calculator (toda a matemática), storage, subject (estado + persistência)
  components/  header, subject-card, grade-input, progress-card, simulation-panel, score-bar
  pages/       dashboard, subject-details, add-subject
```

### Como o cálculo funciona

Todo modelo vira a mesma conta linear: cada avaliação tem `scale` (nota máxima digitada) e `maxPoints` (quanto contribui para a nota final); contribuição = `nota / scale × maxPoints`. Isso cobre soma direta, média ponderada e grupos/RAs. Notas reais, simuladas e pendentes são sempre distintas (campo vazio ≠ zero), e exigências são arredondadas **para cima**.

### Adicionar uma disciplina fixa

Acrescente um objeto em `src/app/data/default-subjects.ts`. Se o plano tiver ambiguidade, use `formula.validation: 'pending'` e descreva em `formula.notes`; o app mostrará o resultado como provisório até o aluno confirmar.

## Regras ainda não confirmadas (ver `formula.notes` de cada disciplina)

| Disciplina | Situação |
|---|---|
| Desenvolvimento Web | Confirmada (soma = 10) |
| Arquitetura de Banco de Dados | Confirmada (soma = 10) |
| Requisitos de Software | Pendente: quadro (7,0 + 3,0 por grupo) × cronograma (avaliações de 5,0) |
| Lógica Matemática | Pendente: pesos 30/30/10/30 (cabeçalho) × 30/30/20/20 (fórmula) |
| Conectividade | Pendente: escala (0–10 ÷ 10) e siglas PT/AS/SEM; recuperação não implementada |

Recuperação, frequência mínima e aprovação oficial não são calculadas.

## Login com o Google

A tela de entrada (`/entrar`) oferece **Continuar com o Google** ou **Continuar sem conta**. O botão do Google só aparece depois de você configurar um Client ID:

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) → crie (ou escolha) um projeto.
2. **APIs e serviços → Tela de permissão OAuth**: tipo *Externo*, informe nome do app e seu e-mail. Em *Escopos*, os básicos (`email`, `profile`, `openid`) bastam.
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, adicione `http://localhost:4200` e o endereço do site na Vercel (ex.: `https://notacerta.vercel.app`). Não é preciso URI de redirecionamento.
5. Copie o ID (termina em `.apps.googleusercontent.com`) para `GOOGLE_CLIENT_ID_VALUE` em `src/app/config.ts`. O Client ID é público, não é segredo.
6. Enquanto o app estiver em modo "Teste" no Google, só os e-mails cadastrados como *usuários de teste* conseguem entrar. Para liberar a todos, publique o app na tela de permissão.

### O que o login faz (e não faz)

- Mostra quem entrou (nome, e-mail, foto) e **separa as notas de cada conta neste navegador**. A primeira conta que entra no aparelho herda as notas lançadas antes, no modo sem conta.
- Guarda só o perfil na sessão, nunca o token. O app não tem servidor: **nada é enviado a lugar nenhum**.
- O token do Google é lido no navegador (emissor, Client ID e validade são conferidos), mas a assinatura **não** é verificada. Isso basta para exibir a conta e separar dados locais, **não** serve como segurança de acesso.
- **Não sincroniza entre aparelhos.** Para isso seria preciso um backend com banco de dados, verificando o token no servidor.

## Notas do AVA (Canvas)

Em **Notas do AVA** (`/ava`) você conecta sua conta do Canvas com um token pessoal e, em cada disciplina, usa **Importar notas do AVA**: escolhe a disciplina do AVA, confere quais atividades valem cada avaliação (o app sugere pelo nome) e aplica.

- **Só lê.** O app consulta suas notas já publicadas e nunca altera nada no AVA.
- **Não troca o que você já lançou**, a menos que você marque "Substituir".
- **Só importa nota completa:** se alguma atividade ligada à avaliação ainda não foi corrigida, a avaliação continua pendente. Várias atividades somam pontos (útil para listas).
- **Conversão:** `pontos obtidos ÷ pontos possíveis × valor da avaliação` (8/10 numa prova que vale 2,0 → 1,60).
- **O token** fica só neste navegador (na sessão por padrão; no aparelho se você marcar "Lembrar"). Crie um token só para o NotaCerta, com validade curta, e apague-o em *Conta → Configurações → Integrações aprovadas* quando não precisar mais.
- **Como a chamada é feita:** o AVA da PUCPR **não aceita chamadas diretas do navegador** (não envia cabeçalhos CORS), então toda consulta passa pela ponte [`api/canvas.js`](api/canvas.js) do próprio site, que só repassa um GET, não guarda nem registra o token e só aceita hosts `*.instructure.com`. Se a sua escola usa domínio próprio, liste-o em `CANVAS_ALLOWED_HOSTS` (variável de ambiente na Vercel, separada por vírgula).
- **Localmente:** `npm start` sobe a ponte (`scripts/dev-api.cjs`, porta 3001) junto com o Angular, e o `proxy.conf.json` encaminha `/api` para ela. Para rodar só o Angular, use `npm run start:ng` (aí a importação do AVA não funciona).
- **Endereço:** pode colar a URL inteira (ex.: `https://pucpr.instructure.com/profile/settings`); o app guarda só o host.
