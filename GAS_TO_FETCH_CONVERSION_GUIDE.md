# Google Apps Script to Fetch() API Conversion Guide

## Quick Reference for Converting app.js

This guide provides specific examples for converting the Google Apps Script calls in `app.js` to standard fetch() API calls for Node.js/Express.

## General Pattern

### Google Apps Script (GAS) Pattern:
```javascript
google.script.run
  .withSuccessHandler(successCallback)
  .withFailureHandler(errorCallback)
  .serverFunction(arg1, arg2, arg3)
```

### Fetch() API Pattern:
```javascript
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ arg1, arg2, arg3 })
})
  .then(response => {
    if (!response.ok) throw new Error('Network response was not ok');
    return response.json();
  })
  .then(successCallback)
  .catch(errorCallback)
```

## API Endpoints to Create

Based on the function calls in app.js, you need to create these Express routes:

### Citizen/User Data
- `GET /api/citizen/:uid` - getCitizenServer(uid)
- `POST /api/crm/by-email` - fetchCrmByEmail(email)
- `GET /api/crm/strapi/:uid` - fetchCrmStrapiOnly(uid)
- `POST /api/crm/sync` - sincronizarCrmPorNumeroDocumento(uid)

### Products
- `GET /api/productos` - getProductosServer()
- `GET /api/productos/catalog` - getProductosCatalog()

### Memberships
- `GET /api/membresias/old/:uid` - traerMembresiasServer(uid)
- `GET /api/membresias/frapp/:uid` - fetchMembresiasFRAPP(uid)
- `GET /api/membresias/plans/active` - getActiveMembershipPlans()
- `POST /api/membresias/add` - addMembershipToFRAPP(payload)
- `POST /api/membresias/freeze` - freezeMembership(payload)
- `POST /api/membresias/unfreeze` - unfreezeMembership(payload)
- `POST /api/membresias/batch/validate` - validateCedulasForBatch(cedulas)
- `POST /api/membresias/batch/add` - addBatchMemberships(payload)

### Sales & Agreements
- `GET /api/ventas/:uid` - fetchVentas(uid)
- `GET /api/acuerdos/:uid` - fetchAcuerdos(uid)
- `POST /api/acuerdos/resolve-payment` - resolvePagoYActualizarCartera(payload)
- `POST /api/acuerdos/update-estado` - updateEstadoAcuerdo(payload)

### Payment Links
- `GET /api/links/:uid` - getLinksByIdentityDocument(uid)
- `POST /api/links/create` - createPaymentLink(payload)

### External Integrations
- `POST /api/callbell/contact` - getCallbellContact(celular)
- `POST /api/whatsapp/send` - sendToWhatsApp(payload)

## Conversion Steps

1. Search for all instances of `google.script.run` in app.js
2. For each function call:
   - Identify the function name
   - Map it to the appropriate API endpoint (see list above)
   - Convert to fetch() using the pattern shown
   - Update success and error handlers

## Testing Checklist

After conversion, test:
- [ ] Login and user session
- [ ] Search by ID
- [ ] Search by email
- [ ] Product selection
- [ ] Create payment link (normal sale)
- [ ] Trust sale workflow
- [ ] Add single membership
- [ ] Batch add memberships
- [ ] Freeze/unfreeze membership
- [ ] View sales data
- [ ] View agreements
- [ ] View payment links
- [ ] Callbell integration
