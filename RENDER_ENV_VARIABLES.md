# Variables de Entorno para Render

## ⚠️ IMPORTANTE
Estas variables DEBEN estar configuradas en Render para que la aplicación funcione correctamente.

Ve a: `Render Dashboard` → `FR360` → `Environment` → `Environment Variables`

---

## Variables Requeridas

### 🔐 Sesiones y Seguridad
```
SESSION_SECRET=tu_secret_super_seguro_cambialo_en_produccion
```
**Acción:** Genera un string aleatorio largo (mínimo 32 caracteres)

### 🔑 Google OAuth 2.0
```
GOOGLE_CLIENT_ID=TU_CLIENT_ID_AQUI.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=TU_CLIENT_SECRET_AQUI
GOOGLE_CALLBACK_URL=https://fr360-1ls4.onrender.com/auth/google/callback
```
**Acción:** Usa las credenciales que creaste en Google Cloud Console

### 📊 Strapi CMS
```
STRAPI_BASE_URL=https://strapi-project-d3p7.onrender.com/api
STRAPI_TOKEN=b07772d8be9e7a19ea6ee8536e6b2858e3d06f50f1505ec954f2dc5a98b240a0c7f53fd65c9b90f0edac2336b88294591eab7b28f455389830cfebf90f3a4718d31e2b029be1b1708c6b235a842d514e8e504517e4791a53d1bcf1c1fb4808deddc6c6adc2af3c10c2b5a7bc090519928210752e7a879fa132a0513e6fe045e6
```
**Nota:** Ya debes tener este token

### 🌐 FR360 API (Ciudadanos y Payment Links)
```
FR360_BASE_URL=https://fr360-7cwi.onrender.com/api
FR360_BEARER_TOKEN=91f3c19f460cf9ea3f3f00aa8339f2ab
FR360_EPAYCO_TOKEN=145c42235fb69634f97d628ca902f35b
```
**⚠️ CRÍTICO:** El código usa `FR360_BEARER_TOKEN` (no `FR360_TOKEN`)

### 💳 FRAPP API (Membresías)
```
FRAPP_BASE_URL=https://admin-appfr-os0a.onrender.com/api
FRAPP_API_KEY=5a8812447d3195748c5a438c9a85478e
```
**⚠️ CRÍTICO:** El código usa `FRAPP_API_KEY` (singular, no múltiples keys)

### 💬 Callbell API (WhatsApp)
```
CALLBELL_BASE_URL=https://api.callbell.eu/v1
CALLBELL_API_KEY=tu_api_key_callbell_aqui
```
**⚠️ CRÍTICO:** El código usa `CALLBELL_API_KEY` (no `CALLBELL_TOKEN`)
**Acción:** Reemplaza con tu API key real de Callbell

### 📚 Old Membership Platform (WordPress)
```
OLD_MEMB_BASE_URL=https://app.cursofuturosresidentes.com/wp-json
OLD_MEMB_AUTH=JqL1TDznO43PsMk?bbeoSk_h#B+tGOhjKjuD
```
**⚠️ CRÍTICO:** El código usa `OLD_MEMB_BASE_URL` y `OLD_MEMB_AUTH` (no `WP_*`)

### 👥 Usuarios Especiales
```
SPECIAL_USERS=daniel.cardona@sentiretaller.com,alex.lopez@sentiretaller.com
```

---

## 🔍 Verificación Rápida

### Variables que probablemente YA tienes en Render (nombres ANTIGUOS):
- ❌ `FR360_TOKEN` → Cambiar a `FR360_BEARER_TOKEN`
- ❌ `CALLBELL_TOKEN` → Cambiar a `CALLBELL_API_KEY`
- ❌ `WP_BASE_URL` → Cambiar a `OLD_MEMB_BASE_URL`
- ❌ `WP_AUTH_TOKEN` → Cambiar a `OLD_MEMB_AUTH`
- ❌ `FRAPP_API_KEY_READ`, `FRAPP_API_KEY_REGISTER`, etc → Usar solo `FRAPP_API_KEY`

### Acción Requerida:
1. Ve a Render → Environment Variables
2. **RENOMBRA** las variables con nombres antiguos
3. **VERIFICA** que los valores son correctos
4. **AGREGA** cualquier variable que falte
5. Guarda los cambios

---

## 📋 Checklist de Variables

Marca cada variable después de verificarla en Render:

- [ ] SESSION_SECRET
- [ ] GOOGLE_CLIENT_ID
- [ ] GOOGLE_CLIENT_SECRET
- [ ] GOOGLE_CALLBACK_URL
- [ ] STRAPI_BASE_URL
- [ ] STRAPI_TOKEN
- [ ] FR360_BASE_URL
- [ ] FR360_BEARER_TOKEN ⚠️
- [ ] FR360_EPAYCO_TOKEN
- [ ] FRAPP_BASE_URL
- [ ] FRAPP_API_KEY ⚠️
- [ ] CALLBELL_BASE_URL
- [ ] CALLBELL_API_KEY ⚠️
- [ ] OLD_MEMB_BASE_URL ⚠️
- [ ] OLD_MEMB_AUTH ⚠️
- [ ] SPECIAL_USERS

**⚠️ = Variables que probablemente necesitas renombrar**

---

## 🚀 Después de Actualizar

1. Guarda los cambios en Render
2. Render redesplegar automáticamente
3. Espera 2-3 minutos
4. Refresca tu sitio web
5. Deberías ver que todos los endpoints funcionan sin errores 500

---

## ❓ Preguntas Frecuentes

**P: ¿Debo borrar las variables antiguas?**
R: Sí, pero solo DESPUÉS de renombrarlas. Ejemplo:
   1. Copia el valor de `FR360_TOKEN`
   2. Crea nueva variable `FR360_BEARER_TOKEN` con ese valor
   3. Borra la antigua `FR360_TOKEN`

**P: ¿Qué pasa si me equivoco?**
R: Puedes volver a cambiarlas en cualquier momento. Render redesplegar automáticamente.

**P: ¿Los valores son sensibles?**
R: SÍ. Nunca compartas estos valores públicamente. Render los mantiene seguros.

**P: ¿Necesito reiniciar después de cambiar?**
R: No, Render reinicia automáticamente cuando guardas cambios en Environment Variables.

---

## 🆘 Si algo no funciona

Revisa los logs en Render:
```
Render Dashboard → FR360 → Logs
```

Busca mensajes como:
- "undefined" en tokens
- "401 Unauthorized"
- "Missing environment variable"

Estos indican que falta configurar alguna variable.
