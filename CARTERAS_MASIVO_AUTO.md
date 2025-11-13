# Actualización Automática de Carteras - Configuración

## Endpoint para Ejecuciones Programadas

### URL del Endpoint
```
GET https://fr360-1ls4.onrender.com/api/carteras-masivo/auto
```

### Parámetros Query
- `token` (requerido): Token secreto de seguridad
- `incluir_mora` (opcional): `true` para incluir cuotas en mora, `false` o omitir para no incluir

### Token de Seguridad
El token por defecto es: `FR360_carteras_masivo_2025`

Para cambiarlo, agregar variable de entorno en Render:
```
CARTERAS_MASIVO_TOKEN=tu_token_personalizado_aqui
```

### Ejemplos de Uso

**Sin incluir mora:**
```
https://fr360-1ls4.onrender.com/api/carteras-masivo/auto?token=FR360_carteras_masivo_2025
```

**Incluyendo mora:**
```
https://fr360-1ls4.onrender.com/api/carteras-masivo/auto?token=FR360_carteras_masivo_2025&incluir_mora=true
```

### Respuesta Exitosa
```json
{
  "success": true,
  "acuerdos_procesados": 39,
  "cuotas_actualizadas": 15,
  "acuerdos": [...],
  "procesados": 15,
  "errores": 0
}
```

### Respuestas de Error

**Token inválido (401):**
```json
{
  "success": false,
  "error": "Token inválido"
}
```

**Error de procesamiento (500):**
```json
{
  "success": false,
  "error": "Mensaje de error"
}
```

---

## Google Apps Script - Trigger Diario

### Código del Script

```javascript
/**
 * Actualización Automática Diaria de Carteras FR360
 * Ejecuta a la 1:00 AM todos los días
 */

function actualizarCarterasDiario() {
  const url = 'https://fr360-1ls4.onrender.com/api/carteras-masivo/auto';
  const token = 'FR360_carteras_masivo_2025';
  const incluirMora = true; // Cambiar a false para no incluir mora

  const fullUrl = `${url}?token=${token}&incluir_mora=${incluirMora}`;

  try {
    Logger.log('🤖 Iniciando actualización automática de carteras...');
    Logger.log(`URL: ${fullUrl}`);

    const response = UrlFetchApp.fetch(fullUrl, {
      method: 'get',
      muteHttpExceptions: true
    });

    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    Logger.log(`Status Code: ${responseCode}`);
    Logger.log(`Response: ${responseBody}`);

    if (responseCode === 200) {
      const data = JSON.parse(responseBody);
      Logger.log(`✅ Éxito - Acuerdos procesados: ${data.acuerdos_procesados}`);
      Logger.log(`✅ Cuotas actualizadas: ${data.cuotas_actualizadas}`);

      // Opcional: Enviar notificación por email
      enviarNotificacionExito(data);
    } else {
      Logger.log(`❌ Error ${responseCode}: ${responseBody}`);

      // Opcional: Enviar alerta por email
      enviarAlertaError(responseCode, responseBody);
    }

  } catch (error) {
    Logger.log(`❌ Error ejecutando actualización: ${error.message}`);
    enviarAlertaError('Exception', error.message);
  }
}

/**
 * Enviar notificación de éxito por email (opcional)
 */
function enviarNotificacionExito(data) {
  const destinatario = 'daniel.cardona@sentiretaller.com';
  const asunto = `✅ FR360: Actualización de Carteras Exitosa - ${new Date().toLocaleDateString()}`;
  const cuerpo = `
Actualización automática de carteras completada exitosamente.

📊 Resumen:
• Acuerdos procesados: ${data.acuerdos_procesados}
• Cuotas actualizadas: ${data.cuotas_actualizadas}
• Hora de ejecución: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}

Este es un mensaje automático generado por el sistema FR360.
  `;

  MailApp.sendEmail(destinatario, asunto, cuerpo);
}

/**
 * Enviar alerta de error por email (opcional)
 */
function enviarAlertaError(codigo, mensaje) {
  const destinatario = 'daniel.cardona@sentiretaller.com';
  const asunto = `❌ FR360: Error en Actualización de Carteras - ${new Date().toLocaleDateString()}`;
  const cuerpo = `
