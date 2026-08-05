/**
 * 4D Design Graphics – 3D Motorcycle Configurator
 * Core Engine: Three.js r165 | GLTFLoader | OrbitControls | CanvasTexture
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';


/* ============================================================
   CONFIG LOADING
   ============================================================ */
let MODELS_CONFIG = null;
let COLOR_PRESETS = null;

async function loadConfigs() {
  const [modelsResp, presetsResp] = await Promise.all([
    fetch('./config/models.json').catch(() => null),
    fetch('./config/colorPresets.json').catch(() => null),
  ]);
  MODELS_CONFIG = modelsResp ? await modelsResp.json() : { models: [], fontOptions: [], logoOptions: [] };
  COLOR_PRESETS = presetsResp ? await presetsResp.json() : { presets: [] };
}

/* ============================================================
   STATE
   ============================================================ */
const state = {
  modelId: null,
  modelConfig: null,
  year: '2025',
  plastics: 'Stock OEM',
  frontFender: 'Standard',
  printBase: 'Standard White',
  laminate: 'Standard Gloss',
  wheelsGraphics: 'No Decals',
  colors: {},           // { zoneId: hexColor }
  logo: 'none',
  logoImage: null,
  presetId: null,

  // Multi-plate configuration state
  activePlate: 'front',
  plates: {
    front: { number: '333', font: 'bebas', color: '#000000', strokeColor: '#ffffff', x: 512, y: 1536, fontSize: 240, rotation: 0, stretchH: 1.0, stretchV: 1.0, letterSpacing: 0.02, strokeWidth: 4 },
    left:  { number: '333', font: 'bebas', color: '#000000', strokeColor: '#ffffff', x: 1180, y: 1024, fontSize: 200, rotation: 0, stretchH: 1.0, stretchV: 1.0, letterSpacing: 0.02, strokeWidth: 4 },
    right: { number: '333', font: 'bebas', color: '#000000', strokeColor: '#ffffff', x: 680, y: 1024, fontSize: 200, rotation: 0, stretchH: 1.0, stretchV: 1.0, letterSpacing: 0.02, strokeWidth: 4 },
  }
};

/* ============================================================
   THREE.JS ENGINE
   ============================================================ */
