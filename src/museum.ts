import * as THREE from "three";
import { Botany } from "./botany";
import type { SceneGame } from "./games";
import { translate } from "./i18n";
import { assetUrl, partOfSpeech, type Exhibit, type Room } from "./types";
import {
  CITY,
  DISTRICTS,
  ENTRY,
  ROOT_START,
  ROOT_COUNT,
  ROOT_ROOM,
  LANE_ZS,
  LANE_HALF,
  LANE_X,
  LANE_COUNT,
  MAX_LANES,
  HOUSES_PER_LANE,
  BLOCK_OFFSETS,
  OUTER_EDGE,
  MARKET_CENTER,
  areaAt,
  blockOffset,
  displayPlacement,
  displayScale,
  districtFor,
  freestanding,
  houseColumnX,
  houseStyle,
  isRootRoom,
  laneColumn,
  laneHouseCount,
  laneRow,
  laneZ,
  roomPose,
  rootRoomTransform,
  STREETS_INDEX,
  withinGrounds,
} from "./layout";

export type Pose = { x: number; z: number; yaw: number; room: number };
type MuseumOptions = {
  locale: string;
  exhibits: Exhibit[];
  rooms: Room[];
  checked: string[];
  onToggleChecked: (exhibit: Exhibit) => void;
  onVideo: (exhibit: Exhibit) => void;
  onSelect: (exhibit: Exhibit, area?: number) => void;
  onHover: (exhibit: Exhibit | null, action?: ExhibitHit["action"]) => void;
  onMove: (pose: Pose) => void;
  onReady: () => void;
  onError: (message: string) => void;
};
const EYE_HEIGHT = 1.78;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

export function exhibitPlacement(exhibit: Pick<Exhibit, "room" | "slot">) {
  return displayPlacement(exhibit.room, exhibit.slot, familySize(exhibit.room));
}

// Root rooms hold between two and six family words; slots are laid out per room size.
const familySizes = new Map<number, number>();
export function registerFamilySizes(rooms: Room[]) {
  rooms.forEach((room, index) => { if (room.root) familySizes.set(index, room.root.words.length); });
}
const familySize = (room: number) => familySizes.get(room) ?? 6;
export function exhibitPlacements(exhibit: Exhibit) {
  return [
    exhibitPlacement(exhibit),
    // A word hangs once in every root family it belongs to, besides its home district.
    ...(exhibit.families ?? []).filter((family) => family.room !== exhibit.room).map((family) => exhibitPlacement(family)),
  ];
}
export const familyIn = (exhibit: Exhibit, room: number) => exhibit.families?.find((family) => family.room === room);

type ExhibitHit = {
  exhibit: Exhibit;
  action: "open" | "check" | "video";
  area: number;
};
type DisplayFrame = {
  id: string;
  material: THREE.MeshStandardMaterial;
  checkedColor: string;
  halo?: boolean;
  checkbox: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  position: THREE.Vector3;
  phase: number;
};
// Root rooms are built when the visitor comes near and released again when far away,
// so only a handful of the 93 rooms hold canvases and paintings at any time.
type Zone = {
  room: number;
  x: number;
  z: number;
  group: THREE.Group | null;
  textures: THREE.Texture[];
  localized: (() => void)[];
  frames: DisplayFrame[];
  paintings: string[];
};
const ZONE_BUILD_DISTANCE = 64;
const ZONE_RELEASE_DISTANCE = 104;

