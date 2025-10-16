document.getElementById('btn-api')?.addEventListener('click', async () => {
  const pre = document.getElementById('salida');
  pre.textContent = 'Cargando...';
  try {
    const r = await fetch('/api/externa');
    const data = await r.json();
    pre.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    pre.textContent = 'Error: ' + e.message;
  }
});
