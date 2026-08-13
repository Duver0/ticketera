// Shim de Vercel: la función serverless vive en `api/` (requerido por Vercel),
// pero el handler de NestJS compilado está en `dist/lambda.js`. Re-exportamos el
// handler por defecto para que Vercel lo detecte como única Serverless Function.
// `../dist/lambda.js` es rastreado por el bundler (@vercel/nft) junto con sus
// dependencias (dist/**), por lo que no necesitamos empaquetar manualmente.
module.exports = require('../dist/lambda.js').default;
