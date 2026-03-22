# Mochi Sprite Reference for Chrome Extension

This document describes all sprites from the Mochi-ee project and how to implement them in a Chrome extension context.

## Folder Structure

- `all-sprites/` - Complete collection of all 46 renamed sprites
- `chrome-extension/` - 42 sprites suitable for Chrome extension (excludes window manipulation)
- `mvp/` - 11 essential sprites for minimal implementation

## Sprite Details

### Standing & Walking

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `stand-neutral.png` | shime1 | Default standing pose | Idle state, walk frame 1/3 |
| `walk-step-left.png` | shime2 | Left foot forward | Walk animation frame 2 |
| `walk-step-right.png` | shime3 | Right foot forward | Walk animation frame 4 |

**Walk Animation Sequence:**
```javascript
const walkFrames = [
  'stand-neutral.png',    // frame 1
  'walk-step-left.png',   // frame 2
  'stand-neutral.png',    // frame 3
  'walk-step-right.png'   // frame 4
];
// Duration: 6 ticks per frame at velocity -2 (slow walk)
// Duration: 2 ticks per frame at velocity -4 (run)
// Duration: 2 ticks per frame at velocity -8 (dash)
```

### Falling & Bouncing

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `fall.png` | shime4 | Arms up, falling pose | During gravity fall |
| `bounce-squish.png` | shime18 | Squished on impact | Landing frame 1 |
| `bounce-recover.png` | shime19 | Recovering from bounce | Landing frame 2 |

**Fall & Bounce Implementation:**
```javascript
// Physics constants from original
const FALL_PHYSICS = {
  resistanceX: 0.05,
  resistanceY: 0.1,
  gravity: 2
};

// Bounce animation after landing
const bounceFrames = [
  { sprite: 'bounce-squish.png', duration: 4 },
  { sprite: 'bounce-recover.png', duration: 4 }
];
```

### Jumping

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `jump.png` | shime22 | Arms raised, jumping | During upward jump |

**Jump Implementation:**
```javascript
const JUMP_VELOCITY = 20; // Initial upward velocity
// Use fall.png when velocity becomes downward
```

### Sitting & Idle Behaviors

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `sit.png` | shime11 | Sitting down | Idle sitting pose |
| `sit-look-up.png` | shime26 | Sitting, looking upward | Looking at cursor above |
| `sprawl-lying.png` | shime21 | Lying flat | Extended idle/rest |
| `crawl-crouch.png` | shime20 | Crouched low | Crawl animation |

**Sit and Look at Cursor:**
```javascript
function getSitSprite(cursorY, screenHeight) {
  // If cursor is in upper half of screen, look up
  if (cursorY < screenHeight / 2) {
    return 'sit-look-up.png';
  }
  return 'sit.png';
}
```

### Edge Sitting (for sitting on browser viewport edge)

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `sit-edge-legs-up.png` | shime30 | Sitting with legs up | Edge sit transition |
| `sit-edge-legs-down.png` | shime31 | Sitting with legs hanging | Default edge sit |
| `sit-edge-dangle-frame-1.png` | shime32 | Legs swinging left | Dangle animation |
| `sit-edge-dangle-frame-2.png` | shime33 | Legs swinging right | Dangle animation |

**Edge Sit Animation:**
```javascript
const edgeSitFrames = [
  { sprite: 'sit-edge-legs-up.png', duration: 10 },       // transition: settling onto edge
  { sprite: 'sit-edge-legs-down.png', duration: 20 },      // legs hang down
  { sprite: 'sit-edge-dangle-frame-1.png', duration: 15 }, // dangle left
  { sprite: 'sit-edge-legs-down.png', duration: 20 },      // return center
  { sprite: 'sit-edge-dangle-frame-2.png', duration: 15 }  // dangle right
];
```

### Dragging Interaction

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `dragged-tilt-left-light.png` | shime7 | Slight left tilt | Cursor slightly left |
| `dragged-tilt-right-light.png` | shime8 | Slight right tilt | Cursor slightly right |
| `dragged-tilt-left-heavy.png` | shime9 | Heavy left tilt | Cursor far left |
| `dragged-tilt-right-heavy.png` | shime10 | Heavy right tilt | Cursor far right |

**Drag Sprite Selection:**
```javascript
function getDraggedSprite(footX, cursorX) {
  const diff = cursorX - footX;

  if (diff > 50) return 'dragged-tilt-left-heavy.png';
  if (diff > 30) return 'dragged-tilt-left-light.png';
  if (diff > -30) return 'stand-neutral.png';
  if (diff > -50) return 'dragged-tilt-right-light.png';
  return 'dragged-tilt-right-heavy.png';
}
```

### Resisting (while being dragged)

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `resist-frame-1.png` | shime5 | Struggling pose 1 | Alternating resistance |
| `resist-frame-2.png` | shime6 | Struggling pose 2 | Alternating resistance |

**Resist Animation:**
```javascript
const resistSequence = [
  // Fast struggle
  { sprite: 'resist-frame-1.png', duration: 5 },
  { sprite: 'resist-frame-2.png', duration: 5 },
  // Pause
  { sprite: 'stand-neutral.png', duration: 50 },
  // Resume struggle...
];
```

