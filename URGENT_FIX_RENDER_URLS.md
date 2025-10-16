# 🚨 ARREGLO URGENTE: Variables de Render

## ⚠️ PROBLEMA IDENTIFICADO

Las URLs base en Render tienen sufijos de ruta (`/api`, `/wp-json`) que causan URLs duplicadas:

**Ejemplo del problema:**
```
STRAPI_BASE_URL = https://strapi-project-d3p7.onrender.com/api
Código agrega:    /api/productos
Resultado:        https://strapi-project-d3p7.onrender.com/api/api/productos  ❌ 404 ERROR
```

## ✅ SOLUCIÓN INMEDIATA

Ve a **Render Dashboard → FR360 → Environment** y modifica estas **4 variables**:

### 1. STRAPI_BASE_URL
**❌ Incorrecto (actual):**
```
STRAPI_BASE_URL=https://strapi-project-d3p7.onrender.com/api
```

**✅ Correcto (cambiar a):**
```
STRAPI_BASE_URL=https://strapi-project-d3p7.onrender.com
```

### 2. FR360_BASE_URL
**❌ Incorrecto (actual):**
```
FR360_BASE_URL=https://fr360-7cwi.onrender.com/api
```

**✅ Correcto (cambiar a):**
```
FR360_BASE_URL=https://fr360-7cwi.onrender.com
```

### 3. FRAPP_BASE_URL
**❌ Incorrecto (actual):**
```
FRAPP_BASE_URL=https://admin-appfr-os0a.onrender.com/api
```

**✅ Correcto (cambiar a):**
```
FRAPP_BASE_URL=https://admin-appfr-os0a.onrender.com
```

### 4. OLD_MEMB_BASE_URL
**❌ Incorrecto (actual):**
```
OLD_MEMB_BASE_URL=https://app.cursofuturosresidentes.com/wp-json
```

**✅ Correcto (cambiar a):**
```
OLD_MEMB_BASE_URL=https://app.cursofuturosresidentes.com
```

### 5. OLD_MEMB_AUTH (BONUS)
**❌ Si tiene comillas:**
```
OLD_MEMB_AUTH="JqL1TDznO43PsMk?bbeoSk_h#B+tGOhjKjuD"
```

**✅ Debe ser SIN comillas:**
```
OLD_MEMB_AUTH=JqL1TDznO43PsMk?bbeoSk_h#B+tGOhjKjuD
```

---

## 📝 Pasos a Seguir

1. **Abre** Render Dashboard
2. **Selecciona** tu servicio FR360
3. **Ve a** Environment tab
4. **Edita** cada una de las 5 variables arriba
5. **Guarda** los cambios
6. **Espera** 2-3 minutos mientras Render redesplega
7. **Refresca** tu sitio web

---

## 🎯 Resultado Esperado

Después de estos cambios, TODAS las llamadas API funcionarán:
- ✅ getCitizenServer
- ✅ fetchCrmStrapiOnly
- ✅ fetchAcuerdos
- ✅ fetchVentas
- ✅ fetchMembresiasFRAPP
- ✅ Todos los demás endpoints

---

## 💡 ¿Por qué pasó esto?

En Google Apps Script el código original construía las URLs completas:
```javascript
const url = 'https://strapi-project-d3p7.onrender.com/api/productos';
```

En Node.js usamos variables de entorno:
```javascript
const url = `${STRAPI_BASE_URL}/api/productos`;
```

Si STRAPI_BASE_URL ya incluye `/api`, obtenemos `/api/api/productos` → **404 Error**

La solución es que STRAPI_BASE_URL sea **solo el dominio**, sin rutas.

---

## ⚠️ IMPORTANTE

Este cambio es **CRÍTICO** y arregla el 90% de los errores que estás viendo.
Sin esto, ninguna llamada API funcionará correctamente.
