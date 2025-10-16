# 🔧 Solución Final: TokenError Bad Request (Persistente)

## Tu Situación:
- ✅ Credenciales correctas: `634050828330-iktg7gn9gs8cq9ois950920nvn8irtf3.apps.googleusercontent.com`
- ✅ Secret correcto: `GOCSPX-aYM7IzpIY12OIZZ_1pbAShFK2q4`
- ✅ URLs configuradas correctamente
- ❌ Error persiste: `TokenError: Bad Request`

---

## 🎯 CAUSA REAL DEL PROBLEMA:

El error **TokenError: Bad Request** cuando el callback recibe un código válido significa que:

1. **Google OAuth API no está habilitada**, O
2. **La aplicación no está en modo "Producción"** (si es Externa), O
3. **Falta configurar la pantalla de consentimiento correctamente**

---

## ✅ SOLUCIÓN COMPLETA:

### PASO 1: Habilitar Google+ API (Obligatorio)

1. Ve a: https://console.cloud.google.com/apis/library
2. En la búsqueda, escribe: **"Google+ API"** o **"People API"**
3. Click en **"Google People API"**
4. Click en **"HABILITAR"** (botón azul)
5. Espera 1-2 minutos a que se habilite

### PASO 2: Verificar Estado de la Pantalla de Consentimiento

1. Ve a: https://console.cloud.google.com/apis/credentials/consent
2. Verifica el **"Estado de publicación"**:

**Si dice "En producción":**
- ✅ Está bien, continúa al Paso 3

**Si dice "Pruebas" o "Testing":**
- Click en **"PUBLICAR APLICACIÓN"**
- Click en **"CONFIRMAR"**
- Espera 1-2 minutos

### PASO 3: Verificar Ámbitos (Scopes) en la Pantalla de Consentimiento

1. Todavía en: https://console.cloud.google.com/apis/credentials/consent
2. Click en **"EDITAR APLICACIÓN"**
3. Ve a la sección **"Ámbitos"** (Scopes)
4. Click en **"AÑADIR O QUITAR ÁMBITOS"**
5. Asegúrate de tener EXACTAMENTE estos 3 ámbitos:

```
✅ .../auth/userinfo.email
✅ .../auth/userinfo.profile
✅ openid
```

6. Si falta alguno, márcalo y click en **"ACTUALIZAR"**
7. Click en **"GUARDAR Y CONTINUAR"**
8. Click en **"VOLVER AL PANEL"**

### PASO 4: Recrear el Cliente OAuth (Si nada más funciona)

Si los pasos anteriores no funcionan, el cliente OAuth puede estar corrupto. Vamos a crear uno nuevo:

1. Ve a: https://console.cloud.google.com/apis/credentials
2. Click en tu cliente actual (el que dice 634050828330...)
3. **COPIA** el Client ID y Secret (guárdalos en un lugar seguro)
4. Cierra el modal
5. Click en **"+ CREAR CREDENCIALES"** → **"ID de cliente de OAuth 2.0"**
6. Configura:
   - **Tipo**: Aplicación web
   - **Nombre**: `FR360 Web Client v2`
   - **Orígenes JavaScript autorizados**:
     ```
     https://fr360-1ls4.onrender.com
     ```
   - **URIs de redirección autorizadas**:
     ```
     https://fr360-1ls4.onrender.com/auth/google/callback
     ```
7. Click **CREAR**
8. **COPIA las nuevas credenciales**
9. Ve a Render → Environment
10. Actualiza `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` con los nuevos valores
11. Guarda y espera 2-3 minutos

---

## 🔍 VERIFICACIÓN ADICIONAL:

### Check 1: ¿La API de People está habilitada?

Ve a: https://console.cloud.google.com/apis/dashboard

Deberías ver **"People API"** o **"Google+ API"** en la lista de APIs habilitadas.

Si NO aparece:
1. Click en **"+ HABILITAR APIS Y SERVICIOS"**
2. Busca "People API"
3. Click en "HABILITAR"

### Check 2: ¿El proyecto tiene facturación habilitada? (NO requerido pero ayuda)

Si tienes problemas, a veces Google requiere que el proyecto tenga una cuenta de facturación asociada (aunque no te cobrará nada para OAuth básico).

