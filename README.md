Simple LOD Terrain Demo
=======================

Uses `three.js` orbital camera so you can spin around if you want to.


About
-----

This is a quick `three.js` based demo of multi-resolution level of detail rendering on a sample terrain. Various patches morph smoothly as the detail is increased or decreased.


**What it does:**

- Generate a perlin noise terrain
- Sample it in suitable ways for rendering
- Break into tiles and process to GPU compatible data
- Run a loop, shifting around the LOD factors across the terrain so you can see the system work.
- All dynamics are then done on the GPU


**Notes:**

- Normally you'd expect the lod factors to come from distance from camera, but I made them run from a nice oscillating pattern so you can see what's going on.
- At runtime all morphing is done by a vertex shader, the only data that's uploading in real time 
- Rendering is simple so you can see what's going on, shaders are in `Shaders.ts`
- No tile stitching, ran out of time on a quick demo. Not too hard though, either stitch potential T junctions to the lower resolution LOD, or be clever with a mask on the morp



Code Layout
-----------

 Written by me specifically for this demo:

- LandScape.ts
- PerlinTerrain.ts
- Region.ts
- Shaders.ts
- Tile.ts
- Utilities.ts
- main.ts


Previously written code by me:

- CanvasManager.ts
- DebugCanvas.ts



Other .js are parts of three.js

