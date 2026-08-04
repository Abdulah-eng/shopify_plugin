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
  year: null,
  plastics: null,
  frontFender: null,
  printBase: null,
  laminate: null,
  wheelsGraphics: null,
  colors: {},           // { zoneId: hexColor }
  riderName: '',
  riderNumber: '',
  nameColor: '#FFFFFF',
  numberColor: '#FFFFFF',
  nameFont: 'bebas',
  logo: 'none',
  presetId: null,
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
    // Light background
    this.scene.background = new THREE.Color(0xF0F2F5);
    this.scene.fog = new THREE.FogExp2(0xF0F2F5, 0.05);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xE4E6EB,
      roughness: 0.85,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid helper
    const grid = new THREE.GridHelper(12, 24, 0xC0C4CC, 0xD0D3DA);
    grid.position.y = 0;
    this.scene.add(grid);

    // Reflective circle under bike
    const circleGeo = new THREE.CircleGeometry(1.4, 64);
    const circleMat = new THREE.MeshStandardMaterial({
      color: 0xDDDFE5,
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
    // Ambient — brighter for light theme
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);

    // Key light (neutral white)
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
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

    // Fill light (cool)
    const fill = new THREE.DirectionalLight(0xe8eeff, 0.7);
    fill.position.set(-4, 2, -2);
    this.scene.add(fill);

    // Rim light (subtle accent)
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
    updateAutoRotateBadge(false);
    clearTimeout(this.autoRotateTimer);
    this.autoRotateTimer = setTimeout(() => {
      this.controls.autoRotate = true;
      updateAutoRotateBadge(true);
    }, 5000);
  }

  _setupDecalCanvas() {
    this.decalCanvas = document.createElement('canvas');
    this.decalCanvas.width = 1024;
    this.decalCanvas.height = 512;
    this.decalCtx = this.decalCanvas.getContext('2d');
    this.decalTexture = new THREE.CanvasTexture(this.decalCanvas);
    this.decalTexture.colorSpace = THREE.SRGBColorSpace;
  }

  _setupResizeObserver() {
    const ro = new ResizeObserver(() => this._onResize());
    ro.observe(this.canvas.parentElement);
  }

  _onResize() {
    const w = this.canvas.offsetWidth;
    const h = this.canvas.offsetHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    this.animFrameId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /* ----- MODEL LOADING ----- */
  async loadModel(modelConfig, onProgress) {
    if (this.isLoading) return;
    this.isLoading = true;

    // Remove existing model
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      this.model = null;
      this.meshMap = {};
      this.zoneMaterials = {};
    }

    // Try loading GLB
    const glbLoaded = await this._tryLoadGLB(modelConfig, onProgress);
    if (!glbLoaded) {
      // Fall back to procedural placeholder
      this._createPlaceholderBike(modelConfig);
      onProgress && onProgress(100);
    }

    // Apply initial colors
    state.colors = {};
    modelConfig.colorZones.forEach(zone => {
      state.colors[zone.id] = zone.default;
    });
    this._applyAllColors();
    this._redrawDecal();

    this.isLoading = false;
  }

  async _tryLoadGLB(modelConfig, onProgress) {
    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/');
      loader.setDRACOLoader(draco);

      loader.load(
        modelConfig.glb,
        (gltf) => {
          this.model = gltf.scene;
          this.model.scale.setScalar(modelConfig.scale || 1);

          // Center model
          const box = new THREE.Box3().setFromObject(this.model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          this.model.position.sub(center);
          this.model.position.y += size.y / 2;

          // Map meshes, set up materials
          this.model.traverse(obj => {
            const objName = (obj.name || '').toLowerCase();
            
            // Hide other vehicles (KTM, Husqvarna, YZF dirt bike) and floating duplicate parts
            if (modelConfig.id === 'yfz450r') {
              const isToHide = (
                objName === 'frame_chrome_f18' ||
                objName === 'yamaha_f' ||
                objName === 'handlebar_chrome00' ||
                objName === 'handles00' ||
                objName === 'handles01' ||
                objName === 'red_part' ||
                objName.includes('yamaha_yzf_450_2020.001') ||
                objName.includes('yamaha_yzf_450_2020.002') ||
                objName.includes('yamaha_yzf_450_2020.003') ||
                objName.includes('yamaha_yzf_450_2020.005') ||
                objName.includes('husqvarna') || 
                objName.includes('ktm') || 
                objName.includes('rim_second') ||
                objName === 'plano' ||
                objName === 'plane' ||
                (objName.startsWith('plane.') && !objName.includes('.006') && !objName.includes('.007') && !objName.includes('.008') && !objName.includes('.009')) ||
                objName.includes('render.') ||
                objName.includes('cylinder') ||
                objName.includes('circle') ||
                objName.includes('cube') ||
                objName.includes('bolt') ||
                objName.includes('hex nut') ||
                (objName.startsWith('black_tubes_handlebar') && !objName.includes('.00'))
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

              // Upgrade material to physical
              const oldMat = obj.material;
              obj.material = new THREE.MeshPhysicalMaterial({
                color: oldMat.color || new THREE.Color(0xffffff),
                map: oldMat.map || null,
                normalMap: oldMat.normalMap || null,
                roughness: oldMat.roughness !== undefined ? oldMat.roughness : 0.5,
                metalness: oldMat.metalness !== undefined ? oldMat.metalness : 0.3,
                clearcoat: 0.5,
                clearcoatRoughness: 0.1,
              });

              // Map zone to mesh (supporting substring and array matches)
              const matchedZones = modelConfig.colorZones.filter(z => {
                if (Array.isArray(z.meshName)) {
                  return z.meshName.some(name => obj.name.toLowerCase().includes(name.toLowerCase()));
                }
                return obj.name.toLowerCase().includes(z.meshName.toLowerCase());
              });

              matchedZones.forEach(zone => {
                if (!this.zoneMaterials[zone.id]) {
                  this.zoneMaterials[zone.id] = [];
                }
                this.zoneMaterials[zone.id].push(obj.material);
              });

              // Decal mesh (supporting substring and array matches)
              let isDecal = false;
              if (Array.isArray(modelConfig.decalMesh)) {
                isDecal = modelConfig.decalMesh.some(name => obj.name.toLowerCase().includes(name.toLowerCase()));
              } else if (modelConfig.decalMesh) {
                isDecal = obj.name.toLowerCase().includes(modelConfig.decalMesh.toLowerCase());
              }

              if (isDecal) {
                obj.material = new THREE.MeshStandardMaterial({
                  map: this.decalTexture,
                  transparent: true,
                  roughness: 0.6,
                  metalness: 0.1,
                });
              }
            }
          });

          this.scene.add(this.model);

          // Camera positioning
          const target = new THREE.Vector3(...(modelConfig.cameraTarget || [0, 0.3, 0]));
          this.controls.target.copy(target);
          this.camera.position.set(...(modelConfig.cameraPosition || [0, 0.6, 2.8]));
          this.controls.update();

          resolve(true);
        },
        (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 90));
          }
        },
        () => {
          // GLB not found – resolve false to trigger placeholder
          resolve(false);
        }
      );
    });
  }

  _createPlaceholderBike(modelConfig) {
    const group = new THREE.Group();

    // ---- Shared materials pool ----
    const bodyMat = () => new THREE.MeshPhysicalMaterial({
      color: 0x0a0a0a, roughness: 0.4, metalness: 0.4,
      clearcoat: 0.8, clearcoatRoughness: 0.15,
    });
    const chromeMat = new THREE.MeshPhysicalMaterial({
      color: 0xcccccc, roughness: 0.1, metalness: 0.95,
      clearcoat: 1, clearcoatRoughness: 0.05,
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.85, metalness: 0.05,
    });
    const rimMat = new THREE.MeshPhysicalMaterial({
      color: 0x888888, roughness: 0.2, metalness: 0.9,
      clearcoat: 0.8,
    });
    const graphicMat = new THREE.MeshStandardMaterial({
      color: 0xD4FF00, roughness: 0.5, metalness: 0.1,
    });

    // Helper
    const mesh = (geo, mat, x=0, y=0, z=0, rx=0, ry=0, rz=0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    // ---- WHEELS ----
    const wheelGeo = new THREE.TorusGeometry(0.32, 0.09, 16, 48);
    const wheelFront = mesh(wheelGeo, tireMat, 0.75, 0.32, 0, Math.PI/2, 0, 0);
    const wheelRear  = mesh(wheelGeo, tireMat, -0.75, 0.32, 0, Math.PI/2, 0, 0);
    group.add(wheelFront, wheelRear);

    // Rims
    const rimGeo = new THREE.TorusGeometry(0.28, 0.02, 8, 32);
    group.add(mesh(rimGeo, rimMat, 0.75, 0.32, 0, Math.PI/2));
    group.add(mesh(rimGeo, rimMat, -0.75, 0.32, 0, Math.PI/2));

    // Spokes
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spokeGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.54, 4);
      const sx = Math.cos(a) * 0.13;
      const sy = Math.sin(a) * 0.13;
      for (const wx of [0.75, -0.75]) {
        const s = mesh(spokeGeo, rimMat, wx, 0.32 + sy, sx, 0, 0, a);
        group.add(s);
      }
    }

    // Axle
    const axleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 12);
    group.add(mesh(axleGeo, chromeMat, 0.75, 0.32, 0, 0, 0, Math.PI/2));
    group.add(mesh(axleGeo, chromeMat, -0.75, 0.32, 0, 0, 0, Math.PI/2));

    // ---- FRAME ----
    const frameMat = bodyMat();
    // Main spine
    const spineGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.55, 8);
    group.add(mesh(spineGeo, frameMat, -0.05, 0.62, 0, 0, 0, -0.18));
    // Down tube
    const dtGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8);
    group.add(mesh(dtGeo, frameMat, 0.38, 0.4, 0, 0, 0, 0.6));
    // Seat rail
    const srGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8);
    group.add(mesh(srGeo, frameMat, -0.5, 0.71, 0, 0, 0, 0.12));
    // Sub frame
    const sfGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.48, 8);
    group.add(mesh(sfGeo, frameMat, -0.78, 0.56, 0, 0, 0, -0.45));

    // ---- ENGINE / BLOCK ----
    const engineMat = new THREE.MeshPhysicalMaterial({
      color: 0x333333, roughness: 0.6, metalness: 0.7,
    });
    const engGeo = new THREE.BoxGeometry(0.32, 0.28, 0.22);
    group.add(mesh(engGeo, engineMat, 0.0, 0.38, 0));
    // Cylinder head
    const cylGeo = new THREE.CylinderGeometry(0.085, 0.09, 0.22, 16);
    group.add(mesh(cylGeo, engineMat, 0.05, 0.62, 0, 0, 0, -0.15));
    // Exhaust pipe
    const pipe1Geo = new THREE.TorusGeometry(0.14, 0.022, 8, 20, Math.PI * 0.6);
    group.add(mesh(pipe1Geo, chromeMat, 0.12, 0.35, 0.12, -Math.PI/2, 0, 1.2));
    const pipe2Geo = new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8);
    group.add(mesh(pipe2Geo, chromeMat, -0.34, 0.3, 0.12, 0, 0, -0.22));
    const mufflerGeo = new THREE.CylinderGeometry(0.042, 0.035, 0.28, 12);
    group.add(mesh(mufflerGeo, chromeMat, -0.56, 0.26, 0.12, 0, 0, -0.15));

    // ---- TANK (colorable) ----
    const tankMat = bodyMat();
    const tankGeo = new THREE.BoxGeometry(0.42, 0.18, 0.22);
    const tank = mesh(tankGeo, tankMat, 0.14, 0.76, 0);
    group.add(tank);
    // Round tank sides
    const tankCapGeo = new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI);
    group.add(mesh(tankCapGeo, tankMat, 0.34, 0.76, 0, 0, 0, 0));

    // ---- FRONT FENDER ----
    const fFenderMat = bodyMat();
    fFenderMat.color.set(0xD4FF00);
    const ffGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.12, 24, 1, true, -Math.PI*0.22, Math.PI*0.44);
    const ff = mesh(ffGeo, fFenderMat, 0.75, 0.32, 0, 0, 0, -Math.PI*0.1);
    group.add(ff);

    // ---- REAR FENDER ----
    const rFenderMat = bodyMat();
    rFenderMat.color.set(0xD4FF00);
    const rfGeo = new THREE.BoxGeometry(0.32, 0.07, 0.18);
    const rf = mesh(rfGeo, rFenderMat, -0.82, 0.72, 0, 0, 0, 0.15);
    group.add(rf);

    // ---- SHROUDS (colorable graphic panels) ----
    const shroudMat = bodyMat();
    // Left shroud
    const sLGeo = new THREE.BoxGeometry(0.32, 0.22, 0.06);
    const shroudL = new THREE.Mesh(sLGeo, shroudMat);
    shroudL.position.set(-0.12, 0.52, 0.13);
    shroudL.castShadow = true;
    group.add(shroudL);
    // Right shroud
    const shroudR = shroudL.clone();
    shroudR.position.z = -0.13;
    group.add(shroudR);

    // Graphics decal on shrouds (accent stripe)
    const stripeGeo = new THREE.BoxGeometry(0.3, 0.04, 0.065);
    const stripeMatL = new THREE.MeshStandardMaterial({
      map: this.decalTexture, transparent: true,
    });
    const stripeL = mesh(stripeGeo, stripeMatL, -0.12, 0.52, 0.133);
    group.add(stripeL);
    this.meshMap['Mesh_GraphicDecal'] = stripeL;

    // ---- SEAT ----
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1a1212, roughness: 0.9 });
    const seatGeo = new THREE.BoxGeometry(0.44, 0.06, 0.16);
    group.add(mesh(seatGeo, seatMat, -0.32, 0.82, 0));

    // ---- SWINGARM ----
    const swingMat = bodyMat();
    const swingGeo = new THREE.BoxGeometry(0.72, 0.05, 0.1);
    group.add(mesh(swingGeo, swingMat, -0.6, 0.32, 0, 0, 0, 0.1));

    // ---- FORK (front) ----
    const forkMat = chromeMat.clone();
    const fork1Geo = new THREE.CylinderGeometry(0.025, 0.025, 0.52, 12);
    group.add(mesh(fork1Geo, forkMat, 0.75, 0.57, 0.06, 0, 0, 0.06));
    group.add(mesh(fork1Geo, forkMat, 0.75, 0.57, -0.06, 0, 0, 0.06));

    // ---- HANDLEBAR ----
    const hbarGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.36, 10);
    group.add(mesh(hbarGeo, chromeMat, 0.6, 0.92, 0, 0, 0, Math.PI/2));
    // Grips
    const gripGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    group.add(mesh(gripGeo, gripMat, 0.6, 0.92, 0.20, 0, 0, Math.PI/2));
    group.add(mesh(gripGeo, gripMat, 0.6, 0.92, -0.20, 0, 0, Math.PI/2));
    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8);
    group.add(mesh(stemGeo, chromeMat, 0.66, 0.82, 0));

    // ---- NUMBER PLATE ----
    const numMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const numGeo = new THREE.BoxGeometry(0.16, 0.14, 0.01);
    const numPlate = mesh(numGeo, numMat, 0.86, 0.58, 0, 0, 0, -0.1);
    group.add(numPlate);
    this.meshMap['Mesh_NumberPlate'] = numPlate;

    // ---- HEADLIGHT ----
    const headlightMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0, metalness: 0,
      transparent: true, opacity: 0.85,
      transmission: 0.5,
    });
    const headGeo = new THREE.SphereGeometry(0.075, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    group.add(mesh(headGeo, headlightMat, 0.95, 0.62, 0, -Math.PI/2, 0, 0));
    // Headlight glow
    const glowLight = new THREE.PointLight(0xffeedd, 1.5, 1.0);
    glowLight.position.set(1.1, 0.65, 0);
    group.add(glowLight);

    // ---- Map zone names to meshes ----
    modelConfig.colorZones.forEach(zone => {
      let targetMesh = null;
      if (zone.id === 'front_fender') targetMesh = ff;
      else if (zone.id === 'rear_fender') targetMesh = rf;
      else if (zone.id === 'tank') targetMesh = tank;
      else if (zone.id === 'shroud_left') targetMesh = shroudL;
      else if (zone.id === 'shroud_right') targetMesh = shroudR;
      else if (zone.id === 'swingarm') targetMesh = group.children.find(c => c.geometry === swingGeo);
      else if (zone.id === 'number_plate') targetMesh = numPlate;
      else if (zone.id === 'hood') targetMesh = tank;
      else if (zone.id === 'side_panels') targetMesh = shroudL;
      else if (zone.id === 'front_bumper') targetMesh = rf;

      if (targetMesh) {
        this.zoneMaterials[zone.id] = targetMesh.material;
        this.meshMap[zone.meshName] = targetMesh;
      }
    });

    // Center group
    group.position.set(0, 0, 0);
    this.model = group;
    this.scene.add(group);
  }

  /* ----- MATERIAL UPDATES ----- */
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
    updateColorPickerUI();
  }

  /* ----- DECAL / CANVAS TEXTURE ----- */
  _redrawDecal() {
    const ctx = this.decalCtx;
    const w = this.decalCanvas.width;
    const h = this.decalCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const fontMap = {
      bebas: "'Bebas Neue', Impact, sans-serif",
      racing: "'Racing Sans One', Impact, sans-serif",
      orbitron: "'Orbitron', sans-serif",
      bangers: "'Bangers', cursive",
      russo: "'Russo One', sans-serif",
    };
    const fontFamily = fontMap[state.nameFont] || fontMap.bebas;

    if (state.modelId === 'yfz450r') {
      // ── YFZ 450R CUSTOM MAPPING ──
      
      // 1. Draw on Side Plates (U: [0.25, 0.42] => X: [255, 429], V: [0.15, 0.85] => Y: [79, 432])
      if (state.riderNumber) {
        ctx.font = `bold 64px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = state.numberColor || '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 5;
        ctx.strokeText(state.riderNumber, 342, 275);
        ctx.fillText(state.riderNumber, 342, 275);
      }
      if (state.riderName) {
        ctx.font = `bold 32px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = state.nameColor || '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 4;
        ctx.strokeText(state.riderName.toUpperCase(), 342, 195);
        ctx.fillText(state.riderName.toUpperCase(), 342, 195);
      }

      // 2. Draw on Front Hood / Nose (U: [0.38, 0.78] => X: [387, 795], V: [0.06, 0.93] => Y: [33, 478])
      if (state.riderNumber) {
        ctx.font = `bold 96px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = state.numberColor || '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 7;
        ctx.strokeText(state.riderNumber, 591, 310);
        ctx.fillText(state.riderNumber, 591, 310);
      }
      if (state.riderName) {
        ctx.font = `bold 44px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = state.nameColor || '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 5;
        ctx.strokeText(state.riderName.toUpperCase(), 591, 205);
        ctx.fillText(state.riderName.toUpperCase(), 591, 205);
      }
      if (state.logoImage) {
        // Draw logo on the front hood (below the number)
        ctx.drawImage(state.logoImage, 541, 370, 100, 70);
        
        // Also draw logo on the side plates (below the number)
        ctx.drawImage(state.logoImage, 302, 335, 80, 56);
      }

    } else {
      // ── DRZ 400SM DEFAULT MAPPING ──
      // Background stripe
      const grd = ctx.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.3, 'rgba(0,0,0,0.6)');
      grd.addColorStop(0.7, 'rgba(0,0,0,0.6)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, h * 0.2, w, h * 0.6);

      // Rider name
      if (state.riderName) {
        ctx.font = `bold 130px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = state.nameColor || '#ffffff';
        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 8;
        ctx.strokeText(state.riderName.toUpperCase(), w * 0.5, h * 0.42);
        ctx.fillText(state.riderName.toUpperCase(), w * 0.5, h * 0.42);
      }

      // Rider number
      if (state.riderNumber) {
        ctx.font = `bold 160px ${fontFamily}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = state.numberColor || '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 10;
        ctx.strokeText(state.riderNumber, w * 0.92, h * 0.68);
        ctx.fillText(state.riderNumber, w * 0.92, h * 0.68);
      }

      // Logo
      if (state.logoImage) {
        ctx.drawImage(state.logoImage, 30, h * 0.2, 120, 120);
      }
    }

    this.decalTexture.needsUpdate = true;
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

  /* ----- SCREENSHOT ----- */
  captureScreenshot() {
    // Force render, grab data URL
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/jpeg', 0.85);
  }

  /* ----- CAMERA PRESETS ----- */
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

/* ============================================================
   UI BUILDER
   ============================================================ */
function buildModelSelector(models) {
  const grid = document.getElementById('model-grid');
  if (!grid) return;
  grid.innerHTML = '';
  models.forEach(m => {
    const card = document.createElement('div');
    card.className = 'model-card' + (m.id === state.modelId ? ' selected' : '');
    card.dataset.id = m.id;
    card.innerHTML = `
      <div class="model-card-icon">🏍️</div>
      <div class="model-card-name">${m.name}</div>
      <div class="model-card-brand">${m.brand} · ${m.category}</div>
      <div class="model-card-check">
        <svg viewBox="0 0 12 12" fill="none" stroke="#000" stroke-width="2">
          <polyline points="2,6 5,9 10,3"/>
        </svg>
      </div>`;
    card.addEventListener('click', () => selectModel(m.id));
    grid.appendChild(card);
  });
}

function buildOptionPills(containerId, options, stateKey, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  options.forEach(opt => {
    const pill = document.createElement('button');
    pill.className = 'option-pill' + (state[stateKey] === opt ? ' selected' : '');
    pill.textContent = opt;
    pill.addEventListener('click', () => {
      state[stateKey] = opt;
      container.querySelectorAll('.option-pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
      onChange && onChange(opt);
      updateSummary();
    });
    container.appendChild(pill);
  });
  // Auto-select first
  if (!state[stateKey] && options.length > 0) {
    state[stateKey] = options[0];
    container.querySelector('.option-pill')?.classList.add('selected');
  }
}

function buildColorZoneTabs(modelConfig) {
  const tabs = document.getElementById('color-zone-tabs');
  const pickers = document.getElementById('color-pickers');
  if (!tabs || !pickers) return;

  tabs.innerHTML = '';
  pickers.innerHTML = '';

  modelConfig.colorZones.forEach((zone, i) => {
    // Tab
    const tab = document.createElement('button');
    tab.className = 'zone-tab' + (i === 0 ? ' active' : '');
    tab.textContent = zone.name;
    tab.dataset.zone = zone.id;
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('.zone-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
    tabs.appendChild(tab);

    // Color picker row
    const row = document.createElement('div');
    row.className = 'color-picker-row';
    row.dataset.zone = zone.id;
    const currentColor = state.colors[zone.id] || zone.default;
    row.innerHTML = `
      <div class="color-picker-swatch">
        <input type="color" id="color-${zone.id}" value="${currentColor}">
      </div>
      <div class="color-picker-info">
        <div class="color-picker-name">${zone.name}</div>
        <div class="color-picker-hex" id="hex-${zone.id}">${currentColor.toUpperCase()}</div>
      </div>`;

    const input = row.querySelector(`#color-${zone.id}`);
    input.addEventListener('input', (e) => {
      const hex = e.target.value;
      row.querySelector(`#hex-${zone.id}`).textContent = hex.toUpperCase();
      configurator.setZoneColor(zone.id, hex);
      updateSummary();
    });
    pickers.appendChild(row);
  });
}

function buildColorPresets(presets) {
  const grid = document.getElementById('preset-grid');
  if (!grid) return;
  grid.innerHTML = '';
  presets.forEach(p => {
    const chip = document.createElement('button');
    chip.className = 'preset-chip' + (state.presetId === p.id ? ' selected' : '');
    chip.style.background = p.thumbnail;
    chip.dataset.id = p.id;
    chip.title = p.name;
    chip.innerHTML = `<div class="preset-chip-label">${p.name}</div>`;
    chip.addEventListener('click', () => {
      document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      configurator.applyPreset(p);
      showToast('✦ ' + p.name + ' preset applied', 'success');
    });
    grid.appendChild(chip);
  });
}

function buildFontSelector(fonts) {
  const container = document.getElementById('font-grid');
  if (!container) return;
  container.innerHTML = '';
  fonts.forEach(f => {
    const card = document.createElement('div');
    card.className = 'font-card' + (state.nameFont === f.id ? ' selected' : '');
    card.innerHTML = `
      <div class="font-card-name">${f.name}</div>
      <div class="font-card-preview" style="font-family: ${f.family}">RIDER</div>`;
    card.addEventListener('click', () => {
      container.querySelectorAll('.font-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      configurator.setFont(f.id);
      updateTextPreview();
    });
    container.appendChild(card);
  });
}

function buildLogoGrid(logos) {
  const grid = document.getElementById('logo-grid');
  if (!grid) return;
  grid.innerHTML = '';
  logos.forEach(l => {
    const card = document.createElement('div');
    card.className = 'logo-card' + (state.logo === l.id ? ' selected' : '');
    if (l.file) {
      card.innerHTML = `<img src="${l.file}" alt="${l.name}" onerror="this.style.display='none'">`;
    } else {
      card.innerHTML = `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="10" y1="10" x2="30" y2="30"/><line x1="30" y1="10" x2="10" y2="30"/>
      </svg>`;
    }
    card.innerHTML += `<div class="logo-card-name">${l.name}</div>`;
    card.addEventListener('click', () => {
      grid.querySelectorAll('.logo-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      configurator.setLogo(l);
    });
    grid.appendChild(card);
  });
}

/* ============================================================
   MODEL SELECTION
   ============================================================ */
async function selectModel(modelId) {
  const modelConfig = MODELS_CONFIG.models.find(m => m.id === modelId);
  if (!modelConfig) return;

  state.modelId = modelId;
  state.modelConfig = modelConfig;

  // Update model card UI
  document.querySelectorAll('.model-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.id === modelId);
  });

  // Update summary model name
  const summaryModelName = document.getElementById('summary-model-name');
  if (summaryModelName) summaryModelName.textContent = modelConfig.name;

  // Build model-specific options
  buildOptionPills('year-pills', modelConfig.years, 'year', () => updateSummary());
  buildOptionPills('plastics-pills', modelConfig.plastics, 'plastics', () => updateSummary());
  buildOptionPills('fender-pills', modelConfig.frontFenders, 'frontFender', () => updateSummary());
  buildOptionPills('printbase-pills', modelConfig.printBases, 'printBase', () => updateSummary());
  buildOptionPills('laminate-pills', modelConfig.laminates, 'laminate', () => updateSummary());
  buildOptionPills('wheels-pills', modelConfig.wheelsGraphics, 'wheelsGraphics', () => updateSummary());
  buildColorZoneTabs(modelConfig);
  updateColorPickerUI();

  // Set price in left strip
  const priceEl = document.getElementById('price-value');
  if (priceEl) {
    priceEl.textContent = modelConfig.currency + ' ' + modelConfig.price.toLocaleString();
  }
  // Update model name in strip
  const stripName = document.getElementById('strip-model-name');
  if (stripName) stripName.textContent = modelConfig.name;

  // Load 3D model
  setLoadingProgress(10, 'Loading model…');
  showLoadingOverlay(true);

  await configurator.loadModel(modelConfig, (pct) => {
    setLoadingProgress(pct, pct < 90 ? 'Downloading 3D model…' : 'Setting up materials…');
  });

  setLoadingProgress(100, 'Ready!');
  setTimeout(() => showLoadingOverlay(false), 400);

  updateSummary();
  showToast('🏍 ' + modelConfig.name + ' loaded', 'success');
}

/* ============================================================
   COLOR UI SYNC
   ============================================================ */
function updateColorPickerUI() {
  if (!state.modelConfig) return;
  state.modelConfig.colorZones.forEach(zone => {
    const input = document.getElementById(`color-${zone.id}`);
    const hexEl = document.getElementById(`hex-${zone.id}`);
    const col = state.colors[zone.id] || zone.default;
    if (input) input.value = col;
    if (hexEl) hexEl.textContent = col.toUpperCase();
  });
}

/* ============================================================
   TEXT PREVIEW
   ============================================================ */
function updateTextPreview() {
  const fontMap = {
    bebas: "'Bebas Neue', Impact, sans-serif",
    racing: "'Racing Sans One', Impact, sans-serif",
    orbitron: "'Orbitron', sans-serif",
    bangers: "'Bangers', cursive",
    russo: "'Russo One', sans-serif",
  };
  const namePreview = document.getElementById('name-preview');
  const numPreview = document.getElementById('number-preview');
  const ff = fontMap[state.nameFont] || fontMap.bebas;
  if (namePreview) {
    namePreview.style.fontFamily = ff;
    namePreview.style.color = state.nameColor;
    namePreview.textContent = state.riderName || 'YOUR NAME';
  }
  if (numPreview) {
    numPreview.style.fontFamily = ff;
    numPreview.style.color = state.numberColor;
    numPreview.textContent = state.riderNumber || '000';
  }
}

/* ============================================================
   SUMMARY PANEL
   ============================================================ */
function updateSummary() {
  const items = [
    { key: 'Model',   val: state.modelConfig?.name || '—' },
    { key: 'Year',    val: state.year || '—' },
    { key: 'Plastics', val: state.plastics || '—' },
    { key: 'Front Fender', val: state.frontFender || '—' },
    { key: 'Print Base', val: state.printBase || '—' },
    { key: 'Laminate', val: state.laminate || '—' },
    { key: 'Wheels',  val: state.wheelsGraphics || '—' },
    { key: 'Name',    val: state.riderName || '—' },
    { key: 'Number',  val: state.riderNumber || '—' },
    { key: 'Font',    val: state.nameFont || '—' },
    { key: 'Logo',    val: state.logo || 'None' },
  ];
  // summary-items no longer exists in new layout; kept for compatibility
}

/* ============================================================
   LOADING OVERLAY
   ============================================================ */
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

/* ============================================================
   AUTO-ROTATE BADGE
   ============================================================ */
function updateAutoRotateBadge(rotating) {
  const badge = document.getElementById('auto-rotate-badge');
  if (!badge) return;
  badge.classList.toggle('paused', !rotating);
  badge.querySelector('.badge-text').textContent = rotating ? 'AUTO ROTATE' : 'PAUSED';
}

/* ============================================================
   STEP NAVIGATION
   ============================================================ */
function setupStepNav() {
  const tabs = document.querySelectorAll('.step-tab');
  const panels = document.querySelectorAll('.config-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.panel;
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(target)?.classList.add('active');
    });
  });

  // Next buttons
  document.querySelectorAll('[data-next-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextId = btn.dataset.nextPanel;
      const nextTab = document.querySelector(`[data-panel="${nextId}"]`);
      if (nextTab) {
        // Mark current tab done
        const currentTab = document.querySelector('.step-tab.active');
        if (currentTab) currentTab.classList.add('done');
        nextTab.click();
        nextTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    });
  });
}

