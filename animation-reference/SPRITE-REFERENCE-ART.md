# Mochi Sprite Reference for Artists

This guide explains how each image is used in the character’s animations in plain, visual terms. It is meant for illustrators and graphic designers. The developer-focused document remains in `SPRITE-REFERENCE.md`.

## How to Use This Folder

- `all-sprites/` has the full set (46 images). This is the master reference.
- `chrome-extension/` removes window-handling images that cannot be used in a browser extension.
- `mvp/` is the minimal set for a simple, working character.

## General Art Notes (Non-Technical)

- **Consistent size and ground line:** All images should sit on the same baseline so the feet always touch the same “floor.”
- **Facing direction:** All sprites face left by default. The character will be flipped to face right, so keep the silhouette clean.
- **Keep proportions steady:** Head and body size should not drift between frames unless intentionally squashing or stretching.
- **Emotion and motion clarity:** Each pose should be readable at a glance; small changes matter in animation.

---

## Standing & Walking

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `stand-neutral.png` | ![](all-sprites/stand-neutral.png) | Calm, relaxed standing pose | Idle state and the “neutral” frame between steps |
| `walk-step-left.png` | ![](all-sprites/walk-step-left.png) | Left foot forward, light step | Walking cycle frame 2 |
| `walk-step-right.png` | ![](all-sprites/walk-step-right.png) | Right foot forward, light step | Walking cycle frame 4 |

**Walk flow:** neutral → left step → neutral → right step (loop).

---

## Falling & Landing

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `fall.png` | ![](all-sprites/fall.png) | Arms up, startled fall | Character is dropping through the air |
| `bounce-squish.png` | ![](all-sprites/bounce-squish.png) | Compressed, squashed on impact | First moment of landing |
| `bounce-recover.png` | ![](all-sprites/bounce-recover.png) | Rebounding back to normal | Second landing frame before returning to idle |

---

## Jumping

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `jump.png` | ![](all-sprites/jump.png) | Energetic upward leap | The instant the character jumps upward |

---

## Sitting & Resting

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `sit.png` | ![](all-sprites/sit.png) | Relaxed seated pose | Standard idle sitting |
| `sit-look-up.png` | ![](all-sprites/sit-look-up.png) | Sitting, looking upward | Used when the cursor or focus is above the character |
| `sprawl-lying.png` | ![](all-sprites/sprawl-lying.png) | Lying flat, very relaxed | Long idle rest or “dozing” mood |
| `crawl-crouch.png` | ![](all-sprites/crawl-crouch.png) | Low crouch, ready to move | Start of crawl or low movement |

---

## Dragging (Picked Up by the Cursor)

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `dragged-tilt-left-light.png` | ![](all-sprites/dragged-tilt-left-light.png) | Slight tilt left | Cursor is slightly left of the feet |
| `dragged-tilt-right-light.png` | ![](all-sprites/dragged-tilt-right-light.png) | Slight tilt right | Cursor is slightly right of the feet |
| `dragged-tilt-left-heavy.png` | ![](all-sprites/dragged-tilt-left-heavy.png) | Strong tilt left | Cursor is far left; big pull |
| `dragged-tilt-right-heavy.png` | ![](all-sprites/dragged-tilt-right-heavy.png) | Strong tilt right | Cursor is far right; big pull |

These frames communicate how hard the character is being pulled.

---

## Resisting While Dragged

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `resist-frame-1.png` | ![](all-sprites/resist-frame-1.png) | Struggling pose A | Alternates with frame 2 |
| `resist-frame-2.png` | ![](all-sprites/resist-frame-2.png) | Struggling pose B | Alternates with frame 1 |

These two frames create a quick “wiggle” or struggle loop.

---

## Wall Climbing

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `grab-wall.png` | ![](all-sprites/grab-wall.png) | Static hold on wall | Hanging still on a wall |
| `climb-wall-frame-1.png` | ![](all-sprites/climb-wall-frame-1.png) | Climb step A | Wall climb motion |
| `climb-wall-frame-2.png` | ![](all-sprites/climb-wall-frame-2.png) | Climb step B | Wall climb motion |

