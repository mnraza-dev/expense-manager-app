const { validatePublicEnvironment } = require('./scripts/check-public-env.cjs');
const { validateLocalReleaseProfile } = require('./scripts/check-local-release.cjs');
validateLocalReleaseProfile(require('./src/release/profile.json'), require('./package.json'));
validatePublicEnvironment(process.env);
module.exports = require('./app.json').expo;
