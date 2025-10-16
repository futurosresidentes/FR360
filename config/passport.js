const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

/**
 * Configuración de Passport con Google OAuth 2.0
 * Permite login solo con cuentas de Google del dominio @sentiretaller.com
 */

module.exports = function(app) {
  // Serializar usuario en la sesión
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  // Deserializar usuario de la sesión
  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  // Estrategia de Google OAuth 2.0
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Extraer información del perfil de Google
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;

        if (!email) {
          return done(null, false, { message: 'No se pudo obtener el email de Google' });
        }

        // Verificar que el email sea del dominio permitido
        const allowedDomain = '@sentiretaller.com';
        if (!email.endsWith(allowedDomain)) {
          console.log(`❌ Intento de login con dominio no permitido: ${email}`);
          return done(null, false, {
            message: `Solo usuarios con correo ${allowedDomain} pueden acceder`
          });
        }

        // Usuario válido
        const user = {
          id: profile.id,
          email: email,
          displayName: profile.displayName || email.split('@')[0],
          firstName: profile.name?.givenName || '',
          lastName: profile.name?.familyName || '',
          photo: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
          provider: 'google',
          loginAt: new Date().toISOString()
        };

        console.log(`✅ Login exitoso: ${email}`);
        return done(null, user);

      } catch (error) {
        console.error('❌ Error en estrategia de Google:', error);
        return done(error, null);
      }
    }
  ));

  // Inicializar Passport
  app.use(passport.initialize());
  app.use(passport.session());

  console.log('✅ Passport configurado con Google OAuth 2.0');
};
