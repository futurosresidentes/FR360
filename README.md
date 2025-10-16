# FR360 - Panel Comercial

Sistema de gestión comercial migrado de Google Apps Script a Node.js/Express para deployment en Render.

## 📋 Descripción

FR360 es un panel administrativo completo para gestión de ventas, membresías, acuerdos y links de pago. Integra múltiples APIs externas:

- **Strapi CMS**: Productos, CRM, Carteras, Facturaciones
- **FR360 API**: Ciudadanos y Payment Links (ePayco)
- **FRAPP API**: Gestión de membresías
- **Callbell API**: Mensajería WhatsApp
- **WordPress (legacy)**: Plataforma antigua de membresías

## 🏗️ Arquitectura

```
FR360/
├── index.js                 # Servidor Express principal
├── package.json             # Dependencias
├── .env                     # Variables de entorno (NO subir a Git)
├── .gitignore              # Archivos ignorados
├── controllers/            # Lógica de negocio
├── routes/                 # Rutas Express
├── services/               # Servicios de API externa
│   ├── strapiService.js
│   ├── fr360Service.js
│   ├── frappService.js
│   ├── callbellService.js
│   └── oldMembershipService.js
├── utils/                  # Utilidades
│   ├── dateUtils.js
│   ├── phoneUtils.js
│   └── mathUtils.js
├── middleware/             # Middlewares personalizados
├── views/                  # Templates EJS
│   ├── layout.ejs
│   ├── home.ejs
│   └── partials/
└── public/                 # Archivos estáticos
    ├── css/
    ├── js/
    └── img/
```

## 🚀 Instalación Local

### 1. Clonar y preparar el proyecto

```bash
cd c:\Sitios\FR360
npm install
```

### 2. Configurar variables de entorno

Edita el archivo `.env` con tus credenciales reales:

```env
PORT=3000
SESSION_SECRET=GENERA_UN_SECRET_ALEATORIO_DE_64_CARACTERES

# Google OAuth 2.0
GOOGLE_CLIENT_ID=TU_GOOGLE_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=TU_GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Strapi CMS
STRAPI_BASE_URL=https://tu-strapi.onrender.com
STRAPI_TOKEN=TU_STRAPI_TOKEN_AQUI

# FR360 API
FR360_BASE_URL=https://tu-fr360.onrender.com
FR360_BEARER_TOKEN=TU_FR360_BEARER_TOKEN
FR360_EPAYCO_TOKEN=TU_FR360_EPAYCO_TOKEN

# FRAPP API
FRAPP_BASE_URL=https://tu-frapp.onrender.com
FRAPP_API_KEY=TU_FRAPP_API_KEY

# Callbell API (WhatsApp)
CALLBELL_BASE_URL=https://api.callbell.eu/v1
CALLBELL_API_KEY=TU_CALLBELL_API_KEY
CALLBELL_TEMPLATE_UUID=TU_CALLBELL_TEMPLATE_UUID

# Old Membership Platform (WordPress)
OLD_MEMB_BASE_URL=https://app.cursofuturosresidentes.com
OLD_MEMB_AUTH="TU_WORDPRESS_AUTH_TOKEN"

# Usuarios especiales con permisos administrativos (separados por comas)
SPECIAL_USERS=email1@sentiretaller.com,email2@sentiretaller.com

# Configuración de timeouts y reintentos
API_TIMEOUT=15000
API_MAX_RETRIES=5
API_RETRY_DELAY=2000
```

⚠️ **IMPORTANTE**:
- NO uses estos valores de ejemplo
- Genera tus propias credenciales en cada plataforma
- Para SESSION_SECRET usa: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### 3. Ejecutar en modo desarrollo

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

### 4. Ejecutar en producción

```bash
npm start
```

## 🌐 Deployment en Render

### Paso 1: Preparar el repositorio

1. **Crear repositorio en GitHub**:

```bash
cd c:\Sitios\FR360
git init
git add .
git commit -m "Initial commit: FR360 migrado de Google Apps Script"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/fr360.git
git push -u origin main
```

2. **Verificar que `.env` NO se suba** (ya está en `.gitignore`)

### Paso 2: Crear Web Service en Render

