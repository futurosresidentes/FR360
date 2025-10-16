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
SESSION_SECRET=tu_secret_super_seguro_cambialo_en_produccion

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
CALLBELL_API_KEY=tu_api_key_callbell_aqui

# Old Membership Platform
OLD_MEMB_BASE_URL=https://app.cursofuturosresidentes.com/wp-json
OLD_MEMB_AUTH=JqL1TDznO43PsMk?bbeoSk_h#B+tGOhjKjuD

# Usuarios especiales (separados por comas)
SPECIAL_USERS=daniel.cardona@sentiretaller.com,alex.lopez@sentiretaller.com

# Configuración de timeouts
API_TIMEOUT=15000
API_MAX_RETRIES=5
API_RETRY_DELAY=2000
```

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

⚠️ **MUY IMPORTANTE**: Debes agregar TODAS estas variables en Render:

```
PORT=3000

SESSION_SECRET=genera_un_secret_aleatorio_seguro_de_64_caracteres

STRAPI_BASE_URL=https://strapi-project-d3p7.onrender.com/api
STRAPI_TOKEN=b07772d8be9e7a19ea6ee8536e6b2858e3d06f50f1505ec954f2dc5a98b240a0c7f53fd65c9b90f0edac2336b88294591eab7b28f455389830cfebf90f3a4718d31e2b029be1b1708c6b235a842d514e8e504517e4791a53d1bcf1c1fb4808deddc6c6adc2af3c10c2b5a7bc090519928210752e7a879fa132a0513e6fe045e6

FR360_BASE_URL=https://fr360-7cwi.onrender.com/api
FR360_BEARER_TOKEN=91f3c19f460cf9ea3f3f00aa8339f2ab
FR360_EPAYCO_TOKEN=145c42235fb69634f97d628ca902f35b

FRAPP_BASE_URL=https://admin-appfr-os0a.onrender.com/api
FRAPP_API_KEY=5a8812447d3195748c5a438c9a85478e

CALLBELL_BASE_URL=https://api.callbell.eu/v1
CALLBELL_API_KEY=TU_API_KEY_CALLBELL

OLD_MEMB_BASE_URL=https://app.cursofuturosresidentes.com/wp-json
OLD_MEMB_AUTH=JqL1TDznO43PsMk?bbeoSk_h#B+tGOhjKjuD

SPECIAL_USERS=daniel.cardona@sentiretaller.com,alex.lopez@sentiretaller.com

API_TIMEOUT=15000
API_MAX_RETRIES=5
API_RETRY_DELAY=2000
```

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
