# Migration Guide: Google Apps Script to Node.js Services

This document provides a comprehensive guide for migrating from the Google Apps Script implementation to the new Node.js services.

## Overview

The API service functions have been migrated from `c:\Sitios\comercialito_web\Código.js` (Google Apps Script) to modular Node.js services in `c:\Sitios\FR360\services\`.

## Service Mapping

### Original Google Apps Script Functions → New Node.js Services

#### Strapi Service (`strapiService.js`)

| Original Function | New Function | Notes |
|------------------|--------------|-------|
| `getProducts(options)` | `strapiService.getProducts(options)` | Identical API |
| `getProductosServer()` | `strapiService.getProducts({ mode: 'names' })` | Wrapper removed |
| `getProductosCatalog()` | `strapiService.getProducts({ mode: 'catalog' })` | Wrapper removed |
| `getProductDescription(name)` | `strapiService.getProducts({ mode: 'description', productName: name })` | Wrapper removed |
| `fetchVentas(uid)` | `strapiService.fetchVentas(uid)` | Identical API |
| `fetchAcuerdos(uid)` | `strapiService.fetchAcuerdos(uid)` | Identical API |
| `fetchCrmStrapiOnly(uid)` | `strapiService.fetchCrmStrapiOnly(uid)` | Identical API |
| `fetchCrmStrapiBatch(uids)` | `strapiService.fetchCrmStrapiBatch(uids)` | Identical API |
| `fetchCrmByEmail(email)` | `strapiService.fetchCrmByEmail(email)` | Identical API |
| `consultarAcuerdo(nroAcuerdo)` | `strapiService.consultarAcuerdo(nroAcuerdo)` | Identical API |
| `saveConfianzaRecord(data)` | `strapiService.saveConfianzaRecord(data)` | ⚠️ Needs implementation |

#### FR360 Service (`fr360Service.js`)

| Original Function | New Function | Notes |
|------------------|--------------|-------|
| `getCitizenServer(uid)` | `fr360Service.getCitizen(uid)` | Renamed |
| `createPaymentLink(paymentData)` | `fr360Service.createPaymentLink(paymentData)` | Identical API |
| `savePaymentLinkToDatabase(linkData)` | `fr360Service.savePaymentLinkToDatabase(linkData)` | Identical API |
| `getLinksByIdentityDocument(uid)` | `fr360Service.getLinksByIdentityDocument(uid)` | Identical API |

#### FRAPP Service (`frappService.js`)

| Original Function | New Function | Notes |
|------------------|--------------|-------|
| `fetchMembresiasFRAPP(uid)` | `frappService.fetchMembresiasFRAPP(uid)` | Identical API |
| `registerMembFRAPP(payload)` | `frappService.registerMembFRAPP(payload)` | Identical API |
| `updateMembershipFRAPP(...)` | `frappService.updateMembershipFRAPP(...)` | Identical API |
| `getActiveMembershipPlans()` | `frappService.getActiveMembershipPlans()` | Identical API |
| `getProductHandleFromFRAPP(name)` | `frappService.getProductHandleFromFRAPP(name)` | Identical API |

#### Callbell Service (`callbellService.js`)

| Original Function | New Function | Notes |
|------------------|--------------|-------|
| `normalizeColombianPhone(phone)` | `callbellService.normalizeColombianPhone(phone)` | Identical API |
| `getCallbellContact(phone)` | `callbellService.getCallbellContact(phone)` | Identical API |
| `sendWhatsAppMessage(phone, product, link)` | `callbellService.sendWhatsAppMessage(phone, product, link)` | Identical API |
| `checkMessageStatus(uuid)` | `callbellService.checkMessageStatus(uuid)` | Identical API |

#### Old Membership Service (`oldMembershipService.js`)

| Original Function | New Function | Notes |
|------------------|--------------|-------|
| `traerMembresiasServer(uid)` | `oldMembershipService.traerMembresiasServer(uid)` | Identical API |
| `calcularMeses(start, end)` | `oldMembershipService.calcularMeses(start, end)` | Helper function |
| `formatDDMMYYYY(s)` | `oldMembershipService.formatDDMMYYYY(s)` | Helper function |

## Code Examples

### Before (Google Apps Script)

```javascript
function myFunction() {
  // Get products
  const products = getProductosServer();

  // Get citizen
  const citizen = getCitizenServer('1234567890');

  // Get memberships
  const memberships = fetchMembresiasFRAPP('1234567890');
}
```

### After (Node.js/Express)

```javascript
const services = require('./services');

