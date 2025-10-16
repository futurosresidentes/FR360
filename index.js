// index.js
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos (css/js/img si más adelante los agregas)
app.use(express.static('public'));

// Ruta principal: esto reemplaza tu doGet()
app.get('/', (req, res) => {
  // Aquí podrías construir HTML como lo hacía tu template en Apps Script
  res.send(`
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Mi Web Migrada</title>
    </head>
    <body>
      <h1>¡Hola desde Node + Express!</h1>
      <p>Esto es el equivalente a doGet(): estamos respondiendo al GET /</p>

      <button id="btn-llamar-api">Probar llamada a una API externa</button>
      <pre id="salida"></pre>

      <script>
        document.getElementById('btn-llamar-api').onclick = async () => {
          try {
            // Ejemplo de ruta interna que luego crearemos para llamar servicios externos
            const r = await fetch('/api/ping');
            const data = await r.json();
            document.getElementById('salida').textContent = JSON.stringify(data, null, 2);
          } catch (e) {
            document.getElementById('salida').textContent = 'Error: ' + e.message;
          }
        };
      </script>
    </body>
    </html>
  `);
});

// Ruta de ejemplo para "simular" tus llamados a servicios externos
app.get('/api/ping', async (req, res) => {
  // Aquí después usaremos fetch/axios para llamar a tus APIs reales
  res.json({ ok: true, mensaje: 'Funciona /api/ping' });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
