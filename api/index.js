// Vercel serverless entry — delegates to compiled Express app
module.exports = require('../backend/dist/app').default;