Frames 1 and 2 alternate to show a climbing rhythm.

---

## Ceiling Hanging & Crawling

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `grab-ceiling.png` | ![](all-sprites/grab-ceiling.png) | Hanging still from the ceiling | Static ceiling hold |
| `climb-ceiling-frame-1.png` | ![](all-sprites/climb-ceiling-frame-1.png) | Ceiling crawl step A | Moving along the ceiling |
| `climb-ceiling-frame-2.png` | ![](all-sprites/climb-ceiling-frame-2.png) | Ceiling crawl step B | Moving along the ceiling |

These are upside-down versions of movement, so silhouettes should remain clear.

---

## Edge Sitting (Perched on a Ledge)

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `sit-edge-legs-up.png` | ![](all-sprites/sit-edge-legs-up.png) | Sitting on edge, legs tucked | Transitioning to the edge seat |
| `sit-edge-legs-down.png` | ![](all-sprites/sit-edge-legs-down.png) | Sitting on edge, legs dangling | Default edge sit |
| `sit-edge-dangle-frame-1.png` | ![](all-sprites/sit-edge-dangle-frame-1.png) | Legs swinging left | Dangle animation frame A |
| `sit-edge-dangle-frame-2.png` | ![](all-sprites/sit-edge-dangle-frame-2.png) | Legs swinging right | Dangle animation frame B |

The dangle frames alternate to create a gentle leg swing.

---

## Original Mochi-ee Sprite Mapping (For Importing New Characters)

This mapping shows which **Mochi-ee original sprite** each renamed file corresponds to. Use this when bringing in existing Mochi-ee packs and renaming them for this extension.

| Renamed Sprite | Mochi-ee Original |
|----------------|---------------------|
| `stand-neutral.png` | `shime1` |
| `walk-step-left.png` | `shime2` |
| `walk-step-right.png` | `shime3` |
| `fall.png` | `shime4` |
| `resist-frame-1.png` | `shime5` |
| `resist-frame-2.png` | `shime6` |
| `dragged-tilt-left-light.png` | `shime7` |
| `dragged-tilt-right-light.png` | `shime8` |
| `dragged-tilt-left-heavy.png` | `shime9` |
| `dragged-tilt-right-heavy.png` | `shime10` |
| `sit.png` | `shime11` |
| `climb-wall-frame-1.png` | `shime12` |
| `grab-wall.png` | `shime13` |
| `climb-wall-frame-2.png` | `shime14` |
| `spin-head-frame-1.png` | `shime15` |
| `spin-head-frame-2.png` | `shime16` |
| `spin-head-frame-3.png` | `shime17` |
| `bounce-squish.png` | `shime18` |
| `bounce-recover.png` | `shime19` |
| `crawl-crouch.png` | `shime20` |
| `sprawl-lying.png` | `shime21` |
| `jump.png` | `shime22` |
| `grab-ceiling.png` | `shime23` |
| `climb-ceiling-frame-1.png` | `shime24` |
| `climb-ceiling-frame-2.png` | `shime25` |
| `sit-look-up.png` | `shime26` |
| `spin-head-frame-4.png` | `shime27` |
| `spin-head-frame-5.png` | `shime28` |
| `spin-head-frame-6.png` | `shime29` |
| `sit-edge-legs-up.png` | `shime30` |
| `sit-edge-legs-down.png` | `shime31` |
| `sit-edge-dangle-frame-1.png` | `shime32` |
| `sit-edge-dangle-frame-2.png` | `shime33` |
| `carry-window-walk-frame-1.png` | `shime34` |
| `carry-window-walk-frame-2.png` | `shime35` |
| `carry-window-stand.png` | `shime36` |
| `throw-window.png` | `shime37` |
| `pull-up-friend-frame-1.png` | `shime38` |
| `pull-up-friend-frame-2.png` | `shime39` |
| `pull-up-friend-frame-3.png` | `shime40` |
| `pull-up-friend-frame-4.png` | `shime41` |
| `divide-frame-1.png` | `shime42` |
| `divide-frame-2.png` | `shime43` |
| `divide-frame-3.png` | `shime44` |
| `divide-frame-4.png` | `shime45` |
| `divide-frame-5.png` | `shime46` |

