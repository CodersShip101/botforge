const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;

const OAUTH_PROVIDERS = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use('google', new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/oauth/google/callback'
    },
    (accessToken, refreshToken, profile, done) => {
      done(null, {
        id: profile.id,
        email: profile.emails?.[0]?.value,
        displayName: profile.displayName,
        photos: profile.photos,
        accessToken,
        refreshToken
      });
    }
  ));
  OAUTH_PROVIDERS.google = true;
}

if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use('facebook', new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL || '/api/auth/oauth/facebook/callback',
      profileFields: ['id', 'displayName', 'emails', 'photos']
    },
    (accessToken, refreshToken, profile, done) => {
      done(null, {
        id: profile.id,
        email: profile.emails?.[0]?.value,
        displayName: profile.displayName,
        photos: profile.photos,
        accessToken,
        refreshToken
      });
    }
  ));
  OAUTH_PROVIDERS.facebook = true;
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
module.exports.OAUTH_PROVIDERS = OAUTH_PROVIDERS;