### Wall Climbing

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `grab-wall.png` | shime13 | Holding onto wall | Static wall grab |
| `climb-wall-frame-1.png` | shime12 | Climbing frame 1 | Wall climb animation |
| `climb-wall-frame-2.png` | shime14 | Climbing frame 2 | Wall climb animation |

**Wall Climb Animation:**
```javascript
// Climbing up (negative Y velocity)
const climbUpFrames = [
  { sprite: 'climb-wall-frame-2.png', duration: 16, velocity: { x: 0, y: 0 } },
  { sprite: 'climb-wall-frame-2.png', duration: 4, velocity: { x: 0, y: -1 } },
  { sprite: 'climb-wall-frame-1.png', duration: 4, velocity: { x: 0, y: -1 } },
  { sprite: 'grab-wall.png', duration: 4, velocity: { x: 0, y: -1 } },
  // continues...
];
```

### Ceiling Hanging

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `grab-ceiling.png` | shime23 | Hanging from ceiling | Static ceiling grab |
| `climb-ceiling-frame-1.png` | shime24 | Ceiling movement 1 | Ceiling crawl |
| `climb-ceiling-frame-2.png` | shime25 | Ceiling movement 2 | Ceiling crawl |

**Ceiling Implementation Note:**
In a Chrome extension, the "ceiling" would be the top of the viewport. The mascot can hang upside down from browser top edge.

### Head Spin (Idle Animation)

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `spin-head-frame-1.png` | shime15 | Head turning 1 | Rotation sequence |
| `spin-head-frame-2.png` | shime16 | Head turning 2 | Rotation sequence |
| `spin-head-frame-3.png` | shime17 | Head turning 3 | Rotation sequence |
| `spin-head-frame-4.png` | shime27 | Head turning 4 | Rotation sequence |
| `spin-head-frame-5.png` | shime28 | Head turning 5 | Rotation sequence |
| `spin-head-frame-6.png` | shime29 | Head turning 6 | Rotation sequence |

**Head Spin Animation (while sitting):**
```javascript
const spinHeadFrames = [
  { sprite: 'sit-look-up.png', duration: 5 },
  { sprite: 'spin-head-frame-1.png', duration: 5 },
  { sprite: 'spin-head-frame-4.png', duration: 5 },
  { sprite: 'spin-head-frame-2.png', duration: 5 },
  { sprite: 'spin-head-frame-5.png', duration: 5 },
  { sprite: 'spin-head-frame-3.png', duration: 5 },
  { sprite: 'spin-head-frame-6.png', duration: 5 },
  { sprite: 'sit.png', duration: 5 }
];
```

### Multiplication Animations

| Sprite | Original | Description | Animation Use |
|--------|----------|-------------|---------------|
| `pull-up-friend-frame-1.png` | shime38 | Reaching down | Pulling up new Mochi |
| `pull-up-friend-frame-2.png` | shime39 | Grabbing | Pulling animation |
| `pull-up-friend-frame-3.png` | shime40 | Lifting | Pulling animation |
| `pull-up-friend-frame-4.png` | shime41 | Friend emerging | Pulling animation |
| `divide-frame-1.png` | shime42 | Division start | Splitting animation |
| `divide-frame-2.png` | shime43 | Division mid 1 | Splitting animation |
| `divide-frame-3.png` | shime44 | Division mid 2 | Splitting animation |
| `divide-frame-4.png` | shime45 | Division mid 3 | Splitting animation |
| `divide-frame-5.png` | shime46 | Division complete | Two mochis visible |

**Note:** These are advanced features for spawning multiple mascots.

### Window Manipulation (NOT included in chrome-extension folder)

| Sprite | Original | Description | Reason Excluded |
|--------|----------|-------------|-----------------|
| `carry-window-stand.png` | shime36 | Holding window | No window access in extension |
| `carry-window-walk-frame-1.png` | shime34 | Walking with window | No window access |
| `carry-window-walk-frame-2.png` | shime35 | Walking with window | No window access |
| `throw-window.png` | shime37 | Throwing window | No window access |

---

## MVP Implementation Guide

The `mvp/` folder contains 11 essential sprites for a basic working Mochi:

### State Machine

```javascript
const states = {
  IDLE: 'idle',
  WALKING: 'walking',
  FALLING: 'falling',
  SITTING: 'sitting',
  DRAGGED: 'dragged'
};
```

### MVP Sprite Mapping

```javascript
const MVP_SPRITES = {
  idle: ['stand-neutral.png'],
  walking: ['stand-neutral.png', 'walk-step-left.png', 'stand-neutral.png', 'walk-step-right.png'],
  falling: ['fall.png'],
  landing: ['bounce-squish.png', 'bounce-recover.png'],
  sitting: ['sit.png'],
  dragged: ['dragged-tilt-left-light.png', 'stand-neutral.png', 'dragged-tilt-right-light.png'],
  resisting: ['resist-frame-1.png', 'resist-frame-2.png']
};
```

### Basic Behavior Loop