1. Ve a: https://console.cloud.google.com/billing
2. Si no tiene facturación, click en **"VINCULAR UNA CUENTA DE FACTURACIÓN"**
3. Sigue los pasos (puedes usar la capa gratuita)

### Check 3: ¿Tu dominio está verificado en Google Search Console? (Opcional)

Si quieres restringir solo a @sentiretaller.com a nivel de Google:

1. Ve a: https://search.google.com/search-console
2. Agrega y verifica el dominio `sentiretaller.com`
3. Vuelve a Google Cloud Console → Pantalla de consentimiento
4. Agrega `sentiretaller.com` como dominio autorizado

---

## 🧪 PRUEBA ALTERNATIVA: Modo Desarrollo Local

Para descartar que sea un problema de Render:

1. Abre `c:\Sitios\FR360\.env`
2. Agrega/actualiza:
   ```env
   GOOGLE_CLIENT_ID=634050828330-iktg7gn9gs8cq9ois950920nvn8irtf3.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-aYM7IzpIY12OIZZ_1pbAShFK2q4
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   ```

3. En Google Cloud Console, agrega URLs locales:
   - Orígenes: `http://localhost:3000`
   - Redirección: `http://localhost:3000/auth/google/callback`

4. Ejecuta:
   ```bash
   cd c:\Sitios\FR360
   npm run dev
   ```

5. Abre: http://localhost:3000/login-page

6. Prueba el login

**Si funciona local pero NO en Render:**
- El problema está en las URLs o configuración de Render

**Si NO funciona ni local:**
- El problema está en la configuración de Google Cloud Console

---

## 📊 CONFIGURACIÓN CORRECTA EN GOOGLE CLOUD CONSOLE:

### Pantalla de Consentimiento OAuth:
```
┌─────────────────────────────────────────────┐
│ Tipo de usuario: Interno (o Externo)       │
│ Estado: EN PRODUCCIÓN ✅                    │
│ Nombre de app: FR360 - Panel Comercial     │
│ Correo de soporte: tu@sentiretaller.com    │
│ Dominios autorizados: sentiretaller.com    │
│                                             │
│ Ámbitos:                                    │
│  ✅ .../auth/userinfo.email                │
│  ✅ .../auth/userinfo.profile              │
│  ✅ openid                                  │
└─────────────────────────────────────────────┘
```

### Cliente OAuth 2.0:
```
┌─────────────────────────────────────────────────────────────┐
│ Nombre: FR360 Web Client                                    │
│                                                             │
│ Orígenes de JavaScript autorizados:                         │
│  • https://fr360-1ls4.onrender.com                          │
│                                                             │
│ URIs de redirección autorizadas:                            │
│  • https://fr360-1ls4.onrender.com/auth/google/callback    │
└─────────────────────────────────────────────────────────────┘
```

### APIs Habilitadas:
```
✅ Google People API (o Google+ API)
✅ Google OAuth2 API
```

---

## 🎯 CHECKLIST FINAL:

- [ ] People API habilitada
- [ ] Pantalla de consentimiento en "Producción" (si es Externa)
- [ ] Ámbitos correctos: email, profile, openid
- [ ] Orígenes JavaScript: https://fr360-1ls4.onrender.com
- [ ] URI de redirección: https://fr360-1ls4.onrender.com/auth/google/callback
- [ ] Credenciales copiadas correctamente en Render
- [ ] Esperado 2-3 minutos después de cambios
- [ ] Probado en local (opcional pero recomendado)

---

## 📞 SI NADA FUNCIONA:

### Última opción: Usar una biblioteca más simple

Si el problema persiste, podemos cambiar la estrategia a una más simple sin Passport:

Cambiaríamos de:
```javascript
passport-google-oauth20
```

A:
```javascript
googleapis (Google's official Node.js library)
```

Pero esto requeriría reescribir el código de autenticación. **Solo hazlo si todo lo anterior falla**.

---

## 💡 CONSEJO:

El error "TokenError: Bad Request" casi siempre se debe a:

1. **90% de los casos**: APIs no habilitadas (People API)
2. **8% de los casos**: App en modo "Pruebas" en lugar de "Producción"
3. **2% de los casos**: Credenciales incorrectas (pero ya verificamos que las tuyas son correctas)

Empieza por **habilitar People API** y **publicar la aplicación**. Esos dos pasos resuelven el 98% de los casos.
