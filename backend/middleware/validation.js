function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function validatePassword(password) {
  return password && password.length >= 6;
}

function validateUsername(username) {
  return username && username.length >= 3 && username.length <= 20;
}

const validationMiddleware = {
  validateEmail,
  validatePassword,
  validateUsername,

  validateRegister: (req, res, next) => {
    const { email, username, password, confirmPassword } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    if (!username || !validateUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (!password || !validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    next();
  },

  validateLogin: (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    next();
  },

  validatePasswordReset: (req, res, next) => {
    const { password, confirmPassword } = req.body;

    if (!password || !validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    next();
  },

  validateEmailOnly: (req, res, next) => {
    const { email } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    next();
  },

  validateToken: (req, res, next) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    next();
  }
};

module.exports = validationMiddleware;
