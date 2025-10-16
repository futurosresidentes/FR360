const express = require('express');
const passport = require('passport');
const router = express.Router();

/**
 * Rutas de autenticación con Google OAuth 2.0
 */

// Ruta de login - inicia el flujo de OAuth con Google
router.get('/login',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    hd: 'sentiretaller.com' // Hosted Domain - solo muestra cuentas de este dominio
  })
);

// Callback de Google después de la autenticación
router.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login-failed',
    failureMessage: true
  }),
  (req, res) => {
    // Autenticación exitosa
    console.log(`✅ Usuario autenticado: ${req.user.email}`);
    res.redirect('/');
  }
);

// Ruta de logout
router.get('/logout', (req, res, next) => {
  const userEmail = req.user ? req.user.email : 'unknown';

  req.logout((err) => {
    if (err) {
      console.error('Error al hacer logout:', err);
      return next(err);
    }

    console.log(`👋 Usuario deslogueado: ${userEmail}`);
    req.session.destroy((err) => {
      if (err) {
        console.error('Error al destruir sesión:', err);
      }
      res.redirect('/login-page');
    });
  });
});

// Página de login (muestra botón para iniciar sesión)
router.get('/login-page', (req, res) => {
  // Si ya está autenticado, redirigir al home
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }

  res.render('login', {
    title: 'FR360 - Iniciar Sesión',
    message: null
  });
});

// Página de error de login
router.get('/login-failed', (req, res) => {
  const messages = req.session.messages || [];
  const errorMessage = messages.length > 0 ? messages[0] : 'Error al iniciar sesión con Google';

  res.render('login', {
    title: 'FR360 - Error de Autenticación',
    message: errorMessage
  });
});

// API endpoint para verificar si el usuario está autenticado
router.get('/api/auth/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        email: req.user.email,
        displayName: req.user.displayName,
        photo: req.user.photo
      }
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// API endpoint para obtener información del usuario actual
router.get('/api/auth/user', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