class MotorcycleConfigurator {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.model = null;
    this.meshMap = {};       // meshName -> THREE.Mesh
    this.zoneMaterials = {}; // zoneId -> THREE.Material
    this.decalCanvas = null;
    this.decalCtx = null;
    this.decalTexture = null;
    this.autoRotate = true;
    this.autoRotateTimer = null;
    this.animFrameId = null;
    this.isLoading = false;
    this.envLoaded = false;
  }

  init() {
    this._setupRenderer();
    this._setupScene();
    this._setupCamera();
    this._setupLights();
    this._setupControls();
    this._setupDecalCanvas();
    this._setupResizeObserver();
    this._animate();
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.offsetWidth, this.canvas.offsetHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xEBEFF2);
    this.scene.fog = new THREE.FogExp2(0xEBEFF2, 0.05);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xDFE3E6,
      roughness: 0.85,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid helper
    const grid = new THREE.GridHelper(12, 24, 0xC4C9CD, 0xD4D9DD);
    grid.position.y = 0;
    this.scene.add(grid);
    this.grid = grid;

    // Reflective circle under bike
    const circleGeo = new THREE.CircleGeometry(1.4, 64);
    const circleMat = new THREE.MeshStandardMaterial({
      color: 0xD0D5D9,
      roughness: 0.2,
      metalness: 0.5,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.001;
    circle.receiveShadow = true;
    this.scene.add(circle);
  }

  _setupCamera() {
    const aspect = this.canvas.offsetWidth / this.canvas.offsetHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    this.camera.position.set(0, 0.8, 3.4);
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambient);

    // Key light
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.001;
    this.scene.add(key);

    // Fill light
    const fill = new THREE.DirectionalLight(0xe8eeff, 0.7);
    fill.position.set(-4, 2, -2);
    this.scene.add(fill);

    // Rim light
    const rim = new THREE.DirectionalLight(0xffffff, 0.4);
    rim.position.set(0, 1, -4);
    this.scene.add(rim);

    // Hemisphere
    const hemi = new THREE.HemisphereLight(0xdde8ff, 0xf5f5f0, 0.5);
    this.scene.add(hemi);
  }

  _setupControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 0.45, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 5;
    this.controls.minPolarAngle = Math.PI * 0.1;
    this.controls.maxPolarAngle = Math.PI * 0.65;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.9;

    // Pause auto-rotate on interaction
    this.canvas.addEventListener('pointerdown', () => this._pauseAutoRotate());
    this.controls.addEventListener('start', () => this._pauseAutoRotate());
  }

  _pauseAutoRotate() {
    this.controls.autoRotate = false;
    clearTimeout(this.autoRotateTimer);
    this.autoRotateTimer = setTimeout(() => {
      this.controls.autoRotate = true;
    }, 15000);
  }

  _setupDecalCanvas() {
    this.decalCanvas = document.createElement('canvas');
    this.decalCanvas.width = 2048;
    this.decalCanvas.height = 2048;
    this.decalCtx = this.decalCanvas.getContext('2d');

    this.decalTexture = new THREE.CanvasTexture(this.decalCanvas);
    this.decalTexture.colorSpace = THREE.SRGBColorSpace;
    this.decalTexture.flipY = false;
    this.decalTexture.needsUpdate = true;
  }

  _setupResizeObserver() {
    const resizeObserver = new ResizeObserver(() => {
      this.forceResize();
    });
    resizeObserver.observe(this.canvas.parentElement);
  }

  forceResize() {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const w = this.canvas.parentElement.clientWidth;
    const h = this.canvas.parentElement.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    this.animFrameId = requestAnimationFrame(() => this._animate());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* ----- GLTF LOADER ----- */
  async loadModel(modelConfig, onProgress) {
    if (this.model) {
      this.scene.remove(this.model);
      this.model = null;
      this.meshMap = {};
      this.zoneMaterials = {};
    }

    const loader = new GLTFLoader();
    
    // Draco decoder
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(draco);

    this.isLoading = true;
    const modelUrl = './' + modelConfig.glb;

    const loadGLB = () => new Promise((resolve) => {
      loader.load(
        modelUrl,
        (gltf) => {
          try {
            this.model = gltf.scene;
            this.model.scale.setScalar(modelConfig.scale || 1);

            // Center model using ONLY the main ATV assembly's bounding box
            let centerTarget = this.model;
            this.model.traverse(n => {
              if (n.name === 'Yamaha_YZF_450_2020') centerTarget = n;
            });
            const box = new THREE.Box3().setFromObject(centerTarget);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            this.model.position.sub(center);
            this.model.position.y += size.y / 2;

            // Map meshes, set up materials
            this.model.traverse(obj => {
              const objName = (obj.name || '').toLowerCase();
              const parentName = (obj.parent && obj.parent.name || '').toLowerCase();
              const fullName = objName + ' ' + parentName;
              
              // Hide other vehicles (KTM, Husqvarna, YZF dirt bike) and floating duplicate parts
              if (modelConfig.id === 'yfz450r') {
                let rootNode = obj;
                while (rootNode.parent && rootNode.parent !== this.model) {
                  rootNode = rootNode.parent;
                }
                const rootName = (rootNode.name || '').toLowerCase();

                const badRootGroups = new Set([
                  'yamaha_yzf_450_2020.001', 'yamaha_yzf_450_2020.002', 'yamaha_yzf_450_2020.003',
                  'yamaha_yzf_450_2020.004', 'yamaha_yzf_450_2020.005',
                  'yamaha_yzf_450_2020.006', 'yamaha_yzf_450_2020.007',
                  'yamaha_yzf_450_2020.008', 'yamaha_yzf_450_2020.009',
                  'yamaha_yzf_450_2020.010',
                  'yamaha_yzf_450_2020.011', // dirt bike forks Y=37-64 units
                  'yamaha_yzf_450_2020.012',
                  'yamaha_yzf_450_2020.013',
                  'yamaha_yzf_450_2020.014', 'yamaha_yzf_450_2020.015',
                  'yamaha_yzf_450_2020.016',
                  'yamaha_yzf_450_2020.017', 'yamaha_yzf_450_2020.018',
                  'new graphic', // mispositioned decals
                  'sticker.001',
                  'sticker.002',
                  'sticker.003',
                ]);

              const isToHide = (
                badRootGroups.has(rootName) ||
                objName === 'frame_chrome_f18' ||
                objName === 'yamaha_f' ||
                objName === 'handlebar_chrome00' ||
                objName === 'handles00' ||
                objName === 'handles01' ||
                objName === 'red_part' ||
                objName.includes('husqvarna') || 
                objName.includes('ktm') || 
                objName.includes('rim_second') ||
                objName === 'plano' ||
                objName === 'plane' ||
                (objName.startsWith('plane.') && !objName.includes('.006') && !objName.includes('.007') && !objName.includes('.008') && !objName.includes('.009')) ||
                objName.includes('render.') ||
                /^cylinder(\.\d+)?$/.test(objName) ||
                /^circle(\.\d+)?$/.test(objName) ||
                /^cube(\.\d+)?$/.test(objName) ||
                /^bolt(\.\d+)?$/.test(objName) ||
                objName === 'hex nut' ||
                (objName.startsWith('handlebar_') && objName.endsWith('.001')) ||
                (objName.startsWith('handlebar_') && objName.endsWith('.002')) ||
                objName === 'handle.002'
              );
              
              if (isToHide) {
                obj.visible = false;
                if (obj.isMesh) {
                  obj.castShadow = false;
                  obj.receiveShadow = false;
                }
                return;
              }
            }

            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
              this.meshMap[obj.name] = obj;

              const oldMat = obj.material;
              const fullName = obj.name.toLowerCase();

              // Map zone to mesh
              const matchedZones = modelConfig.colorZones.filter(z => {
                if (Array.isArray(z.meshName)) {
                  return z.meshName.some(name => fullName.includes(name.toLowerCase()));
                }
                return fullName.includes(z.meshName.toLowerCase());
              });

              if (matchedZones.length > 0) {
                obj.material = new THREE.MeshPhysicalMaterial({
                  color: oldMat.color || new THREE.Color(0xffffff),
                  map: oldMat.map || null,
                  normalMap: oldMat.normalMap || null,
                  roughness: oldMat.roughness !== undefined ? oldMat.roughness : 0.2,
                  metalness: oldMat.metalness !== undefined ? oldMat.metalness : 0.1,
                  clearcoat: 0.9,
                  clearcoatRoughness: 0.05,
                  transparent: oldMat.transparent || false,
                  opacity: oldMat.opacity !== undefined ? oldMat.opacity : 1.0,
                });

                matchedZones.forEach(zone => {
                  if (!this.zoneMaterials[zone.id]) {
                    this.zoneMaterials[zone.id] = [];
                  }
                  this.zoneMaterials[zone.id].push(obj.material);
                });
              }

              // Decal mesh mapping
              let isDecal = false;
              if (Array.isArray(modelConfig.decalMesh)) {
                isDecal = modelConfig.decalMesh.some(name => fullName.includes(name.toLowerCase()));
              } else if (modelConfig.decalMesh) {
                isDecal = fullName.includes(modelConfig.decalMesh.toLowerCase());
              }

              if (isDecal) {
                obj.material = new THREE.MeshStandardMaterial({
                  map: this.decalTexture,
                  transparent: true,
                  roughness: 0.5,
                  metalness: 0.1,
                  polygonOffset: true,
                  polygonOffsetFactor: -4,
                  polygonOffsetUnits: -4,
                  depthWrite: true,
                });
              }
            }
          });

          // ── WORLD-SPACE SANITY FILTER (double safety for floating washers/bolts) ──
          const atvBoundsMin = new THREE.Vector3(-1.0, -0.1, -1.5);
          const atvBoundsMax = new THREE.Vector3(1.6, 1.4, 1.5);
          this.model.updateMatrixWorld(true);
          this.model.traverse(obj => {
            if (!obj.isMesh || !obj.visible) return;
            const _meshCenter = new THREE.Vector3();
            obj.getWorldPosition(_meshCenter);
            const isStray = (
              _meshCenter.x < atvBoundsMin.x ||
              _meshCenter.x > atvBoundsMax.x ||
              _meshCenter.y < atvBoundsMin.y ||
              _meshCenter.y > atvBoundsMax.y ||
              _meshCenter.z < atvBoundsMin.z ||
              _meshCenter.z > atvBoundsMax.z
            );
            if (isStray) {
              obj.visible = false;
              obj.castShadow = false;
              obj.receiveShadow = false;
            }
          });

          this.scene.add(this.model);

          // Camera positioning
          const target = new THREE.Vector3(...(modelConfig.cameraTarget || [0, 0.3, 0]));
          this.controls.target.copy(target);
          this.camera.position.set(...(modelConfig.cameraPosition || [0, 0.6, 2.8]));
          this.controls.update();

          resolve(true);
          } catch (err) {
            console.error("Error in gltf success callback:", err);
            resolve(false);
          }
        },
        (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 90));
          }
        },
        () => {
          resolve(false);
        }
      );
    });

    const success = await loadGLB();
    if (!success) {
      this._createPlaceholderBike(modelConfig);
    }
    
    this._applyAllColors();
    this._redrawDecal();
    this.isLoading = false;
  }

  _createPlaceholderBike(modelConfig) {
    const group = new THREE.Group();
    const bodyMat = () => new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.4, metalness: 0.4 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
    const graphicMat = new THREE.MeshStandardMaterial({ map: this.decalTexture, transparent: true });

    const mesh = (geo, mat, x=0, y=0, z=0, rx=0, ry=0, rz=0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      return m;
    };

    const wheelGeo = new THREE.TorusGeometry(0.32, 0.09, 16, 48);
    group.add(mesh(wheelGeo, tireMat, 0.75, 0.32, 0, Math.PI/2));
    group.add(mesh(wheelGeo, tireMat, -0.75, 0.32, 0, Math.PI/2));

    const spineGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.55, 8);
    group.add(mesh(spineGeo, bodyMat(), -0.05, 0.62, 0, 0, 0, -0.18));

    const graphicPanelGeo = new THREE.BoxGeometry(0.32, 0.22, 0.06);
    const panelL = mesh(graphicPanelGeo, graphicMat, -0.12, 0.52, 0.133);
    group.add(panelL);
    this.meshMap['Mesh_GraphicDecal'] = panelL;

    group.position.set(0, 0, 0);
    this.model = group;
    this.scene.add(group);
  }

  /* ----- MATERIAL CONFIG ----- */
  setZoneColor(zoneId, hexColor) {
    state.colors[zoneId] = hexColor;
    const mats = this.zoneMaterials[zoneId];
    if (mats) {
      const matArray = Array.isArray(mats) ? mats : [mats];
      matArray.forEach(mat => {
        mat.color.set(hexColor);
        mat.needsUpdate = true;
      });
    }
    this._redrawDecal();
  }

  _applyAllColors() {
    Object.entries(state.colors).forEach(([zoneId, hex]) => {
      this.setZoneColor(zoneId, hex);
    });
  }

  applyPreset(preset) {
    if (!state.modelConfig) return;
    state.presetId = preset.id;
    state.modelConfig.colorZones.forEach(zone => {
      const col = preset.colors[zone.id];
      if (col) this.setZoneColor(zone.id, col);
    });
    updateSummary();
  }

  /* ----- MULTI-PLATE CANVAS DECAL DRAWING ----- */
  _redrawDecal() {
    const ctx = this.decalCtx;
    const W = this.decalCanvas.width;
    const H = this.decalCanvas.height;

    ctx.clearRect(0, 0, W, H);

    const fontMap = {
      bebas:   "'Bebas Neue', Impact, sans-serif",
      racing:  "'Racing Sans One', Impact, sans-serif",
      orbitron:"'Orbitron', sans-serif",
      bangers: "'Bangers', cursive",
      russo:   "'Russo One', sans-serif",
    };

    const bodyColor = state.colors.side_panels || state.colors.front_fender || '#0055aa';
    const accent = '#D4FF00'; // 4D neon green
    
    // Draw base styled wrapping layout template design across the canvas
    const drawBaseTemplate = (ox, oy, tw, th) => {
      ctx.fillStyle = bodyColor;
      ctx.fillRect(ox, oy, tw, th);

      // Top bands
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + tw, oy);
      ctx.lineTo(ox + tw, oy + th * 0.28);
      ctx.lineTo(ox, oy + th * 0.18);
      ctx.closePath();
      ctx.fill();

      // Chevrons
      const chH = th * 0.12;
      const chY = oy + th * 0.38;
      const drawChevron = (x, y, w, h, col) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w + h * 0.4, y + h * 0.5);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + h * 0.4, y + h * 0.5);
        ctx.closePath();
        ctx.fill();
      };
      drawChevron(ox + tw * 0.05, chY, tw * 0.88, chH, accent);
      drawChevron(ox + tw * 0.05, chY + chH * 1.2, tw * 0.88, chH * 0.6, 'rgba(0,0,0,0.3)');
    };

    // Draw the 4 background quadrants
    const tileW = W / 2;
    const tileH = H / 2;
    drawBaseTemplate(0, 0, tileW, tileH);
    drawBaseTemplate(tileW, 0, tileW, tileH);
    drawBaseTemplate(0, tileH, tileW, tileH);
    drawBaseTemplate(tileW, tileH, tileW, tileH);

    // Render fixed white background plates (Left, Right, Front)
    const drawBackgroundPlate = (x, y, w, h) => {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 14;
      
      const r = w * 0.12;
      ctx.beginPath();
      ctx.moveTo(x - w/2 + r, y - h/2);
      ctx.lineTo(x + w/2 - r, y - h/2);
      ctx.quadraticCurveTo(x + w/2, y - h/2, x + w/2, y - h/2 + r);
      ctx.lineTo(x + w/2, y + h/2 - r);
      ctx.quadraticCurveTo(x + w/2, y + h/2, x + w/2 - r, y + h/2);
      ctx.lineTo(x - w/2 + r, y + h/2);
      ctx.quadraticCurveTo(x - w/2, y + h/2, x - w/2, y + h/2 - r);
      ctx.lineTo(x - w/2, y - h/2 + r);
      ctx.quadraticCurveTo(x - w/2, y - h/2, x - w/2 + r, y - h/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    // Right Plate (sticker.003) sits at X ~ 680, Y ~ 1024
    drawBackgroundPlate(680, 1024, 380, 520);
    // Left Plate (sticker.002) sits at X ~ 1180, Y ~ 1024
    drawBackgroundPlate(1180, 1024, 380, 520);
    // Front Plate sits at X ~ 512, Y ~ 1536
    drawBackgroundPlate(512, 1536, 400, 480);

    // Helper: draw text according to coordinate sliders
    const drawPlateRiderText = (p) => {
      const fontFamily = fontMap[p.font] || fontMap.bebas;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.scale(p.stretchH, p.stretchV);
      
      ctx.font = `bold ${p.fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      if (ctx.letterSpacing !== undefined) {
        ctx.letterSpacing = (p.letterSpacing * p.fontSize) + 'px';
      }
      
      const num = p.number || '';
      
      if (p.strokeWidth > 0) {
        ctx.lineWidth = p.strokeWidth;
        ctx.strokeStyle = p.strokeColor;
        ctx.strokeText(num, 0, 0);
      }
      
      ctx.fillStyle = p.color;
      ctx.fillText(num, 0, 0);
      ctx.restore();
    };

    // Draw active plates text
    drawPlateRiderText(state.plates.front);
    drawPlateRiderText(state.plates.left);
    drawPlateRiderText(state.plates.right);

    // Draw Sponsor Logo if selected (e.g. top-left quadrant)
    if (state.logoImage) {
      const logoW = tileW * 0.35;
      const logoH = logoW * 0.6;
      ctx.drawImage(state.logoImage, tileW * 0.1, tileH * 0.1, logoW, logoH);
      ctx.drawImage(state.logoImage, tileW * 1.1, tileH * 0.1, logoW, logoH);
    }

    this.decalTexture.needsUpdate = true;

    // Mirror decalCanvas to the 2D layout preview panel in top right
    const previewCanvas = document.getElementById('layout-preview-canvas');
    if (previewCanvas) {
      const previewCtx = previewCanvas.getContext('2d');
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.drawImage(this.decalCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
    }
  }

  setRiderName(name) {
    state.riderName = name;
    this._redrawDecal();
  }

  setRiderNumber(num) {
    state.riderNumber = num;
    this._redrawDecal();
  }

  setFont(fontId) {
    state.nameFont = fontId;
    this._redrawDecal();
  }

  setNameColor(hex) {
    state.nameColor = hex;
    this._redrawDecal();
  }

  setNumberColor(hex) {
    state.numberColor = hex;
    this._redrawDecal();
  }

  setLogo(logoOption) {
    state.logo = logoOption.id;
    if (!logoOption.file) {
      state.logoImage = null;
      this._redrawDecal();
      return;
    }
    const img = new Image();
    img.onload = () => {
      state.logoImage = img;
      this._redrawDecal();
    };
    img.src = logoOption.file;
  }

  captureScreenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/jpeg', 0.85);
  }

  setCameraView(view) {
    const targets = {
      front:  { pos: [1.5, 0.5, 0.5], tgt: [0, 0.3, 0] },
      rear:   { pos: [-1.5, 0.5, 0.5], tgt: [0, 0.3, 0] },
      top:    { pos: [0, 2.5, 0.1], tgt: [0, 0.3, 0] },
      side:   { pos: [0, 0.5, 2.5], tgt: [0, 0.3, 0] },
    };
    const t = targets[view];
    if (!t) return;
    this.camera.position.set(...t.pos);
    this.controls.target.set(...t.tgt);
    this.controls.update();
  }

  resetCamera() {
    if (!state.modelConfig) return;
    const pos = state.modelConfig.cameraPosition || [0, 0.6, 2.8];
    const tgt = state.modelConfig.cameraTarget || [0, 0.3, 0];
    this.camera.position.set(...pos);
    this.controls.target.set(...tgt);
    this.controls.update();
  }
}

async function selectModel(modelId) {
  const modelConfig = MODELS_CONFIG.models.find(m => m.id === modelId);
  if (!modelConfig) return;

  state.modelId = modelId;
  state.modelConfig = modelConfig;

  // Set price in left badge
  const priceEl = document.getElementById('price-value');
  if (priceEl) {
    priceEl.textContent = modelConfig.currency + ' ' + modelConfig.price.toLocaleString();
  }
  // Update model name in left badge
  const badgeName = document.getElementById('product-model-name');
  if (badgeName) badgeName.textContent = modelConfig.name;

  // Load 3D model
  setLoadingProgress(10, 'Loading model…');
  
  // If personalization gate is hidden, show overlay, otherwise do it silently
  const gate = document.getElementById('gate-container');
  const isGateVisible = gate && !gate.classList.contains('hidden');
  if (!isGateVisible) {
    showLoadingOverlay(true);
  }

  await configurator.loadModel(modelConfig, (pct) => {
    setLoadingProgress(pct, pct < 90 ? 'Downloading 3D model…' : 'Setting up materials…');
  });

  setLoadingProgress(100, 'Ready!');
  if (!isGateVisible) {
    setTimeout(() => showLoadingOverlay(false), 400);
  }

  showToast('🏍 ' + modelConfig.name + ' loaded', 'success');
}

/* ============================================================
   BOTTOM WINDOW CUSTOM DYNAMIC BUILDERS
   ============================================================ */

function switchBottomTab(tabId) {
  document.querySelectorAll('.bottom-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  const contentArea = document.getElementById('drawer-content-area');
  if (!contentArea) return;
  
  if (tabId === 'logos') {
    renderLogosDrawer(contentArea);
  } else if (tabId === 'rider-id') {
    renderRiderIDDrawer(contentArea);
  } else if (tabId === 'materials') {
    renderMaterialsDrawer(contentArea);
  } else if (tabId === 'plate') {
    renderPlateDrawer(contentArea);
  } else if (tabId === 'kit') {
    renderKitDrawer(contentArea);
  } else if (tabId === 'bike') {
    renderBikeDrawer(contentArea);
  }
}

function renderLogosDrawer(container) {
  container.innerHTML = `
    <div class="drawer-panel">
      <div class="drawer-hd">
        <span class="drawer-title">Select Sponsor Logo</span>
      </div>
      <div class="logos-grid-container">
        ${MODELS_CONFIG.logoOptions.map(l => `
          <div class="logo-option-card ${state.logo === l.id ? 'selected' : ''}" data-id="${l.id}">
            ${l.file ? `<img src="${l.file}" alt="${l.name}" class="logo-option-img" onerror="this.style.display='none'">` : `
              <svg style="width:20px;height:20px;margin-bottom:6px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            `}
            <span class="logo-option-name">${l.name}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  container.querySelectorAll('.logo-option-card').forEach(card => {
    card.addEventListener('click', () => {
      const logoId = card.dataset.id;
      const logoOption = MODELS_CONFIG.logoOptions.find(l => l.id === logoId);
      if (logoOption) {
        configurator.setLogo(logoOption);
        renderLogosDrawer(container);
      }
    });
  });
}

let editPlateMode = null;

function renderRiderIDDrawer(container) {
  if (editPlateMode) {
    renderEditPlateDrawer(container, editPlateMode);
    return;
  }
  
  container.innerHTML = `
    <div class="drawer-panel">
      <div class="drawer-hd">
        <span class="drawer-title">Personalize Your Rider ID Plates</span>
      </div>
      <div class="sub-tabs-container" style="margin-top: 10px">
        <div class="sub-tab-card" data-plate="front">
          <div class="sub-tab-skew"></div>
          <span class="sub-tab-label">FRONT</span>
          <span class="sub-tab-preview">${state.plates.front.number || '—'}</span>
        </div>
        <div class="sub-tab-card" data-plate="left">
          <div class="sub-tab-skew"></div>
          <span class="sub-tab-label">LEFT</span>
          <span class="sub-tab-preview">${state.plates.left.number || '—'}</span>
        </div>
        <div class="sub-tab-card" data-plate="right">
          <div class="sub-tab-skew"></div>
          <span class="sub-tab-label">RIGHT</span>
          <span class="sub-tab-preview">${state.plates.right.number || '—'}</span>
        </div>
      </div>
    </div>
  `;
  
  container.querySelectorAll('.sub-tab-card').forEach(card => {
    card.addEventListener('click', () => {
      editPlateMode = card.dataset.plate;
      state.activePlate = editPlateMode;
      renderRiderIDDrawer(container);
    });
  });
}

function renderEditPlateDrawer(container, plateId) {
  const p = state.plates[plateId];
  const colors = [
    { name: 'White', hex: '#FFFFFF' },
    { name: 'Black', hex: '#000000' },
    { name: 'Yellow', hex: '#D4FF00' },
    { name: 'Red', hex: '#FF2233' },
    { name: 'Blue', hex: '#0066FF' },
    { name: 'Orange', hex: '#FF6600' },
    { name: 'Gold', hex: '#FFD700' },
    { name: 'Silver', hex: '#AAAAAA' }
  ];
  
  container.innerHTML = `
    <div class="drawer-panel">
      <div class="drawer-hd">
        <button class="drawer-back-btn" id="btn-plate-back" aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12,19 5,12 12,5"></polyline>
          </svg>
        </button>
        <span class="drawer-title">EDIT ${plateId.toUpperCase()} RIDER NUMBER</span>
      </div>

      <div class="sliders-grid">
        <!-- LEFT COLUMN -->
        <div class="slider-column">
          <div class="edit-form-row">
            <div class="edit-input-group">
              <label class="edit-label">Number</label>
              <input type="text" id="plate-num-input" class="edit-input-field" value="${p.number}" maxlength="4" style="width: 80px">
            </div>
            
            <div class="edit-input-group">
              <label class="edit-label">Number Font</label>
              <select id="plate-font-select" class="font-dropdown-field" style="width: 140px">
                ${MODELS_CONFIG.fontOptions.map(f => `<option value="${f.id}" ${p.font === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="edit-form-row" style="margin-top: 4px">
            <div class="edit-input-group">
              <label class="edit-label">Filled Color</label>
              <div class="swatches-row">
                ${colors.map(c => `<div class="swatch-circle ${p.color === c.hex ? 'selected' : ''}" data-color="${c.hex}" data-type="color" style="background: ${c.hex}"></div>`).join('')}
              </div>
            </div>
            <div class="edit-input-group" style="margin-left: 10px">
              <label class="edit-label">Stroke Color</label>
              <div class="swatches-row">
                ${colors.map(c => `<div class="swatch-circle ${p.strokeColor === c.hex ? 'selected' : ''}" data-color="${c.hex}" data-type="stroke" style="background: ${c.hex}"></div>`).join('')}
              </div>
            </div>
          </div>

          <div class="edit-form-row" style="margin-top: 6px">
            <button class="gate-btn skip" id="btn-plate-apply-all" style="padding: 5px 16px; font-size: 9px; min-width: auto; transform: skewX(-10deg); border-width: 1.5px;">Apply To All</button>
          </div>

          <!-- Letter Spacing slider -->
          <div class="control-row" style="margin-top: 4px">
            <span class="control-label">Letter Spacing</span>
            <div class="slider-wrapper">
              <input type="range" class="slider-input plate-slider" data-prop="letterSpacing" min="-0.1" max="0.3" step="0.01" value="${p.letterSpacing}">
              <span class="slider-value">${p.letterSpacing.toFixed(2)}</span>
            </div>
          </div>
          <!-- Stroke Width slider -->
          <div class="control-row">
            <span class="control-label">Stroke Width</span>
            <div class="slider-wrapper">
              <input type="range" class="slider-input plate-slider" data-prop="strokeWidth" min="0" max="20" step="1" value="${p.strokeWidth}">
              <span class="slider-value">${p.strokeWidth}</span>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="slider-column">
          <div class="control-row">
            <span class="control-label">X Position</span>
            <div class="slider-wrapper">
              <input type="range" class="slider-input plate-slider" data-prop="x" min="0" max="2048" step="5" value="${p.x}">
              <span class="slider-value">${Math.round(p.x)}</span>
            </div>
          </div>
          <div class="control-row">
            <span class="control-label">Y Position</span>
            <div class="slider-wrapper">
              <input type="range" class="slider-input plate-slider" data-prop="y" min="0" max="2048" step="5" value="${p.y}">
              <span class="slider-value">${Math.round(p.y)}</span>
            </div>
          </div>
          <div class="control-row">
            <span class="control-label">Font Size</span>
            <div class="slider-wrapper">
              <input type="range" class="slider-input plate-slider" data-prop="fontSize" min="50" max="600" step="5" value="${p.fontSize}">
              <span class="slider-value">${Math.round(p.fontSize)}</span>
            </div>
          </div>
          <div class="control-row">
            <span class="control-label">Rotation</span>
            <div class="slider-wrapper">
              <input type="range" class="slider-input plate-slider" data-prop="rotation" min="-180" max="180" step="2" value="${p.rotation}">
              <span class="slider-value">${p.rotation}°</span>
            </div>
          </div>
          <div class="control-row">
            <span class="control-label">Horizontal Stretch</span>
            <div class="slider-wrapper">
              <input type="range" class="slider-input plate-slider" data-prop="stretchH" min="0.3" max="2.5" step="0.05" value="${p.stretchH}">
              <span class="slider-value">${p.stretchH.toFixed(2)}</span>
            </div>
          </div>
          <div class="control-row">
            <span class="control-label">Vertical Stretch</span>
            <div class="slider-wrapper">
              <input type="range" class="slider-input plate-slider" data-prop="stretchV" min="0.3" max="2.5" step="0.05" value="${p.stretchV}">
              <span class="slider-value">${p.stretchV.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-plate-back').addEventListener('click', () => {
    editPlateMode = null;
    renderRiderIDDrawer(container);
  });

  const numInput = container.querySelector('#plate-num-input');
  numInput.addEventListener('input', (e) => {
    p.number = e.target.value;
    state.riderNumber = e.target.value;
    configurator._redrawDecal();
  });

  const fontSelect = container.querySelector('#plate-font-select');
  fontSelect.addEventListener('change', (e) => {
    p.font = e.target.value;
    configurator._redrawDecal();
  });

  container.querySelectorAll('.swatch-circle').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const type = swatch.dataset.type;
      const color = swatch.dataset.color;
      if (type === 'color') {
        p.color = color;
      } else {
        p.strokeColor = color;
      }
      renderEditPlateDrawer(container, plateId);
      configurator._redrawDecal();
    });
  });

  container.querySelector('#btn-plate-apply-all').addEventListener('click', () => {
    Object.keys(state.plates).forEach(key => {
      state.plates[key].number = p.number;
      state.plates[key].font = p.font;
      state.plates[key].color = p.color;
      state.plates[key].strokeColor = p.strokeColor;
    });
    configurator._redrawDecal();
    showToast('✦ Applied rider configuration to all plates', 'success');
  });

  container.querySelectorAll('.plate-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const prop = slider.dataset.prop;
      const val = parseFloat(slider.value);
      p[prop] = val;
      
      let displayVal = val;
      if (prop === 'rotation') displayVal = val + '°';
      else if (prop === 'stretchH' || prop === 'stretchV' || prop === 'letterSpacing') displayVal = val.toFixed(2);
      else displayVal = Math.round(displayVal);
      
      slider.closest('.slider-wrapper').querySelector('.slider-value').textContent = displayVal;
      configurator._redrawDecal();
    });
  });
}

