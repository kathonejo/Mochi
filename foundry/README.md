# foundry

Proyecto Foundry para contratos, tests y despliegues de la suite AVAX.

## Variables

Copiá `foundry/.env.example` a `foundry/.env` y completá `DEPLOYER_PRIVATE_KEY` cuando vayas a desplegar en Fuji o Mainnet.

## Comandos

Desde la raíz del repo:

```bash
pnpm run test:contracts
pnpm run deploy:local
pnpm run deploy:testnet
pnpm run deploy:mainnet
```
