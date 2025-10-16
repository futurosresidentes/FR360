# ✅ Checklist de Deployment en Render para FR360

## Tu URL de Render:
```
https://fr360-1ls4.onrender.com
```

---

## 📋 VARIABLES DE ENTORNO REQUERIDAS EN RENDER

Ve a: https://dashboard.render.com/ → FR360 → Environment

Copia y pega estas variables (reemplaza los valores que digan "TU_..."):

```env
# Puerto
PORT=3000

# Sesión (GENERA UN SECRET ALEATORIO DE 64 CARACTERES)
SESSION_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# Google OAuth 2.0
GOOGLE_CLIENT_ID=TU_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=TU_CLIENT_SECRET_AQUI
GOOGLE_CALLBACK_URL=https://fr360-1ls4.onrender.com/auth/google/callback

# Strapi CMS
STRAPI_BASE_URL=https://strapi-project-d3p7.onrender.com/api
STRAPI_TOKEN=b07772d8be9e7a19ea6ee8536e6b2858e3d06f50f1505ec954f2dc5a98b240a0c7f53fd65c9b90f0edac2336b88294591eab7b28f455389830cfebf90f3a4718d31e2b029be1b1708c6b235a842d514e8e504517e4791a53d1bcf1c1fb4808deddc6c6adc2af3c10c2b5a7bc090519928210752e7a879fa132a0513e6fe045e6

# FR360 API
FR360_BASE_URL=https://fr360-7cwi.onrender.com/api
FR360_BEARER_TOKEN=91f3c19f460cf9ea3f3f00aa8339f2ab
FR360_EPAYCO_TOKEN=145c42235fb69634f97d628ca902f35b

# FRAPP API
FRAPP_BASE_URL=https://admin-appfr-os0a.onrender.com/api
FRAPP_API_KEY=5a8812447d3195748c5a438c9a85478e

# Callbell API
CALLBELL_BASE_URL=https://api.callbell.eu/v1
CALLBELL_API_KEY=TU_API_KEY_CALLBELL

# Old Membership Platform
OLD_MEMB_BASE_URL=https://app.cursofuturosresidentes.com/wp-json
OLD_MEMB_AUTH=JqL1TDznO43PsMk?bbeoSk_h#B+tGOhjKjuD

# Usuarios especiales
SPECIAL_USERS=daniel.cardona@sentiretaller.com,alex.lopez@sentiretaller.com

# Configuración de APIs
API_TIMEOUT=15000
API_MAX_RETRIES=5
API_RETRY_DELAY=2000

# Entorno
NODE_ENV=production
```

---

## 🔐 CONFIGURACIÓN EN GOOGLE CLOUD CONSOLE

### Orígenes de JavaScript autorizados:
```
https://fr360-1ls4.onrender.com
```

### URIs de redirección autorizadas:
```
https://fr360-1ls4.onrender.com/auth/google/callback
```

---

## 🔍 VERIFICAR LOGS EN RENDER

1. Ve a https://dashboard.render.com/
2. Click en tu servicio FR360
3. Click en **"Logs"** (menú lateral)
4. Busca errores rojos o mensajes que digan:
   - `Cannot find module`
   - `GOOGLE_CLIENT_ID is undefined`
   - `Error:`

---

## ⚠️ PROBLEMAS COMUNES Y SOLUCIONES

### Error: "Bad Request" o "Internal server error"

**Posibles causas:**

1. **Falta alguna variable de entorno**
   - Solución: Verifica que todas las variables estén configuradas en Render

2. **Falta algún archivo o carpeta**
   - Solución: Verifica que se haya hecho `git push` de todos los archivos

3. **Error en el código**
   - Solución: Revisa los logs en Render

### Error: "Cannot find module './config/passport'"

**Causa:** No se subió la carpeta `config/` a Git

**Solución:**
```bash
cd c:\Sitios\FR360
git add config/
git add middleware/
git add routes/
git commit -m "fix: add missing config and routes folders"
git push origin main
```

### Error: "GOOGLE_CLIENT_ID is not defined"

**Causa:** Falta configurar las variables de Google OAuth en Render

**Solución:** Agrega las 3 variables de Google en Render Environment

---

## 📝 ORDEN DE DESPLIEGUE CORRECTO

1. ✅ Verificar que todos los archivos estén en Git:
   ```bash
   git status
   ```

2. ✅ Hacer commit y push:
   ```bash
   git add .
   git commit -m "feat: complete OAuth setup"
   git push origin main
   ```

3. ✅ Configurar TODAS las variables de entorno en Render

4. ✅ Esperar a que Render termine el despliegue (5-10 min)

5. ✅ Revisar logs en Render para errores

6. ✅ Probar la URL: https://fr360-1ls4.onrender.com

---

## 🧪 ENDPOINTS PARA PROBAR

Una vez desplegado, prueba estos endpoints:

### Health Check (debería funcionar sin login)
```
https://fr360-1ls4.onrender.com/health
```

**Respuesta esperada:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-15T...",
  "uptime": 123.456,
  "environment": "production"
}
```

### Login Page (debería mostrar página de login)
```
https://fr360-1ls4.onrender.com/login-page
```

### Home (debería redirigir a login si no estás autenticado)
```
https://fr360-1ls4.onrender.com/
```

---

## 🔄 SI NECESITAS REDESPLEGAR

Después de hacer cambios:

```bash
cd c:\Sitios\FR360
git add .
git commit -m "fix: descripción del cambio"
git push origin main
```

Render desplegará automáticamente en 5-10 minutos.

---

## 📊 VERIFICACIÓN FINAL

- [ ] Todas las variables de entorno configuradas en Render
- [ ] Google Cloud Console configurado con URLs correctas
- [ ] Archivos config/, middleware/, routes/ en Git
- [ ] Push exitoso a GitHub
- [ ] Despliegue exitoso en Render (sin errores rojos en Logs)
- [ ] `/health` responde correctamente
- [ ] `/login-page` muestra página de login
- [ ] Login con Google funciona
- [ ] Solo usuarios @sentiretaller.com pueden acceder

---

**Tu URL:** https://fr360-1ls4.onrender.com
**Google Callback:** https://fr360-1ls4.onrender.com/auth/google/callback