/* ============================================================
   VIEWER CONTROLS
   ============================================================ */
function setupViewerControls() {
  document.getElementById('btn-reset-cam')?.addEventListener('click', () => configurator.resetCamera());
  document.getElementById('btn-view-front')?.addEventListener('click', () => configurator.setCameraView('front'));
  document.getElementById('btn-view-rear')?.addEventListener('click', () => configurator.setCameraView('rear'));
  document.getElementById('btn-view-top')?.addEventListener('click', () => configurator.setCameraView('top'));
  document.getElementById('btn-screenshot')?.addEventListener('click', () => {
    const url = configurator.captureScreenshot();
    const a = document.createElement('a');
    a.href = url;
    a.download = '4d-design-config.jpg';
    a.click();
    showToast('📸 Screenshot saved', 'success');
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
    toast.style.animation = 'toastOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================
   SHOPIFY CART
   ============================================================ */
async function addToCart() {
  const btn = document.getElementById('btn-add-cart');
  if (!btn || !state.modelConfig) return;

  if (!state.year || !state.plastics) {
    showToast('⚠ Please select Year and Plastics options', 'error');
    document.getElementById('tab-kit')?.click();
    return;
  }

  btn.classList.add('loading');

  // Capture screenshot for order reference
  let previewDataUrl = '';
  try { previewDataUrl = configurator.captureScreenshot(); } catch(e) {}

  const properties = {
    'Year': state.year || '',
    'Plastics': state.plastics || '',
    'Front Fender': state.frontFender || '',
    'Print Base': state.printBase || '',
    'Laminate': state.laminate || '',
    'Wheels Graphics': state.wheelsGraphics || '',
    'Rider Name': state.riderName || '',
    'Rider Number': state.riderNumber || '',
    'Font Style': state.nameFont || '',
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
    // If in iframe mode, the loading state is removed by the postMessage handler (4d:cart-added/4d:cart-error)
    // If in standalone mode, remove loading now
    if (window.parent === window) {
      btn.classList.remove('loading');
    }
  } catch (err) {
    showToast('⚠ Could not add to cart: ' + err.message, 'error');
    btn.classList.remove('loading');
  }
}

function showSuccessModal(properties) {
  const modal = document.getElementById('success-modal');
  if (modal) modal.classList.remove('hidden');
}

/* ============================================================
   APP BOOTSTRAP
   ============================================================ */
let configurator;

async function init() {
  // Check WebGL
  const canvas = document.getElementById('three-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    document.getElementById('webgl-error')?.classList.add('visible');
    document.getElementById('loading-screen')?.classList.add('hidden');
    return;
  }

  // Load configs
  await loadConfigs();

  // Init Three.js
  configurator = new MotorcycleConfigurator(canvas);
  configurator.init();

  // Build UI
  buildColorPresets(COLOR_PRESETS.presets);
  buildFontSelector(MODELS_CONFIG.fontOptions);
  buildLogoGrid(MODELS_CONFIG.logoOptions);

  // Setup viewer controls
  setupViewerControls();

  // Text inputs
  const nameInput = document.getElementById('input-rider-name');
  const numInput = document.getElementById('input-rider-number');

  nameInput?.addEventListener('input', (e) => {
    state.riderName = e.target.value;
    configurator.setRiderName(e.target.value);
    updateTextPreview();
    updateSummary();
  });
  numInput?.addEventListener('input', (e) => {
    state.riderNumber = e.target.value;
    configurator.setRiderNumber(e.target.value);
    updateTextPreview();
    updateSummary();
  });

  // Text color dots
  document.querySelectorAll('.text-color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const color = dot.dataset.color;
      const target = dot.dataset.target;
      dot.closest('.text-color-row')?.querySelectorAll('.text-color-dot').forEach(d => {
        if (d.dataset.target === target) d.classList.remove('selected');
      });
      dot.classList.add('selected');
      if (target === 'name') {
        state.nameColor = color;
        configurator.setNameColor(color);
      } else {
        state.numberColor = color;
        configurator.setNumberColor(color);
      }
      updateTextPreview();
    });
  });

  // Add to cart button
  document.getElementById('btn-add-cart')?.addEventListener('click', addToCart);

  // Modal close
  document.getElementById('modal-close')?.addEventListener('click', () => {
    document.getElementById('success-modal')?.classList.add('hidden');
  });
  document.getElementById('modal-view-cart')?.addEventListener('href', () => {
    window.location.href = '/cart';
  });

  // Summary update interval
  setInterval(() => {
    if (state.modelId) updateSummary();
  }, 2000);

  // Load first model
  if (MODELS_CONFIG.models.length > 0) {
    await selectModel(MODELS_CONFIG.models[0].id);
  }

  // Reveal app
  document.getElementById('loading-screen')?.classList.add('hidden');
  document.getElementById('app')?.classList.add('visible');

  updateTextPreview();
}

// Start
document.addEventListener('DOMContentLoaded', init);
window.addEventListener('load', () => {
  // Ensure fonts loaded
  document.fonts.ready.then(updateTextPreview);
});

// Expose for Shopify theme integration
window.configurator4D = { state, selectModel, addToCart, showToast };
