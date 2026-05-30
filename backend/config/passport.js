const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;

passport.use('google', new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID || 'disabled',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'disabled',
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

passport.use('facebook', new FacebookStrategy(
  {
    clientID: process.env.FACEBOOK_APP_ID || 'disabled',
    clientSecret: process.env.FACEBOOK_APP_SECRET || 'disabled',
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

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