⚠️ La actualización automática de carteras falló.

Error: ${codigo}
Mensaje: ${mensaje}
Hora: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}

Por favor revisa el sistema FR360.
  `;

  MailApp.sendEmail(destinatario, asunto, cuerpo);
}

/**
 * Función de prueba (ejecutar manualmente)
 */
function testActualizarCarteras() {
  actualizarCarterasDiario();
}
```

---

## Configurar Trigger en Google Apps Script

### Pasos:

1. **Abrir el Script Editor**
   - Ve a https://script.google.com
   - Crea un nuevo proyecto o usa uno existente
   - Pega el código anterior

2. **Configurar el Trigger**
   - Click en el icono de reloj ⏰ (Triggers) en la barra lateral
   - Click en "+ Add Trigger" (abajo derecha)

3. **Configuración del Trigger:**
   - **Función a ejecutar**: `actualizarCarterasDiario`
   - **Tipo de evento**: `Time-driven` (Basado en tiempo)
   - **Tipo de trigger de tiempo**: `Day timer` (Temporizador diario)
   - **Hora del día**: `1am to 2am` (1:00 AM a 2:00 AM)
   - **Notificaciones de fallo**: Tu preferencia (recomendado: "Notify me immediately")

4. **Guardar**
   - Click en "Save" (Guardar)
   - Autoriza los permisos si es necesario

5. **Probar Manualmente**
   - Ejecuta `testActualizarCarteras()` para verificar que funciona
   - Revisa los logs (View > Logs)

---

## Monitoreo y Logs

### Ver Logs en Google Apps Script
1. En el editor, click en "View" > "Logs" o "Executions"
2. Verás el historial de ejecuciones con timestamps
3. Click en cualquier ejecución para ver los logs detallados

### Ver Logs en Render (Backend)
1. Ve a https://dashboard.render.com
2. Selecciona el servicio FR360
3. Click en "Logs"
4. Busca líneas que empiecen con `🤖 [AUTO]`

---

## Seguridad

### Recomendaciones:
1. **Cambiar el token por defecto** en producción
2. **No compartir el token** públicamente
3. **Usar HTTPS** siempre (ya configurado)
4. **Revisar logs** regularmente para detectar accesos no autorizados

### Si necesitas cambiar el token:
1. En Render Dashboard > FR360 > Environment
2. Agregar/modificar: `CARTERAS_MASIVO_TOKEN=nuevo_token_secreto`
3. Actualizar el token en el Google Apps Script
4. Redeploy del servicio

---

## Troubleshooting

### El trigger no se ejecuta
- Verifica que el trigger esté habilitado en Google Apps Script
- Revisa la zona horaria del proyecto (File > Project properties)
- Verifica que no haya errores en "Executions"

### Error "Token inválido"
- Verifica que el token en el script coincida con la variable de entorno
- Verifica que no haya espacios extras en el token

### Timeout
- El procesamiento puede tardar varios minutos
- Google Apps Script tiene límite de 6 minutos para triggers
- Si es necesario, considera dividir el procesamiento

### No recibe notificaciones por email
- Verifica que las funciones `enviarNotificacionExito` y `enviarAlertaError` estén descomentadas
- Verifica el email del destinatario
- Autoriza permisos de Gmail si es necesario

---

## Mantenimiento

### Frecuencia recomendada:
- **Diaria a la 1:00 AM** (horario de baja actividad)
- Considera ejecutar también los fines de semana

### Qué hace la actualización:
1. Busca cuotas con `estado_pago = null`
2. Busca cuotas con `estado_pago = 'al_dia'` y `fecha_limite < hoy`
3. Si `incluir_mora=true`: También busca cuotas con `estado_pago = 'en_mora'`
4. Para cada cuota, busca si fue pagada en facturaciones
5. Actualiza el estado según corresponda
6. Solo actualiza cuotas que realmente cambiaron de estado

---

## Contacto

Para soporte o dudas:
- **Email**: daniel.cardona@sentiretaller.com
- **Sistema**: FR360 - https://fr360-1ls4.onrender.com
