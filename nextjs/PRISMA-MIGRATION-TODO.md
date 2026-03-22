# Prisma Migration TODO

Pendiente para cuando exista la nueva base de datos de `Mochi`.

## Renames de dominio

- Renombrar `ArtistProfile.basePriceAvax` a `basePriceAvax`.
- Revisar cualquier columna o índice con nomenclatura legacy previa a la migración EVM.
- Verificar que los modelos guarden wallets EVM checksum `0x...` en lugar del formato legacy previo a EVM.

## Auth de perfiles

- Mantener `ArtistAuthChallenge.wallet` y `ArtistAuthSession.wallet` como direcciones EVM checksum.
- Confirmar que `verificationMode` use valores EVM (`evm_message`, o `siwe` si luego migramos a SIWE completo).
- Si migramos a SIWE formal, agregar columnas para `domain`, `nonce`, `chainId`, `issuedAt` y `statement`.

## Validaciones y constraints

- Validar longitud/formato de `walletAddress` para EVM.
- Revisar unicidad e índices sobre `walletAddress`, `wallet`, `reporterWallet`.
- Confirmar que búsquedas por wallet no dependan de `toUpperCase()` heredado del stack previo a EVM.

## Datos de marketplace/perfiles

- Revisar si `basePriceUsdc` y `basePriceAvax` deben seguir como `String` o pasar a enteros en unidades mínimas.
- Considerar almacenar precios monetarios en unidades mínimas (`wei`, `6 decimals`) para evitar floats/string parsing.
- Evaluar si conviene persistir `chainId` junto al wallet para compatibilidad multi-red.

## Limpieza de legado

- Regenerar Prisma Client después del nuevo schema.
- Actualizar rutas/API que todavía asumen nombres legacy en payloads o respuestas.
- Eliminar adaptadores temporales que hoy mapean dominio AVAX a columnas legacy de Prisma.
