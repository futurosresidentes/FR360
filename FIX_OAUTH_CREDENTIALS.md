# 🔧 Solución: TokenError Bad Request

## ❌ Error Detectado:
```
Error global: TokenError: Bad Request
```

Esto ocurre en el callback `/auth/google/callback` cuando Google intenta validar tus credenciales.

---

## ✅ SOLUCIÓN:

### PASO 1: Verificar las Credenciales en Google Cloud Console

1. Ve a: https://console.cloud.google.com/apis/credentials
2. Asegúrate de estar en el proyecto correcto (FR360-Auth o el que creaste)
3. Click en tu **ID de cliente OAuth 2.0** (algo como "FR360 Web Client")
4. Verás dos valores:

**ID de cliente:**
```
123456789-abcdefghijk.apps.googleusercontent.com
```

**Secreto del cliente:**
```
GOCSPX-abc123def456ghi789jkl
```

### PASO 2: Copiar las Credenciales CORRECTAMENTE

⚠️ **MUY IMPORTANTE**: Copia COMPLETOS sin espacios ni saltos de línea.

**Formato correcto del CLIENT_ID:**
- Debe terminar en `.apps.googleusercontent.com`
- Ejemplo: `123456789-abc123xyz.apps.googleusercontent.com`

**Formato correcto del CLIENT_SECRET:**
- Debe empezar con `GOCSPX-`
- Ejemplo: `GOCSPX-abc123def456ghi789`

### PASO 3: Actualizar en Render

1. Ve a: https://dashboard.render.com/
2. Tu servicio FR360 → **Environment**
3. **Edita** (no borres y vuelvas a crear):
   - `GOOGLE_CLIENT_ID` → Pega el valor completo
   - `GOOGLE_CLIENT_SECRET` → Pega el valor completo
4. Click **Save Changes**
5. Render reiniciará automáticamente (2-3 minutos)

---

## 🔍 VERIFICACIÓN PASO A PASO:

### Verifica el CLIENT_ID

En Render, el valor de `GOOGLE_CLIENT_ID` debe verse así (cuando le das click al ojo 👁️):

```
123456789-abc123xyz456.apps.googleusercontent.com
```

✅ **Correcto**: Termina en `.apps.googleusercontent.com`
❌ **Incorrecto**: `..........` (puntos, significa que está oculto pero correcto)
❌ **Incorrecto**: Sin `.apps.googleusercontent.com` al final
❌ **Incorrecto**: Con espacios o saltos de línea

### Verifica el CLIENT_SECRET

En Render, el valor de `GOOGLE_CLIENT_SECRET` debe verse así:

```
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45
```

✅ **Correcto**: Empieza con `GOCSPX-`
❌ **Incorrecto**: No empieza con `GOCSPX-`
❌ **Incorrecto**: Con espacios o saltos de línea

---

## 🚨 ERRORES COMUNES:

### Error 1: Copiar con espacios
```
# ❌ INCORRECTO:
GOCSPX- abc123def456

# ✅ CORRECTO:
GOCSPX-abc123def456
```

### Error 2: Copiar incompleto
```
# ❌ INCORRECTO (falta el final):
123456789-abc.apps.google

# ✅ CORRECTO:
123456789-abc.apps.googleusercontent.com
```

### Error 3: Usar credenciales de otro proyecto
- Asegúrate de estar en el proyecto **FR360-Auth** en Google Cloud Console
- Las credenciales de otros proyectos NO funcionarán

---

## 🔄 SI SIGUES TENIENDO PROBLEMAS:

### Opción A: Crear Nuevas Credenciales

Si no estás seguro de que las credenciales sean correctas:

1. Ve a Google Cloud Console → Credenciales
2. Click en **+ CREAR CREDENCIALES** → **ID de cliente de OAuth 2.0**
3. Tipo de aplicación: **Aplicación web**
4. Nombre: `FR360 Web Client NEW`
5. Orígenes autorizados: `https://fr360-1ls4.onrender.com`
6. URIs de redirección: `https://fr360-1ls4.onrender.com/auth/google/callback`
7. Click **CREAR**
8. **COPIA INMEDIATAMENTE** el Client ID y Client Secret
9. Pégalos en Render

### Opción B: Descargar credenciales como JSON

1. En Google Cloud Console → Credenciales
2. Click en tu cliente OAuth
3. Click en **DESCARGAR JSON** (botón de descarga arriba a la derecha)
4. Abre el archivo JSON
5. Busca:
   ```json
   {
     "client_id": "123456789-abc.apps.googleusercontent.com",
     "client_secret": "GOCSPX-abc123def456"
   }
   ```
6. Copia estos valores EXACTAMENTE como aparecen
7. Pégalos en Render

---

## 📸 CÓMO DEBE VERSE EN RENDER:

```
┌────────────────────────┬──────────────────────────────────────────────────────┐
│ GOOGLE_CLIENT_ID       │ 123456789-abc123.apps.googleusercontent.com          │
├────────────────────────┼──────────────────────────────────────────────────────┤
│ GOOGLE_CLIENT_SECRET   │ GOCSPX-abc123def456ghi789                            │
├────────────────────────┼──────────────────────────────────────────────────────┤
│ GOOGLE_CALLBACK_URL    │ https://fr360-1ls4.onrender.com/auth/google/callback│
└────────────────────────┴──────────────────────────────────────────────────────┘
```

**NO debe haber:**
- Espacios antes o después
- Saltos de línea
- Comillas ("" o '')
- Puntos y coma (;)

---

## ✅ DESPUÉS DE ACTUALIZAR:

1. **Espera 2-3 minutos** a que Render reinicie
2. Ve a: https://fr360-1ls4.onrender.com/login-page
3. Click en "Iniciar sesión con Google"
4. Selecciona tu cuenta @sentiretaller.com
5. ✅ Debería funcionar correctamente

---

## 🧪 TEST RÁPIDO:

Para verificar que las credenciales sean correctas SIN esperar a Render:

### Test Local:

1. Abre tu archivo `.env` local:
   ```
   c:\Sitios\FR360\.env
   ```

2. Pega las mismas credenciales:
   ```env
   GOOGLE_CLIENT_ID=el_que_copiaste
   GOOGLE_CLIENT_SECRET=el_que_copiaste
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   ```

3. En Google Cloud Console, agrega también la URL local:
   - Orígenes: `http://localhost:3000`
   - Redirección: `http://localhost:3000/auth/google/callback`

4. Ejecuta localmente:
   ```bash
   cd c:\Sitios\FR360
   npm run dev
   ```

5. Abre: http://localhost:3000/login-page

6. Si funciona local, las credenciales son correctas → El problema es solo en Render

7. Si NO funciona local, las credenciales están mal → Necesitas crear nuevas

---

## 📝 CHECKLIST:

- [ ] Ir a Google Cloud Console → Credenciales
- [ ] Copiar CLIENT_ID completo (termina en .apps.googleusercontent.com)
- [ ] Copiar CLIENT_SECRET completo (empieza con GOCSPX-)
- [ ] Pegar en Render (sin espacios, sin comillas)
- [ ] Verificar que GOOGLE_CALLBACK_URL sea: https://fr360-1ls4.onrender.com/auth/google/callback
- [ ] Guardar en Render
- [ ] Esperar 2-3 minutos
- [ ] Probar login

---

**NOTA**: El error "TokenError: Bad Request" indica que Google rechaza las credenciales. 99% de las veces es porque:
1. El CLIENT_ID o CLIENT_SECRET están mal copiados
2. Estás usando credenciales de otro proyecto
3. Hay espacios/saltos de línea en los valores