export class Museum {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(68, 1, 0.08, 330);
  private renderer: THREE.WebGLRenderer;
  private keys = new Set<string>();
  private game: SceneGame | null = null;
  private gameGroup: THREE.Group | null = null;
  private gameTextures: THREE.Texture[] = [];
  private gameMasks: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; map: THREE.Texture | null }[] = [];
  private hiddenFloor: THREE.Object3D[] = [];
  private standingTile: { id: string; since: number; answered: boolean } | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private botany: Botany;
  private textures: THREE.Texture[] = [];
  private paintingTextures = new Map<string, THREE.Texture>();
  private localizedTextures: (() => void)[] = [];
  private resizeObserver: ResizeObserver;
  private yaw = ENTRY.yaw;
  private pitch = 0.055;
  private dragging = false;
  private dragDistance = 0;
  private lastPointer = { x: 0, y: 0 };
  private blocked = false;
  private disposed = false;
  private lastTime = 0;
  private lastReport = 0;
  private needsRender = true;
  private reportedPose: Pose | null = null;
  private hoverId: string | null = null;
  private checked = new Set<string>();
  private displayFrames: DisplayFrame[] = [];
  private zones: Zone[] = [];
  private activeZone: Zone | null = null;
  private paintingUses = new Map<string, number>();
  private lastZoneCheck = 0;
  private videoTexture!: THREE.Texture;
  private checkTextures: THREE.Texture[] = [];
  private lastPulse = 0;
  private transition: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromYaw: number;
    toYaw: number;
    fromPitch: number;
    toPitch: number;
    start: number;
    duration: number;
  } | null = null;
  private sun: THREE.DirectionalLight;
  private water: THREE.Mesh | null = null;
  private hemisphere: THREE.HemisphereLight;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private obstacles: { x: number; z: number; rx: number; rz: number }[] = [];

  constructor(
    private host: HTMLElement,
    private options: MuseumOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Architecture and trees are static: bake their shadows once, not per frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Walkable 3D vocabulary museum. Drag to look, use W A S D or arrow keys to walk, and click a painting to study it.",
    );
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color("#cfe0e6");
    this.scene.fog = new THREE.Fog("#d9e4de", 110, 300);
    this.camera.position.set(ENTRY.x, EYE_HEIGHT, ENTRY.z);
    this.camera.rotation.order = "YXZ";
    this.hemisphere = new THREE.HemisphereLight("#fcf4e5", "#b6a084", 2.3);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight("#fff4db", 3.5);
    this.sun.position.set(-30, 40, -60);
    this.sun.target.position.set(0, 0, -90);
    this.scene.add(this.sun.target);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, {
      left: -140,
      right: 140,
      top: 220,
      bottom: -220,
      far: 420,
    });
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun);
    this.checked = new Set(options.checked);
    registerFamilySizes(options.rooms);
    this.botany = new Botany((w, h, draw) => this.canvasTexture(w, h, draw));
    this.buildCity();
    this.buildExhibits();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.resize();
    this.updateZones(true);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("dragover", this.gameDragOver);
    canvas.addEventListener("drop", this.gameDrop);
    canvas.addEventListener("contextmenu", this.preventContext);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.clearInput);
    this.renderer.setAnimationLoop(this.animate);
    if (import.meta.env.DEV) (window as unknown as { __museum?: Museum }).__museum = this;
    options.onReady();
  }

  private material(color: string, roughness = 0.8, metalness = 0) {
    const key = `${color}-${roughness}-${metalness}`;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new THREE.MeshStandardMaterial({ color, roughness, metalness }),
      );
    return this.materials.get(key)!;
  }

  private box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: string,
    parent: THREE.Object3D = this.scene,
    shadow = false,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      this.material(color),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private canvasTexture(
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
    localized = false,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d")!);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    (this.activeZone?.textures ?? this.textures).push(texture);
    if (localized)
      (this.activeZone?.localized ?? this.localizedTextures).push(() => {
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, width, height);
        draw(ctx);
        texture.needsUpdate = true;
      });
    return texture;
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    width: number,
    lineHeight: number,
  ) {
    let line = "";
    const isCjk = /[\u3000-\u9fff]/.test(text);
    for (const word of isCjk ? Array.from(text) : text.split(" ")) {
      const test = line ? `${line}${isCjk ? "" : " "}${word}` : word;
      if (ctx.measureText(test).width > width && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else line = test;
    }
    ctx.fillText(line, x, y);
    return y + lineHeight;
  }

  private panel(
    texture: THREE.Texture,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        toneMapped: false,
      }),
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  // ---- Vocab City -------------------------------------------------------------
  private cobbles!: THREE.MeshStandardMaterial;
  private stone!: THREE.MeshStandardMaterial;
  private tiles!: THREE.MeshStandardMaterial;

  private cityMaterials() {
    const cobbleTexture = this.canvasTexture(512, 512, (ctx) => {
      let seed = 41;
      const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
      ctx.fillStyle = "#b9b1a0"; ctx.fillRect(0, 0, 512, 512);
      for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
        const x = col * 32 + (row % 2) * 16, y = row * 32, shade = 60 + rnd() * 14;
        ctx.fillStyle = `hsl(36 ${14 + rnd() * 10}% ${shade}%)`;
        ctx.beginPath(); ctx.roundRect(x + 2, y + 2, 29, 28, 7); ctx.fill();
      }
    });
    cobbleTexture.wrapS = cobbleTexture.wrapT = THREE.RepeatWrapping;
    cobbleTexture.repeat.set(6, 6);
    this.cobbles = new THREE.MeshStandardMaterial({ map: cobbleTexture, roughness: 0.9 });
    const stoneTexture = this.canvasTexture(512, 512, (ctx) => {
      let seed = 163;
      const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
      ctx.fillStyle = "#d9cdb4"; ctx.fillRect(0, 0, 512, 512);
      for (let row = 0; row < 10; row++) for (let col = 0; col < 6; col++) {
        const x = col * 88 + (row % 2) * 44 - 44, y = row * 52;
        ctx.fillStyle = `hsl(37 ${22 + rnd() * 10}% ${72 + rnd() * 10}%)`;
        ctx.fillRect(x + 2, y + 2, 84, 48);
      }
      for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(90,70,40,${rnd() * 0.12})`; ctx.fillRect(rnd() * 512, rnd() * 512, 2, 2); }
    });
    stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
    stoneTexture.repeat.set(3, 1.5);
    this.stone = new THREE.MeshStandardMaterial({ map: stoneTexture, roughness: 0.95 });
    const tileTexture = this.canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = "#b8653f"; ctx.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        ctx.fillStyle = (row + col) % 3 ? "#c4744b" : "#a95a37";
        ctx.beginPath(); ctx.arc(col * 32 + 16 + (row % 2) * 16, row * 32 + 16, 14, 0, Math.PI); ctx.fill();
      }
    });
    tileTexture.wrapS = tileTexture.wrapT = THREE.RepeatWrapping;
    tileTexture.repeat.set(8, 4);
    this.tiles = new THREE.MeshStandardMaterial({ map: tileTexture, roughness: 0.85 });
  }

  private ground(x0: number, x1: number, z0: number, z1: number, material: THREE.Material, y = 0.005, parent: THREE.Object3D = this.scene) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private wall(x0: number, x1: number, z0: number, z1: number, height: number, color: string, y0 = 0, shadow = true) {
    return this.box(Math.max(x1 - x0, 0.01), height, Math.max(z1 - z0, 0.01), (x0 + x1) / 2, y0 + height / 2, (z0 + z1) / 2, color, this.scene, shadow);
  }
  private roof(x0: number, x1: number, z0: number, z1: number, y: number, ridge = 2.2) {
    // A hipped terracotta roof: a low box under a shallow pyramid cap.
    const w = x1 - x0, d = z1 - z0;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.35, d + 1.2), this.tiles);
    base.position.set((x0 + x1) / 2, y + 0.17, (z0 + z1) / 2); base.castShadow = true; this.scene.add(base);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, ridge, 4), this.tiles);
    cap.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
    cap.rotation.y = Math.PI / 4;
    cap.position.set((x0 + x1) / 2, y + 0.35 + ridge / 2, (z0 + z1) / 2); cap.castShadow = true; this.scene.add(cap);
  }
  private column(x: number, z: number, height: number, radius = 0.32, color = "#e6dcc5", parent: THREE.Object3D = this.scene) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, height, 16), this.material(color));
    shaft.position.set(x, height / 2, z); shaft.castShadow = true; parent.add(shaft);
    this.box(radius * 3, 0.22, radius * 3, x, height + 0.11, z, "#cbbb9c", parent);
    this.box(radius * 3.2, 0.2, radius * 3.2, x, 0.1, z, "#bfae8d", parent);
    this.obstacles.push({ x, z, rx: radius + 0.35, rz: radius + 0.35 });
  }
  private window(x: number, y: number, z: number, w: number, h: number, yaw: number, lit = true) {
    const pane = this.box(w, h, 0.08, 0, 0, 0, lit ? "#f6ecc9" : "#5d6a73");
    pane.material = this.material(lit ? "#f6ecc9" : "#5d6a73").clone();
    if (lit) { pane.material.emissive.set("#f3e2b0"); pane.material.emissiveIntensity = 0.45; }
    pane.position.set(x, y, z); pane.rotation.y = yaw;
    const frame = this.box(w + 0.3, h + 0.3, 0.05, 0, 0, 0, "#f0e9d8");
    frame.position.set(x, y, z); frame.rotation.y = yaw;
    for (const side of [-1, 1]) {
      const shutter = this.box(w * 0.45, h, 0.06, 0, 0, 0, "#587a77");
      const offset = new THREE.Vector3(side * (w / 2 + w * 0.25), 0, 0.04).applyAxisAngle(Y_AXIS, yaw);
      shutter.position.set(x + offset.x, y, z + offset.z); shutter.rotation.y = yaw;
    }
  }
  private lamp(x: number, z: number, height = 3.6) {
    this.box(0.12, height, 0.12, x, height / 2, z, "#5f7773");
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), this.material("#ffe8ba").clone());
    (bulb.material as THREE.MeshStandardMaterial).emissive.set("#ffe8ba");
    (bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
    bulb.position.set(x, height + 0.15, z); this.scene.add(bulb);
    this.obstacles.push({ x, z, rx: 0.3, rz: 0.3 });
  }
  private bench(x: number, z: number, yaw: number) {
    const bench = new THREE.Group();
    bench.position.set(x, 0, z); bench.rotation.y = yaw; this.scene.add(bench);
    this.box(2.2, 0.1, 0.6, 0, 0.48, 0, "#9b7d58", bench, true);
    this.box(2.2, 0.5, 0.08, 0, 0.8, -0.28, "#9b7d58", bench, true);
    for (const dx of [-0.9, 0.9]) this.box(0.1, 0.48, 0.55, dx, 0.24, 0, "#5a6660", bench, true);
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    this.obstacles.push({ x, z, rx: c * 1.25 + s * 0.5, rz: s * 1.25 + c * 0.5 });
  }
  private tree(x: number, z: number, size: number, seed: number, distant = false) {
    const tree = this.botany.tree(size, seed, distant);
    tree.position.set(x, 0, z);
    this.scene.add(tree);
    this.shadow(x, z, 5 * size, 5 * size);
    this.obstacles.push({ x, z, rx: 0.5 * size, rz: 0.5 * size });
  }
  private sign(text: string | (() => string), detail: string, x: number, y: number, z: number, yaw: number, width = 6.6, colors = ["#385c49", "#b9aa7b", "#f7f0da", "#c7cfb0"]) {
    const texture = this.canvasTexture(1024, 250, (ctx) => {
      ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, 1024, 250);
      ctx.strokeStyle = colors[1]; ctx.lineWidth = 3; ctx.strokeRect(18, 18, 988, 214);
      ctx.fillStyle = colors[2]; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = '44px "DM Sans", sans-serif'; ctx.fillText(typeof text === "string" ? translate(text, this.options.locale) : text(), 512, 96, 950);
      ctx.fillStyle = colors[3]; ctx.font = '26px "DM Sans", sans-serif'; ctx.fillText(translate(detail, this.options.locale), 512, 172, 950);
    }, true);
    const panel = this.panel(texture, width, width * 250 / 1024, x, y, z);
    panel.rotation.y = yaw;
    return panel;
  }
  // A building sign names the district after its collection room.
  private districtSign(room: number, x: number, y: number, z: number, yaw: number, width = 6) {
    const district = districtFor(room);
    this.sign(() => translate(this.options.rooms[room].name, this.options.locale), district.landmark.toUpperCase(), x, y, z, yaw, width);
  }

  private buildCity() {
    this.cityMaterials();
    this.buildHarbour();
    this.buildRamparts();
    this.buildGateSquare();
    this.buildTownHallAndInn();
    this.buildCorso();
    this.buildPark();
    this.buildMarket();
    this.buildCathedralSquare();
    this.buildCathedral();
    this.buildCistern();
    this.buildOldTown();
    this.buildLandmarks();
  }

  private buildHarbour() {
    const c = CITY;
    // Sea to the south, with the quay, the mole and the lighthouse.
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700), new THREE.MeshStandardMaterial({ color: "#6f9fa4", metalness: 0.25, roughness: 0.32 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.6, c.seaEdge + 330); this.scene.add(sea);
    for (let i = 0; i < 160; i++) {
      const x = Math.sin(i * 6.7) * 300, z = c.seaEdge + 8 + (i * 13.7) % 260;
      if (x > c.mole.x0 - 3 && x < c.mole.x1 + 3 && z < c.mole.z1 + 4) continue;
      this.box(1 + i % 4, 0.008, 0.04, x, -0.55, z, i % 3 ? "#a6cac4" : "#5f9598");
    }
    this.ground(-c.wallX - 2, c.wallX + 2, c.quay.north - 2, c.quay.south, this.cobbles, 0.002);
    this.box(c.wallX * 2 + 4, 1.3, 0.5, 0, -0.65, c.quay.south + 0.25, "#a99a7c");
    // Railing along the sea edge, leaving the mole open.
    for (let x = -c.wallX + 1; x <= c.wallX; x += 2) {
      if (x > c.mole.x0 - 1 && x < c.mole.x1 + 1) continue;
      this.box(0.09, 1.1, 0.09, x, 0.55, c.quay.south - 0.3, "#687c78");
    }
    for (const [x0, x1] of [[-c.wallX + 1, c.mole.x0 - 1], [c.mole.x1 + 1, c.wallX]] as const) {
      this.box(x1 - x0, 0.08, 0.08, (x0 + x1) / 2, 1.13, c.quay.south - 0.3, "#8b947f");
    }
    for (let x = -80; x <= 80; x += 20) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 12), this.material("#4d5551"));
      bollard.position.set(x + 3, 0.45, c.quay.south - 1); this.scene.add(bollard);
      this.obstacles.push({ x: x + 3, z: c.quay.south - 1, rx: 0.4, rz: 0.4 });
      if (x % 40 === 0) this.lamp(x, c.quay.south - 2.2);
    }
    // The mole and the lighthouse.
    this.ground(c.mole.x0, c.mole.x1, c.mole.z0 - 1, c.mole.z1, this.cobbles, 0.004);
    this.box(c.mole.x1 - c.mole.x0 + 0.6, 1.6, c.mole.z1 - c.mole.z0 + 1, (c.mole.x0 + c.mole.x1) / 2, -0.8, (c.mole.z0 + c.mole.z1) / 2, "#a99a7c");
    for (let z = c.mole.z0 + 1; z <= c.mole.z1; z += 2) for (const x of [c.mole.x0 + 0.3, c.mole.x1 - 0.3]) this.box(0.09, 1.1, 0.09, x, 0.55, z, "#687c78");
    for (const x of [c.mole.x0 + 0.3, c.mole.x1 - 0.3]) this.box(0.08, 0.08, c.mole.z1 - c.mole.z0, x, 1.13, (c.mole.z0 + c.mole.z1) / 2, "#8b947f");
    this.box(c.mole.x1 - c.mole.x0, 1.1, 0.4, (c.mole.x0 + c.mole.x1) / 2, 0.55, c.mole.z1, "#a99a7c");
    const light = c.lighthouse;
    this.box(8, 1.6, 8, light.x, -0.8, light.z, "#9d927a");
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.3, 18, 24), this.material("#f4efe3"));
    tower.position.set(light.x, 9, light.z); tower.castShadow = true; this.scene.add(tower);
    for (const y of [4, 10]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(2.05 - y * 0.03, 2.15 - y * 0.03, 1.6, 24), this.material("#b8453a"));
      band.position.set(light.x, y, light.z); this.scene.add(band);
    }
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 24), this.material("#5f6b6a"));
    gallery.position.set(light.x, 18, light.z); this.scene.add(gallery);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 12), this.material("#fff0c2").clone());
    (lantern.material as THREE.MeshStandardMaterial).emissive.set("#ffe39a"); (lantern.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4;
    lantern.position.set(light.x, 19.4, light.z); this.scene.add(lantern);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 12), this.material("#b8453a"));
    cap.position.set(light.x, 21.3, light.z); this.scene.add(cap);
    // Moored boats and a distant sail.
    for (const [x, z, color] of [[-30, 68, "#b37661"], [30, 69, "#73959e"], [-70, 72, "#c9a55a"], [110, 110, "#f3e7cc"]] as const) {
      const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.material(color));
      hull.scale.set(1.4, 0.75, 3.2); hull.position.set(x, -0.9, z); this.scene.add(hull);
      this.box(2.1, 0.12, 4.8, x, -0.36, z, "#d6ba87");
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 7, 8), this.material("#a8926a"));
      mast.position.set(x, 3.05, z); this.scene.add(mast);
      const sailGeometry = new THREE.BufferGeometry();
      sailGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 6.2, 0, 0, 0.7, 0, 0, 0.7, 3.1], 3)); sailGeometry.computeVertexNormals();
      const sail = new THREE.Mesh(sailGeometry, new THREE.MeshStandardMaterial({ color: "#f3e7cc", side: THREE.DoubleSide })); sail.position.set(x, -0.6, z); this.scene.add(sail);
    }
    // Belvedere: a pergola and benches at the western end of the quay.
    for (const x of [-86, -74, -62]) for (const z of [52, 60]) { this.box(0.24, 3.7, 0.24, x, 1.85, z, "#a68d64", this.scene, true); this.obstacles.push({ x, z, rx: 0.45, rz: 0.45 }); }
    for (const z of [52, 60]) this.box(26, 0.25, 0.3, -74, 3.65, z, "#ae946c", this.scene, true);
    for (let x = -87; x <= -61; x += 1.3) this.box(0.15, 0.2, 9, x, 3.82, 56, "#c1a881", this.scene, true);
    this.bench(-80, 56, 0); this.bench(-68, 56, 0);
    this.plant(-58, 60, 1.6); this.plant(-88, 60, 1.6);
  }

  private buildRamparts() {
    const c = CITY;
    const stone = "#d5c6a6";
    // South wall with the sea gate, then the long side walls and the north wall.
    for (const [x0, x1] of [[-c.wallX, -c.gate.halfWidth - 2.2], [c.gate.halfWidth + 2.2, c.wallX]] as const) {
      this.wall(x0, x1, c.wallSouth - 0.6, c.wallSouth + 0.6, 9, stone);
      for (let x = x0 + 1; x < x1; x += 2.4) this.box(1.2, 1, 1.4, x, 9.5, c.wallSouth, stone);
    }
    this.box(c.gate.halfWidth * 2 + 4.4, 3.5, 2.6, 0, 8.75, c.wallSouth, stone, this.scene, true);
    for (const side of [-1, 1]) {
      const x = side * (c.gate.halfWidth + 2.2);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 15, 20), this.material(stone));
      tower.position.set(x, 7.5, c.wallSouth); tower.castShadow = true; this.scene.add(tower);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 1, 20), this.material("#c9b691"));
      top.position.set(x, 15.4, c.wallSouth); this.scene.add(top);
      const capRoof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.6, 20), this.tiles);
      capRoof.position.set(x, 17.2, c.wallSouth); this.scene.add(capRoof);
      this.obstacles.push({ x, z: c.wallSouth, rx: 2.9, rz: 2.9 });
    }
    for (const side of [-1, 1]) {
      this.wall(side * c.wallX - 0.6, side * c.wallX + 0.6, c.wallNorth, c.wallSouth, 8, stone);
      for (let z = c.wallSouth - 40; z > c.wallNorth; z -= 60) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 12, 16), this.material(stone));
        tower.position.set(side * c.wallX, 6, z); tower.castShadow = true; this.scene.add(tower);
        const capRoof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.4, 16), this.tiles);
        capRoof.position.set(side * c.wallX, 13.2, z); this.scene.add(capRoof);
      }
      for (let z = c.promenade.z1 - 14; z > c.wallNorth + 6; z -= 24) this.lamp(side * (c.wallX - 1.6), z, 3.2);
    }
    for (const [x0, x1] of [[-c.wallX, -5], [5, c.wallX]] as const) this.wall(x0, x1, c.wallNorth - 0.6, c.wallNorth + 0.6, 8, stone);
    this.box(12, 3, 2, 0, 7.5, c.wallNorth, stone, this.scene, true);
  }

  private buildGateSquare() {
    const c = CITY, sq = c.square;
    this.ground(-sq.x, sq.x, sq.z0 - 2, sq.z1 + 2, this.cobbles, 0.003);
    this.ground(-c.gate.halfWidth, c.gate.halfWidth, c.gate.z0 - 1, c.gate.z1 + 1, this.cobbles, 0.004);
    // Fountain at the centre.
    const f = sq.fountain;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r + 0.2, 0.9, 32), this.material("#d9d0b8"));
    basin.position.set(f.x, 0.45, f.z); basin.castShadow = true; this.scene.add(basin);
    const water = new THREE.Mesh(new THREE.CircleGeometry(f.r - 0.3, 32), new THREE.MeshStandardMaterial({ color: "#739e9b", roughness: 0.25, metalness: 0.28 }));
    water.rotation.x = -Math.PI / 2; water.position.set(f.x, 0.8, f.z); this.scene.add(water);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 16), this.material("#cfc4a6"));
    stem.position.set(f.x, 2, f.z); this.scene.add(stem);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.6, 0.4, 24), this.material("#d9d0b8"));
    bowl.position.set(f.x, 3.2, f.z); this.scene.add(bowl);
    this.obstacles.push({ x: f.x, z: f.z, rx: f.r + 0.3, rz: f.r + 0.3 });
    // Arcades along both sides of the square carry the Gate Square paintings.
    for (const side of [-1, 1]) {
      for (let z = sq.z0 + 2; z <= sq.z1 - 2; z += 4) this.column(side * 18.2, z, 5.2, 0.3);
      this.box(0.6, 0.35, sq.z1 - sq.z0, side * 18.2, 5.4, (sq.z0 + sq.z1) / 2, "#c9b691", this.scene, true);
      this.box(4.2, 0.28, sq.z1 - sq.z0, side * 20, 5.6, (sq.z0 + sq.z1) / 2, "#a9906a", this.scene, true);
      const roofStrip = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, sq.z1 - sq.z0), this.tiles);
      roofStrip.position.set(side * 20.1, 5.9, (sq.z0 + sq.z1) / 2); roofStrip.rotation.z = side * 0.12; roofStrip.castShadow = true; this.scene.add(roofStrip);
    }
    this.lamp(-8, 16); this.lamp(8, 16); this.lamp(-8, 40); this.lamp(8, 40);
    for (const x of [-14, 14]) this.bench(x, 22, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    // Greeting at the gate.
    const mascotTexture = new THREE.TextureLoader().load(assetUrl("mascot/welcome.webp"), () => { this.needsRender = true; });
    mascotTexture.colorSpace = THREE.SRGBColorSpace; this.textures.push(mascotTexture);
    const mascot = this.panel(mascotTexture, 2.85, 3.5, 9.5, 1.85, 41);
    mascot.material.alphaTest = 0.05; mascot.material.side = THREE.DoubleSide;
    this.shadow(9.5, 41, 3.8, 1.6);
    this.obstacles.push({ x: 9.5, z: 41, rx: 1.5, rz: 0.7 });
    const hello = this.canvasTexture(768, 190, (ctx) => {
      ctx.fillStyle = "#f7f3e7"; ctx.beginPath(); ctx.roundRect(0, 0, 768, 160, 32); ctx.fill();
      ctx.beginPath(); ctx.moveTo(345, 158); ctx.lineTo(377, 188); ctx.lineTo(407, 158); ctx.fill();
      ctx.fillStyle = "#385c49"; ctx.textAlign = "center"; ctx.font = '34px "DM Sans", sans-serif';
      ctx.fillText(translate("Hello! Welcome to Vocab City.", this.options.locale), 384, 69, 704);
      ctx.font = '25px "DM Sans", sans-serif';
      ctx.fillText(translate("Take your time. Follow your curiosity.", this.options.locale), 384, 116, 704);
    }, true);
    this.panel(hello, 4.9, 1.21, 9.5, 4.25, 41.04);
    this.sign("VOCAB CITY · A CITY OF WORDS", "THROUGH THE SEA GATE, EVERY STREET TEACHES", 0, 6.2, c.wallSouth + 1.4, 0, 11);
    this.sign("GATE SQUARE · CORSO AHEAD", "TOWN HALL EAST · INN COURTYARD WEST", 0, 5.4, sq.z0 - 0.4, 0, 8);
  }

  private buildTownHallAndInn() {
    const c = CITY;
    // Town Hall: a civic hall with a coffered ceiling, entered from the square.
    const th = c.townHall;
    this.building(th, 9, "#e8d9bf", { side: "west", z: th.door.z, width: 6 }, "tiles", 6);
    for (const z of [19, 37]) this.window(th.x0 - 0.02, 6.4, z, 1.5, 2.4, Math.PI / 2);
    // Inn: an open courtyard with an arcade on three sides and a well.
    const inn = c.inn;
    this.building(inn, 7, "#e3c9a4", { side: "east", z: inn.door.z, width: 6 }, "open", 8);
    for (const x of [inn.x0 + 6, inn.x0 + 14, inn.x0 + 22]) {
      this.column(x, inn.z0 + 3.4, 4.6, 0.26, "#e8dcc4"); this.column(x, inn.z1 - 3.4, 4.6, 0.26, "#e8dcc4");
    }
    for (const z of [inn.z0 + 3.4, inn.z1 - 3.4]) this.box(inn.x1 - inn.x0 - 4, 0.3, 0.3, (inn.x0 + inn.x1) / 2, 4.85, z, "#a68d64", this.scene, true);
    for (const z of [inn.z0 + 9, inn.z0 + 19]) this.column(inn.x0 + 3.4, z, 4.6, 0.26, "#e8dcc4");
    this.box(0.3, 0.3, inn.z1 - inn.z0 - 4, inn.x0 + 3.4, 4.85, (inn.z0 + inn.z1) / 2, "#a68d64", this.scene, true);
    const well = inn.well;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1, 20), this.stone);
    ring.position.set(well.x, 0.5, well.z); ring.castShadow = true; this.scene.add(ring);
    for (const dx of [-0.9, 0.9]) this.box(0.12, 2.4, 0.12, well.x + dx, 1.5, well.z, "#7c6a4c");
    this.box(2.2, 0.1, 0.9, well.x, 2.7, well.z, "#8f6f4d");
    this.obstacles.push({ x: well.x, z: well.z, rx: 1.4, rz: 1.4 });
    for (const [x, z] of [[-45, 20], [-27, 20], [-45, 36], [-27, 36]] as const) this.plant(x, z, 1.4);
    this.bench(-36, 19, 0); this.bench(-36, 37, Math.PI);
    for (const dx of [6, 14, 22]) this.window(inn.x0 + dx, 5.8, inn.z1 + 0.02, 1.2, 1.8, Math.PI);
  }

  // Generic building shell: walls with a door gap, floor, an optional ceiling and roof.
  private building(
    box: { x0: number; x1: number; z0: number; z1: number },
    height: number,
    color: string,
    door: { side: "west" | "east" | "south" | "north"; z?: number; x?: number; width: number },
    roof: "tiles" | "open" | "flat" | "dome",
    windowsEvery = 0,
  ) {
    const t = 0.6, { x0, x1, z0, z1 } = box;
    this.ground(x0, x1, z0, z1, this.stone, 0.006);
    const gap = (a: number, b: number, at: number, w: number) => [[a, at - w / 2], [at + w / 2, b]] as const;
    // West and east walls run the full depth; north and south walls sit between them.
    const westParts = door.side === "west" ? gap(z0, z1, door.z!, door.width) : [[z0, z1]] as const;
    const eastParts = door.side === "east" ? gap(z0, z1, door.z!, door.width) : [[z0, z1]] as const;
    const southParts = door.side === "south" ? gap(x0, x1, door.x!, door.width) : [[x0, x1]] as const;
    const northParts = door.side === "north" ? gap(x0, x1, door.x!, door.width) : [[x0, x1]] as const;
    for (const [a, b] of westParts) this.wall(x0 - t, x0, a, b, height, color);
    for (const [a, b] of eastParts) this.wall(x1, x1 + t, a, b, height, color);
    for (const [a, b] of southParts) this.wall(a, b, z1, z1 + t, height, color);
    for (const [a, b] of northParts) this.wall(a, b, z0 - t, z0, height, color);
    // Lintel and arch above the door.
    if (door.side === "west" || door.side === "east") {
      const x = door.side === "west" ? x0 - t / 2 : x1 + t / 2;
      this.box(t, height - 4.6, door.width + 0.4, x, 4.6 + (height - 4.6) / 2, door.z!, color, this.scene, true);
      this.box(t + 0.3, 0.4, door.width + 1.2, x, 4.55, door.z!, "#c9b691");
    } else {
      const z = door.side === "south" ? z1 + t / 2 : z0 - t / 2;
      this.box(door.width + 0.4, height - 4.6, t, door.x!, 4.6 + (height - 4.6) / 2, z, color, this.scene, true);
      this.box(door.width + 1.2, 0.4, t + 0.3, door.x!, 4.55, z, "#c9b691");
    }
    if (roof === "open") {
      for (const [a, b, zz] of [[x0, x1, z0 - t / 2], [x0, x1, z1 + t / 2]] as const) this.box(b - a + 2 * t, 0.3, t + 0.6, (a + b) / 2, height + 0.15, zz, "#b8653f");
      for (const xx of [x0 - t / 2, x1 + t / 2]) this.box(t + 0.6, 0.3, z1 - z0, xx, height + 0.15, (z0 + z1) / 2, "#b8653f");
    } else {
      this.box(x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, height + 0.15, (z0 + z1) / 2, "#f3efe2");
      const sky = this.box(Math.min(8, (x1 - x0) * 0.4), 0.06, Math.min(10, (z1 - z0) * 0.4), (x0 + x1) / 2, height - 0.04, (z0 + z1) / 2, "#dbe9e5");
      sky.material = this.material("#dbe9e5").clone(); sky.material.emissive.set("#dbe9e5"); sky.material.emissiveIntensity = 0.5;
      for (let z = z0 + 4; z < z1; z += 6) this.box(x1 - x0, 0.25, 0.2, (x0 + x1) / 2, height - 0.12, z, "#bfa581");
      for (let x = x0 + 4; x < x1; x += 6) this.box(0.2, 0.25, z1 - z0, x, height - 0.12, (z0 + z1) / 2, "#bfa581");
      for (const [x, z] of [[x0 + 5, z0 + 5], [x1 - 5, z0 + 5], [x0 + 5, z1 - 5], [x1 - 5, z1 - 5], [(x0 + x1) / 2, (z0 + z1) / 2]] as const) {
        const light = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), new THREE.MeshBasicMaterial({ color: "#fff2c7" }));
        light.rotation.x = Math.PI / 2; light.position.set(x, height - 0.02, z); this.scene.add(light);
      }
      if (roof === "tiles") this.roof(x0, x1, z0, z1, height + 0.3, 2.6);
    }
    if (windowsEvery) {
      for (let z = z0 + windowsEvery / 2; z < z1; z += windowsEvery) {
        if (door.side !== "west" || Math.abs(z - door.z!) > door.width) this.window(x0 - t - 0.02, height * 0.62, z, 1.4, 2.2, -Math.PI / 2);
        if (door.side !== "east" || Math.abs(z - door.z!) > door.width) this.window(x1 + t + 0.02, height * 0.62, z, 1.4, 2.2, Math.PI / 2);
      }
    }
    for (const side of [x0 - t, x1 + t]) this.box(0.1, 0.2, z1 - z0, side + (side < (x0 + x1) / 2 ? t + 0.05 : -t - 0.05), 0.1, (z0 + z1) / 2, "#b5a07e");
  }

  private buildCorso() {
    const c = CITY, k = c.corso;
    this.ground(-k.arcade - 0.5, k.arcade + 0.5, k.z0 - 2, k.z1 + 2, this.cobbles, 0.003);
    this.box(4, 0.012, k.z1 - k.z0, 0, 0.012, (k.z0 + k.z1) / 2, "#e4dccb");
    const facades = ["#d9b18a", "#e2cfa7", "#c8a08c", "#d6c1a0", "#b9b3a1", "#e0b99a"];
    for (const side of [-1, 1]) {
      // Ground-floor arcade with the paintings on the house fronts; upper floors above.
      for (let z = k.z1 - 2; z > k.z0; z -= 5) {
        if (Math.abs(z - k.passageZ) < 4) continue;
        this.column(side * k.x, z, 5, 0.3);
      }
      this.box(0.5, 0.4, k.z1 - k.z0, side * k.x, 5.2, (k.z0 + k.z1) / 2, "#c9b691", this.scene, true);
      const houses = 6;
      for (let i = 0; i < houses; i++) {
        const z1 = k.z1 - i * ((k.z1 - k.z0) / houses), z0 = z1 - (k.z1 - k.z0) / houses, zc = (z0 + z1) / 2;
        const color = facades[(i + (side > 0 ? 3 : 0)) % facades.length];
        const passage = Math.abs(zc - k.passageZ) < 7;
        // Ground floor: the façade behind the arcade, opened for the passage to the park or market.
        if (passage) {
          this.wall(side * k.arcade, side * (k.arcade + 0.6), z0, k.passageZ - 3, 5.4, color);
          this.wall(side * k.arcade, side * (k.arcade + 0.6), k.passageZ + 3, z1, 5.4, color);
          this.box(0.6, 1.6, 6.4, side * (k.arcade + 0.3), 4.6, k.passageZ, color, this.scene, true);
        } else this.wall(side * k.arcade, side * (k.arcade + 0.6), z0, z1, 5.4, color);
        // Upper floors set on the arcade line, with shutters and balconies.
        const height = 11 + (i % 2) * 1.5;
        this.wall(side * k.x, side * (k.arcade + 10), z0, z1, height - 5.4, color, 5.4);
        this.box(10.6 + 0.6, 0.3, z1 - z0 + 0.4, side * (k.x + 5.3), height + 0.15, zc, "#b8653f");
        this.roof(Math.min(side * k.x, side * (k.arcade + 10)), Math.max(side * k.x, side * (k.arcade + 10)), z0, z1, height + 0.3, 2);
        for (const dz of [-3.5, 3.5]) {
          this.window(side * (k.x - 0.02), 8, zc + dz, 1.2, 1.8, side > 0 ? -Math.PI / 2 : Math.PI / 2);
          this.box(0.9, 0.06, 2, side * (k.x - 0.4), 6.8, zc + dz, "#8a7a5c");
          for (let r = -0.9; r <= 0.9; r += 0.3) this.box(0.05, 0.9, 0.05, side * (k.x - 0.85), 7.3, zc + dz + r, "#6e8171");
          this.box(0.05, 0.05, 2, side * (k.x - 0.85), 7.75, zc + dz, "#6e8171");
        }
        for (let s = 0; s < 8; s++) {
          const awning = this.box(1.7, 0.08, 0.7, side * (k.x + 0.9), 5.05, z1 - 1 - s * 0.7, s % 2 ? "#f2e5c9" : (side > 0 ? "#8a9a84" : "#b56b5a"));
          awning.rotation.z = side * 0.14;
        }
      }
      for (const z of [k.z1 - 12, k.z1 - 32, k.z1 - 52, k.z1 - 72]) this.lamp(side * 6.6, z, 4.2);
    }
    for (const side of [-1, 1]) this.plant(side * 6.2, k.passageZ + 8, 1.1);
    this.sign("CATHEDRAL SQUARE AHEAD", "PARK WEST · MARKET EAST · PASSAGES HALFWAY", 0, 6, k.z0 + 1.2, 0, 8);
  }

  private buildPark() {
    const c = CITY, p = c.park;
    this.ground(p.x0, p.x1, p.z0, p.z1, this.material("#8a9c72"), 0.002);
    // Gravel paths in a cross and around the pond.
    this.box(6, 0.02, p.z1 - p.z0, (p.x0 + p.x1) / 2, 0.012, (p.z0 + p.z1) / 2, "#e0d9c3");
    this.box(p.x1 - p.x0, 0.02, 6, (p.x0 + p.x1) / 2, 0.014, c.corso.passageZ, "#e0d9c3");
    this.ground(p.x1 - 2, -c.corso.arcade, c.corso.passageZ - 3, c.corso.passageZ + 3, this.cobbles, 0.004);
    for (const side of [-1, 1]) this.wall(p.x1 - 0.3, p.x1 + 0.3, side > 0 ? c.corso.passageZ + 3 : p.z0, side > 0 ? p.z1 : c.corso.passageZ - 3, 2.4, "#d5c6a6");
    for (const [x0, x1] of [[p.x0, p.x1]] as const) { this.wall(x0, x1, p.z0 - 0.3, p.z0 + 0.3, 2.4, "#d5c6a6"); this.wall(x0, x1, p.z1 - 0.3, p.z1 + 0.3, 2.4, "#d5c6a6"); }
    this.wall(p.x0 - 0.3, p.x0 + 0.3, p.z0, p.z1, 2.4, "#d5c6a6");
    const pond = p.pond;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: "#739e9b", roughness: 0.25, metalness: 0.28, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2; water.scale.set(pond.rx, pond.rz, 1); water.position.set(pond.x, 0.05, pond.z); this.scene.add(water);
    const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 40), this.material("#bfbca1"));
    rim.rotation.x = -Math.PI / 2; rim.scale.set(pond.rx, pond.rz, 1); rim.position.set(pond.x, 0.06, pond.z); this.scene.add(rim);
    this.obstacles.push({ x: pond.x, z: pond.z, rx: pond.rx + 0.5, rz: pond.rz + 0.5 });
    for (let i = 0; i < 8; i++) {
      const lily = this.botany.lily(i);
      lily.position.set(pond.x + Math.sin(i * 2.4) * 3, 0.07, pond.z + Math.cos(i * 3.1) * 4);
      lily.rotation.y = i * 2.4; this.scene.add(lily);
    }
    // Bandstand landmark on the south lawn.
    const b = p.bandstand;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r + 0.3, 0.5, 8), this.material("#d9d0b8"));
    base.position.set(b.x, 0.25, b.z); base.castShadow = true; this.scene.add(base);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), this.material("#6e8171"));
      post.position.set(b.x + Math.cos(angle) * (b.r - 0.4), 2.5, b.z + Math.sin(angle) * (b.r - 0.4)); this.scene.add(post);
    }
    const dome = new THREE.Mesh(new THREE.ConeGeometry(b.r + 0.4, 2.2, 8), this.material("#587a77"));
    dome.position.set(b.x, 5.6, b.z); dome.castShadow = true; this.scene.add(dome);
    this.obstacles.push({ x: b.x, z: b.z, rx: b.r + 0.3, rz: b.r + 0.3 });
    // Trees, beds and benches keep clear of the display sightlines.
    const spots: [number, number, number][] = [[-58, -14, 1.2], [-26, -14, 1.1], [-58, -58, 1.3], [-26, -58, 1.2], [-34, -50, 1.1], [-56, -34, 1.0], [-26, -40, 1.1], [-50, -20, 1.0]];
    spots.forEach(([x, z, size], i) => this.tree(x, z, size, i + 3));
    const beds = this.botany.flowerBeds();
    beds.position.set(-42 + 0, 0, -36 + 92); beds.scale.setScalar(0.6); this.scene.add(beds);
    this.bench(-36, -20, Math.PI); this.bench(-48, -20, Math.PI); this.bench(-42, -54, 0);
    this.lamp(-38, -30); this.lamp(-46, -30); this.lamp(-42, -46);
    this.districtSign(4, p.x1 - 0.5, 3.4, c.corso.passageZ - 5.5, Math.PI / 2, 4.4);
    this.districtSign(9, p.x1 - 0.5, 3.4, c.corso.passageZ + 5.5, Math.PI / 2, 4.4);
  }

  private buildMarket() {
    const c = CITY, mk = c.market, center = MARKET_CENTER;
    this.ground(mk.x0, mk.x1, mk.z0, mk.z1, this.cobbles, 0.002);
    this.ground(c.corso.arcade, mk.x0 + 2, c.corso.passageZ - 3, c.corso.passageZ + 3, this.cobbles, 0.004);
    for (const side of [-1, 1]) this.wall(mk.x0 - 0.3, mk.x0 + 0.3, side > 0 ? c.corso.passageZ + 3 : mk.z0, side > 0 ? mk.z1 : c.corso.passageZ - 3, 2.4, "#d5c6a6");
    this.wall(mk.x0, mk.x1, mk.z0 - 0.3, mk.z0 + 0.3, 2.4, "#d5c6a6"); this.wall(mk.x0, mk.x1, mk.z1 - 0.3, mk.z1 + 0.3, 2.4, "#d5c6a6");
    this.wall(mk.x1 - 0.3, mk.x1 + 0.3, mk.z0, mk.z1, 2.4, "#d5c6a6");
    const stallColors = ["#a26055", "#748c76", "#c09c56", "#7395a1", "#a77d93", "#bf805e"];
    const slots = DISTRICTS[12].slots;
    slots.forEach((p, slot) => {
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z); g.rotation.y = p.yaw; this.scene.add(g);
      const color = stallColors[slot];
      // The stall's goods and posts are behind its painting, never across its view.
      this.box(7.2, 0.2, 3, 0.85, 0.1, -1.5, "#b7a181", g);
      this.box(7.2, 1.15, 0.8, 0.85, 0.65, -2.2, "#95734e", g);
      for (const x of [-2.6, 4.3]) for (const z of [-0.6, -2.8]) this.box(0.11, 6.2, 0.11, x, 3.1, z, "#8d7050", g);
      for (let stripe = 0; stripe < 12; stripe++) {
        const roof = this.box(0.62, 0.09, 3.7, -2.55 + stripe * 0.62, 6.15, -1.55, stripe % 2 ? "#f4e3bf" : color, g);
        roof.rotation.x = -0.09;
        this.box(0.62, 0.3, 0.08, -2.55 + stripe * 0.62, 5.86, 0.29, stripe % 2 ? "#f4e3bf" : color, g);
      }
      for (let crate = 0; crate < 3; crate++) {
        const x = -1.65 + crate * 2.3;
        this.box(1.7, 0.45, 0.7, x, 1.35, -2.2, "#b18b54", g);
        for (let slat = 0; slat < 4; slat++) this.box(0.08, 0.5, 0.77, x - 0.7 + slat * 0.46, 1.35, -2.2, "#775d3a", g);
        for (let fruit = 0; fruit < 8; fruit++) {
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), this.material(["#c68244", "#7c9957", "#b8624e"][(slot + crate) % 3]));
          ball.position.set(x - 0.55 + (fruit % 4) * 0.36, 1.63 + (fruit > 3 ? 0.07 : 0), -2.38 + Math.floor(fruit / 4) * 0.34); g.add(ball);
        }
      }
      const obstacleCenter = new THREE.Vector3(0.85, 0, -1.6).applyAxisAngle(Y_AXIS, p.yaw);
      const cs = Math.abs(Math.cos(p.yaw)), sn = Math.abs(Math.sin(p.yaw));
      this.obstacles.push({ x: p.x + obstacleCenter.x, z: p.z + obstacleCenter.z, rx: cs * 3.8 + sn * 1.7, rz: sn * 3.8 + cs * 1.7 });
    });
    // Bunting spans the square well above the stalls.
    for (const offset of [-9, 9]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) points.push(new THREE.Vector3(mk.x0 + 1 + i * ((mk.x1 - mk.x0 - 2) / 24), 8.8 - Math.sin(i / 24 * Math.PI) * 1.3, center.z + offset));
      const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.025, 4, false), this.material("#756b50")); this.scene.add(cord);
      for (let i = 1; i < 24; i++) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.38, 0, 0, 0.38, 0, 0, 0, -0.75, 0], 3)); geometry.computeVertexNormals();
        const flag = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: stallColors[i % 6], side: THREE.DoubleSide }));
        flag.position.copy(points[i]); this.scene.add(flag);
      }
      for (const x of [mk.x0 + 1, mk.x1 - 1]) this.box(0.16, 9, 0.16, x, 4.5, center.z + offset, "#807157");
    }
    for (const [x, z] of [[mk.x0 + 4, mk.z0 + 4], [mk.x1 - 4, mk.z0 + 4], [mk.x0 + 4, mk.z1 - 4], [mk.x1 - 4, mk.z1 - 4]] as const) this.tree(x, z, 1.4, x + z);
    this.districtSign(12, mk.x0 + 0.5, 3.4, c.corso.passageZ - 5.5, -Math.PI / 2, 4.4);
  }

  private buildCathedralSquare() {
    const c = CITY, sq = c.cathedralSquare;
    this.ground(-sq.x, sq.x, sq.z0, sq.z1 + 2, this.cobbles, 0.003);
    this.ground(-c.sideLanes.x1, c.sideLanes.x1, c.cathedral.z0 - 2, sq.z0, this.cobbles, 0.004);
    const st = sq.statue;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 2.2, 8), this.material("#cfc4a6"));
    plinth.position.set(st.x, 1.1, st.z); plinth.castShadow = true; this.scene.add(plinth);
    const figure = new THREE.Group(); figure.position.set(st.x, 2.2, st.z); this.scene.add(figure);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 2.6, 12), this.material("#7c8773", 0.4, 0.3)); body.position.y = 1.3; figure.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), this.material("#7c8773", 0.4, 0.3)); head.position.y = 3; figure.add(head);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 1.6, 8), this.material("#7c8773", 0.4, 0.3)); arm.position.set(0.5, 2.2, -0.3); arm.rotation.z = -1.1; arm.rotation.x = 0.6; figure.add(arm);
    this.obstacles.push({ x: st.x, z: st.z, rx: st.r, rz: st.r });
    for (const x of [-22, 22]) for (const z of [-78, -102]) this.lamp(x, z, 4.4);
    for (const x of [-12, 12]) { this.bench(x, -76, Math.PI); this.bench(x, -104, 0); }
    for (const side of [-1, 1]) this.tree(side * 26, -104, 1.6, 40 + side, false);
    this.building(c.palazzo, 10, "#dcc19a", { side: "east", z: c.palazzo.door.z, width: 6 }, "tiles", 7);
    this.building(c.guildhall, 10, "#e5d3b3", { side: "west", z: c.guildhall.door.z, width: 6 }, "tiles", 7);
    this.districtSign(10, c.palazzo.x1 + 0.95, 6.4, c.palazzo.door.z, Math.PI / 2, 5.4);
    this.districtSign(2, c.guildhall.x0 - 0.95, 6.4, c.guildhall.door.z, -Math.PI / 2, 5.4);
    this.districtSign(6, c.townHall.x0 - 0.95, 6.4, c.townHall.door.z, -Math.PI / 2, 5.4);
    this.districtSign(8, c.inn.x1 + 0.95, 6.4, c.inn.door.z, Math.PI / 2, 5.4);
    // Chandeliers in the two grand halls.
    for (const hall of [c.palazzo, c.guildhall]) {
      const x = (hall.x0 + hall.x1) / 2, z = (hall.z0 + hall.z1) / 2;
      this.box(0.1, 2, 0.1, x, 8.9, z, "#9b7b40");
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.055, 6, 24), this.material("#b08a44", 0.3, 0.5));
      ring.rotation.x = Math.PI / 2; ring.position.set(x, 7.6, z); this.scene.add(ring);
      for (let i = 0; i < 10; i++) {
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), this.material("#fff3cf").clone());
        (glow.material as THREE.MeshStandardMaterial).emissive.set("#ffe8ae"); (glow.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
        glow.position.set(x + Math.sin(i * Math.PI / 5) * 1.65, 7.95, z + Math.cos(i * Math.PI / 5) * 1.65); this.scene.add(glow);
      }
    }
  }

  private buildCathedral() {
    const c = CITY, ca = c.cathedral, x0 = -ca.x, x1 = ca.x;
    this.building({ x0, x1, z0: ca.z0, z1: ca.z1 }, 14, "#e9dcc4", { side: "south", x: 0, width: ca.door * 2 }, "flat");
    // Nave columns, tall windows, and the dome over the crossing.
    for (const x of [-12, 12]) for (const z of [-118, -126, -134, -142]) this.column(x, z, 12, 0.5, "#eadeca");
    for (const side of [-1, 1]) for (const z of [-118, -130, -142]) this.window(side * (ca.x + 0.62), 8, z, 1.4, 5, side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 4, 32), this.material("#e9dcc4"));
    drum.position.set(0, 16.3, -130); drum.castShadow = true; this.scene.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.material("#8c9a8a", 0.5, 0.2));
    dome.position.set(0, 18.3, -130); dome.castShadow = true; this.scene.add(dome);
    const lanternTop = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3, 12), this.material("#e9dcc4"));
    lanternTop.position.set(0, 28.5, -130); this.scene.add(lanternTop);
    const cross = this.box(0.25, 2.2, 0.25, 0, 31.2, -130, "#b08a44"); cross.castShadow = true;
    this.box(1.2, 0.25, 0.25, 0, 31.6, -130, "#b08a44");
    // Inside: an oculus and a ring of light under the dome.
    const oculus = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), new THREE.MeshBasicMaterial({ color: "#dbe9e5" }));
    oculus.rotation.x = Math.PI / 2; oculus.position.set(0, 13.9, -130); this.scene.add(oculus);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 1.8, 12), this.material("#b08a44", 0.35, 0.6));
    bell.position.set(0, 26, -130); this.scene.add(bell);
    for (const side of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 22, 5), this.material("#e9dcc4"));
      tower.position.set(side * 16, 11, ca.z1 - 2); tower.castShadow = true; this.scene.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 4, 4), this.tiles);
      cap.rotation.y = Math.PI / 4; cap.position.set(side * 16, 24, ca.z1 - 2); this.scene.add(cap);
    }
    this.districtSign(5, 0, 7.4, ca.z1 + 0.95, 0, 7);
    this.districtSign(13, c.cistern.x0 - 0.95, 6.2, c.cistern.door.z, -Math.PI / 2, 5.4);
  }

  private buildCistern() {
    const c = CITY, ci = c.cistern;
    this.building(ci, 7, "#8e8c7c", { side: "west", z: ci.door.z, width: 6 }, "flat");
    this.ground(ci.x0, ci.x1, ci.z0, ci.z1, this.material("#6d6e62"), 0.02);
    for (const x of [ci.x0 + 8, ci.x0 + 20]) for (const z of [ci.z0 + 8, ci.z0 + 16, ci.z0 + 24]) this.column(x, z, 7, 0.45, "#7a7b6e");
    for (const [x, z] of [[ci.x0 + 4, ci.z0 + 4], [ci.x1 - 4, ci.z0 + 4], [ci.x0 + 4, ci.z1 - 4], [ci.x1 - 4, ci.z1 - 4]] as const) {
      this.box(0.32, 1.35, 0.32, x, 0.675, z, "#4d5551");
      const glass = this.box(0.24, 0.35, 0.24, x, 1.32, z, "#efd29a");
      glass.material = this.material("#efd29a").clone(); glass.material.emissive.set("#ffd494"); glass.material.emissiveIntensity = 1.2;
      this.obstacles.push({ x, z, rx: 0.4, rz: 0.4 });
    }
    const light = new THREE.PointLight("#ffd99e", 22, 40, 1.6);
    light.position.set((ci.x0 + ci.x1) / 2, 5, (ci.z0 + ci.z1) / 2); this.scene.add(light);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 10), new THREE.MeshStandardMaterial({ color: "#3f5d63", roughness: 0.2, metalness: 0.4 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set((ci.x0 + ci.x1) / 2, 0.03, (ci.z0 + ci.z1) / 2); this.scene.add(pool);
    this.box(6.4, 0.3, 0.3, (ci.x0 + ci.x1) / 2, 0.15, (ci.z0 + ci.z1) / 2 - 5.1, "#5f6058"); this.box(6.4, 0.3, 0.3, (ci.x0 + ci.x1) / 2, 0.15, (ci.z0 + ci.z1) / 2 + 5.1, "#5f6058");
    this.box(0.3, 0.3, 10.4, (ci.x0 + ci.x1) / 2 - 3.1, 0.15, (ci.z0 + ci.z1) / 2, "#5f6058"); this.box(0.3, 0.3, 10.4, (ci.x0 + ci.x1) / 2 + 3.1, 0.15, (ci.z0 + ci.z1) / 2, "#5f6058");
    this.obstacles.push({ x: (ci.x0 + ci.x1) / 2, z: (ci.z0 + ci.z1) / 2, rx: 3.4, rz: 5.4 });
  }

  private buildOldTown() {
    const c = CITY;
    // Promenade across the whole Old Town, then the canal street and the lanes.
    this.ground(-c.wallX, c.wallX, c.promenade.z0 - 1, c.promenade.z1 + 1, this.cobbles, 0.003);
    for (const side of [-1, 1]) {
      this.ground(side > 0 ? OUTER_EDGE : -c.wallX, side > 0 ? c.wallX : -OUTER_EDGE, c.wallNorth, c.promenade.z0, this.cobbles, 0.003);
    }
    for (const offset of BLOCK_OFFSETS) {
      this.ground(offset - c.canal.street, offset + c.canal.street, c.canal.z0 - 1, c.canal.z1 + 1, this.cobbles, 0.003);
      if (offset === 0) {
        // The canal: sunken water between stone walls, crossed by a bridge at every lane.
        const water = new THREE.Mesh(new THREE.PlaneGeometry(c.canal.x * 2, c.canal.z1 - c.canal.z0), new THREE.MeshStandardMaterial({ color: "#5f8e93", roughness: 0.2, metalness: 0.35 }));
        water.rotation.x = -Math.PI / 2; water.position.set(0, -1.1, (c.canal.z0 + c.canal.z1) / 2); this.scene.add(water);
        for (const side of [-1, 1]) {
          this.box(0.3, 1.6, c.canal.z1 - c.canal.z0, side * c.canal.x, -0.8, (c.canal.z0 + c.canal.z1) / 2, "#a99a7c");
          this.box(0.4, 0.6, c.canal.z1 - c.canal.z0, side * (c.canal.x + 0.2), 0.3, (c.canal.z0 + c.canal.z1) / 2, "#c7c5ab");
        }
        for (const lz of [...LANE_ZS, c.canal.z1 - 2, c.canal.z0 + 2]) {
          this.box(c.canal.x * 2 + 1.2, 0.5, LANE_HALF * 2, 0, 0.02, lz, "#d3c8ad", this.scene, true);
          for (const side of [-1, 1]) this.box(c.canal.x * 2 + 1.2, 0.9, 0.25, 0, 0.7, lz + side * LANE_HALF, "#bfae8d");
        }
        for (let z = c.canal.z1 - 8; z > c.canal.z0; z -= 16) { this.lamp(-c.canal.street + 1.2, z, 3.4); this.lamp(c.canal.street - 1.2, z + 8, 3.4); }
      } else {
        for (let z = c.canal.z1 - 8; z > c.canal.z0; z -= 20) { this.tree(offset - 4, z, 1.3, z); this.tree(offset + 4, z - 10, 1.3, z + 1); }
      }
    }
    for (const [row, lz] of LANE_ZS.entries()) {
      this.ground(-c.wallX, c.wallX, lz - LANE_HALF - 0.4, lz + LANE_HALF + 0.4, this.cobbles, 0.003);
      // Lane signs at each canal bridge list the roots along the lane.
      for (const column of BLOCK_OFFSETS.keys()) {
        const lane = column * MAX_LANES + row, count = laneHouseCount(lane);
        if (count <= 0) continue;
        const roots = Array.from({ length: count }, (_, i) => this.options.rooms[ROOT_START + lane * HOUSES_PER_LANE + i].house!.display);
        const offset = BLOCK_OFFSETS[column];
        for (const side of [-1, 1]) {
          this.sign(() => `${translate("LANE", this.options.locale)} ${lane + 1} · ${count} ${translate("HOUSES", this.options.locale)}`, roots.slice(0, 8).join("  ·  ") + (roots.length > 8 ? "  ·  …" : ""), offset + side * (c.canal.street + 0.3), 4.6, lz, side > 0 ? -Math.PI / 2 : Math.PI / 2, 5.8);
          for (const dz of [-2.6, 2.6]) this.box(0.14, 5.6, 0.14, offset + side * (c.canal.street + 0.3), 2.8, lz + dz, "#7c795d");
        }
      }
      // Laundry lines and lamps make the lanes lived-in; both sit on plot boundaries, clear of doors.
      for (const offset of BLOCK_OFFSETS) for (const boundary of [-72, -40, 40, 72]) {
        const x = offset + boundary;
        const cord = this.box(0.03, 0.03, LANE_HALF * 2 + 0.4, x, 5.4, lz, "#8a8474");
        cord.castShadow = false;
        for (let k = 0; k < 5; k++) this.box(0.5, 0.7, 0.02, x, 5.0, lz - 2.4 + k * 1.2, ["#d9c9a7", "#8fa4b6", "#c78e7f", "#e9e2d1", "#9aae8c"][k]);
        this.lamp(x + 16, lz + (row % 2 ? -1 : 1) * (LANE_HALF - 0.6), 3.2);
      }
    }
    // Houses are zones: built near the visitor, released far away.
    for (let i = 0; i < ROOT_COUNT; i++) {
      const origin = rootRoomTransform(ROOT_START + i);
      this.zones.push({ room: ROOT_START + i, x: origin.x, z: origin.z, group: null, textures: [], localized: [], frames: [], paintings: [] });
    }
    // Empty plots on the last lane become a small orchard.
    const lastLane = LANE_COUNT - 1, used = laneHouseCount(lastLane);
    for (let slot = used; slot < HOUSES_PER_LANE; slot++) {
      const north = slot % 2 === 0, plot = Math.floor(slot / 2);
      const x = blockOffset(laneColumn(lastLane)) + houseColumnX(plot), z = laneZ(laneRow(lastLane)) + (north ? -1 : 1) * (LANE_HALF + ROOT_ROOM.depth / 2);
      this.ground(x - 8, x + 8, z - 7, z + 7, this.material("#8a9c72"), 0.004);
      this.tree(x - 3, z, 1.2, slot + 60); this.tree(x + 4, z + (north ? -3 : 3), 1.1, slot + 61);
    }
    this.sign("THE OLD TOWN", "ROOT FAMILIES · THEME HOUSES · WORD FAMILIES · LEVEL LANES", 0, 5.6, c.promenade.z1 + 0.5, 0, 9);
  }

  private buildLandmarks() {
    const c = CITY;
    // Bell tower beyond the last bridge, and the observatory on its hill outside the walls.
    const bt = c.bellTower;
    this.box(6, 30, 6, bt.x, 15, bt.z, "#e2d3b4", this.scene, true);
    for (const side of [-1, 1]) {
      this.box(0.4, 4, 2.6, bt.x + side * 2.8, 27, bt.z, "#e2d3b4"); this.box(2.6, 4, 0.4, bt.x, 27, bt.z + side * 2.8, "#e2d3b4");
    }
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 1.8, 12), this.material("#b08a44", 0.35, 0.6));
    bell.position.set(bt.x, 27.5, bt.z); this.scene.add(bell);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.6, 4.4, 4), this.tiles);
    cap.rotation.y = Math.PI / 4; cap.position.set(bt.x, 32.2, bt.z); this.scene.add(cap);
    const clock = this.canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = "#f7f0da"; ctx.beginPath(); ctx.arc(128, 128, 110, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#5b5340"; ctx.lineWidth = 8; ctx.stroke();
      for (let i = 0; i < 12; i++) { ctx.save(); ctx.translate(128, 128); ctx.rotate(i * Math.PI / 6); ctx.fillStyle = "#5b5340"; ctx.fillRect(-4, -100, 8, 18); ctx.restore(); }
      ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128, 60); ctx.stroke();
      ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(185, 128); ctx.stroke();
    });
    const face = this.panel(clock, 3.6, 3.6, bt.x, 20, bt.z + 3.02); face.rotation.y = 0;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.material("#9ead8d"));
    hill.position.set(c.observatory.x, -14, c.observatory.z); hill.scale.set(70, 34, 60); this.scene.add(hill);
    const obs = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 8, 24), this.material("#f0e6d0"));
    obs.position.set(c.observatory.x, 22, c.observatory.z); this.scene.add(obs);
    const obsDome = new THREE.Mesh(new THREE.SphereGeometry(5.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.material("#b8bfbf", 0.4, 0.5));
    obsDome.position.set(c.observatory.x, 26, c.observatory.z); this.scene.add(obsDome);
    for (let i = 0; i < 14; i++) {
      const hillock = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), this.material(["#9ead8d", "#899e87", "#b2bca0"][i % 3]));
      hillock.position.set(-160 + i * 26, -8, c.observatory.z - 90 - (i % 3) * 30);
      hillock.scale.set(28 + (i % 3) * 10, 18 + (i % 4) * 6, 26); this.scene.add(hillock);
    }
    // Cypresses along the walls outside, seen over the ramparts.
    for (let z = c.wallSouth - 30; z > c.wallNorth; z -= 36) for (const side of [-1, 1]) {
      const cypress = new THREE.Mesh(new THREE.ConeGeometry(1.4, 12, 8), this.material("#3f5a45"));
      cypress.position.set(side * (c.wallX + 6), 6, z); this.scene.add(cypress);
    }
  }

  private buildExhibits() {
    this.checkTextures = [false, true].map((checked) =>
      this.canvasTexture(128, 128, (ctx) => {
        ctx.fillStyle = checked ? "#42694e" : "#e8b945";
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = checked ? "#fff9e8" : "#86621b";
        ctx.lineWidth = 6;
        ctx.strokeRect(18, 18, 92, 92);
        if (checked) {
          ctx.lineWidth = 12;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(36, 63);
          ctx.lineTo(55, 84);
          ctx.lineTo(93, 43);
          ctx.stroke();
        }
      }),
    );
    this.videoTexture = this.canvasTexture(128, 92, (ctx) => {
      ctx.fillStyle = "#cc4336";
      ctx.beginPath();
      ctx.roundRect(4, 4, 120, 84, 20);
      ctx.fill();
      ctx.fillStyle = "#fff9ed";
      ctx.beginPath();
      ctx.moveTo(51, 24);
      ctx.lineTo(51, 68);
      ctx.lineTo(88, 46);
      ctx.fill();
    });
    // Thematic galleries and the garden are built once; root-room displays belong to zones.
    for (const [index, exhibit] of this.options.exhibits.entries())
      for (const placement of exhibitPlacements(exhibit))
        if (!isRootRoom(placement.area)) this.buildDisplay(exhibit, index, placement, this.scene);
  }

  private buildDisplay(
    exhibit: Exhibit,
    index: number,
    placement: { x: number; z: number; yaw: number; area: number },
    parent: THREE.Object3D,
  ) {
    const loader = new THREE.TextureLoader();
    const outdoor = freestanding(placement.area);
    const group = new THREE.Group();
    group.position.set(placement.x, 0, placement.z);
    group.rotation.y = placement.yaw;
    group.scale.setScalar(displayScale(placement.area));
    parent.add(group);
    if (outdoor) {
      // Solid, freestanding display walls face clear paths in the park, market and mole.
      this.box(5.6, 5.1, 0.28, 0.85, 2.55, -0.19, "#ddd9c4", group, true);
      this.box(5.85, 0.16, 0.48, 0.85, 5.18, -0.19, "#b8a078", group, true);
      this.box(5.7, 0.15, 0.65, 0.85, 0.075, -0.19, "#c6bfa6", group);
      const center = new THREE.Vector3(0.85, 0, -0.19).applyAxisAngle(
        Y_AXIS,
        placement.yaw,
      );
      const c = Math.abs(Math.cos(placement.yaw)), s = Math.abs(Math.sin(placement.yaw));
      this.obstacles.push({
        x: placement.x + center.x,
        z: placement.z + center.z,
        rx: c * 3.2 + s * 0.65,
        rz: s * 3.2 + c * 0.65,
      });
    }
    const frameColor = "#9a744f";
    // A mural is painted straight onto the wall: no frame or mat, only a faint halo that glows until the word is checked.
    const mural = !!exhibit.artwork?.mural;
    const frame = mural
      ? this.box(3.0, 3.0, 0.01, 0, 2.85, 0.02, frameColor, group)
      : this.box(2.64, 3.24, 0.13, 0, 3.15, 0.06, frameColor, group, true);
    if (!mural) {
      this.box(2.36, 2.96, 0.035, 0, 3.15, 0.14, "#eee8d7", group);
      this.box(2.2, 2.2, 0.012, 0, 2.85, 0.165, "#faf7e9", group);
    }
    let texture = this.paintingTextures.get(exhibit.image);
    this.paintingUses.set(exhibit.image, (this.paintingUses.get(exhibit.image) ?? 0) + 1);
    this.activeZone?.paintings.push(exhibit.image);
    if (!texture) {
      texture = loader.load(
        assetUrl(exhibit.image),
        (loaded: THREE.Texture) => {
          if (this.disposed) return;
          const image = loaded.image as HTMLImageElement;
          if (image.width > 768) {
            const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = Math.round(image.height * 768 / image.width);
            canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
            loaded.source = new THREE.Source(canvas); loaded.needsUpdate = true;
          }
          this.needsRender = true;
        },
        undefined,
        () =>
          this.options.onError(
            `The artwork for “${exhibit.word}” could not load. You can still read its exhibit.`,
          ),
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      this.textures.push(texture);
      this.paintingTextures.set(exhibit.image, texture);
    }
    const art = mural
      ? this.panel(texture, 2.84, 2.84, 0, 2.85, 0.03, group)
      : this.panel(texture, 2.16, 2.16, 0, 2.85, 0.177, group);
    const target: ExhibitHit = {
      exhibit,
      action: "open",
      area: placement.area,
    };
    frame.userData.target = target;
    art.userData.target = target;
    frame.material = this.material(frameColor).clone();
    const isChecked = this.checked.has(exhibit.id);
    if (mural) {
      frame.material.transparent = true;
      frame.material.depthWrite = false;
      frame.material.opacity = isChecked ? 0 : 0.35;
    }
    frame.material.color.set(isChecked ? frameColor : "#daa32e");
    frame.material.emissive.set("#ffc43d");
    frame.material.emissiveIntensity = isChecked ? 0 : 0.32;
    const checkbox = this.panel(
      this.checkTextures[Number(this.checked.has(exhibit.id))],
      0.58,
      0.58,
      1.65,
      4.32,
      0.18,
      group,
    );
    checkbox.userData.target = { ...target, action: "check" };
    (this.activeZone?.frames ?? this.displayFrames).push({
      id: exhibit.id,
      material: frame.material,
      checkedColor: frameColor,
      halo: mural,
      checkbox,
      position: group.position.clone(),
      phase: index * 0.23,
    });
    // The icon occupies only the caption's top row, above all gloss text.
    const video = this.panel(
      this.videoTexture,
      0.24,
      0.1725,
      -1.06,
      1.335,
      0.1,
      group,
    );
    video.userData.target = { ...target, action: "video" };
    const family = isRootRoom(placement.area) ? familyIn(exhibit, placement.area) : undefined;
    const bannerTexture = this.canvasTexture(1024, 260, (ctx) => {
      ctx.fillStyle = "#355d47";
      ctx.fillRect(0, 0, 1024, 260);
      ctx.fillStyle = "#b5bb8d";
      ctx.fillRect(38, 22, 948, 2);
      ctx.fillRect(38, 236, 948, 2);
      let fontSize = 152;
      ctx.font = `500 ${fontSize}px "Cormorant Garamond"`;
      while (ctx.measureText(exhibit.word).width > 908 && fontSize > 80) {
        fontSize -= 2;
        ctx.font = `500 ${fontSize}px "Cormorant Garamond"`;
      }
      ctx.fillStyle = "#faf5e7";
      ctx.textBaseline = "middle";
      if (family) {
        // In a root room the shared root glows gold inside the word.
        const segments = family.pieces.map((piece) => piece.joined);
        let x = 512 - ctx.measureText(exhibit.word).width / 2;
        ctx.textAlign = "left";
        segments.forEach((segment, i) => {
          ctx.fillStyle = i === family.rootIndex ? "#f0c66a" : "#faf5e7";
          ctx.fillText(segment, x, 140);
          x += ctx.measureText(segment).width;
        });
      } else {
        ctx.textAlign = "center";
        ctx.fillText(exhibit.word, 512, 140);
      }
    });
    const banner = this.panel(
      bannerTexture,
      2.36,
      0.6,
      0,
      4.32,
      0.177,
      group,
    );
    banner.userData.target = target;
    banner.userData.wordBanner = true;
    const label = this.canvasTexture(
      1024,
      310,
      (ctx) => {
        ctx.fillStyle = "#f5f1e6";
        ctx.fillRect(0, 0, 1024, 310);
        ctx.fillStyle = "#777d66";
        ctx.font = '20px "DM Sans"';
        ctx.fillText(
          `NO. ${String(index + 1).padStart(2, "0")}   /   ${translate(partOfSpeech(exhibit.pos), this.options.locale).toUpperCase()}${
            family ? `   /   ${family.pieces.map((piece) => piece.surface).join(" + ")}` : ""
          }`,
          200,
          46,
        );
        ctx.fillStyle = "#343e31";
        const meaning = exhibit.translations[this.options.locale];
        if (meaning) {
          ctx.font = '42px "DM Sans", sans-serif';
          ctx.fillText(meaning, 45, 123);
        }
        ctx.fillStyle = "#666956";
        ctx.font = '25px "DM Sans"';
        this.wrapText(
          ctx,
          exhibit.definition,
          45,
          meaning ? 183 : 110,
          930,
          37,
        );
      },
      true,
    );
    const plaque = this.panel(label, 2.52, 0.85, 0, 1, 0.05, group);
    plaque.userData.target = target;
    plaque.userData.gameCaption = target.area;
    // Examples sit beside the framed sticker, like a museum curator's note.
    const example = this.canvasTexture(
      500,
      960,
      (ctx) => {
        ctx.fillStyle = "#62674f";
        ctx.font = '20px "DM Sans"';
        ctx.fillText(
          this.options.locale === "zh_TW"
            ? "把單字放進生活"
            : "IN A SENTENCE",
          28,
          68,
        );
        ctx.fillStyle = "#b0a284";
        ctx.fillRect(28, 92, 55, 2);
        ctx.fillStyle = "#505640";
        ctx.font = 'italic 35px "Cormorant Garamond"';
        const end = this.wrapText(
          ctx,
          `“${exhibit.example}”`,
          28,
          150,
          444,
          46,
        );
        const translation =
          exhibit.exampleTranslations[this.options.locale];
        if (translation) {
          ctx.font = '25px "DM Sans", sans-serif';
          ctx.fillStyle = "#69715b";
          this.wrapText(ctx, translation, 28, end + 30, 444, 37);
        }
        ctx.fillStyle = "#6c735e";
        ctx.font = '19px "DM Sans"';
        ctx.fillText(
          this.options.locale === "zh_TW"
            ? "點選畫作，閱讀與聆聽"
            : "Click the artwork to read & listen",
          28,
          915,
        );
      },
      true,
    );
    this.panel(example, 1.45, 2.2, 2.16, 2.76, 0.03, group).userData.gameCaption = target.area;
  }

  private shadow(x: number, z: number, w: number, d: number) {
    const texture = this.canvasTexture(128, 128, (ctx) => {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(42,32,16,0.26)");
      gradient.addColorStop(1, "rgba(42,32,16,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    });
    const mesh = this.panel(texture, w, d, x, 0.016, z);
    mesh.rotation.x = -Math.PI / 2;
  }

  private plant(x: number, z: number, scale = 1) {
    const group = this.botany.pottedPlant(Math.round(Math.abs(x * 17 + z)));
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    this.scene.add(group);
    this.shadow(x, z, 2 * scale, 2 * scale);
    this.obstacles.push({ x, z, rx: 0.55 * scale, rz: 0.55 * scale });
  }

  private buildZone(zone: Zone) {
    const { width: w, depth: d } = ROOT_ROOM;
    const index = zone.room, room = this.options.rooms[index], house = room.house!;
    const root = { display: house.display, translations: house.translations, meaning: house.note, origin: house.note, words: house.words };
    const origin = rootRoomTransform(index), style = houseStyle(index);
    const h = style === "shop" ? ROOT_ROOM.height : 5.6;
    // The zone group sits at the world origin: the house shell is transformed inside it,
    // while displays keep the world placements shared with the map and navigation.
    const zoneGroup = new THREE.Group();
    const hall = new THREE.Group();
    hall.position.set(origin.x, 0, origin.z);
    hall.rotation.y = origin.yaw;
    zoneGroup.add(hall);
    zone.group = zoneGroup;
    this.activeZone = zone;
    const tint = new THREE.Color(room.color);
    const wall = `#${tint.clone().lerp(new THREE.Color("#f2ede1"), 0.66).getHexString()}`;
    const facade = `#${tint.clone().lerp(new THREE.Color("#e8c9a0"), 0.5).getHexString()}`;
    const trim = `#${tint.clone().lerp(new THREE.Color("#5b5340"), 0.35).getHexString()}`;
    this.box(w, 0.12, d, 0, -0.06, 0, "#d9d3bf", hall);
    this.box(4, 0.014, d, 0, 0.012, 0, "#e9e3d2", hall);
    for (let z = -d / 2 + 2; z < d / 2; z += 2) this.box(w, 0.009, 0.025, 0, 0.02, z, "#c9c2ad", hall);
    for (let x = -w / 2 + 2; x < w / 2; x += 2) this.box(0.025, 0.009, d, x, 0.02, 0, "#c9c2ad", hall);
    this.box(w + 0.3, h, 0.3, 0, h / 2, -d / 2, wall, hall);
    for (const side of [-1, 1]) {
      this.box(0.3, h, d, side * w / 2, h / 2, 0, wall, hall);
      this.box(3.3, h, 0.3, side * (w / 2 - 1.5), h / 2, d / 2, facade, hall);
      this.box(0.1, 0.2, d, side * (w / 2 - 0.18), 0.1, 0, "#b5a07e", hall);
      this.box(0.34, h, 0.5, side * 4.9, h / 2, d / 2, "#e1d8c6", hall);
    }
    // Arched front: a lintel over the wide opening, a tiled coping or a full roof.
    this.box(10.6, h - 5.3, 0.34, 0, h - (h - 5.3) / 2, d / 2, facade, hall);
    this.box(11.4, 0.4, 0.5, 0, 5.1, d / 2, "#c9b691", hall);
    this.box(w, 0.2, 0.1, 0, 0.1, -d / 2 + 0.2, "#b5a07e", hall);
    if (style === "shop") {
      this.box(w, 0.2, d, 0, h + 0.1, 0, "#f3efe2", hall);
      const sky = this.box(6, 0.06, 6, 0, h - 0.03, 0, "#dbe9e5", hall);
      sky.material = this.material("#dbe9e5").clone();
      sky.material.emissive.set("#dbe9e5");
      sky.material.emissiveIntensity = 0.4;
      for (const z of [-4.7, 4.7]) this.box(w, 0.22, 0.16, 0, h - 0.11, z, "#bfa581", hall);
      const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.35, d + 1), this.tiles);
      roofMesh.position.set(0, h + 0.4, 0); roofMesh.castShadow = true; hall.add(roofMesh);
      const ridge = new THREE.Mesh(new THREE.ConeGeometry(w * 0.7, 2, 4), this.tiles);
      ridge.scale.z = d / w; ridge.rotation.y = Math.PI / 4; ridge.position.set(0, h + 1.5, 0); hall.add(ridge);
      for (const x of [-5.5, 5.5]) for (const z of [-3.5, 3.5]) {
        const light = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshBasicMaterial({ color: "#fff2c7" }));
        light.rotation.x = Math.PI / 2;
        light.position.set(x, h - 0.01, z);
        hall.add(light);
      }
      for (const dx of [-5.5, 5.5]) {
        const shutterWindow = this.box(1.2, 1.5, 0.08, dx, h - 1.8, d / 2 + 0.2, "#f6ecc9", hall);
        shutterWindow.material = this.material("#f6ecc9").clone(); shutterWindow.material.emissive.set("#f3e2b0"); shutterWindow.material.emissiveIntensity = 0.4;
        for (const side of [-1, 1]) this.box(0.55, 1.5, 0.06, dx + side * 0.9, h - 1.8, d / 2 + 0.2, "#587a77", hall);
      }
    } else {
      // Courtyard: open to the sky, tiled copings, vines at the corners.
      for (const [bw, bd, bx, bz] of [[w + 0.9, 0.9, 0, -d / 2], [0.9, d + 0.9, -w / 2, 0], [0.9, d + 0.9, w / 2, 0]] as const) {
        const coping = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.3, bd), this.tiles);
        coping.position.set(bx, h + 0.15, bz); hall.add(coping);
      }
      this.box(11.6, 0.3, 0.9, 0, h + 0.15, d / 2, "#b8653f", hall);
      for (const [x, z] of [[-6.6, -5.6], [6.6, -5.6]] as const) {
        const vine = this.botany.pottedPlant(index + Math.round(x));
        vine.position.set(x, 0, z); vine.scale.setScalar(1.3); hall.add(vine);
      }
      for (let i = 0; i < 10; i++) {
        const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.28, 6), this.material("#7f9a6a"));
        leaf.position.set(-w / 2 + 0.2, 2.5 + (i % 5) * 0.55, -6 + i * 0.9); leaf.rotation.y = Math.PI / 2; hall.add(leaf);
      }
    }
    // A flush floor inlay keeps the house information below every painting sightline.
    const floorInfo = this.canvasTexture(1536, 1024, (ctx) => {
      ctx.fillStyle = "#eee7d5"; ctx.fillRect(0, 0, 1536, 1024);
      ctx.fillStyle = room.color; ctx.fillRect(28, 28, 1480, 968);
      ctx.fillStyle = "#eee7d5"; ctx.fillRect(42, 42, 1452, 940);
      ctx.strokeStyle = trim; ctx.lineWidth = 2; ctx.strokeRect(60, 60, 1416, 904);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#635f4d"; ctx.font = '500 38px "DM Sans", sans-serif';
      ctx.fillText(translate(house.kind === "root" ? "ROOT FAMILY" : house.kind === "theme" ? "THEME HOUSE" : house.kind === "family" ? "WORD FAMILY HOUSE" : "LEVEL LANE", this.options.locale), 768, 120, 1300);
      ctx.fillStyle = "#354638";
      let fontSize = house.display.length > 12 ? 110 : 220;
      ctx.font = `italic 500 ${fontSize}px "Cormorant Garamond", serif`;
      while (ctx.measureText(root.display).width > 1300 && fontSize > 48) { fontSize -= 6; ctx.font = `italic 500 ${fontSize}px "Cormorant Garamond", serif`; }
      ctx.fillText(root.display, 768, 285, 1300);
      ctx.fillStyle = "#354638"; ctx.font = '500 64px "DM Sans", sans-serif';
      ctx.fillText(root.translations[this.options.locale] || room.root?.meaning || root.meaning, 768, 445, 1290);
      ctx.strokeStyle = room.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(568, 515); ctx.lineTo(968, 515); ctx.stroke();
      // Origins and the family list wrap instead of squeezing six words onto a line.
      ctx.fillStyle = "#635f4d"; ctx.font = '38px "DM Sans", sans-serif';
      this.wrapText(ctx, house.kind === "root" ? room.root!.origin : root.meaning, 768, 590, 1270, 48);
      ctx.fillStyle = "#354638"; ctx.font = '500 46px "DM Sans", sans-serif';
      this.wrapText(ctx, root.words.join("  ·  "), 768, 760, 1240, 64);
    }, true);
    const floorPlaque = this.panel(floorInfo, 7.2, 4.8, 0, 0.035, 0, hall);
    floorPlaque.rotation.x = -Math.PI / 2;
    floorPlaque.userData.floorInfo = index;
    const sign = this.canvasTexture(1024, 200, (ctx) => {
      ctx.fillStyle = room.color; ctx.fillRect(0, 0, 1024, 200);
      ctx.strokeStyle = "#e6dcbd"; ctx.lineWidth = 3; ctx.strokeRect(16, 16, 992, 168);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#faf5e7"; ctx.font = `italic 500 ${house.display.length > 12 ? 44 : 84}px "Cormorant Garamond", serif`;
      ctx.fillText(root.display, 300, 100, 440);
      ctx.fillStyle = "#f2e9cf"; ctx.textAlign = "left"; ctx.font = '500 34px "DM Sans", sans-serif';
      ctx.fillText(root.translations[this.options.locale] || root.meaning, 560, 72, 430);
      ctx.fillStyle = "#dfd6b4"; ctx.font = '24px "DM Sans", sans-serif';
      ctx.fillText(`${translate(house.kind === "root" ? "ROOT FAMILY" : "TOWNHOUSE", this.options.locale)} · ${root.words.length} ${translate("words", this.options.locale)}`, 560, 130, 430);
    }, true);
    this.panel(sign, 5.6, 1.1, 0, h - 0.7, d / 2 + 0.18, hall);
    for (const [exhibitIndex, exhibit] of this.options.exhibits.entries())
      for (const placement of exhibitPlacements(exhibit))
        if (placement.area === index) this.buildDisplay(exhibit, exhibitIndex, placement, zoneGroup);
    this.activeZone = null;
    this.displayFrames.push(...zone.frames);
    this.scene.add(zoneGroup);
    this.renderer.shadowMap.needsUpdate = true;
    this.needsRender = true;
  }

  private releaseZone(zone: Zone) {
    if (!zone.group) return;
    this.scene.remove(zone.group);
    zone.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of mats) if (!Array.from(this.materials.values()).includes(material)) material.dispose();
      }
    });
    zone.textures.forEach((texture) => texture.dispose());
    for (const image of zone.paintings) {
      const uses = (this.paintingUses.get(image) ?? 1) - 1;
      this.paintingUses.set(image, uses);
      if (uses <= 0) {
        this.paintingTextures.get(image)?.dispose();
        this.paintingTextures.delete(image);
        this.paintingUses.delete(image);
      }
    }
    const released = new Set(zone.frames);
    this.displayFrames = this.displayFrames.filter((frame) => !released.has(frame));
    zone.group = null;
    zone.textures = [];
    zone.localized = [];
    zone.frames = [];
    zone.paintings = [];
    this.needsRender = true;
  }

  private updateZones(force = false) {
    const now = performance.now();
    if (!force && now - this.lastZoneCheck < 300) return;
    this.lastZoneCheck = now;
    const { x, z } = this.camera.position;
    for (const zone of this.zones) {
      const distance = Math.max(Math.abs(zone.x - x), Math.abs(zone.z - z));
      if (!zone.group && distance < ZONE_BUILD_DISTANCE) this.buildZone(zone);
      else if (zone.group && distance > ZONE_RELEASE_DISTANCE) this.releaseZone(zone);
    }
  }

  private resize = () => {
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.game?.mode === "step") this.setGame(this.game);
    this.needsRender = true;
  };

  private pointerDown = (event: PointerEvent) => {
    if (this.blocked || event.button !== 0) return;
    this.renderer.domElement.focus({ preventScroll: true });
    this.dragging = true;
    this.dragDistance = 0;
    this.transition = null;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.blocked) return;
    if (this.dragging) {
      const dx = event.clientX - this.lastPointer.x,
        dy = event.clientY - this.lastPointer.y;
      this.dragDistance += Math.abs(dx) + Math.abs(dy);
      this.needsRender = true;
      this.yaw -= dx * 0.0035;
      this.pitch = clamp(this.pitch - dy * 0.0035, -0.8, 0.8);
      this.lastPointer = { x: event.clientX, y: event.clientY };
    } else this.updateHover(event.clientX, event.clientY);
  };
  private pointerUp = (event: PointerEvent) => {
    if (!this.blocked && this.dragging && this.dragDistance < 7) {
      if (this.game) {
        this.answerGameAt(event.clientX, event.clientY);
        this.pointerCancel();
        return;
      }
      const hit = this.pick(event.clientX, event.clientY);
      if (hit?.action === "check") {
        const next = new Set(this.checked);
        if (next.has(hit.exhibit.id)) next.delete(hit.exhibit.id);
        else next.add(hit.exhibit.id);
        this.setChecked([...next]);
        this.options.onToggleChecked(hit.exhibit);
      } else if (hit?.action === "video") this.options.onVideo(hit.exhibit);
      else if (hit) this.options.onSelect(hit.exhibit, hit.area);
    }
    this.pointerCancel();
  };
  private pointerCancel = () => {
    this.dragging = false;
  };
  private preventContext = (event: Event) => event.preventDefault();
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError(
      "The 3D view was interrupted. Your collection is safe. Reload the page to return to the museum.",
    );
  };

  private pickObject(x: number, y: number): THREE.Object3D | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Check the architecture too, so paintings cannot be selected through walls.
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    const first = hits.find(
      (hit) =>
        hit.object.userData.gameAnswer ||
        !(hit.object as THREE.Mesh).material ||
        !((hit.object as THREE.Mesh).material as THREE.Material).transparent ||
        hit.object.userData.target,
    );
    return first?.object ?? null;
  }
  private pick(x: number, y: number): ExhibitHit | null {
    return this.pickObject(x, y)?.userData.target ?? null;
  }
  private updateHover(x: number, y: number) {
    if (this.game) {
      const object = this.pickObject(x, y);
      this.renderer.domElement.style.cursor = object?.userData.gameAnswer || object?.userData.target ? "pointer" : "grab";
      return;
    }
    const hit = this.pick(x, y);
    const hoverId = hit ? `${hit.exhibit.id}:${hit.action}` : null;
    if (hoverId !== this.hoverId) {
      this.hoverId = hoverId;
      this.options.onHover(hit?.exhibit ?? null, hit?.action);
    }
    this.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
  }
  private keyDown = (event: KeyboardEvent) => {
    if (
      this.blocked ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      (event.target instanceof HTMLElement &&
        event.target.matches(
          "input, textarea, select, [contenteditable='true']",
        ))
    )
      return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyQ",
        "KeyE",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ShiftLeft",
        "ShiftRight",
      ].includes(event.code)
    ) {
      event.preventDefault();
      this.keys.add(event.code);
      this.transition = null;
    }
  };
  private keyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  private clearInput = () => {
    this.keys.clear();
    this.dragging = false;
  };

  setBlocked(blocked: boolean) {
    this.blocked = blocked;
    this.clearInput();
    if (blocked) {
      this.hoverId = null;
      this.options.onHover(null);
    }
  }
  setChecked(ids: string[]) {
    this.checked = new Set(ids);
    for (const display of this.displayFrames) {
      const checked = this.checked.has(display.id);
      display.checkbox.material.map = this.checkTextures[Number(checked)];
      display.material.color.set(checked ? display.checkedColor : "#daa32e");
      display.material.emissiveIntensity = checked ? 0 : 0.32;
      if (display.halo) display.material.opacity = checked ? 0 : 0.35;
    }
    this.needsRender = true;
  }
  setLocale(locale: string) {
    this.options.locale = locale;
    this.localizedTextures.forEach((redraw) => redraw());
    for (const zone of this.zones) zone.localized.forEach((redraw) => redraw());
    this.needsRender = true;
  }
  setMovement(
    direction: "forward" | "back" | "left" | "right",
    active: boolean,
  ) {
    const key = { forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD" }[
      direction
    ];
    if (active) {
      this.keys.add(key);
      this.transition = null;
    } else this.keys.delete(key);
  }
  setEvening(evening: boolean) {
    this.needsRender = true;
    this.renderer.toneMappingExposure = evening ? 0.78 : 1.22;
    this.hemisphere.color.set(evening ? "#e5d7c5" : "#fcf4e5");
    this.hemisphere.intensity = evening ? 1.7 : 2.3;
    this.sun.color.set(evening ? "#ffd19d" : "#fff4db");
    this.sun.intensity = evening ? 1.5 : 3.5;
  }

  goToRoom(room: number) {
    const pose = roomPose(room);
    this.moveCamera(new THREE.Vector3(pose.x, EYE_HEIGHT, pose.z), pose.yaw, isRootRoom(room) ? 0.04 : 0.05);
  }
  goToGate() {
    this.moveCamera(new THREE.Vector3(ENTRY.x, EYE_HEIGHT, ENTRY.z), ENTRY.yaw, 0.055);
  }

  goToExhibit(exhibit: Exhibit, preferredArea?: number) {
    const placements = exhibitPlacements(exhibit);
    const area = areaAt(this.camera.position.x, this.camera.position.z);
    // A room chosen in the collection wins; otherwise visitors already in the Old Town
    // stay there for a shared word.
    const placement =
      (preferredArea !== undefined ? placements.find((p) => p.area === preferredArea) : undefined) ||
      placements.find((p) => p.area === area) ||
      (isRootRoom(area) || area === STREETS_INDEX ? placements.find((p) => isRootRoom(p.area)) : null) ||
      placements[0];
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(
      Y_AXIS,
      placement.yaw,
    );
    const position = new THREE.Vector3(
      placement.x,
      EYE_HEIGHT,
      placement.z,
    ).addScaledVector(normal, freestanding(placement.area) ? 4.3 : 4.9);
    this.moveCamera(position, placement.yaw, freestanding(placement.area) ? 0.2 : 0.29);
    return placement.area;
  }
  private moveCamera(to: THREE.Vector3, yaw: number, pitch = 0.08) {
    this.needsRender = true;
    this.clearInput();
    const delta = Math.atan2(
      Math.sin(yaw - this.yaw),
      Math.cos(yaw - this.yaw),
    );
    // Fade for room changes avoids passing through walls or furniture.
    const far = this.camera.position.distanceTo(to) > 8;
    const crossesObstacle = Array.from({ length: 20 }, (_, i) => {
      const point = new THREE.Vector3().lerpVectors(
        this.camera.position,
        to,
        (i + 1) / 20,
      );
      return !this.canMove(point.x, point.z);
    }).some(Boolean);
    if (far || crossesObstacle || this.reducedMotion) {
      this.camera.position.copy(to);
      this.yaw += delta;
      this.pitch = pitch;
      this.transition = null;
      this.updateZones(true);
    } else
      this.transition = {
        from: this.camera.position.clone(),
        to,
        fromYaw: this.yaw,
        toYaw: this.yaw + delta,
        fromPitch: this.pitch,
        toPitch: pitch,
        start: performance.now(),
        duration: 900,
      };
  }

  private gameTexture(draw: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 512;
    draw(canvas.getContext("2d")!);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.gameTextures.push(texture);
    return texture;
  }

  setGame(game: SceneGame | null) {
    for (const mask of this.gameMasks) mask.mesh.material.map = mask.map;
    this.gameMasks = [];
    for (const floor of this.hiddenFloor) floor.visible = true;
    this.hiddenFloor = [];
    this.gameGroup?.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
      }
    });
    this.gameGroup?.removeFromParent();
    this.gameGroup = null;
    this.gameTextures.forEach(texture => texture.dispose());
    this.gameTextures = [];
    this.game = game;
    this.needsRender = true;
    this.hoverId = null;
    this.options.onHover(null);
    if (!game) { this.standingTile = null; return; }
    this.updateZones(true);
    if (!game.enabled) this.clearInput();
    if (game.mode === "restore" || game.conceal) {
      this.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !object.userData.wordBanner) return;
        const target: ExhibitHit = object.userData.target;
        const number = game.exhibits.findIndex(e => e.id === target.exhibit.id);
        if (target.area !== game.room || number < 0 || (!game.conceal && game.restored.includes(target.exhibit.id))) return;
        this.gameMasks.push({ mesh: object, map: object.material.map });
        object.material.map = this.gameTexture(ctx => {
          ctx.fillStyle = "#ebe1c7"; ctx.fillRect(0, 0, 1024, 512);
          ctx.strokeStyle = "#8c7351"; ctx.lineWidth = 7; ctx.setLineDash([22, 14]); ctx.strokeRect(24, 24, 976, 464);
          ctx.fillStyle = "#695839"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.font = '500 250px "Cormorant Garamond", serif'; ctx.fillText(String(number + 1).padStart(2, "0"), 512, 268);
        });
      });
    }
    if (game.mode === "market") { this.buildGameNeighbours(game); return; }
    this.scene.traverse(object => {
      if (((game.mode === "step" || game.conceal) && object.userData.floorInfo === game.room) ||
          (game.conceal && object.userData.gameCaption === game.room)) {
        object.visible = false; this.hiddenFloor.push(object);
      }
    });
    if (game.mode !== "step") return;
    const origin = rootRoomTransform(game.room);
    const group = new THREE.Group();
    group.position.set(origin.x, 0, origin.z); group.rotation.y = origin.yaw;
    this.gameGroup = group; this.scene.add(group);
    const portrait = this.camera.aspect < 0.85;
    game.exhibits.forEach((exhibit, i) => {
      const correct = game.restored.includes(exhibit.id);
      const texture = this.gameTexture(ctx => {
        ctx.fillStyle = correct ? "#466c54" : "#eee3c8"; ctx.fillRect(0, 0, 1024, 512);
        ctx.strokeStyle = correct ? "#b9d3ac" : "#92794f"; ctx.lineWidth = 7; ctx.strokeRect(22, 22, 980, 468);
        ctx.fillStyle = correct ? "#f7f1df" : "#435842"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = '500 58px "DM Sans", sans-serif'; ctx.fillText(correct ? "✓" : String(i + 1).padStart(2, "0"), 512, 115);
        ctx.font = '500 104px "Cormorant Garamond", serif'; ctx.fillText(exhibit.word, 512, 284, 890);
      });
      const width = portrait ? 2.6 : 2.85, depth = portrait ? 1.2 : 2;
      const tile = this.panel(texture, width, depth, portrait ? 0 : i % 2 ? 1.65 : -1.65, 0.045, portrait ? 1.4 - i * 1.6 : i < 2 ? 1.35 : -1.15, group);
      tile.userData.halfWidth = width / 2;
      tile.userData.halfDepth = depth / 2;
      tile.rotation.x = -Math.PI / 2;
      tile.userData.gameAnswer = exhibit.id;
    });
  }

  private buildGameNeighbours(game: SceneGame) {
    const group = new THREE.Group(); this.gameGroup = group; this.scene.add(group);
    (game.actors ?? []).forEach((actor, i) => {
      const neighbour = new THREE.Group(); neighbour.position.set(MARKET_CENTER.x - 1, 0, MARKET_CENTER.z - 6 + i * 6);
      neighbour.rotation.y = -Math.PI / 2; neighbour.userData.actorId = actor.id; group.add(neighbour);
      const part = (geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .85 }));
        mesh.position.set(x, y, z); mesh.castShadow = true; neighbour.add(mesh); return mesh;
      };
      // Small wooden figures stand in the open square, away from all six paintings.
      for (const x of [-.19, .19]) {
        part(new THREE.CylinderGeometry(.11, .13, .6, 10), "#625747", x, .37, 0);
        part(new THREE.SphereGeometry(.15, 12, 8), "#3d493c", x, .13, .08).scale.set(1, .6, 1.5);
        const arm = part(new THREE.CylinderGeometry(.095, .11, .7, 10), actor.color, x * 2.2, 1.2, .07);
        arm.rotation.z = x < 0 ? -.2 : .2;
        part(new THREE.SphereGeometry(.11, 10, 8), "#d9ad7d", x * 2.5, .86, .07);
      }
      part(new THREE.CylinderGeometry(.3, .38, .95, 16), actor.color, 0, 1.15, 0);
      part(new THREE.BoxGeometry(.48, .62, .06), "#eadbb9", 0, 1.04, .32);
      part(new THREE.SphereGeometry(.28, 20, 14), "#d9ad7d", 0, 1.87, 0);
      for (const x of [-.1, .1]) part(new THREE.SphereGeometry(.025, 8, 6), "#3f4134", x, 1.91, .254);
      part(new THREE.SphereGeometry(.045, 10, 8), "#bc895d", 0, 1.85, .28);
      part(new THREE.CylinderGeometry(.39, .39, .07, 24), i === 0 ? "#f8edd7" : actor.color, 0, 2.12, 0);
      part(new THREE.CylinderGeometry(.23, .27, i === 0 ? .3 : .12, 20), i === 0 ? "#f8edd7" : actor.color, 0, 2.24, 0);
      const badge = this.gameTexture(ctx => {
        ctx.fillStyle = actor.complete ? "#42694e" : actor.active ? "#c59b4d" : "#e5dac1"; ctx.fillRect(0, 0, 1024, 512);
        ctx.strokeStyle = "#f8efda"; ctx.lineWidth = 7; ctx.strokeRect(22, 22, 980, 468);
        ctx.fillStyle = actor.complete ? "#fff7e5" : "#374c3b"; ctx.textAlign = "center";
        ctx.font = '500 90px "DM Sans", sans-serif'; ctx.fillText(actor.complete ? "✓" : String(i + 1).padStart(2, "0"), 512, 170);
        ctx.font = '500 130px "Cormorant Garamond", serif'; ctx.fillText(actor.name, 512, 340);
      });
      const tile = this.panel(badge, 1.85, 1, 0, .04, 1.2, neighbour); tile.rotation.x = -Math.PI / 2;
      neighbour.traverse(object => { object.userData.gameAnswer = `npc:${actor.id}`; });
    });
  }

  visitGameNeighbour(id: string) {
    const actor = this.gameGroup?.children.find(child => child.userData.actorId === id);
    if (!actor || this.game?.mode !== "market") return;
    this.clearInput(); this.transition = null;
    this.camera.position.set(actor.position.x - 4, EYE_HEIGHT, actor.position.z);
    this.yaw = -Math.PI / 2; this.pitch = this.camera.aspect < .85 ? -.34 : -.05;
    this.updateZones(true); this.needsRender = true;
  }

  resetGamePosition(room: number, floor = false) {
    // A level starting line lets visitors see all tiles; no answer is under their feet.
    const pose = roomPose(room);
    this.clearInput(); this.transition = null; this.standingTile = null;
    this.camera.position.set(pose.x, EYE_HEIGHT, pose.z);
    this.yaw = pose.yaw; this.pitch = floor ? -0.48 : room === 12 && this.camera.aspect < .85 ? -.27 : 0.04;
    this.updateZones(true); this.needsRender = true;
  }

  private answerGameAt(x: number, y: number) {
    if (!this.game?.enabled || this.blocked) return;
    const object = this.pickObject(x, y);
    if (this.game.mode === "step" || this.game.mode === "market") {
      if (object?.userData.gameAnswer) this.game.onAnswer(object.userData.gameAnswer);
    } else {
      const target: ExhibitHit | undefined = object?.userData.target;
      if (target?.area === this.game.room) this.game.onAnswer(target.exhibit.id);
    }
  }
  private gameDragOver = (event: DragEvent) => {
    if (this.game?.mode === "restore" && !this.blocked) event.preventDefault();
  };
  private gameDrop = (event: DragEvent) => {
    if (this.game?.mode !== "restore") return;
    event.preventDefault(); this.answerGameAt(event.clientX, event.clientY);
  };
  private checkGameStep(time: number) {
    if (this.blocked || !this.game?.enabled || this.game.mode !== "step" || !this.gameGroup || this.transition) return;
    const local = this.gameGroup.worldToLocal(this.camera.position.clone());
    const tile = this.gameGroup.children.find(child => Math.abs(local.x - child.position.x) < child.userData.halfWidth && Math.abs(local.z - child.position.z) < child.userData.halfDepth);
    const id: string | undefined = tile?.userData.gameAnswer;
    if (!id) { this.standingTile = null; return; }
    if (this.standingTile?.id !== id) this.standingTile = { id, since: time, answered: false };
    if (!this.standingTile.answered && time - this.standingTile.since > 600) {
      this.standingTile.answered = true;
      this.game.onAnswer(id);
    }
  }

  private canMove(x: number, z: number) {
    if (this.game?.mode === "market") {
      const b = CITY.market;
      if (x < b.x0 + .7 || x > b.x1 - .7 || z < b.z0 + .7 || z > b.z1 - .7) return false;
      if (this.gameGroup?.children.some(actor => Math.hypot(x - actor.position.x, z - actor.position.z) < .7)) return false;
    } else if (this.game) {
      const origin = rootRoomTransform(this.game.room);
      if (Math.abs(x - origin.x) > ROOT_ROOM.width / 2 - 0.65 || Math.abs(z - origin.z) > ROOT_ROOM.depth / 2 - 0.65) return false;
    }
    if (!withinGrounds(x, z)) return false;
    for (const obstacle of this.obstacles)
      if (
        Math.abs(x - obstacle.x) < obstacle.rx &&
        Math.abs(z - obstacle.z) < obstacle.rz
      )
        return false;
    return true;
  }

  private animate = (time: number) => {
    if (this.disposed) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    if (this.transition || (!this.blocked && this.keys.size))
      this.needsRender = true;
    if (this.transition) {
      const t = clamp(
        (performance.now() - this.transition.start) / this.transition.duration,
        0,
        1,
      );
      const ease = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(
        this.transition.from,
        this.transition.to,
        ease,
      );
      this.yaw = THREE.MathUtils.lerp(
        this.transition.fromYaw,
        this.transition.toYaw,
        ease,
      );
      this.pitch = THREE.MathUtils.lerp(
        this.transition.fromPitch,
        this.transition.toPitch,
        ease,
      );
      if (t === 1) this.transition = null;
    } else if (!this.blocked) {
      const forward =
        Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) -
        Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
      const strafe =
        Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
      const turn =
        Number(this.keys.has("ArrowLeft") || this.keys.has("KeyQ")) -
        Number(this.keys.has("ArrowRight") || this.keys.has("KeyE"));
      this.yaw += turn * dt * 1.2;
      const direction = new THREE.Vector3(strafe, 0, -forward)
        .normalize()
        .applyAxisAngle(Y_AXIS, this.yaw);
      const speed =
        (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 8 : 4.2) *
        dt;
      const nextX = this.camera.position.x + direction.x * speed;
      const nextZ = this.camera.position.z + direction.z * speed;
      if (this.canMove(nextX, this.camera.position.z))
        this.camera.position.x = nextX;
      if (this.canMove(this.camera.position.x, nextZ))
        this.camera.position.z = nextZ;
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.checkGameStep(time);
    if (!this.blocked) this.updateZones();
    if (time - this.lastReport > 150) {
      const { x, z } = this.camera.position;
      const pose = { x, z, yaw: this.yaw, room: areaAt(x, z) };
      if (
        !this.reportedPose ||
        pose.x !== this.reportedPose.x ||
        pose.z !== this.reportedPose.z ||
        pose.yaw !== this.reportedPose.yaw
      ) {
        this.options.onMove(pose);
        this.reportedPose = pose;
      }
      this.lastReport = time;
    }
    // A slow, restrained glow draws attention to unchecked frames only.
    if (
      !this.blocked &&
      !this.reducedMotion &&
      !document.hidden &&
      time - this.lastPulse > 80
    ) {
      for (const display of this.displayFrames) {
        if (
          !this.checked.has(display.id) &&
          display.position.distanceTo(this.camera.position) < 38
        ) {
          display.material.emissiveIntensity =
            0.22 +
            (1 - Math.cos((time / 6800) * Math.PI * 2 + display.phase)) * 0.26;
          this.needsRender = true;
        }
      }
      this.lastPulse = time;
    }
    // Leave the static scene alone while reading a flashcard or standing still.
    // This also gives slower devices time for interface and audio interactions.
    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  };

  dispose() {
    this.disposed = true;
    this.setGame(null);
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.pointerDown);
    canvas.removeEventListener("pointermove", this.pointerMove);
    canvas.removeEventListener("pointerup", this.pointerUp);
    canvas.removeEventListener("pointercancel", this.pointerCancel);
    canvas.removeEventListener("dragover", this.gameDragOver);
    canvas.removeEventListener("drop", this.gameDrop);
    canvas.removeEventListener("contextmenu", this.preventContext);
    canvas.removeEventListener("webglcontextlost", this.contextLost);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.clearInput);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const mats = Array.isArray(object.material)
          ? object.material
          : [object.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.textures.forEach((texture) => texture.dispose());
    for (const zone of this.zones) zone.textures.forEach((texture) => texture.dispose());
    this.paintingTextures.forEach((texture) => texture.dispose());
    this.renderer.dispose();
    canvas.remove();
  }
}
