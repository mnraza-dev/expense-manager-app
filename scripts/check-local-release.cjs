function validateLocalReleaseProfile(profile, packageJSON) {
  if (
    profile.profile !== 'local' ||
    profile.cloudAccounts !== false ||
    profile.storePurchases !== false
  )
    throw new Error(
      'This release supports local finance only. Cloud accounts or purchases need a new policy audit and reviewed release configuration.'
    );
  if (!packageJSON.expo?.autolinking?.android?.exclude?.includes('react-native-purchases'))
    throw new Error(
      'The unused native billing SDK must be excluded from this local Android release.'
    );
}
if (require.main === module) {
  validateLocalReleaseProfile(require('../src/release/profile.json'), require('../package.json'));
  process.stdout.write(
    'Local release controls verified. Play Console and final-binary signoff remain pending.\n'
  );
}
module.exports = { validateLocalReleaseProfile };
