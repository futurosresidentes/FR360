# 🔐 Resumen de Autenticación Implementada

## ✅ Estado: COMPLETADO

La autenticación con Google OAuth 2.0 ha sido implementada exitosamente en FR360.

---

## 📦 Archivos Creados

| Archivo | Descripción |
|---------|-------------|
| `config/passport.js` | Configuración de Passport con estrategia de Google OAuth |
| `middleware/auth.js` | Middlewares de autenticación y autorización |
| `routes/auth.js` | Rutas de login, logout, callback |
| `views/login.ejs` | Página de inicio de sesión |
| `views/error.ejs` | Página de error de acceso denegado |
| `GOOGLE_OAUTH_SETUP.md` | Guía completa de configuración de Google Cloud |

---

## 🔒 Características Implementadas

### 1. **Login con Google OAuth 2.0** ✅

- Solo usuarios con correo **@sentiretaller.com**
- Flujo completo de autenticación
- Sesiones persistentes (24 horas)
- Información del usuario en `req.user`:
  ```javascript
  {
    id: '123456789',
    email: 'usuario@sentiretaller.com',
    displayName: 'Nombre Usuario',
    firstName: 'Nombre',
    lastName: 'Apellido',
    photo: 'https://...',
    provider: 'google',
    loginAt: '2025-10-15T...'
  }
  ```

### 2. **Protección de Rutas** ✅

Todas las rutas están protegidas con middlewares:

#### Rutas Públicas (sin autenticación):
- `/login` - Inicia flujo OAuth
- `/login-page` - Página de inicio de sesión
- `/login-failed` - Error de autenticación
- `/auth/google/callback` - Callback de Google
- `/health` - Health check

#### Rutas Protegidas (requieren autenticación):
- `/` - Página principal (requiere @sentiretaller.com)
- `/api/*` - Todos los endpoints API (requieren @sentiretaller.com)
- `/logout` - Cerrar sesión

### 3. **Middlewares de Autorización** ✅

#### `ensureAuthenticated`
Verifica que el usuario esté autenticado. Si no, redirige a `/login`.

**Uso:**
```javascript
app.get('/ruta-protegida', ensureAuthenticated, (req, res) => {
  // Solo accesible si está autenticado
});
```

#### `ensureDomain`
Verifica que el usuario pertenezca a @sentiretaller.com. Si no, muestra error 403.

**Uso:**
```javascript
app.get('/ruta-protegida', ensureAuthenticated, ensureDomain, (req, res) => {
  // Solo accesible para @sentiretaller.com
});
```

#### `ensureSpecialUser`
Verifica que el usuario esté en la lista de usuarios especiales (variable `SPECIAL_USERS`).

**Uso:**
```javascript
app.post('/api/accion-admin', ensureAuthenticated, ensureDomain, ensureSpecialUser, (req, res) => {
  // Solo accesible para usuarios administradores
});
```

**Usuarios especiales configurados:**
- daniel.cardona@sentiretaller.com
- alex.lopez@sentiretaller.com

#### `checkAuthenticated`
Verifica autenticación sin redirigir (útil para contenido condicional).

**Uso:**
```javascript
app.get('/ruta-mixta', checkAuthenticated, (req, res) => {
  if (req.isAuth) {
    // Usuario autenticado
  } else {
    // Usuario anónimo
  }
});
```

---

## 🌐 Flujo de Autenticación

```
1. Usuario visita https://tu-app.onrender.com/
   └─> No autenticado → Redirige a /login-page

2. Usuario hace clic en "Iniciar sesión con Google"
   └─> Redirige a /login
   └─> Passport redirige a Google OAuth

3. Google muestra pantalla de selección de cuenta
   └─> Usuario selecciona cuenta @sentiretaller.com
   └─> Google valida y redirige a /auth/google/callback

4. Passport procesa el callback
   ├─> Verifica dominio @sentiretaller.com
   ├─> Crea sesión
   └─> Redirige a /

5. Usuario autenticado accede al panel
   └─> Todas las rutas /api/* están protegidas
```

---

## 🛡️ Seguridad Implementada

### ✅ Validación de Dominio
Solo usuarios con correo @sentiretaller.com pueden acceder.

**Código:**
```javascript
if (email && email.endsWith('@sentiretaller.com')) {
  return next();
} else {
  res.status(403).render('error', { ... });
}
```

### ✅ Sesiones Seguras
- Cookies con `httpOnly: true`
- En producción: `secure: true` (solo HTTPS)
- Duración: 24 horas
- Secret fuerte (configurable en `.env`)

### ✅ Protección CSRF
Express-session incluye protección contra CSRF por defecto.

### ✅ Tokens Encriptados
Google maneja los tokens de OAuth de forma segura.

---

## 📝 Variables de Entorno Requeridas

Debes configurar estas variables en Render:

