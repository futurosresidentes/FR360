# 🖥️ Desarrollo Local - Guía Completa

## ✅ Ventajas de Desarrollo Local

- ⚡ **Cambios instantáneos** - No esperas 2-3 minutos de deploy
- 🐛 **Debugging fácil** - Ves los logs en tu consola
- 🔄 **Hot reload** - Los cambios se aplican automáticamente
- 💾 **Sin consumir deploys** - Render tiene límites gratuitos
- 🧪 **Testing seguro** - No afectas producción

---

## 📋 Configuración Inicial (Una sola vez)

### 1. Instalar Dependencias

```bash
cd c:\Sitios\FR360
npm install
```

### 2. Configurar Google OAuth para Local

Ve a [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Selecciona tu proyecto OAuth
2. Edita las credenciales OAuth 2.0
3. En **"URIs de redirección autorizados"**, **AGREGA** (no reemplaces):
   ```
   http://localhost:3000/auth/google/callback
   ```
4. En **"Orígenes de JavaScript autorizados"**, **AGREGA**:
   ```
   http://localhost:3000
   ```
5. Guarda los cambios

**IMPORTANTE:** No borres las URLs de producción de Render, solo agrega las de localhost.

### 3. Verificar .env Local

El archivo `.env` ya está configurado para localhost. Verifica que tenga:

```env
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

**Nota:** Para volver a producción, cambia a:
```env
GOOGLE_CALLBACK_URL=https://fr360-1ls4.onrender.com/auth/google/callback
```

---

## 🚀 Iniciar Servidor Local

### Opción 1: Modo Desarrollo (con hot reload)

```bash
npm run dev
```

Si no existe el script, usa:
```bash
node index.js
```

### Opción 2: Modo Producción Local

```bash
npm start
```

### Verificar que funcionó

Deberías ver en la consola:
```
╔════════════════════════════════════════╗
║   🚀 FR360 Server Running             ║
║                                        ║
║   Port: 3000                           ║
║   Environment: development             ║
║   URL: http://localhost:3000           ║
╚════════════════════════════════════════╝
```

---

## 🌐 Acceder a la Aplicación Local

1. **Abre tu navegador**
2. **Ve a:** http://localhost:3000
3. **Inicia sesión** con tu cuenta @sentiretaller.com
4. **¡Listo!** Ya puedes probar todos los cambios localmente

---

## 🔄 Workflow de Desarrollo

### 1. Hacer Cambios

Edita cualquier archivo:
- `index.js` - Backend/API
- `services/*.js` - Lógica de servicios
- `public/js/app.js` - Frontend JavaScript
- `public/css/styles.css` - Estilos
- `views/*.ejs` - HTML/Templates

### 2. Ver Cambios

**Backend (index.js, services):**
- Detén el servidor (Ctrl+C)
- Reinicia: `node index.js`

**Frontend (public/*):**
- Solo refresca el navegador (F5)

**Views (views/*.ejs):**
- Solo refresca el navegador (F5)

### 3. Ver Logs

Los logs aparecen en tu terminal:
```
📞 API Call: getCitizenServer [1234567890]
✅ Completada consulta: Datos ciudadano
```

### 4. Cuando Todo Funcione Local

```bash
git add .
git commit -m "Descripción de cambios"
git push
```

Render detecta el push y redesplega automáticamente.

---

## 🐛 Debugging Local

### Ver todos los logs de API

Los logs se muestran en tiempo real en tu consola:
```
📞 API Call: fetchVentas [1234567890]
🔄 Strapi intento 1/5 para UID: 1234567890
✅ Strapi exitoso en intento 1
```

### Probar endpoints directamente

Puedes usar Postman, Thunder Client o curl:

```bash
# Health check
curl http://localhost:3000/health

# API endpoint (necesitas estar autenticado)
curl -X POST http://localhost:3000/api/getCitizenServer \
  -H "Content-Type: application/json" \
  -d '{"args":["1234567890"]}'
```

### Errores comunes

**Error: EADDRINUSE (Puerto 3000 en uso)**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Alternativa: Cambiar puerto en .env
PORT=3001
```

**Error: Cannot find module**
```bash
npm install
```

**Error: Google OAuth redirect_uri_mismatch**
- Verifica que agregaste http://localhost:3000 en Google Cloud Console
- Verifica que .env tenga GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

---

## 📊 Comparación: Local vs Render

| Aspecto | Local | Render |
|---------|-------|--------|
| **Velocidad** | ⚡ Instantáneo | 🐌 2-3 min deploy |
| **Logs** | ✅ En consola | ⚠️ En dashboard |
| **Debugging** | ✅ Fácil | ❌ Limitado |
| **Testing** | ✅ Seguro | ⚠️ Afecta usuarios |
| **Base de datos** | ✅ Usa producción* | ✅ Usa producción |
| **APIs externas** | ✅ Usa producción* | ✅ Usa producción |

*Porque usas los mismos tokens en .env

---

## ⚠️ Advertencias Importantes

### 1. Datos Reales
Tu desarrollo local usa las **mismas APIs y bases de datos** que producción porque comparten los mismos tokens. Ten cuidado al:
- Crear registros
- Modificar datos
- Enviar mensajes de WhatsApp

### 2. No Subir Cambios al .env
El `.env` está en `.gitignore` por seguridad. Nunca lo subas a GitHub.

### 3. Mantener Sincronizados
Los cambios que hagas local **NO afectan** a Render hasta que hagas `git push`.

---

## 💡 Tips Pro

### 1. Usar nodemon para auto-restart

```bash
npm install -g nodemon
nodemon index.js
```

Ahora cada cambio en backend reinicia automáticamente el servidor.

### 2. Crear scripts en package.json

```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "test": "node check-env.js"
  }
}
```

Luego usa: `npm run dev`

### 3. Múltiples terminales

Terminal 1: Servidor Node.js
```bash
npm run dev
```

Terminal 2: Comandos git
```bash
git status
git add .
git commit -m "mensaje"
```

### 4. VS Code Live Server para HTML estático

Si solo necesitas probar cambios en HTML/CSS sin backend, usa la extensión "Live Server" de VS Code.

---

## 🔄 Volver a Producción

Cuando termines de desarrollar local y quieras deployar:

1. **Verifica cambios:**
   ```bash
   git status
   ```

2. **Opcional: Cambia .env a producción**
   ```env
   GOOGLE_CALLBACK_URL=https://fr360-1ls4.onrender.com/auth/google/callback
   ```

3. **Commit y push:**
   ```bash
   git add .
   git commit -m "Descripción de cambios"
   git push
   ```

4. **Espera deploy de Render** (~2-3 min)

5. **Prueba en producción:** https://fr360-1ls4.onrender.com

---

## 📞 Necesitas Ayuda?

Si algo no funciona:
1. Revisa los logs en tu consola
2. Verifica que todas las variables estén en .env
3. Ejecuta `node check-env.js` para verificar configuración
4. Revisa el puerto: `netstat -ano | findstr :3000`

¡Happy coding! 🚀