1. Ve a [https://render.com](https://render.com) e inicia sesión
2. Click en **"New +"** → **"Web Service"**
3. Conecta tu repositorio de GitHub
4. Configura el servicio:

| Campo | Valor |
|-------|-------|
| **Name** | `fr360-comercialito` |
| **Region** | `Oregon (US West)` o el más cercano |
| **Branch** | `main` |
| **Root Directory** | `.` (vacío) |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` (para empezar) o `Starter` |

5. Click en **"Advanced"** y agrega las siguientes **Environment Variables**:

### Paso 3: Configurar Variables de Entorno en Render

⚠️ **MUY IMPORTANTE**: Usa las mismas variables que en tu archivo `.env` local, pero con los valores de producción.

Consulta el archivo `RENDER_ENV_VARIABLES.md` para ver la lista completa de variables requeridas.

**Variables mínimas requeridas:**
- `SESSION_SECRET` - Secret aleatorio de 64 caracteres
- `GOOGLE_CLIENT_ID` - Client ID de Google OAuth
- `GOOGLE_CLIENT_SECRET` - Client Secret de Google OAuth
- `GOOGLE_CALLBACK_URL` - URL de callback de producción
- `STRAPI_BASE_URL` y `STRAPI_TOKEN`
- `FR360_BASE_URL`, `FR360_BEARER_TOKEN`, `FR360_EPAYCO_TOKEN`
- `FRAPP_BASE_URL` y `FRAPP_API_KEY`
- `CALLBELL_BASE_URL`, `CALLBELL_API_KEY`, `CALLBELL_TEMPLATE_UUID`
- `OLD_MEMB_BASE_URL` y `OLD_MEMB_AUTH`
- `SPECIAL_USERS`

📝 **Nota**: NO copies las credenciales de este README. Usa tus propias credenciales generadas en cada plataforma.

### Paso 4: Deploy

1. Click en **"Create Web Service"**
2. Render comenzará a:
   - Clonar tu repositorio
   - Ejecutar `npm install`
   - Ejecutar `npm start`
   - Asignar una URL pública

3. Espera a que el deployment termine (3-5 minutos)
4. Tu aplicación estará disponible en: `https://fr360-comercialito.onrender.com`

### Paso 5: Configurar Dominio Personalizado (Opcional)

1. En el dashboard de tu servicio en Render, ve a **"Settings"**
2. Scroll a **"Custom Domain"**
3. Agrega tu dominio personalizado (ej: `comercialito.tudominio.com`)
4. Configura los DNS según las instrucciones de Render

## 📊 Endpoints Principales

### API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Página principal |
| GET | `/api/citizen/:uid` | Obtener datos de ciudadano |
| GET | `/api/products` | Listar productos |
| GET | `/api/products/catalog` | Catálogo completo |
| POST | `/api/payment-link` | Crear link de pago |
| GET | `/api/ventas/:uid` | Obtener ventas por UID |
| GET | `/api/acuerdos/:uid` | Obtener acuerdos por UID |
| GET | `/api/membresias/:uid` | Obtener membresías |
| POST | `/api/membresias` | Crear membresía |
| GET | `/api/links/:uid` | Obtener links de pago |

## 🔧 Diferencias vs Google Apps Script

| Característica | Google Apps Script | Node.js/Express |
|----------------|-------------------|-----------------|
| **Hosting** | Google Cloud | Render/Heroku/AWS |
| **HTTP Requests** | `UrlFetchApp.fetch()` | `axios` |
| **Sessions** | `Session.getActiveUser()` | `express-session` |
| **Templates** | `HtmlService` | `EJS` |
| **Timezone** | `Utilities.formatDate()` | `moment-timezone` |
| **Delays** | `Utilities.sleep()` | `setTimeout/await` |
| **Deployment** | `clasp push` | `git push` |

## 🛠️ Comandos Útiles

```bash
# Desarrollo con auto-reload
npm run dev

# Producción
npm start

# Ver logs en Render
# (desde el dashboard de Render, tab "Logs")

# Actualizar deployment
git add .
git commit -m "Descripción de cambios"
git push origin main
# Render hará auto-deploy automáticamente
```

## 🔐 Seguridad

- ✅ Todas las API keys están en variables de entorno
- ✅ `.env` está en `.gitignore`
- ✅ CORS configurado
- ✅ Retry logic para APIs externas
- ✅ Timeouts configurados
- ⚠️ Considera agregar autenticación/autorización para producción

## 📝 Notas Importantes

### Autenticación de Usuarios

El proyecto original usaba `Session.getActiveUser().getEmail()` de Google Workspace. En Node.js necesitarás:

1. **Opción 1**: Implementar Google OAuth 2.0
2. **Opción 2**: Usar otro sistema de autenticación (JWT, Passport.js)
3. **Opción 3**: Usar express-session con login manual

Por ahora, el proyecto NO tiene autenticación implementada. Deberás agregarla según tus necesidades.

### Función `saveConfianzaRecord`

Esta función originalmente guardaba en Google Sheets. Necesitarás:

1. Integrar Google Sheets API para Node.js, O
2. Cambiar a guardar en Strapi u otra base de datos

### Timeouts y Cold Starts

Los servicios en Render (plan gratuito) tienen "cold starts" después de 15 minutos de inactividad. Considera:

- Usar un plan pagado para evitar cold starts
- Implementar un cron job para hacer ping cada 10 minutos
- Mostrar un loading más largo en el frontend

## 🐛 Troubleshooting

### Error: "Cannot find module"
```bash
npm install
```

### Error: "STRAPI_TOKEN is not defined"
- Verifica que todas las variables de entorno estén configuradas en Render
- Revisa que el archivo `.env` esté configurado localmente

### Error: "Port already in use"
```bash
# Cambiar puerto en .env
PORT=3001
```

### Logs en Render
- Ve al dashboard de Render
- Click en tu servicio
- Tab "Logs" para ver errores en tiempo real

## 📧 Soporte

Para problemas o preguntas:
- Revisa los logs en Render
- Verifica las variables de entorno
- Comprueba que todas las APIs externas estén accesibles

## 📄 Licencia

MIT

---

**Migrado exitosamente de Google Apps Script a Node.js/Express** 🎉
