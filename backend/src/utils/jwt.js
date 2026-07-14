const jwt = require("jsonwebtoken");

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      pwdAt: user.passwordChangedAt ? user.passwordChangedAt.getTime() : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

module.exports = { signToken };
