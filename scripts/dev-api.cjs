// Ponte local: roda api/canvas.js (função da Vercel) num servidor simples para o `npm start`.
// O dev server do Angular encaminha /api para cá (veja proxy.conf.json).
const http = require('node:http');
const handler = require('../api/canvas.js');

http
  .createServer((req, res) => {
    req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
      return res;
    };
    res.send = (body) => {
      res.end(body);
      return res;
    };
    handler(req, res);
  })
  .listen(3001, '127.0.0.1', () => console.log('Ponte do AVA em http://127.0.0.1:3001 (usada por /api)'));