```javascript
function updateMascot() {
  switch (state) {
    case states.IDLE:
      // Random chance to start walking or sitting
      if (Math.random() < 0.01) state = states.WALKING;
      if (Math.random() < 0.005) state = states.SITTING;
      break;

    case states.WALKING:
      // Move horizontally, check boundaries
      x += velocity.x * direction;
      if (atBoundary()) state = states.IDLE;
      if (Math.random() < 0.01) state = states.IDLE;
      break;

    case states.FALLING:
      // Apply gravity
      velocity.y += GRAVITY;
      y += velocity.y;
      if (onGround()) {
        playBounceAnimation();
        state = states.IDLE;
      }
      break;

    case states.DRAGGED:
      // Follow cursor, play resist animation periodically
      x = cursor.x;
      y = cursor.y;
      break;
  }
}
```

### Anchor Point

All sprites use an anchor point of (64, 128) for a 128x128 sprite, meaning the anchor is at the bottom center. Position calculations should use:

```javascript
// To draw sprite at position (x, y) where y is ground level:
drawX = x - 64;  // Center horizontally
drawY = y - 128; // Anchor at feet
```

### Flipping for Direction

Sprites are drawn facing left by default. To face right, flip horizontally:

```javascript
ctx.save();
if (facingRight) {
  ctx.scale(-1, 1);
  ctx.drawImage(sprite, -x - width, y);
} else {
  ctx.drawImage(sprite, x, y);
}
ctx.restore();
```

---

## Chrome Extension Implementation Notes

### Browser Boundaries

In a Chrome extension, boundaries are the viewport edges:

```javascript
const boundaries = {
  floor: window.innerHeight,
  ceiling: 0,
  leftWall: 0,
  rightWall: window.innerWidth
};
```

### Rendering Layer

Use a fixed-position overlay div with pointer-events: none (except on the mascot itself):

```css
#mochi-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 999999;
}

#mochi {
  pointer-events: auto;
  cursor: grab;
}
```

### Animation Timing

Original Mochi uses "ticks" for timing. Convert to milliseconds:

```javascript
const TICK_MS = 40; // ~25 FPS
const FRAME_DURATION_MS = originalDuration * TICK_MS;
```

---

## Original File Mapping Reference

| New Name | Original | Primary Use |
|----------|----------|-------------|
| stand-neutral.png | shime1 | Idle, walk |
| walk-step-left.png | shime2 | Walk |
| walk-step-right.png | shime3 | Walk |
| fall.png | shime4 | Falling |
| resist-frame-1.png | shime5 | Dragged resist |
| resist-frame-2.png | shime6 | Dragged resist |
| dragged-tilt-left-light.png | shime7 | Dragged |
| dragged-tilt-right-light.png | shime8 | Dragged |
| dragged-tilt-left-heavy.png | shime9 | Dragged |
| dragged-tilt-right-heavy.png | shime10 | Dragged |
| sit.png | shime11 | Sitting |
| climb-wall-frame-1.png | shime12 | Wall climb |
| grab-wall.png | shime13 | Wall hold |
| climb-wall-frame-2.png | shime14 | Wall climb |
| spin-head-frame-1.png | shime15 | Head spin |
| spin-head-frame-2.png | shime16 | Head spin |
| spin-head-frame-3.png | shime17 | Head spin |
| bounce-squish.png | shime18 | Landing |
| bounce-recover.png | shime19 | Landing |
| crawl-crouch.png | shime20 | Crawl |
| sprawl-lying.png | shime21 | Lying down |
| jump.png | shime22 | Jumping |
| grab-ceiling.png | shime23 | Ceiling hang |
| climb-ceiling-frame-1.png | shime24 | Ceiling crawl |
| climb-ceiling-frame-2.png | shime25 | Ceiling crawl |
| sit-look-up.png | shime26 | Sit look up |
| spin-head-frame-4.png | shime27 | Head spin |
| spin-head-frame-5.png | shime28 | Head spin |
| spin-head-frame-6.png | shime29 | Head spin |
| sit-edge-legs-up.png | shime30 | Edge sit |
| sit-edge-legs-down.png | shime31 | Edge sit |
| sit-edge-dangle-frame-1.png | shime32 | Edge dangle |
| sit-edge-dangle-frame-2.png | shime33 | Edge dangle |
| carry-window-walk-frame-1.png | shime34 | Window carry |
| carry-window-walk-frame-2.png | shime35 | Window carry |
| carry-window-stand.png | shime36 | Window carry |
| throw-window.png | shime37 | Window throw |
| pull-up-friend-frame-1.png | shime38 | Clone spawn |
| pull-up-friend-frame-2.png | shime39 | Clone spawn |
| pull-up-friend-frame-3.png | shime40 | Clone spawn |
| pull-up-friend-frame-4.png | shime41 | Clone spawn |
| divide-frame-1.png | shime42 | Clone split |
| divide-frame-2.png | shime43 | Clone split |
| divide-frame-3.png | shime44 | Clone split |
| divide-frame-4.png | shime45 | Clone split |
| divide-frame-5.png | shime46 | Clone split |
