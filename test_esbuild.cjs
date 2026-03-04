const esbuild = require('esbuild');

// This is exactly what build.ts has: '"production"'
const defineValue = '"production"';
console.log('Define value:', defineValue);
console.log('Define value length:', defineValue.length);
console.log('Define value chars:', [...defineValue].map(c => c.charCodeAt(0)));

const result = esbuild.transformSync(
  'var x = process.env.NODE_ENV === "production";',
  { define: { 'process.env.NODE_ENV': defineValue }, minify: true }
);
console.log('Minified result:', result.code);

// Also test what the full session config looks like
const result2 = esbuild.transformSync(
  `var config = {
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    }
  };`,
  { define: { 'process.env.NODE_ENV': defineValue }, minify: true }
);
console.log('Session config result:', result2.code);