## Head Spin (Playful Idle)

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `spin-head-frame-1.png` | ![](all-sprites/spin-head-frame-1.png) | Head turning stage 1 | Head rotation sequence |
| `spin-head-frame-2.png` | ![](all-sprites/spin-head-frame-2.png) | Head turning stage 2 | Head rotation sequence |
| `spin-head-frame-3.png` | ![](all-sprites/spin-head-frame-3.png) | Head turning stage 3 | Head rotation sequence |
| `spin-head-frame-4.png` | ![](all-sprites/spin-head-frame-4.png) | Head turning stage 4 | Head rotation sequence |
| `spin-head-frame-5.png` | ![](all-sprites/spin-head-frame-5.png) | Head turning stage 5 | Head rotation sequence |
| `spin-head-frame-6.png` | ![](all-sprites/spin-head-frame-6.png) | Head turning stage 6 | Head rotation sequence |

This sequence creates a playful, curious “head spin” while sitting.

---

## Multiplication / Cloning (Advanced Feature)

These are used when the character pulls up or splits into another character.

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `pull-up-friend-frame-1.png` | ![](all-sprites/pull-up-friend-frame-1.png) | Reaching down | Start of pulling up a new character |
| `pull-up-friend-frame-2.png` | ![](all-sprites/pull-up-friend-frame-2.png) | Grabbing | Mid pull, contact made |
| `pull-up-friend-frame-3.png` | ![](all-sprites/pull-up-friend-frame-3.png) | Lifting | Pulling the friend upward |
| `pull-up-friend-frame-4.png` | ![](all-sprites/pull-up-friend-frame-4.png) | Friend emerging | Second character becomes visible |
| `divide-frame-1.png` | ![](all-sprites/divide-frame-1.png) | Division start | Begin splitting into two |
| `divide-frame-2.png` | ![](all-sprites/divide-frame-2.png) | Division mid 1 | Splitting in progress |
| `divide-frame-3.png` | ![](all-sprites/divide-frame-3.png) | Division mid 2 | Splitting in progress |
| `divide-frame-4.png` | ![](all-sprites/divide-frame-4.png) | Division mid 3 | Splitting in progress |
| `divide-frame-5.png` | ![](all-sprites/divide-frame-5.png) | Division complete | Two characters fully visible |

---

## Window Handling (Not Used in Chrome Extension)

These are part of the original set but are excluded in `chrome-extension/`.

| Image | Preview | Pose / Feeling | Used When |
|------|---------|-----------------|-----------|
| `carry-window-stand.png` | ![](all-sprites/carry-window-stand.png) | Holding a window while standing | Lifting a window |
| `carry-window-walk-frame-1.png` | ![](all-sprites/carry-window-walk-frame-1.png) | Walking with a window | Carrying while walking (frame A) |
| `carry-window-walk-frame-2.png` | ![](all-sprites/carry-window-walk-frame-2.png) | Walking with a window | Carrying while walking (frame B) |
| `throw-window.png` | ![](all-sprites/throw-window.png) | Throwing motion | Tossing a window |

---

## MVP (Minimal Set)

For the simplest version, the `mvp/` folder includes:
`stand-neutral.png`, `walk-step-left.png`, `walk-step-right.png`, `fall.png`,
`bounce-squish.png`, `bounce-recover.png`, `sit.png`,
`dragged-tilt-left-light.png`, `dragged-tilt-right-light.png`,
`resist-frame-1.png`, `resist-frame-2.png`.

**MVP visuals (from `mvp/`):**
![](mvp/stand-neutral.png)
![](mvp/walk-step-left.png)
![](mvp/walk-step-right.png)
![](mvp/fall.png)
![](mvp/bounce-squish.png)
![](mvp/bounce-recover.png)
![](mvp/sit.png)
![](mvp/dragged-tilt-left-light.png)
![](mvp/dragged-tilt-right-light.png)
![](mvp/resist-frame-1.png)
![](mvp/resist-frame-2.png)