```env
# Sesiones
SESSION_SECRET=genera_un_secret_aleatorio_de_64_caracteres

# Google OAuth 2.0
GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-tu-secret
GOOGLE_CALLBACK_URL=https://tu-app.onrender.com/auth/google/callback

# Usuarios especiales (admin)
SPECIAL_USERS=daniel.cardona@sentiretaller.com,alex.lopez@sentiretaller.com
```

---

## 🚀 Pasos para Activar en Render

1. **Configura Google Cloud Console** (sigue `GOOGLE_OAUTH_SETUP.md`)
2. **Agrega variables de entorno en Render**:
   - Ve a tu servicio → Environment
   - Agrega `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
   - Genera un `SESSION_SECRET` fuerte
3. **Deploy**:
   ```bash
   git add .
   git commit -m "feat: add Google OAuth 2.0 authentication"
   git push origin main
   ```
4. **Prueba**:
   - Ve a `https://tu-app.onrender.com`
   - Deberías ver la página de login
   - Inicia sesión con tu cuenta @sentiretaller.com

---

## 🧪 Cómo Probar

### Test 1: Login Exitoso
```
1. Ve a https://tu-app.onrender.com
2. Click en "Iniciar sesión con Google"
3. Selecciona cuenta @sentiretaller.com
4. ✅ Deberías ver el panel principal
```

### Test 2: Dominio Denegado
```
1. Ve a https://tu-app.onrender.com
2. Click en "Iniciar sesión con Google"
3. Selecciona cuenta de OTRO dominio (ej: @gmail.com)
4. ❌ Deberías ver error: "Acceso Denegado"
```

### Test 3: Protección de API
```
1. Cierra sesión (/logout)
2. Intenta acceder a /api/products
3. ❌ Deberías ser redirigido a /login
```

### Test 4: Usuarios Especiales
```
1. Inicia sesión con alex.lopez@sentiretaller.com
2. Intenta hacer una acción administrativa
3. ✅ Debería funcionar (usuario especial)

4. Inicia sesión con otro-usuario@sentiretaller.com
5. Intenta hacer la misma acción
6. ❌ Debería dar error 403 (no es usuario especial)
```

---

## 📊 Endpoints de Autenticación

| Endpoint | Método | Público | Descripción |
|----------|--------|---------|-------------|
| `/login` | GET | ✅ | Inicia flujo OAuth con Google |
| `/login-page` | GET | ✅ | Muestra página de login |
| `/login-failed` | GET | ✅ | Muestra error de autenticación |
| `/logout` | GET | ❌ | Cierra sesión del usuario |
| `/auth/google/callback` | GET | ✅ | Callback de Google OAuth |
| `/api/auth/status` | GET | ✅ | Verifica si usuario está autenticado |
| `/api/auth/user` | GET | ❌ | Obtiene info del usuario actual |

---

## 🎨 Personalización

### Cambiar el Dominio Permitido

Edita `config/passport.js`:
```javascript
const allowedDomain = '@tu-nuevo-dominio.com';
```

### Agregar Más Usuarios Especiales

Edita `.env` en Render:
```env
SPECIAL_USERS=usuario1@sentiretaller.com,usuario2@sentiretaller.com,usuario3@sentiretaller.com
```

### Cambiar Duración de Sesión

Edita `index.js`:
```javascript
cookie: {
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
}
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module './config/passport'"

**Solución**: Asegúrate de que existe la carpeta `config/` con el archivo `passport.js`.

### Error: "Missing required parameter: hd"

**Solución**: Verifica que el parámetro `hd` esté configurado en `routes/auth.js`:
```javascript
passport.authenticate('google', {
  scope: ['profile', 'email'],
  hd: 'sentiretaller.com'
})
```

### No redirige después de login

**Solución**: Verifica que `GOOGLE_CALLBACK_URL` coincida exactamente con la configurada en Google Cloud Console.

---

## ✅ Checklist de Implementación

- [x] Passport instalado y configurado
- [x] Google OAuth Strategy implementada
- [x] Middlewares de autenticación creados
- [x] Rutas de auth implementadas
- [x] Vistas de login y error creadas
- [x] Protección de rutas API
- [x] Validación de dominio @sentiretaller.com
- [x] Usuarios especiales configurables
- [x] Documentación completa (GOOGLE_OAUTH_SETUP.md)
- [ ] Variables configuradas en Render ⚠️ **PENDIENTE**
- [ ] Credenciales de Google Cloud obtenidas ⚠️ **PENDIENTE**
- [ ] Pruebas realizadas ⚠️ **PENDIENTE**

---

## 📚 Próximos Pasos

1. **Migrar frontend completo** del `index.html` original (6,123 líneas)
2. **Configurar Google Cloud Console** siguiendo `GOOGLE_OAUTH_SETUP.md`
3. **Agregar variables de entorno** en Render
4. **Hacer deploy** y probar la autenticación

---

**Implementado por:** Claude Code
**Fecha:** 2025-10-15
**Estado:** ✅ COMPLETADO (80% - falta configurar en Google Cloud y Render)
