# Animation Reference 🐱🐰

Guia simple y visual de las animaciones de Mochi.

Si solo queres saber "que sprites necesito" y "como se animan", este es el README.

## Links Rapidos

- Referencia visual completa para arte: [SPRITE-REFERENCE-ART.md](./SPRITE-REFERENCE-ART.md)
- Referencia tecnica (estados, tiempos, notas dev): [SPRITE-REFERENCE.md](./SPRITE-REFERENCE.md)
- Set exacto usado en runtime hoy: [runtime-required/README.md](./runtime-required/README.md)

## Que Carpeta Usar

- `runtime-required/`: fuente de verdad para la extension de Chrome y la app desktop.
- `mvp/`: set minimo para personaje basico.
- `all-sprites/` y `complete/`: referencia amplia (no todo se usa hoy en runtime).

## Version Simple (solo caminar) 🐰

Sprites minimos:

- `stand-neutral.png`
- `walk-step-left.png`
- `walk-step-right.png`

Preview:

![](./mvp/stand-neutral.png)
![](./mvp/walk-step-left.png)
![](./mvp/walk-step-right.png)

Secuencia recomendada:

`stand-neutral -> walk-step-left -> stand-neutral -> walk-step-right -> (loop)`

Tips importantes:

- Mismo tamano de canvas en todos los frames (recomendado `128x128`).
- Mismo "piso" (baseline) para evitar jitter.
- Fondo transparente.

## Version Completa (Chrome + Desktop) 🐱

Esta es la experiencia completa usada por los runtimes actuales.

### 1) Caminar, caer, aterrizar y saltar

![](./runtime-required/stand-neutral.png)
![](./runtime-required/walk-step-left.png)
![](./runtime-required/walk-step-right.png)
![](./runtime-required/fall.png)
![](./runtime-required/bounce-squish.png)
![](./runtime-required/bounce-recover.png)
![](./runtime-required/jump.png)

Secuencias:

- Caminar: `stand -> left -> stand -> right`
- Caida: `fall`
- Aterrizaje: `bounce-squish -> bounce-recover -> stand`
- Salto: `jump -> fall -> bounce`

### 2) Drag & resistencia

![](./runtime-required/dragged-tilt-left-light.png)
![](./runtime-required/dragged-tilt-right-light.png)
![](./runtime-required/dragged-tilt-left-heavy.png)
![](./runtime-required/dragged-tilt-right-heavy.png)
![](./runtime-required/resist-frame-1.png)
![](./runtime-required/resist-frame-2.png)

Secuencias:

- Drag suave: `tilt-light` segun direccion del cursor.
- Drag fuerte: `tilt-heavy` segun distancia del cursor.
- Resistencia: `resist-1 <-> resist-2` (alternado rapido).

### 3) Pared y techo

![](./runtime-required/grab-wall.png)
![](./runtime-required/climb-wall-frame-1.png)
![](./runtime-required/climb-wall-frame-2.png)
![](./runtime-required/grab-ceiling.png)
![](./runtime-required/climb-ceiling-frame-1.png)
![](./runtime-required/climb-ceiling-frame-2.png)

Secuencias:

- Escalar pared: `grab-wall` + alternancia `climb-wall-1/2`.
- Techo: `grab-ceiling` + alternancia `climb-ceiling-1/2`.

### 4) Reposo e idle expresivo

![](./runtime-required/sit.png)
![](./runtime-required/sit-look-up.png)
![](./runtime-required/sprawl-lying.png)
![](./runtime-required/crawl-crouch.png)

![](./runtime-required/sit-edge-legs-up.png)
![](./runtime-required/sit-edge-legs-down.png)
![](./runtime-required/sit-edge-dangle-frame-1.png)
![](./runtime-required/sit-edge-dangle-frame-2.png)

Secuencias:

- Sentado base: `sit`
- Mirando arriba: `sit-look-up`
- Borde: `legs-up -> legs-down -> dangle-1 -> legs-down -> dangle-2`

### 5) Head spin (idle jugueton)

![](./runtime-required/spin-head-frame-1.png)
![](./runtime-required/spin-head-frame-2.png)
![](./runtime-required/spin-head-frame-3.png)
![](./runtime-required/spin-head-frame-4.png)
![](./runtime-required/spin-head-frame-5.png)
![](./runtime-required/spin-head-frame-6.png)

Secuencia recomendada:

`sit-look-up -> spin-1 -> spin-4 -> spin-2 -> spin-5 -> spin-3 -> spin-6 -> sit`

## Advanced / No Runtime Actual (por ahora)

Estos existen como referencia pero no son necesarios para el runtime actual:

- Multiplicacion/division: `pull-up-friend-*`, `divide-*`
- Window handling: `carry-window-*`, `throw-window`

Si queres verlos con preview y detalle: [SPRITE-REFERENCE-ART.md](./SPRITE-REFERENCE-ART.md)

## Checklist Final Para Un Personaje Nuevo ✅

1. Respeta nombres de archivos del set objetivo (`mvp` o `runtime-required`).
2. Misma escala y baseline en todos los frames.
3. Proba primero el loop de caminar.
4. Luego agrega caida/rebote y drag.
5. Por ultimo agrega pared/techo/idle avanzados.

Con esto ya queda lista una base de animacion clara para gatitos 🐱, conejitos 🐰 y cualquier mochi nuevo.
