// index.js
require('dotenv').config(); // lee .env
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares
app.use(morgan('dev'));
app.use(cors()); // si luego quieres restringir, lo ajustamos
app.use(express.static('public')); // sirve /public

// --- Motor de vistas (EJS)
app.set('view engine', 'ejs');
app.set('views', './views');

// --- Ruta principal (equivale a doGet())
app.get('/', (req, res) => {
  // Render de la vista 'home' dentro del 'layout'
  res.render('home', { title: 'FR360' }, (err, html) => {
    if (err) return res.status(500).send(err.message);
    // inyectar en layout
    app.render('layout', { title: 'FR360', body: html }, (err2, finalHtml) => {
      if (err2) return res.status(500).send(err2.message);
      res.send(finalHtml);
    });
  });
});

// --- Ejemplo de "UrlFetchApp.fetch" con axios
app.get('/api/externa', async (req, res) => {
  try {
    // Ejemplo: usa variable de entorno como base URL
    const base = process.env.API_BASE_URL || 'https://api.publicapis.org';
    const url = `${base}/entries`; // endpoint de prueba público

    const r = await axios.get(url, { timeout: 15000 });
    res.json({ ok: true, count: r.data?.count ?? r.data?.length ?? null });
  } catch (err) {
    console.error('Error /api/externa:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
