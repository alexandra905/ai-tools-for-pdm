const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  addFeeding,
  bookWalkSlot,
  getCurrentDate,
  getLastFeeding,
  getWalkSlots
} = require('./database');

const port = Number(process.env.PORT) || 3000;
const publicDirectory = path.join(__dirname, 'public');
const staticFiles = {
  '/': { fileName: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/app.js': { fileName: 'app.js', contentType: 'application/javascript; charset=utf-8' },
  '/styles.css': { fileName: 'styles.css', contentType: 'text/css; charset=utf-8' }
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;

      if (body.length > 10_000) {
        reject(new Error('Слишком большой запрос'));
      }
    });

    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Некорректные данные запроса'));
      }
    });

    request.on('error', reject);
  });
}

function serveStaticFile(response, staticFile) {
  const filePath = path.join(publicDirectory, staticFile.fileName);

  fs.readFile(filePath, (error, file) => {
    if (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Не удалось загрузить страницу');
      return;
    }

    response.writeHead(200, { 'Content-Type': staticFile.contentType });
    response.end(file);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, 'http://localhost');

  try {
    if (request.method === 'GET' && requestUrl.pathname === '/api/feedings/latest') {
      sendJson(response, 200, { feeding: getLastFeeding() });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/feedings') {
      const { employeeName } = await readJsonBody(request);
      const result = addFeeding(employeeName);

      if (result.status === 'invalid_name') {
        sendJson(response, 400, { error: 'Введите непустое ФИО.' });
        return;
      }

      sendJson(response, 201, {
        message: 'Кормление отмечено.',
        feeding: result.feeding
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/walk-slots') {
      const date = getCurrentDate();
      sendJson(response, 200, { date, slots: getWalkSlots(date) });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/walk-slots/book') {
      const { slotTime, employeeName } = await readJsonBody(request);
      const result = bookWalkSlot(slotTime, employeeName);

      if (result.status === 'invalid_name') {
        sendJson(response, 400, { error: 'Введите непустое ФИО.' });
        return;
      }

      if (result.status === 'invalid_slot') {
        sendJson(response, 400, { error: 'Выберите доступный слот.' });
        return;
      }

      if (result.status === 'conflict') {
        sendJson(response, 409, { error: 'Этот слот уже занят другим сотрудником.' });
        return;
      }

      sendJson(response, 201, { message: 'Запись на прогулку подтверждена.' });
      return;
    }

    const staticFile = request.method === 'GET' ? staticFiles[requestUrl.pathname] : null;

    if (staticFile) {
      serveStaticFile(response, staticFile);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Страница не найдена');
  } catch (error) {
    const statusCode = error.message === 'Некорректные данные запроса' || error.message === 'Слишком большой запрос'
      ? 400
      : 500;
    sendJson(response, statusCode, { error: error.message || 'Внутренняя ошибка сервера.' });
  }
});

server.listen(port, () => {
  console.log(`Приложение доступно по адресу http://localhost:${port}`);
});
