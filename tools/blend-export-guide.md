# Blender → Web-Optimized GLB Export Guide
## 4D Design Graphics | 3D Configurator

This guide walks you through exporting your `RENDER.blend` file into a web-ready GLB format
that can be loaded by the 3D configurator.

---

## Target Specs

| Property | Target | Maximum |
|---|---|---|
| File size | < 2 MB | 5 MB |
| Polygon count | < 50K tris | 100K tris |
| Texture resolution | 1024×1024 | 2048×2048 |
| Format | GLB (binary GLTF) | — |
| Compression | Draco geometry | — |

---

## Step 1: Open RENDER.blend

```bash
# Make sure you have Blender 3.x or 4.x
blender RENDER.blend
```

---

## Step 2: Name Your Meshes Correctly

The configurator uses **exact mesh names** to apply colors to each zone.
In the Outliner, rename your mesh objects to match these names:

| Zone | Required Mesh Name |
|---|---|
| Front Fender | `Mesh_FrontFender` |
| Rear Fender | `Mesh_RearFender` |
| Tank | `Mesh_Tank` |
| Left Shroud | `Mesh_ShroudL` |
| Right Shroud | `Mesh_ShroudR` |
| Swingarm | `Mesh_Swingarm` |
| Number Plate | `Mesh_NumberPlate` |
| Graphic Decal (for name/logo) | `Mesh_GraphicDecal` |

> **Tip:** To rename in Blender, click the mesh in the Outliner → press F2 → type new name.

---

## Step 3: Optimize Mesh (Decimate Modifier)

If your model has too many polygons, add a Decimate modifier:

1. Select each mesh
2. Add Modifier → Decimate
3. Set **Ratio** to `0.3`–`0.5` (adjust until it looks good)
4. Apply the modifier

Target: **< 50,000 triangles total** across all meshes.

Check with: **Viewport → Overlays → Statistics**

---

## Step 4: UV Unwrap the Graphic Decal Mesh

The `Mesh_GraphicDecal` mesh needs a clean UV map for the canvas texture overlay:

1. Select `Mesh_GraphicDecal`
2. Enter **Edit Mode** (Tab)
3. Select All (A)
4. UV → **Smart UV Project** → Island Margin: `0.02`
5. Return to Object Mode

---

## Step 5: Set Up Materials

Each colorable mesh should have a simple Principled BSDF material:

1. Select mesh → Material Properties
2. Name the material the same as the mesh (e.g., `Mat_FrontFender`)
3. Base Color: Set initial color (configurator will override at runtime)
4. Metallic: `0.3` | Roughness: `0.5`
5. Clear any texture maps you don't want exported (keep only Normal maps)

For `Mesh_GraphicDecal`:
- Base Color: White (`1,1,1,1`)
- Blend Mode: Alpha Blend
- No metallic/roughness maps needed

---

## Step 6: Bake Textures (Optional but Recommended)

If your model has complex procedural materials, bake them to image textures:

1. Create a new Image Texture node in each material (`1024×1024`)
2. Select it (it will be the bake target)
3. Render → Bake → **Diffuse** (uncheck Direct/Indirect to get flat base color)
4. Save each baked image as PNG

---

## Step 7: Export to GLB

### Method A: Blender UI Export

1. **File → Export → glTF 2.0 (.glb/.gltf)**
2. Settings:
   - Format: **GLB** (single binary file)
   - Include: ✅ Selected Objects (or Scene)
   - Geometry: ✅ Apply Modifiers, ✅ UVs, ✅ Normals
   - ✅ Compression (requires `pip install bpy` or use Blender 3.3+)
   - Draco: ✅ Enable → Compression Level: `6`
   - Images: Format: **WEBP** | Quality: `75`
3. Save to: `models/drz400sm/drz400sm.glb`

### Method B: Automated Python Script

Run this in Blender's Python Console (Scripting tab):

```python
import bpy
import os

# Configuration
OUTPUT_PATH = r"c:\projects\shopify_plugin\models\drz400sm\drz400sm.glb"
TEXTURE_SIZE = 1024

# Ensure output directory exists
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

# Export settings
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_PATH,
    export_format='GLB',
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_tangents=False,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_image_format='WEBP',
    export_jpeg_quality=80,
    use_selection=False,
    use_visible=True,
    use_renderable=True,
)

print(f"✅ Exported to: {OUTPUT_PATH}")

# Check file size
size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
print(f"📦 File size: {size_mb:.2f} MB")
if size_mb > 5:
    print("⚠ File is > 5MB — consider decimating meshes or reducing texture size")
else:
    print("✅ File size is within web performance target")
```

---

## Step 8: Further Compression with gltf-transform (Optional)

For maximum compression, run this after export (requires Node.js):

```bash
# Install gltf-transform globally
npm install -g @gltf-transform/cli

# Compress with Draco + WebP textures
npx gltf-transform optimize models/drz400sm/drz400sm.glb models/drz400sm/drz400sm.glb \
  --texture-compress webp \
  --texture-resize 1024

# Check output stats
npx gltf-transform inspect models/drz400sm/drz400sm.glb
```

---

## Step 9: Test in the Configurator

1. Place the exported `drz400sm.glb` in `models/drz400sm/`
2. Start a local server:
   ```bash
   npx serve .
   # or
   python -m http.server 8080
   ```
3. Open `http://localhost:8080` in your browser
4. The configurator will load your GLB automatically (it falls back to the placeholder if the file is not found)

---

## Mesh Naming Quick Reference

```
Root (Group)
├── Mesh_FrontFender      ← colorable via Front Fender zone
├── Mesh_RearFender       ← colorable via Rear Fender zone
├── Mesh_Tank             ← colorable via Tank zone
├── Mesh_ShroudL          ← colorable via Left Shroud zone
├── Mesh_ShroudR          ← colorable via Right Shroud zone
├── Mesh_Swingarm         ← colorable via Swingarm zone
├── Mesh_NumberPlate      ← colorable via Number Plate zone
├── Mesh_GraphicDecal     ← receives CanvasTexture (name/number/logo)
├── Mesh_Frame            ← static (no color zone)
├── Mesh_Engine           ← static
├── Mesh_Wheels           ← static
├── Mesh_Exhaust          ← static
└── Mesh_Seat             ← static
```

---

## Adding a New Bike Model

1. Export your GLB to `models/<model-id>/<model-id>.glb`
2. Add an entry to `config/models.json`:
   ```json
   {
     "id": "crf450r",
     "name": "CRF 450R",
     "brand": "Honda",
     "category": "Dirt Bike",
     "shopifyProductId": "...",
     "shopifyVariantId": "...",
     "glb": "models/crf450r/crf450r.glb",
     "years": ["2021", "2022", "2023", "2024"],
     "plastics": ["OEM", "UFO"],
     "colorZones": [
       { "id": "front_fender", "name": "Front Fender", "meshName": "Mesh_FrontFender", "default": "#cc0000" }
     ]
   }
   ```
3. **No code changes needed.** The configurator reads `config/models.json` at startup.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Model appears black | Check materials — set Base Color, enable Emission slightly |
| Model too large / performance issues | Apply Decimate modifier, reduce polygon count |
| Colors not changing | Verify mesh names match `meshName` in `models.json` |
| Textures missing | Ensure textures are packed in GLB (use "Pack External Data" before export) |
| Model floats / buried | Check origin position in Blender — set origin to geometry base |
| Draco not working | Requires Blender 3.3+; update Blender or use gltf-transform post-process |
