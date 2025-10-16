# 🔐 Checklist de Seguridad - FR360

## ✅ Configuración Completada

### Variables de Entorno
- [x] SESSION_SECRET generado con 128 caracteres aleatorios
- [x] CALLBELL_TEMPLATE_UUID movido a variable de entorno
- [x] Todas las variables validadas al inicio de cada servicio
- [x] Fallbacks hardcodeados removidos de todos los servicios

### Archivos de Configuración
- [x] `.env` está en `.gitignore`
- [x] README.md limpio de credenciales reales
- [x] Documentación con placeholders en lugar de tokens reales

### Código
- [x] No hay credenciales en archivos públicos (`/public`)
- [x] No hay credenciales en templates EJS
- [x] Validación de variables de entorno en todos los servicios
- [x] Logger básico implementado en `utils/logger.js`

## ⚠️ Acciones Requeridas por el Equipo

### 1. Rotar Credenciales (CRÍTICO)

Las siguientes credenciales fueron expuestas en documentación y deben ser regeneradas:

#### Google OAuth
- [ ] Regenerar Client Secret en Google Cloud Console
- [ ] Actualizar `GOOGLE_CLIENT_SECRET` en `.env` local
- [ ] Actualizar `GOOGLE_CLIENT_SECRET` en Render

#### Tokens de API
Estos tokens NO fueron expuestos públicamente pero deben rotarse como medida preventiva:
- [ ] Regenerar `STRAPI_TOKEN` en Strapi Dashboard
- [ ] Regenerar `FR360_BEARER_TOKEN` en FR360 API
- [ ] Regenerar `FR360_EPAYCO_TOKEN` en ePayco
- [ ] Regenerar `FRAPP_API_KEY` en FRAPP Dashboard
- [ ] Verificar `CALLBELL_API_KEY` (fue expuesto en documentación vieja)
- [ ] Verificar `OLD_MEMB_AUTH` (token de WordPress)

### 2. Configurar Variables en Render

Asegúrate de agregar/actualizar TODAS estas variables en Render:

```
PORT=3000
NODE_ENV=production

# Session
SESSION_SECRET=[TU_NUEVO_SECRET_DE_128_CARACTERES]

# Google OAuth
GOOGLE_CLIENT_ID=[TU_CLIENT_ID]
GOOGLE_CLIENT_SECRET=[TU_NUEVO_SECRET]
GOOGLE_CALLBACK_URL=https://tu-app.onrender.com/auth/google/callback

# Strapi CMS
STRAPI_BASE_URL=[TU_URL_SIN_/API]
STRAPI_TOKEN=[TU_NUEVO_TOKEN]

# FR360 API
FR360_BASE_URL=[TU_URL_SIN_/API]
FR360_BEARER_TOKEN=[TU_NUEVO_TOKEN]
FR360_EPAYCO_TOKEN=[TU_NUEVO_TOKEN]

# FRAPP API
FRAPP_BASE_URL=[TU_URL_SIN_/API]
FRAPP_API_KEY=[TU_NUEVO_TOKEN]

# Callbell API
CALLBELL_BASE_URL=https://api.callbell.eu/v1
CALLBELL_API_KEY=[TU_NUEVO_TOKEN]
CALLBELL_TEMPLATE_UUID=[TU_TEMPLATE_UUID]

# WordPress
OLD_MEMB_BASE_URL=https://app.cursofuturosresidentes.com
OLD_MEMB_AUTH="[TU_TOKEN_CON_COMILLAS]"

# Usuarios especiales
SPECIAL_USERS=email1@sentiretaller.com,email2@sentiretaller.com

# Timeouts
API_TIMEOUT=15000
API_MAX_RETRIES=5
API_RETRY_DELAY=2000
```

⚠️ **IMPORTANTE**: Las URLs base NO deben terminar en `/api` porque el código ya lo agrega.

### 3. Verificar Historial de Git

Antes de subir a un repositorio público:

```bash
# Verificar que .env nunca se haya commiteado
git log --all --full-history -- .env

# Si aparece en el historial, usar git-filter-repo o BFG Repo-Cleaner
```

### 4. Configurar Secretos en GitHub (si aplica)

Si usas GitHub Actions:
- [ ] Agregar secrets en Settings → Secrets and variables → Actions
- [ ] NUNCA usar credenciales reales en workflows públicos

## 📋 Checklist de Pre-Deployment

Antes de deployar a producción:

- [ ] Todas las credenciales han sido rotadas
- [ ] Variables de entorno configuradas en Render
- [ ] `NODE_ENV=production` está configurado en Render
- [ ] `.env` local tiene credenciales diferentes a producción
- [ ] Historial de Git verificado (sin credenciales)
- [ ] README.md usa solo placeholders
- [ ] Dominio Google OAuth actualizado con URL de producción

## 🔍 Monitoreo Post-Deployment

Después del deployment:

1. **Verificar Logs en Render**
   - No deben aparecer mensajes de "Missing required ... environment variables"
   - Verificar que todas las API calls funcionan correctamente

2. **Probar Autenticación**
   - Login con Google OAuth funciona
   - Solo emails @sentiretaller.com tienen acceso
   - Sesiones persisten correctamente

3. **Probar Integraciones**
   - Strapi API responde correctamente
   - FR360 API funciona (ciudadanos y payment links)
   - FRAPP API funciona (membresías)
   - Callbell API funciona (WhatsApp)
   - WordPress API funciona o muestra mensaje informativo

## 📝 Notas Adicionales

### Logs en Producción
- Los logs de DEBUG se deshabilitan automáticamente en producción
- Logs de ERROR e INFO siempre se muestran
- Para ver logs en Render: Dashboard → Logs tab

### Mejoras Futuras Recomendadas
- [ ] Implementar rate limiting en endpoints públicos
- [ ] Agregar logging estructurado con Winston o Pino
- [ ] Implementar rotación automática de sesiones
- [ ] Agregar monitoring con Sentry o similar
- [ ] Configurar alertas en Render para errores críticos

## 🆘 En Caso de Exposición de Credenciales

Si se expone alguna credencial accidentalmente:

1. **Inmediatamente**:
   - Rotar la credencial comprometida
   - Actualizar en todos los entornos (local, Render, etc.)
   - Verificar logs de acceso para detectar uso no autorizado

2. **Investigar**:
   - Revisar historial de Git
   - Verificar accesos en las plataformas afectadas
   - Documentar el incidente

3. **Prevenir**:
   - Agregar pre-commit hooks para detectar secrets
   - Usar herramientas como `git-secrets` o `gitleaks`
   - Revisar accesos periódicamente

---

**Última actualización**: 2025-10-16
**Versión**: 1.0