function renderMaterialsDrawer(container) {
  container.innerHTML = `
    <div class="drawer-panel">
      <div class="drawer-hd">
        <span class="drawer-title">Print Base & Lamination Options</span>
      </div>
      <div class="materials-columns" style="margin-top: 8px">
        <!-- PRINT BASE -->
        <div class="material-column">
          <div class="materials-section-title">PRINT BASE</div>
          <div class="materials-grid">
            ${(state.modelConfig?.printBases || ['Standard White', 'Silver Chrome', 'Holographic Chrome']).map(b => `
              <div class="material-card ${state.printBase === b ? 'selected' : ''}" data-base="${b}">
                <div class="material-card-icon">🧻</div>
                <div class="material-card-name">${b}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <!-- LAMINATION -->
        <div class="material-column">
          <div class="materials-section-title">LAMINATION</div>
          <div class="materials-grid">
            ${(state.modelConfig?.laminates || ['Standard Gloss', 'Matte', 'Gloss (SPARKLY) Holo']).map(l => `
              <div class="material-card ${state.laminate === l ? 'selected' : ''}" data-lam="${l}">
                <div class="material-card-icon">🛡️</div>
                <div class="material-card-name">${l}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
  
  container.querySelectorAll('[data-base]').forEach(card => {
    card.addEventListener('click', () => {
      state.printBase = card.dataset.base;
      renderMaterialsDrawer(container);
      updateSummary();
      showToast('✓ Base material: ' + state.printBase, 'success');
    });
  });
  
  container.querySelectorAll('[data-lam]').forEach(card => {
    card.addEventListener('click', () => {
      state.laminate = card.dataset.lam;
      renderMaterialsDrawer(container);
      updateSummary();
      showToast('✓ Lamination: ' + state.laminate, 'success');
    });
  });
}

function renderPlateDrawer(container) {
  container.innerHTML = `
    <div class="drawer-panel">
      <div class="drawer-hd">
        <span class="drawer-title">Plate Styling & Details</span>
      </div>
      <p class="panel-hint" style="font-size:11px;color:var(--text-muted);margin-top:4px">Quick styles to customize background plate designs.</p>
      <div class="presets-grid" style="margin-top:10px">
        <div class="preset-swatch-card" id="btn-plate-style-1">
          <div class="preset-swatch-color" style="background:#ffffff"></div>
          <span class="preset-swatch-name">Clean White (Standard)</span>
        </div>
        <div class="preset-swatch-card" id="btn-plate-style-2">
          <div class="preset-swatch-color" style="background:#000000"></div>
          <span class="preset-swatch-name">Carbon Stealth</span>
        </div>
      </div>
    </div>
  `;
  
  container.querySelector('#btn-plate-style-1').addEventListener('click', () => {
    Object.keys(state.plates).forEach(k => {
      state.plates[k].strokeColor = '#ffffff';
      state.plates[k].color = '#000000';
    });
    configurator._redrawDecal();
    showToast('✓ Clean White Plate Style applied', 'success');
  });
  
  container.querySelector('#btn-plate-style-2').addEventListener('click', () => {
    Object.keys(state.plates).forEach(k => {
      state.plates[k].strokeColor = '#000000';
      state.plates[k].color = '#D4FF00';
    });
    configurator._redrawDecal();
    showToast('✓ Carbon Stealth Plate Style applied', 'success');
  });
}

function renderKitDrawer(container) {
  container.innerHTML = `
    <div class="drawer-panel">
      <div class="drawer-hd">
        <span class="drawer-title">Customize Graphic Kit Components</span>
      </div>
      <div class="materials-columns" style="margin-top:8px">
        <div class="material-column">
          <div class="materials-section-title">Kit Variant Options</div>
          <div class="control-row">
            <span class="control-label">Year</span>
            <select id="select-year" class="font-dropdown-field" style="width: 140px">
              ${(state.modelConfig?.years || ['2025', '2024', '2023']).map(y => `<option value="${y}" ${state.year === y ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </div>
          <div class="control-row" style="margin-top:8px">
            <span class="control-label">Plastics Style</span>
            <select id="select-plastics" class="font-dropdown-field" style="width: 140px">
              ${(state.modelConfig?.plastics || ['Stock OEM', 'Race Cut', 'Wide Vent']).map(p => `<option value="${p}" ${state.plastics === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>
        
        <div class="material-column">
          <div class="materials-section-title">Front Fender & Rims</div>
          <div class="control-row">
            <span class="control-label">Front Fender</span>
            <select id="select-fender" class="font-dropdown-field" style="width: 140px">
              ${(state.modelConfig?.frontFenders || ['Standard', 'MX Vent', 'Shorty']).map(f => `<option value="${f}" ${state.frontFender === f ? 'selected' : ''}>${f}</option>`).join('')}
            </select>
          </div>
          <div class="control-row" style="margin-top:8px">
            <span class="control-label">Rims Graphics</span>
            <select id="select-wheels" class="font-dropdown-field" style="width: 140px">
              ${(state.modelConfig?.wheelsGraphics || ['No Decals', 'Brand Accent', 'Full Wrap']).map(w => `<option value="${w}" ${state.wheelsGraphics === w ? 'selected' : ''}>${w}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    </div>
  `;
  
  container.querySelector('#select-year').addEventListener('change', (e) => {
    state.year = e.target.value;
    updateSummary();
  });
  container.querySelector('#select-plastics').addEventListener('change', (e) => {
    state.plastics = e.target.value;
    updateSummary();
  });
  container.querySelector('#select-fender').addEventListener('change', (e) => {
    state.frontFender = e.target.value;
    updateSummary();
  });
  container.querySelector('#select-wheels').addEventListener('change', (e) => {
    state.wheelsGraphics = e.target.value;
    updateSummary();
  });
}

function renderBikeDrawer(container) {
  container.innerHTML = `
    <div class="drawer-panel">
      <div class="drawer-hd">
        <span class="drawer-title">Model Colors & Presets</span>
      </div>
      
      <div class="materials-columns" style="margin-top: 8px">
        <div class="material-column">
          <div class="materials-section-title">Color Presets</div>
          <div class="presets-grid" style="flex-wrap: wrap; max-height: 120px; overflow-y: auto;">
            ${COLOR_PRESETS.presets.map(p => `
              <div class="preset-swatch-card" data-preset-id="${p.id}" style="${state.presetId === p.id ? 'border-color: #000;' : ''}">
                <div class="preset-swatch-color" style="background: ${p.thumbnail}"></div>
                <span class="preset-swatch-name">${p.name}</span>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="material-column">
          <div class="materials-section-title">Custom Zone Colors</div>
          <div class="color-picker-grid" style="max-height: 120px; overflow-y: auto;">
            ${(state.modelConfig?.colorZones || []).map(z => {
              const col = state.colors[z.id] || z.default;
              return `
                <div class="color-picker-card" data-zone-id="${z.id}">
                  <input type="color" class="custom-picker-input" id="zone-picker-${z.id}" value="${col}">
                  <div class="color-picker-details">
                    <span class="color-picker-zone-name">${z.name}</span>
                    <span class="color-picker-hex-val" id="zone-hex-${z.id}">${col.toUpperCase()}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
  
  container.querySelectorAll('[data-preset-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.presetId;
      const preset = COLOR_PRESETS.presets.find(p => p.id === id);
      if (preset) {
        configurator.applyPreset(preset);
        renderBikeDrawer(container);
        showToast('✦ Applied preset: ' + preset.name, 'success');
      }
    });
  });
  
  container.querySelectorAll('.color-picker-card').forEach(card => {
    const zoneId = card.dataset.zoneId;
    const input = card.querySelector(`#zone-picker-${zoneId}`);
    const hexEl = card.querySelector(`#zone-hex-${zoneId}`);
    
    input.addEventListener('input', (e) => {
      const hex = e.target.value;
      hexEl.textContent = hex.toUpperCase();
      configurator.setZoneColor(zoneId, hex);
    });
  });
}

/* ============================================================
   VIEWER CONTROLS
   ============================================================ */
function setupViewerControls() {
  document.getElementById('btn-reset-cam')?.addEventListener('click', () => configurator.resetCamera());
  
  document.getElementById('btn-toggle-grid')?.addEventListener('click', () => {
    if (configurator.grid) {
      configurator.grid.visible = !configurator.grid.visible;
      showToast(configurator.grid.visible ? '✓ Grid enabled' : '✗ Grid disabled', 'info');
    }
  });

  document.getElementById('btn-toggle-rotate')?.addEventListener('click', () => {
    configurator.controls.autoRotate = !configurator.controls.autoRotate;
    showToast(configurator.controls.autoRotate ? '✓ Auto-rotate active' : '✗ Auto-rotate paused', 'info');
  });

  document.getElementById('btn-screenshot')?.addEventListener('click', () => {
    const url = configurator.captureScreenshot();
    const a = document.createElement('a');
    a.href = url;
    a.download = '4d-design-config.jpg';
    a.click();
    showToast('📸 Screenshot saved', 'success');
  });

  // Top-Right layout preview actions
  document.getElementById('btn-layout-reset')?.addEventListener('click', () => {
    configurator.resetCamera();
    showToast('✓ 3D View reset', 'info');
  });
  document.getElementById('btn-layout-focus')?.addEventListener('click', () => {
    configurator.setCameraView('side');
    showToast('✓ Camera focused on plates', 'info');
  });
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

/* ============================================================
   SHOPIFY CART INTEGRATION
   ============================================================ */
async function addToCart() {
  const btn = document.getElementById('btn-add-cart');
  if (!btn || !state.modelConfig) return;

  btn.classList.add('loading');

  let previewDataUrl = '';
  try { previewDataUrl = configurator.captureScreenshot(); } catch(e) {}

  const properties = {
    'Year': state.year || '',
    'Plastics': state.plastics || '',
    'Front Fender': state.frontFender || '',
    'Print Base': state.printBase || '',
    'Laminate': state.laminate || '',
    'Wheels Graphics': state.wheelsGraphics || '',
    'Rider Number (Front)': state.plates.front.number || '',
    'Rider Number (Left)': state.plates.left.number || '',
    'Rider Number (Right)': state.plates.right.number || '',
    'Logo': state.logo || 'None',
    ...Object.fromEntries(
      (state.modelConfig?.colorZones || []).map(z => [z.name + ' Color', state.colors[z.id] || z.default])
    ),
  };

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const variantId = urlParams.get('variant') || state.modelConfig.shopifyVariantId;

    await window.shopifyCartIntegration.addToCart({
      variantId: variantId,
      quantity: 1,
      properties,
      previewDataUrl,
    });
    if (window.parent === window) {
      btn.classList.remove('loading');
    }
  } catch (err) {
    showToast('⚠ Could not add to cart: ' + err.message, 'error');
    btn.classList.remove('loading');
  }
}

/* ============================================================
   APP BOOTSTRAP
   ============================================================ */
let configurator;

async function init() {
  const canvas = document.getElementById('three-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    document.getElementById('webgl-error')?.classList.add('visible');
    document.getElementById('loading-screen')?.classList.add('hidden');
    return;
  }

  // Load configuration files
  await loadConfigs();

  // Instantiate 3D configurator class
  configurator = new MotorcycleConfigurator(canvas);
  configurator.init();
  window._configuratorEngine = configurator;

  // Setup viewer buttons
  setupViewerControls();

  // Bind cart submit button
  document.getElementById('btn-add-cart')?.addEventListener('click', addToCart);

  // Close success modal button
  document.getElementById('modal-close')?.addEventListener('click', () => {
    document.getElementById('success-modal')?.classList.add('hidden');
  });

  // Summary loop updater
  setInterval(() => {
    if (state.modelId) updateSummary();
  }, 2000);

  // Pre-load the first model in the background as soon as we start
  if (MODELS_CONFIG.models.length > 0) {
    const defaultModel = MODELS_CONFIG.models[0];
    selectModel(defaultModel.id);
  }

  // Set up Personalization Gate welcome screen buttons
  const gateNextBtn = document.getElementById('gate-next-btn');
  const gateSkipBtn = document.getElementById('gate-skip-btn');
  const gateBackBtn = document.querySelector('.gate-back-btn');

  const transitionToCustomizer = () => {
    // Collect gate values
    const nameVal = document.getElementById('gate-rider-name').value;
    const numVal = document.getElementById('gate-rider-number').value;

    if (numVal) {
      Object.keys(state.plates).forEach(k => {
        state.plates[k].number = numVal;
      });
      state.riderNumber = numVal;
    }
    if (nameVal) {
      state.riderName = nameVal;
    }

    configurator._redrawDecal();

    // Hide personalization page
    document.getElementById('gate-container').classList.add('hidden');

    if (configurator.isLoading) {
      // If 3D model is still downloading, show loading screen
      document.getElementById('loading-screen').classList.remove('hidden');
      const checkLoaded = setInterval(() => {
        if (!configurator.isLoading) {
          clearInterval(checkLoaded);
          document.getElementById('loading-screen').classList.add('hidden');
          document.getElementById('app').classList.remove('hidden');
          switchBottomTab('rider-id'); // show RIDER ID drawer first
        }
      }, 100);
    } else {
      document.getElementById('app').classList.remove('hidden');
      switchBottomTab('rider-id'); // show RIDER ID drawer first
    }
  };

  gateNextBtn?.addEventListener('click', transitionToCustomizer);
  gateSkipBtn?.addEventListener('click', transitionToCustomizer);
  gateBackBtn?.addEventListener('click', () => {
    // If embedded, send a postMessage to parent store
    window.parent.postMessage({ type: '4d:back' }, '*');
  });

  // Bind Bottom Tab Category Navigation
  document.querySelectorAll('.bottom-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      editPlateMode = null; // reset edit sub-panel
      switchBottomTab(tabId);
    });
  });
}

function updateSummary() {
  // Summary structure is checked during Shopify add-to-cart mapping
}

function showLoadingOverlay(visible) {
  const overlay = document.getElementById('viewer-loading');
  if (overlay) overlay.style.display = visible ? 'flex' : 'none';
}

function setLoadingProgress(pct, label) {
  const bar = document.getElementById('loading-bar-fill');
  const txt = document.getElementById('loading-pct');
  const lbl = document.getElementById('loading-label');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = pct + '%';
  if (lbl) lbl.textContent = label || '';
}

// Start
init().catch(console.error);
