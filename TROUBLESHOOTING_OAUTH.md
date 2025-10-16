# 🔧 Solución: Error 400 redirect_uri_mismatch

## ❌ El Error que Tienes

```
Error 400: redirect_uri_mismatch
```

Esto significa que la URL de callback en tu código NO coincide con la configurada en Google Cloud Console.

---

## ✅ SOLUCIÓN PASO A PASO:

### PASO 1: Identifica tu URL de Render

1. Ve a tu dashboard de Render: [https://dashboard.render.com/](https://dashboard.render.com/)
2. Click en tu servicio **FR360**
3. En la parte superior verás la URL pública, algo como:
   ```
   https://fr360-comercialito-XXXX.onrender.com
   ```
4. **COPIA ESTA URL COMPLETA** (incluyendo el https://)

---

### PASO 2: Actualiza Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Asegúrate de estar en el proyecto **FR360-Auth**
3. Menú lateral → **APIs y servicios** → **Credenciales**
4. Click en tu cliente OAuth (algo como "FR360 Web Client")

#### 2.1 Actualizar "Orígenes de JavaScript autorizados"

Click en **+ AGREGAR URI** y agrega **EXACTAMENTE**:

```
https://tu-url-de-render.onrender.com
```

⚠️ **SIN barra final**, ejemplo correcto:
```
https://fr360-comercialito-abc123.onrender.com
```

#### 2.2 Actualizar "URIs de redirección autorizadas"

Click en **+ AGREGAR URI** y agrega **EXACTAMENTE**:

```
https://tu-url-de-render.onrender.com/auth/google/callback
```

⚠️ **CON `/auth/google/callback` al final**, ejemplo correcto:
```
https://fr360-comercialito-abc123.onrender.com/auth/google/callback
```

#### 2.3 Guardar

Click en **GUARDAR** (abajo de la página)

---

### PASO 3: Actualiza la Variable de Entorno en Render

1. Ve a Render → Tu servicio FR360
2. Click en **Environment** (menú lateral izquierdo)
3. Busca la variable `GOOGLE_CALLBACK_URL`
4. **Edita el valor** para que coincida EXACTAMENTE:

```
https://tu-url-de-render.onrender.com/auth/google/callback
```

5. Click en **Save Changes**
6. Render reiniciará automáticamente tu servicio (2-3 minutos)

---

### PASO 4: Espera y Prueba

1. **Espera 2-3 minutos** a que Render reinicie el servicio
2. **Limpia la caché de tu navegador** (Ctrl + Shift + Delete)
3. Ve a tu URL de Render: `https://tu-app.onrender.com`
4. Click en **"Iniciar sesión con Google"**
5. ✅ Debería funcionar ahora

---

## 📝 EJEMPLO COMPLETO:

Supongamos que tu URL de Render es:
```
https://fr360-comercialito-xyz789.onrender.com
```

### En Google Cloud Console:

**Orígenes de JavaScript autorizados:**
```
https://fr360-comercialito-xyz789.onrender.com
```

**URIs de redirección autorizadas:**
```
https://fr360-comercialito-xyz789.onrender.com/auth/google/callback
```

### En Render (Variables de Entorno):

```env
GOOGLE_CALLBACK_URL=https://fr360-comercialito-xyz789.onrender.com/auth/google/callback
```

---

## ⚠️ ERRORES COMUNES:

### ❌ Error 1: Barra final en la URL
```
# ❌ INCORRECTO:
https://fr360-comercialito.onrender.com/

# ✅ CORRECTO:
https://fr360-comercialito.onrender.com
```

### ❌ Error 2: Usar http en lugar de https
```
# ❌ INCORRECTO:
http://fr360-comercialito.onrender.com

# ✅ CORRECTO:
https://fr360-comercialito.onrender.com
```

### ❌ Error 3: Falta /auth/google/callback en el callback
```
# ❌ INCORRECTO (URI de redirección):
https://fr360-comercialito.onrender.com

# ✅ CORRECTO (URI de redirección):
https://fr360-comercialito.onrender.com/auth/google/callback
```

### ❌ Error 4: No coincide con lo configurado en Google
```
# En Google Cloud Console:
https://fr360-abc.onrender.com/auth/google/callback

# En Render (variable GOOGLE_CALLBACK_URL):
https://fr360-xyz.onrender.com/auth/google/callback

# ❌ NO COINCIDEN → Error 400
```

---

## 🔍 VERIFICACIÓN RÁPIDA:

Abre 3 pestañas y compara que sean IDÉNTICAS:

### Pestaña 1: Google Cloud Console
```
APIs y servicios → Credenciales → Tu cliente OAuth
Mira "URIs de redirección autorizadas"
```

### Pestaña 2: Render Environment Variables
```
Dashboard → FR360 → Environment
Mira el valor de GOOGLE_CALLBACK_URL
```

### Pestaña 3: Render URL
```
Dashboard → FR360 (parte superior)
Mira la URL pública de tu servicio
```

**Las 3 deben coincidir exactamente (excepto que la URL pública no tiene /auth/google/callback)**

---

## 🐛 SI SIGUE SIN FUNCIONAR:

### Opción A: Ver el error exacto

1. Cuando aparezca el error en Google, busca el link **"detalles del error"**
2. Te dirá cuál es la URL que está recibiendo vs la que espera
3. Ajusta la que esté incorrecta

### Opción B: Ver logs en Render

1. Ve a Render → Tu servicio → **Logs**
2. Busca líneas que digan:
   ```
   ✅ Passport configurado con Google OAuth 2.0
   ```
3. Si ves errores, cópialos y me los pasas

### Opción C: Probar en desarrollo local primero

1. Abre `c:\Sitios\FR360\.env`
2. Configura:
   ```env
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   ```
3. En Google Cloud Console, agrega también:
   ```
   http://localhost:3000
   http://localhost:3000/auth/google/callback
   ```
4. Ejecuta localmente:
   ```bash
   npm run dev
   ```
5. Abre `http://localhost:3000`
6. Si funciona local, el problema es solo la URL de producción

---

## 📸 CAPTURAS DE PANTALLA DE REFERENCIA:

### Google Cloud Console - Cliente OAuth
```
Deberías ver algo así:

┌─────────────────────────────────────────────┐
│ Orígenes de JavaScript autorizados         │
├─────────────────────────────────────────────┤
│ https://fr360-xyz.onrender.com             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ URIs de redirección autorizadas                         │
├─────────────────────────────────────────────────────────┤
│ https://fr360-xyz.onrender.com/auth/google/callback    │
└─────────────────────────────────────────────────────────┘
```

### Render - Environment Variables
```
┌────────────────────────┬──────────────────────────────────────────────────┐
│ Key                    │ Value                                            │
├────────────────────────┼──────────────────────────────────────────────────┤
│ GOOGLE_CLIENT_ID       │ 123456-abc.apps.googleusercontent.com            │
│ GOOGLE_CLIENT_SECRET   │ GOCSPX-abc123def456                              │
│ GOOGLE_CALLBACK_URL    │ https://fr360-xyz.onrender.com/auth/google/...   │
└────────────────────────┴──────────────────────────────────────────────────┘
```

---

## ✅ CHECKLIST DE VERIFICACIÓN:

Marca cada item cuando lo verifiques:

- [ ] URL de Render copiada (sin barra final)
- [ ] Origen JavaScript agregado en Google Cloud Console
- [ ] URI de redirección agregada en Google Cloud Console (con /auth/google/callback)
- [ ] Variable `GOOGLE_CALLBACK_URL` actualizada en Render
- [ ] Guardado en Google Cloud Console
- [ ] Guardado en Render (y servicio reiniciado)
- [ ] Esperado 2-3 minutos
- [ ] Caché del navegador limpiada
- [ ] URLs coinciden EXACTAMENTE en Google y Render

---

## 💡 CONSEJO PRO:

Para evitar este error en el futuro, cuando desarrolles localmente **agrega AMBAS URLs** en Google Cloud Console:

**Orígenes de JavaScript autorizados:**
```
http://localhost:3000
https://tu-app.onrender.com
```

**URIs de redirección autorizadas:**
```
http://localhost:3000/auth/google/callback
https://tu-app.onrender.com/auth/google/callback
```

Así puedes probar tanto en local como en producción sin cambiar configuración.

---

¿Necesitas ayuda para verificar las URLs? Dime cuál es tu URL de Render y te ayudo a configurarlo correctamente.
