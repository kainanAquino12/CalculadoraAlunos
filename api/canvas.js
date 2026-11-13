// Função serverless da Vercel: repassa uma consulta GET ao Canvas (AVA) quando o navegador não consegue chamar direto (CORS).
// Não guarda nada, não registra o token e só fala com hosts permitidos. Veja o README.
//
// Chamada: GET /api/canvas?p=/api/v1/courses  com os cabeçalhos x-canvas-host e x-canvas-token.

const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.instructure\.com$/i;

function hostAllowed(host) {
  if (HOST_RE.test(host)) return true;
  // Para escolas com domínio próprio, liste em CANVAS_ALLOWED_HOSTS (separado por vírgula) nas variáveis da Vercel.
  return (process.env.CANVAS_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(host).toLowerCase());
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  const host = String(req.headers['x-canvas-host'] || '');
  const token = String(req.headers['x-canvas-token'] || '');
  const path = String(req.query.p || '');

  if (!host || !hostAllowed(host)) return res.status(400).json({ error: 'Endereço do AVA não permitido.' });
  if (!token) return res.status(400).json({ error: 'Token ausente.' });
  // Só a API do Canvas, e sem tentar sair do caminho (ex.: //outro-host ou ..)
  if (!path.startsWith('/api/v1/') || path.includes('..') || path.includes('//')) return res.status(400).json({ error: 'Caminho não permitido.' });

  try {
    const upstream = await fetch(`https://${host}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const link = upstream.headers.get('link');
    if (link) res.setHeader('Link', link);
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(await upstream.text());
  } catch {
    res.status(502).json({ error: 'Não foi possível falar com o AVA.' });
  }
};
