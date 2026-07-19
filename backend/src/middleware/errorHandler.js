const crypto = require("crypto");

// Global error handler. Controllers/services forward errors here via asyncHandler(next). 
// Client-safe responses only: known Mongoose/Mongo errors map to 4xx; 
// anything unexpected is a generic 500 with a requestId that ties the response to the full server-side log line.
const errorHandler = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let expose = err.expose === true;
  let message = err.message;

  if (err.name === "ValidationError")        {
    status = 400; expose = true; message = "Invalid input";
  }

  else if (err.name === "CastError")         {
    status = 400; expose = true; message = "Invalid identifier";
  }

  else if (err.code === 11000)               {
    status = 409; expose = true; message = "Duplicate value";
  }

  else if (err.name === "JsonWebTokenError") {
    status = 401; expose = true; message = "Invalid token";
  }

  else if (err.type === "entity.parse.failed")   {
    status = 400; expose = true; message = "Request body is not valid JSON";
  }

  else if (err.type === "entity.too.large")      {
    status = 413; expose = true; message = "Request body is too large";
  }

  const requestId = crypto.randomUUID();
  if (status >= 500) console.error(`[${requestId}] ${req.method} ${req.originalUrl} -`, err);

  res.status(status).json({
    error: expose ? message : "Internal server error",
    requestId,
  });
};

module.exports = errorHandler;
