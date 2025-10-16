# 🔐 Configuración de Google OAuth 2.0 para FR360

Esta guía te explica paso a paso cómo configurar Google OAuth 2.0 para que los usuarios de **@sentiretaller.com** puedan autenticarse en FR360.

---

## 📋 Requisitos Previos

- Cuenta de Google con permisos de administrador (para crear el proyecto en Google Cloud)
- Acceso a [Google Cloud Console](https://console.cloud.google.com/)
- Tu aplicación desplegada en Render (o conocer la URL local para desarrollo)

---

## 🚀 PASO 1: Crear Proyecto en Google Cloud Console

### 1.1 Acceder a Google Cloud Console

1. Ve a [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Inicia sesión con tu cuenta de Google

### 1.2 Crear un Nuevo Proyecto

1. Click en el selector de proyecto (arriba a la izquierda)
2. Click en **"Nuevo Proyecto"**
3. Nombre del proyecto: `FR360-Auth` (o el que prefieras)
4. Click en **"Crear"**
5. Espera a que se cree el proyecto (1-2 minutos)
6. Selecciona el proyecto recién creado

---

## 🔑 PASO 2: Configurar la Pantalla de Consentimiento OAuth

### 2.1 Ir a la Configuración de OAuth

1. En el menú lateral, busca **"APIs y servicios"**
2. Click en **"Pantalla de consentimiento de OAuth"**

### 2.2 Configurar el Tipo de Usuario

1. Selecciona **"Interno"** (solo usuarios de tu organización)
   - ⚠️ **MUY IMPORTANTE**: Solo selecciona "Interno" si tienes Google Workspace
   - Si no tienes Google Workspace, selecciona "Externo" y luego configura el dominio permitido
2. Click en **"Crear"**

### 2.3 Información de la Aplicación

Completa el formulario con los siguientes datos:

| Campo | Valor |
|-------|-------|
| **Nombre de la aplicación** | `FR360 - Panel Comercial` |
| **Correo de asistencia al usuario** | Tu correo @sentiretaller.com |
| **Logo de la aplicación** | (Opcional) Logo de FR360 |
| **Dominios de aplicación** | Tu dominio de Render (ej: `fr360-comercialito.onrender.com`) |
| **Dominios autorizados** | `sentiretaller.com` |
| **Correo electrónico del desarrollador** | Tu correo @sentiretaller.com |

Click en **"Guardar y continuar"**

### 2.4 Ámbitos (Scopes)

1. Click en **"Añadir o quitar ámbitos"**
2. Selecciona los siguientes ámbitos:
   - ✅ `userinfo.email`
   - ✅ `userinfo.profile`
   - ✅ `openid`
3. Click en **"Actualizar"**
4. Click en **"Guardar y continuar"**

### 2.5 Usuarios de Prueba (solo si elegiste "Externo")

Si elegiste "Externo" en el tipo de usuario:
1. Click en **"Añadir usuarios"**
2. Agrega correos @sentiretaller.com para pruebas
3. Click en **"Guardar y continuar"**

### 2.6 Resumen

Revisa la configuración y click en **"Volver al panel"**

---

## 🔐 PASO 3: Crear Credenciales OAuth 2.0

### 3.1 Ir a Credenciales

1. En el menú lateral, click en **"Credenciales"**
2. Click en **"+ Crear credenciales"**
3. Selecciona **"ID de cliente de OAuth 2.0"**

### 3.2 Configurar el Cliente OAuth

Completa el formulario:

| Campo | Valor |
|-------|-------|
| **Tipo de aplicación** | `Aplicación web` |
| **Nombre** | `FR360 Web Client` |

### 3.3 Configurar URLs Autorizadas

**Orígenes de JavaScript autorizados:**

Para **DESARROLLO LOCAL**:
```
http://localhost:3000
```

Para **PRODUCCIÓN (Render)**:
```
https://tu-app-nombre.onrender.com
```

⚠️ **Agrega AMBAS URLs** si quieres probar en local y producción.

**URIs de redirección autorizadas:**

Para **DESARROLLO LOCAL**:
```
http://localhost:3000/auth/google/callback
```

Para **PRODUCCIÓN (Render)**:
```
https://tu-app-nombre.onrender.com/auth/google/callback
```

⚠️ **Agrega AMBAS URLs** si quieres probar en local y producción.

### 3.4 Obtener las Credenciales

1. Click en **"Crear"**
2. Aparecerá un modal con:
   - **ID de cliente** (ej: `123456789-abc.apps.googleusercontent.com`)
   - **Secreto del cliente** (ej: `GOCSPX-abc123...`)
3. **¡COPIA ESTAS CREDENCIALES!** Las necesitarás en el siguiente paso
4. También puedes descargarlas como JSON

---

## ⚙️ PASO 4: Configurar Variables de Entorno

### 4.1 En Desarrollo Local (archivo `.env`)

Edita el archivo `.env` en tu proyecto:

```env
# === GOOGLE OAUTH 2.0 ===
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456ghi789
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

### 4.2 En Producción (Render)

1. Ve a tu servicio en Render: [https://dashboard.render.com/](https://dashboard.render.com/)
2. Click en tu servicio **FR360**
3. Ve a **"Environment"** (menú lateral)
4. Agrega estas 3 variables:

| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | `123456789-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-abc123def456ghi789` |
| `GOOGLE_CALLBACK_URL` | `https://tu-app.onrender.com/auth/google/callback` |

5. Click en **"Save Changes"**
6. Render reiniciará automáticamente tu aplicación

⚠️ **IMPORTANTE**: Reemplaza `tu-app.onrender.com` con la URL real de tu servicio en Render.

---

## 🧪 PASO 5: Probar la Autenticación

### 5.1 En Desarrollo Local

1. Asegúrate de que tu `.env` esté configurado
2. Ejecuta el servidor:
   ```bash
   npm run dev
   ```
3. Abre el navegador en: `http://localhost:3000`
4. Deberías ver la página de login
5. Click en **"Iniciar sesión con Google"**
6. Selecciona tu cuenta @sentiretaller.com
7. Acepta los permisos
8. Deberías ser redirigido al panel principal

### 5.2 En Producción (Render)

1. Ve a tu URL de Render: `https://tu-app.onrender.com`
2. Deberías ver la página de login
3. Click en **"Iniciar sesión con Google"**
4. Selecciona tu cuenta @sentiretaller.com
5. Acepta los permisos
6. Deberías ser redirigido al panel principal

### 5.3 Verificar Restricción de Dominio

Para verificar que solo usuarios @sentiretaller.com pueden acceder:

1. Cierra sesión (`/logout`)
2. Intenta iniciar sesión con una cuenta que NO sea @sentiretaller.com (ej: @gmail.com)
3. Deberías ver un mensaje de error: **"Solo usuarios con correo @sentiretaller.com pueden acceder"**

✅ Si ves este error, ¡la restricción de dominio funciona correctamente!

---

## 🔧 Troubleshooting

### Error: "redirect_uri_mismatch"

**Causa**: La URL de callback no coincide con las configuradas en Google Cloud Console.

**Solución**:
1. Ve a Google Cloud Console → Credenciales
2. Edita tu cliente OAuth
3. Verifica que la URL de callback esté exactamente igual en:
   - Google Cloud Console
   - Tu variable `GOOGLE_CALLBACK_URL` en `.env` o Render

### Error: "Access blocked: This app's request is invalid"

**Causa**: Faltan ámbitos (scopes) en la configuración.

**Solución**:
1. Ve a "Pantalla de consentimiento de OAuth"
2. Asegúrate de tener los scopes: `userinfo.email`, `userinfo.profile`, `openid`

### Error: "Error 400: invalid_request"

**Causa**: Falta configurar el `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET`.

**Solución**:
1. Verifica que las variables de entorno estén configuradas correctamente
2. En Render, ve a Environment y verifica los valores
3. Reinicia el servicio en Render

### No se muestra el dominio @sentiretaller.com al iniciar sesión

**Causa**: El parámetro `hd` (hosted domain) no está funcionando.

**Solución**:
- Si tienes Google Workspace con dominio verificado, asegúrate de seleccionar "Interno" en la pantalla de consentimiento
- Si no tienes Google Workspace, el filtro por dominio se hace en el servidor (ya configurado en el código)

---

## 🔒 Seguridad y Mejores Prácticas

### ✅ Hacer

- ✅ Usar HTTPS en producción (Render lo hace automáticamente)
- ✅ Mantener el `GOOGLE_CLIENT_SECRET` secreto (nunca subirlo a GitHub)
- ✅ Usar `SESSION_SECRET` fuerte (64+ caracteres aleatorios)
- ✅ Configurar cookies `secure: true` en producción
- ✅ Revisar logs de autenticación regularmente

### ❌ NO Hacer

- ❌ NO subir `.env` a GitHub (ya está en `.gitignore`)
- ❌ NO compartir tus credenciales de OAuth
- ❌ NO usar el mismo `CLIENT_SECRET` en múltiples proyectos
- ❌ NO permitir otros dominios además de @sentiretaller.com

---

## 📚 Recursos Adicionales

- [Documentación oficial de Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Passport.js Google Strategy](http://www.passportjs.org/packages/passport-google-oauth20/)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Render Documentation](https://render.com/docs)

---

## ✅ Checklist Final

Antes de considerar la configuración completa, verifica:

- [ ] Proyecto creado en Google Cloud Console
- [ ] Pantalla de consentimiento OAuth configurada
- [ ] Credenciales OAuth 2.0 creadas
- [ ] URLs de callback agregadas (local y producción)
- [ ] Variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` configuradas en `.env` (local)
- [ ] Variables configuradas en Render (producción)
- [ ] Prueba exitosa de login con cuenta @sentiretaller.com
- [ ] Prueba de rechazo con cuenta de otro dominio
- [ ] Logout funciona correctamente

---

**¿Problemas?** Revisa los logs en Render (Dashboard → Logs) o ejecuta `npm run dev` localmente para ver errores en consola.

---

**Configurado por:** Tu Nombre
**Fecha:** 2025-10-15
**Proyecto:** FR360 Commercial Management Panel
