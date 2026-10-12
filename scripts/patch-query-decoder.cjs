const fs = require('node:fs');
// query-string 7 is CommonJS; the patched decoder 0.5 uses an ESM default export.
// Keep Expo Router's query-string API while removing the vulnerable recursive decoder.
const marker = 'SETTLER_SAFE_QUERY_DECODER';
function patchQueryDecoder(source) {
  if (source.includes(marker)) return source;
  const original = "const decodeComponent = require('decode-uri-component');";
  if (!source.includes(original))
    throw new Error('Review the safe query decoder bridge: query-string implementation changed.');
  return source.replace(
    original,
    `// ${marker}\nconst decoderModule = require('decode-uri-component');\nconst decodeComponent = decoderModule.default ?? decoderModule;`
  );
}
if (require.main === module) {
  const target = require.resolve('query-string', {
    paths: [require.resolve('expo-router/package.json')],
  });
  const before = fs.readFileSync(target, 'utf8'),
    after = patchQueryDecoder(before);
  if (before !== after) fs.writeFileSync(target, after);
  process.stdout.write('Safe query decoder bridge applied.\n');
}
module.exports = { patchQueryDecoder };