async function myFunction() {
  // Get products
  const products = await services.strapi.getProducts({ mode: 'names' });

  // Get citizen
  const citizen = await services.fr360.getCitizen('1234567890');

  // Get memberships
  const memberships = await services.frapp.fetchMembresiasFRAPP('1234567890');
}
```

## Environment Setup

### 1. Create `.env` file

Copy the example file and fill in your tokens:

```bash
cp services/.env.example .env
```

### 2. Add to `.gitignore`

Make sure your `.env` file is not committed:

```
# .gitignore
.env
```

### 3. Load environment variables

In your main application file (e.g., `app.js` or `server.js`):

```javascript
require('dotenv').config();
```

### 4. Environment Variables

From the original `Código.js`, here are the tokens you'll need:

```env
# From line 2 of Código.js
STRAPI_TOKEN=b07772d8be9e7a19ea6ee8536e6b2858e3d06f50f1505ec954f2dc5a98b240a0c7f53fd65c9b90f0edac2336b88294591eab7b28f455389830cfebf90f3a4718d31e2b029be1b1708c6b235a842d514e8e504517e4791a53d1bcf1c1fb4808deddc6c6adc2af3c10c2b5a7bc090519928210752e7a879fa132a0513e6fe045e6

# From line 24 and 138
FR360_TOKEN=91f3c19f460cf9ea3f3f00aa8339f2ab

# From line 322
FRAPP_API_KEY_READ=5a8812447d3195748c5a438c9a85478e

# From line 355
FRAPP_API_KEY_REGISTER=dfada71fffda0de7bb562e259bfe1e64

# From line 423
FRAPP_API_KEY_UPDATE=84cd224c2293e9544b5de71f1e53d1a9

# From line 1284 and 1325
FRAPP_API_KEY_FILTERS=58868b8d96fb91bafb76f8d0b263d797

# From line 1517, 1568, 1644
CALLBELL_TOKEN=atydsXnzPRVmzc1mZyh1FSU6TAv5MvzW.95cbe0c070586fa51a92047553974d60a5136bb69af0ccb29f52e9e60052fc37

# From line 241
WP_AUTH_TOKEN=JqL1TDznO43PsMk?bbeoSk_h#B+tGOhjKjuD
```

## Express Route Examples

### Product Routes

```javascript
const express = require('express');
const router = express.Router();
const { strapi } = require('../services');

