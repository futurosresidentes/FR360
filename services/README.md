# FR360 Services

This directory contains all the API service modules migrated from the Google Apps Script application to Node.js/Express.

## Overview

These services provide a clean abstraction layer for interacting with various external APIs used by the FR360 application. Each service handles:

- HTTP requests using axios
- Retry logic with exponential backoff
- Environment variable configuration
- Error handling and logging
- Type conversions from Google Apps Script to Node.js patterns

## Services

### 1. strapiService.js

Handles all interactions with the Strapi CMS API.

**Functions:**
- `getProducts(options)` - Get products with different modes (names, catalog, description)
- `fetchVentas(uid)` - Fetch sales records by identity document
- `fetchAcuerdos(uid)` - Fetch agreements by identity document
- `fetchCrmStrapiOnly(uid)` - Fetch single CRM record with retry logic
- `fetchCrmStrapiBatch(uids)` - Fetch multiple CRM records in one call
- `fetchCrmByEmail(email)` - Fetch CRM record by email address
- `consultarAcuerdo(nroAcuerdo)` - Query agreement by agreement number
- `saveConfianzaRecord(data)` - Save confianza record (needs Google Sheets API implementation)

**Environment Variables:**
- `STRAPI_BASE_URL` - Base URL for Strapi API
- `STRAPI_TOKEN` - Bearer token for Strapi authentication

### 2. fr360Service.js

Handles all interactions with the FR360 API.

**Functions:**
- `getCitizen(uid)` - Get citizen data by identity document
- `createPaymentLink(paymentData)` - Create ePayco payment link
- `savePaymentLinkToDatabase(linkData)` - Save payment link to database
- `getLinksByIdentityDocument(uid)` - Get all payment links for a user

**Environment Variables:**
- `FR360_BASE_URL` - Base URL for FR360 API
- `FR360_TOKEN` - Bearer token for FR360 authentication

### 3. frappService.js

Handles all interactions with the FRAPP (FR App) API.

**Functions:**
- `fetchMembresiasFRAPP(uid)` - Fetch user memberships
- `registerMembFRAPP(payload)` - Register new membership
- `updateMembershipFRAPP(membershipId, changedById, reason, changes)` - Update existing membership
- `getActiveMembershipPlans()` - Get list of active membership plans
- `getProductHandleFromFRAPP(productName)` - Get product handle by name

**Environment Variables:**
- `FRAPP_BASE_URL` - Base URL for FRAPP API
- `FRAPP_API_KEY_READ` - API key for reading memberships
- `FRAPP_API_KEY_REGISTER` - API key for registering memberships
- `FRAPP_API_KEY_UPDATE` - API key for updating memberships
- `FRAPP_API_KEY_FILTERS` - API key for filters/products endpoint

### 4. callbellService.js

Handles all interactions with the Callbell API for WhatsApp messaging.

**Functions:**
- `normalizeColombianPhone(phoneInput)` - Normalize phone numbers to Colombian format
- `getCallbellContact(phoneNumber)` - Get contact information
- `sendWhatsAppMessage(phoneNumber, product, linkURL)` - Send WhatsApp message with template
- `checkMessageStatus(messageUuid)` - Check delivery status of sent message

**Environment Variables:**
- `CALLBELL_BASE_URL` - Base URL for Callbell API
- `CALLBELL_TOKEN` - Bearer token for Callbell authentication

### 5. oldMembershipService.js

Handles interactions with the legacy WordPress membership platform.

**Functions:**
- `traerMembresiasServer(uid)` - Fetch memberships from WordPress (returns HTML table)
- `calcularMeses(start, end)` - Calculate months between dates
- `formatDDMMYYYY(s)` - Format date to DD/MM/YYYY

**Environment Variables:**
- `WP_BASE_URL` - Base URL for WordPress platform
- `WP_AUTH_TOKEN` - Auth token for WordPress API

## Setup

1. Copy `.env.example` to your project root as `.env`:
   ```bash
   cp services/.env.example .env
   ```

2. Fill in all the required tokens and URLs in your `.env` file.

3. Install required dependencies:
   ```bash
   npm install axios dotenv
   ```

4. Load environment variables in your application:
   ```javascript
   require('dotenv').config();
   ```

## Usage

Import the services in your Express routes or controllers:

```javascript
const strapiService = require('./services/strapiService');
const fr360Service = require('./services/fr360Service');
const frappService = require('./services/frappService');
const callbellService = require('./services/callbellService');
const oldMembershipService = require('./services/oldMembershipService');

// Example: Get products from Strapi
app.get('/api/products', async (req, res) => {
  try {
    const products = await strapiService.getProducts({ mode: 'catalog' });
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Example: Get citizen data
app.get('/api/citizen/:uid', async (req, res) => {
  try {
    const citizen = await fr360Service.getCitizen(req.params.uid);
    res.json({ success: true, data: citizen });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Example: Send WhatsApp message
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { phoneNumber, product, linkURL } = req.body;
    const result = await callbellService.sendWhatsAppMessage(phoneNumber, product, linkURL);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## Migration Notes

### Key Changes from Google Apps Script

1. **HTTP Requests**: Converted from `UrlFetchApp.fetch()` to `axios`
2. **Async/Await**: All functions now use async/await instead of synchronous calls
3. **Sleep/Delay**: Converted from `Utilities.sleep()` to `Promise`-based delays
4. **Logging**: Uses `console.log()` instead of `Logger.log()`
5. **Environment Variables**: Uses `process.env` instead of hardcoded constants
6. **Date Formatting**: Custom formatting instead of `Utilities.formatDate()`

### Functions Not Fully Migrated

- `saveConfianzaRecord()` in strapiService.js - Requires Google Sheets API implementation
- Any Google Drive operations (document creation, etc.) would need separate implementation

### Retry Logic

All services implement retry logic with exponential backoff for resilience:
- Default: 5 retries
- Exponential backoff delays
- Detailed logging of each retry attempt
- Graceful degradation on failure

## Error Handling

All service functions include comprehensive error handling:
- Try/catch blocks around all HTTP requests
- Detailed error logging with emojis for easy scanning
- Graceful fallbacks (e.g., returning empty arrays instead of throwing)
- Structured error responses with error codes and messages

## Logging

The services use emoji prefixes for easy log scanning:
- 🔄 - Retry attempt
- ✅ - Success
- ❌ - Error
- ⏱️ - Waiting/delay
- 📡 - API response
- 💳 - Payment link operations
- 📞 - Phone operations
- 🔍 - Search/query operations
- 💾 - Database operations
- 📤 - Outgoing messages
- 📊 - Statistics/data

## Testing

Example test using the services:

```javascript
// Test getting products
const strapiService = require('./services/strapiService');

async function testGetProducts() {
  try {
    const products = await strapiService.getProducts({ mode: 'names' });
    console.log('Products:', products);
  } catch (error) {
    console.error('Error:', error);
  }
}

testGetProducts();
```

## Security Notes

- Never commit your `.env` file to version control
- Keep all API tokens secure and rotate them regularly
- Use different tokens for development and production environments
- Implement rate limiting on your Express endpoints
- Validate and sanitize all user inputs before passing to services

## License

This code is part of the FR360 project.
