const { validatePublicEnvironment } = require('./scripts/check-public-env.cjs');
validatePublicEnvironment(process.env);
module.exports = require('./app.json').expo;