// Get all product names
router.get('/products/names', async (req, res) => {
  try {
    const products = await strapi.getProducts({ mode: 'names' });
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get product catalog
router.get('/products/catalog', async (req, res) => {
  try {
    const products = await strapi.getProducts({ mode: 'catalog' });
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get product description
router.get('/products/:name/description', async (req, res) => {
  try {
    const description = await strapi.getProducts({
      mode: 'description',
      productName: req.params.name
    });
    res.json({ success: true, data: description });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

### Citizen Routes

```javascript
const express = require('express');
const router = express.Router();
const { fr360 } = require('../services');

// Get citizen by UID
router.get('/citizen/:uid', async (req, res) => {
  try {
    const citizen = await fr360.getCitizen(req.params.uid);
    res.json({ success: true, data: citizen });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

### Payment Link Routes

```javascript
const express = require('express');
const router = express.Router();
const { fr360 } = require('../services');

// Create payment link
router.post('/payment-link', async (req, res) => {
  try {
    const result = await fr360.createPaymentLink(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payment links by UID
router.get('/payment-links/:uid', async (req, res) => {
  try {
    const links = await fr360.getLinksByIdentityDocument(req.params.uid);
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

### Membership Routes

```javascript
const express = require('express');
const router = express.Router();
const { frapp } = require('../services');

// Get memberships from FRAPP
router.get('/memberships/frapp/:uid', async (req, res) => {
  try {
    const result = await frapp.fetchMembresiasFRAPP(req.params.uid);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register new membership
router.post('/memberships/frapp', async (req, res) => {
  try {
    const result = await frapp.registerMembFRAPP(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update membership
router.put('/memberships/frapp/:id', async (req, res) => {
  try {
    const { changedById, reason, changes } = req.body;
    const result = await frapp.updateMembershipFRAPP(
      req.params.id,
      changedById,
      reason,
      changes
    );
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

### WhatsApp Routes

```javascript
const express = require('express');
const router = express.Router();
const { callbell } = require('../services');

// Send WhatsApp message
router.post('/whatsapp/send', async (req, res) => {
  try {
    const { phoneNumber, product, linkURL } = req.body;
    const result = await callbell.sendWhatsAppMessage(phoneNumber, product, linkURL);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check message status
router.get('/whatsapp/status/:uuid', async (req, res) => {
  try {
    const result = await callbell.checkMessageStatus(req.params.uuid);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

## Key Differences

### 1. Synchronous → Asynchronous

All service functions are now asynchronous and return Promises.

**Before:**
```javascript
const result = getProductosServer();
```

**After:**
```javascript
const result = await strapiService.getProducts({ mode: 'names' });
```

### 2. Error Handling

Use try/catch blocks for all service calls:

```javascript
try {
  const result = await someService.someFunction();
  // Handle success
} catch (error) {
  // Handle error
  console.error('Error:', error.message);
}
```

### 3. Configuration

All tokens and URLs are now in environment variables instead of hardcoded constants.

### 4. Logging

Uses `console.log()` instead of `Logger.log()` or `console.log()` from Apps Script.

## Functions Not Migrated

The following functions from `Código.js` were **not** migrated as they are Google Apps Script specific:

1. **Document/Google Drive Functions:**
   - `crearAcuerdo()` - Creates Google Docs and PDFs
   - `appendPatrocinioRecord()` - Writes to Google Sheets
   - `saveConfianzaRecord()` - Writes to Google Sheets

2. **Web App Functions:**
   - `doGet()` - Apps Script web app entry point
   - `getUserEmail()` - Gets active user email from Apps Script session

3. **Utility Functions:**
   - `getBatchProductDefaults()` - Returns hardcoded defaults
   - `getColombiaTodayParts()` - Date utilities (can be reimplemented if needed)
   - `resolvePagoYActualizarCartera()` - Complex payment resolution logic
   - `processSinglePayment()` - Payment processing orchestration
   - `sincronizarCrmPorNumeroDocumento()` - CRM synchronization with mapping

These functions will need to be reimplemented in your Node.js application using appropriate libraries:
- Google Sheets API for Node.js
- Google Drive API for Node.js
- PDF generation libraries (e.g., PDFKit, Puppeteer)
- Custom business logic in Express routes/controllers

## Testing

Create a test file to verify all services work:

```javascript
// test-services.js
require('dotenv').config();
const services = require('./services');

async function testServices() {
  try {
    // Test Strapi
    console.log('Testing Strapi...');
    const products = await services.strapi.getProducts({ mode: 'names' });
    console.log('✅ Strapi works! Products:', products.length);

    // Test FR360
    console.log('Testing FR360...');
    const citizen = await services.fr360.getCitizen('1234567890');
    console.log('✅ FR360 works! Citizen:', citizen);

    // Test FRAPP
    console.log('Testing FRAPP...');
    const memberships = await services.frapp.fetchMembresiasFRAPP('1234567890');
    console.log('✅ FRAPP works! Memberships:', memberships.memberships.length);

    console.log('\n✅ All services working!');
  } catch (error) {
    console.error('❌ Error testing services:', error.message);
  }
}

testServices();
```

Run the test:
```bash
node test-services.js
```

## Next Steps

1. ✅ Create `.env` file with all tokens
2. ✅ Install dependencies (`npm install axios dotenv`)
3. ✅ Import services in your Express app
4. ✅ Create routes that use the services
5. ⚠️ Implement Google Sheets/Drive functions if needed
6. ⚠️ Implement business logic functions (payment processing, etc.)
7. ✅ Test all endpoints
8. ✅ Deploy to production

## Support

For questions or issues with the migration, refer to:
- `README.md` - General service documentation
- Individual service files - Detailed JSDoc comments
- Original `Código.js` - Reference implementation

## Security Reminders

- ✅ Never commit `.env` file
- ✅ Use different tokens for dev/prod
- ✅ Rotate tokens regularly
- ✅ Implement rate limiting
- ✅ Validate all inputs
- ✅ Use HTTPS in production
