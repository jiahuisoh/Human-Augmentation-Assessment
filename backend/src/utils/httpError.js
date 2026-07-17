// Errors thrown from the service layer carry their HTTP status; asyncHandler
// forwards them to the global error handler, which exposes message + status
// when `expose` is set (see middleware/errorHandler.js).
const httpError = (status, message) =>
  Object.assign(new Error(message), { status, expose: true });

module.exports = httpError;
