/**
 * Middleware de autenticación y autorización
 * Verifica que el usuario esté autenticado y pertenezca al dominio @sentiretaller.com
 */

/**
 * Middleware para verificar que el usuario esté autenticado
 */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  // Si no está autenticado, redirigir al login
  res.redirect('/login');
}

/**
 * Middleware para verificar que el usuario pertenezca al dominio permitido
 */
function ensureDomain(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }

  const userEmail = req.user.email;
  const allowedDomain = '@sentiretaller.com';

  if (userEmail && userEmail.endsWith(allowedDomain)) {
    return next();
  }

  // Si no es del dominio correcto, mostrar error
  res.status(403).render('error', {
    title: 'Acceso Denegado',
    message: 'Solo usuarios con correo @sentiretaller.com pueden acceder a esta aplicación.',
    userEmail: userEmail
  });
}

/**
 * Middleware para verificar usuarios especiales (pueden hacer acciones administrativas)
 */
function ensureSpecialUser(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }

  const userEmail = req.user.email;
  const specialUsers = (process.env.SPECIAL_USERS || '').split(',').map(e => e.trim());

  if (specialUsers.includes(userEmail)) {
    return next();
  }

  // Si no es usuario especial, denegar acceso
  res.status(403).json({
    success: false,
    error: 'No tienes permisos para realizar esta acción',
    message: 'Solo usuarios administradores pueden realizar esta operación'
  });
}

/**
 * Middleware opcional: verifica autenticación pero no redirige
 * Útil para rutas que quieren mostrar diferente contenido según autenticación
 */
function checkAuthenticated(req, res, next) {
  req.isAuth = req.isAuthenticated();
  req.userEmail = req.isAuth ? req.user.email : null;
  next();
}

module.exports = {
  ensureAuthenticated,
  ensureDomain,
  ensureSpecialUser,
  checkAuthenticated
};
