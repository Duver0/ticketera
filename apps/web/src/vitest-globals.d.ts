// Hace disponibles los globals de Vitest (describe/it/expect/vi) en tsc --noEmit
// sin restringir el campo "types" del tsconfig (que sí incluye @types/react, etc.).
/// <reference types="vitest/globals" />
