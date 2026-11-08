class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const notFound = (what = 'Not found') => new HttpError(404, what);
const forbidden = (what = 'You do not have permission to do that') => new HttpError(403, what);
const badRequest = (what) => new HttpError(400, what);

module.exports = { HttpError, notFound, forbidden, badRequest };
