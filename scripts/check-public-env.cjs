const { Buffer } = require('node:buffer');
function validatePublicEnvironment(env) {
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (key?.startsWith('sb_secret_'))
    throw new Error('Privileged Supabase keys must never be supplied as public app configuration.');
  if (key && key.split('.').length === 3) {
    let role;
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    } catch {
      throw new Error('Invalid legacy Supabase public key.');
    }
    if (role !== 'anon')
      throw new Error('Only an anon legacy key or publishable key may be used in the mobile app.');
  }
  for (const name of ['EXPO_PUBLIC_REVENUECAT_IOS_KEY', 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY'])
    if (env[name]?.startsWith('sk_'))
      throw new Error('RevenueCat secret keys belong only on the trusted server.');
}
module.exports = { validatePublicEnvironment };
