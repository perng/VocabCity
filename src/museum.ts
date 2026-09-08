import * as THREE from "three";
import { Botany } from "./botany";
import { translate } from "./i18n";
import { assetUrl, partOfSpeech, type Exhibit } from "./types";
import {
  HALL_SPACING,
  HALL_WIDTH,
  HALL_FRONT,
  HALL_BACK,
  HALL_HEIGHT,
  GARDEN_WIDTH,
  GARDEN_BACK,
  GARDEN_INDEX,
  ENTRY,
  GALLERY_ENTRY,
  GALLERY_COUNT,
  ENTRANCE_INDEX,
  galleryTransform,
  inGallery,
  areaAt,
  withinGrounds,
  OUTDOOR_DISPLAYS,
} from "./layout";

export type Pose = { x: number; z: number; yaw: number; room: number };
type MuseumOptions = {
  locale: string;
  exhibits: Exhibit[];
  rooms: { name: string; color: string }[];
  checked: string[];
  onToggleChecked: (exhibit: Exhibit) => void;
  onVideo: (exhibit: Exhibit) => void;
  onSelect: (exhibit: Exhibit, area?: number) => void;
  onHover: (exhibit: Exhibit | null, action?: ExhibitHit["action"]) => void;
  onMove: (pose: Pose) => void;
  onReady: () => void;
  onError: (message: string) => void;
};
const ROOM_SPACING = HALL_SPACING;
const EYE_HEIGHT = 1.78;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

export function exhibitPlacement(exhibit: Pick<Exhibit, "room" | "slot">) {
  const slots = [
    { x: -11.78, z: 8, yaw: Math.PI / 2 },
    { x: -11.78, z: 0, yaw: Math.PI / 2 },
    { x: -11.78, z: -8, yaw: Math.PI / 2 },
    { x: 11.78, z: -8, yaw: -Math.PI / 2 },
    { x: 11.78, z: 0, yaw: -Math.PI / 2 },
    { x: 11.78, z: 8, yaw: -Math.PI / 2 },
  ];
  const slot = slots[exhibit.slot];
  return { ...inGallery(exhibit.room, slot.x, slot.z, slot.yaw), area: exhibit.room };
}

export function exhibitPlacements(exhibit: Exhibit) {
  const outdoor = OUTDOOR_DISPLAYS.find((p) => p.word === exhibit.word);
  return [
    exhibitPlacement(exhibit),
    ...(outdoor ? [{ ...outdoor, area: GARDEN_INDEX }] : []),
  ];
}

type ExhibitHit = {
  exhibit: Exhibit;
  action: "open" | "check" | "video";
  area: number;
};

export class Museum {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(68, 1, 0.08, 330);
  private renderer: THREE.WebGLRenderer;
  private keys = new Set<string>();
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
  private displayFrames: {
    id: string;
    material: THREE.MeshStandardMaterial;
    checkedColor: string;
    checkbox: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    position: THREE.Vector3;
    phase: number;
  }[] = [];
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
    this.scene.background = new THREE.Color("#c6dfe4");
    this.scene.fog = new THREE.Fog("#d7e5df", 100, 260);
    this.camera.position.set(ENTRY.x, EYE_HEIGHT, ENTRY.z);
    this.camera.rotation.order = "YXZ";
    this.hemisphere = new THREE.HemisphereLight("#fcf4e5", "#b6a084", 2.3);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight("#fff4db", 3.5);
    this.sun.position.set(-22, 32, -25);
    this.sun.target.position.set(0, 0, -48);
    this.scene.add(this.sun.target);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, {
      left: -130,
      right: 130,
      top: 110,
      bottom: -110,
      far: 300,
    });
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun);
    this.checked = new Set(options.checked);
    this.botany = new Botany((w, h, draw) => this.canvasTexture(w, h, draw));
    this.buildArchitecture();
    this.buildEntrance();
    this.buildExhibits();
    this.buildDecorations();
    this.buildGarden();
    this.buildCuriosities();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.resize();
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("contextmenu", this.preventContext);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.clearInput);
    this.renderer.setAnimationLoop(this.animate);
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
    this.textures.push(texture);
    if (localized)
      this.localizedTextures.push(() => {
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

  private buildArchitecture() {
    let seed = 17;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const floorTexture = this.canvasTexture(1024, 1024, (ctx) => {
      ctx.fillStyle = "#b2936d";
      ctx.fillRect(0, 0, 1024, 1024);
      for (let row = 0; row < 16; row++) {
        for (let col = -1; col < 4; col++) {
          const x = col * 342 + (row % 2) * 171;
          const shade = 61 + random() * 10;
          ctx.fillStyle = `hsl(33 32% ${shade}%)`;
          ctx.fillRect(x + 1, row * 64 + 1, 340, 62);
          for (let grain = 0; grain < 26; grain++) {
            ctx.strokeStyle = `rgba(87, 61, 34, ${random() * 0.06})`;
            ctx.lineWidth = random() * 1.5;
            ctx.beginPath();
            const y = row * 64 + random() * 62;
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x + 90, y + 3, x + 230, y - 3, x + 342, y);
            ctx.stroke();
          }
        }
      }
    });
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(4.5, 5.33);
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.68 });
    const colors = ["#e5e8dc", "#dfe8e6", "#ede1d4", "#e6e9da", "#d9e5dc", "#e3e3e8", "#e6e1d7", "#ebe0dc", "#ecdfce"];
    for (let room = 0; room < GALLERY_COUNT; room++) {
      const origin = galleryTransform(room);
      const hall = new THREE.Group();
      hall.position.set(origin.x, 0, origin.z);
      hall.rotation.y = origin.yaw;
      this.scene.add(hall);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 28), floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      hall.add(floor);
      this.box(8, 0.025, 28, 0, 0.006, 0, "#ded7c5", hall);
      for (const x of [-4, 4]) this.box(0.045, 0.009, 28, x, 0.025, 0, "#b5a172", hall);
      for (let z = -14; z < 14; z += 3.5) this.box(7.96, 0.005, 0.012, 0, 0.022, z, "#c6bfae", hall);
      for (const side of [-1, 1]) {
        this.box(0.3, HALL_HEIGHT, 28, side * 12, HALL_HEIGHT / 2, 0, colors[room], hall);
        this.box(0.1, 0.2, 28, side * 11.82, 0.1, 0, "#b5a07e", hall);
        this.box(0.12, 0.16, 28, side * 11.8, 7.8, 0, "#cabb9e", hall);
        for (const z of [-12, 12]) this.box(0.32, HALL_HEIGHT, 0.5, side * 11.7, HALL_HEIGHT / 2, z, "#e1d8c6", hall);
        this.box(8, 0.22, 28, side * 8, HALL_HEIGHT, 0, "#f3efe2", hall);
        this.box(0.065, 0.08, 25, side * 9.8, 7.5, 0, "#6e6958", hall);
        for (const z of [-8, 0, 8]) {
          const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.38, 12), this.material("#625e4e"));
          lamp.position.set(side * 9.8, 7.3, z);
          lamp.rotation.z = side * 0.6;
          hall.add(lamp);
          const light = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), new THREE.MeshBasicMaterial({ color: "#fff2c7" }));
          light.rotation.x = Math.PI / 2;
          light.position.y = -0.195;
          lamp.add(light);
        }
      }
      const sky = this.box(8, 0.06, 28, 0, 8.6, 0, "#dbe9e5", hall);
      sky.material.emissive.set("#dbe9e5");
      sky.material.emissiveIntensity = 0.35;
      for (let z = -14; z < 14; z += 7) this.box(24, 0.22, 0.16, 0, 8.18, z, "#bfa581", hall);
      for (const x of [-4, 4]) this.box(0.18, 0.25, 28, x, 8.25, 0, "#b69b76", hall);
      const sign = this.canvasTexture(1024, 160, (ctx) => {
        ctx.fillStyle = "#eeeadd"; ctx.fillRect(0, 0, 1024, 160);
        ctx.fillStyle = "#56644e"; ctx.textAlign = "center";
        ctx.font = '30px "DM Sans", sans-serif';
        ctx.fillText(`0${room + 1}   /   ${translate(this.options.rooms[room].name, this.options.locale)}`, 512, 75);
        ctx.font = '19px "DM Sans", sans-serif';
        const route = room < 3 ? "CENTRAL GALLERY · GARDEN AHEAD" : room < 6 ? "WEST WING · NATURE & LIGHT" : "EAST WING · PEOPLE & CONNECTION";
        ctx.fillText(translate(route, this.options.locale), 512, 122);
      }, true);
      this.box(5.7, 0.89, 0.06, 0, 6.8, 11.5, "#eeeadd", hall);
      this.panel(sign, 5.7, 0.89, 0, 6.8, 11.535, hall);
      for (const x of [-2.4, 2.4]) this.box(0.025, 1, 0.025, x, 7.7, 11.5, "#9c957d", hall);
      if (room === 5 || room === 8) {
        this.box(24, 8.4, 0.3, 0, 4.2, -14, colors[room], hall);
        for (const x of [-8, 0, 8]) {
          this.box(6.2, 5.9, 0.08, x, 3.7, -13.81, "#b9cfbf", hall);
          this.box(0.075, 5.9, 0.1, x, 3.7, -13.75, "#e2d6bb", hall);
        }
      }
    }
    this.box(24, 0.4, 0.45, 0, 8.1, HALL_BACK, "#bfa581");
  }

  private buildEntrance() {
    // Pale stone, high clerestories and a level compass floor connect all three routes.
    this.box(36, 0.12, 52, 0, -0.06, 40, "#ddd7c6");
    for (let x = -18; x <= 18; x += 3) this.box(0.025, 0.009, 52, x, 0.009, 40, "#c9c2ad");
    for (let z = 14; z <= 66; z += 3) this.box(36, 0.009, 0.025, 0, 0.009, z, "#c9c2ad");
    this.box(8, 0.014, 52, 0, 0.016, 40, "#ece6d6");
    this.box(36, 0.014, 8, 0, 0.026, 28, "#ece6d6");
    for (const x of [-4, 4]) this.box(0.045, 0.01, 52, x, 0.03, 40, "#bca471");
    for (const z of [24, 32]) this.box(36, 0.01, 0.045, 0, 0.036, z, "#bca471");
    for (const side of [-1, 1]) {
      this.box(6, 10.8, 0.32, side * 15, 5.4, 14, "#e9e2d1");
      this.box(11, 10.8, 0.32, side * 12.5, 5.4, 42, "#e9e2d1");
      this.box(0.35, 2.6, 28, side * 18, 9.5, 28, "#e9e2d1");
      for (const z of [15.4, 40.6]) {
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.67, 10.6, 24), this.material("#e6dcc5"));
        column.position.set(side * 16.7, 5.3, z); column.castShadow = true; this.scene.add(column);
        this.box(1.6, 0.25, 1.6, side * 16.7, 0.125, z, "#bca785");
        this.obstacles.push({ x: side * 16.7, z, rx: 1.05, rz: 1.05 });
      }
      this.box(10, 0.24, 28, side * 13, 10.85, 28, "#f0e9d8");
      this.plant(side * 13.8, 18.5, 1.8);
      this.plant(side * 14, 37.5, 1.7);
      this.box(4.4, 0.22, 1.25, side * 11.6, 0.58, 38.7, "#a38b65");
      this.box(4.35, 0.18, 1.2, side * 11.6, 0.76, 38.7, "#abb596");
      this.obstacles.push({ x: side * 11.6, z: 38.7, rx: 2.5, rz: 0.95 });
    }
    this.box(14, 3.1, 0.32, 0, 9.25, 42, "#e9e2d1");
    const skylight = this.box(16, 0.1, 28, 0, 11, 28, "#cbdedb");
    skylight.material.emissive.set("#cbdedb"); skylight.material.emissiveIntensity = 0.4;
    for (let z = 14; z <= 42; z += 4) this.box(36, 0.25, 0.18, 0, 10.6, z, "#b8a17a");
    for (const x of [-8, 0, 8]) this.box(0.18, 0.25, 28, x, 10.6, 28, "#b8a17a");
    const compass = this.canvasTexture(768, 768, (ctx) => {
      ctx.clearRect(0, 0, 768, 768); ctx.translate(384, 384);
      ctx.strokeStyle = '#ad9368'; ctx.lineWidth = 4;
      for (const radius of [295, 320]) { ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, -270); ctx.lineTo(46, 0); ctx.lineTo(0, 50); ctx.lineTo(-46, 0); ctx.closePath(); ctx.fillStyle = i % 2 ? '#c2b294' : '#839078'; ctx.fill(); ctx.restore();
      }
    });
    const compassFloor = this.panel(compass, 10, 10, 0, 0.045, 28);
    compassFloor.rotation.x = -Math.PI / 2;
    const sign = (text: string, x: number, y: number, z: number, width: number, yaw = 0) => {
      const texture = this.canvasTexture(1024, 230, (ctx) => {
        ctx.fillStyle = '#385c49'; ctx.fillRect(0, 0, 1024, 230);
        ctx.strokeStyle = '#b9aa7b'; ctx.lineWidth = 3; ctx.strokeRect(18, 18, 988, 194);
        ctx.fillStyle = '#f7f0da'; ctx.font = '40px "DM Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(translate(text, this.options.locale), 512, 115, 950);
      }, true);
      const panel = this.panel(texture, width, width * 230 / 1024, x, y, z); panel.rotation.y = yaw;
    };
    sign('CENTRAL GALLERY · GARDEN AHEAD', 0, 7.4, 14.3, 10);
    sign('← WEST WING · NATURE & LIGHT', -12, 7.1, 26, 8);
    sign('EAST WING · PEOPLE & CONNECTION →', 12, 7.1, 26, 8);
    this.box(36, 0.7, 0.35, 0, 0.35, 66, "#c7c5ab");
    for (const side of [-1, 1]) this.box(0.35, 0.7, 18, side * 18, 0.35, 57, "#c7c5ab");
    // An open gate is twelve metres wide; the mascot stands beside the walking route.
    for (const side of [-1, 1]) {
      this.box(1.2, 6.4, 1.25, side * 7.3, 3.2, 48, '#d4c4a6', this.scene, true);
      this.box(1.8, 0.3, 1.8, side * 7.3, 6.4, 48, '#b69b6e');
      this.box(10.1, 1.1, 0.4, side * 12.9, 0.55, 48, '#d2c5a9');
      this.box(18, 0.7, 0.35, side * 27, 0.35, 42, '#c7c5ab');
      this.plant(side * 10, 51.5, 1.9);
      const tree = this.botany.tree(1.4, 80 + side, false);
      tree.position.set(side * 23, 0, 49); this.scene.add(tree);
    }
    this.box(16.4, 0.65, 1.8, 0, 6.85, 48, '#baa075', this.scene, true);
    sign('VOCAB HALL · A MUSEUM FOR YOUR MIND', 0, 5.7, 48.68, 12.6);
    const mascotTexture = new THREE.TextureLoader().load(assetUrl('mascot/welcome.webp'), () => { this.needsRender = true; });
    mascotTexture.colorSpace = THREE.SRGBColorSpace; this.textures.push(mascotTexture);
    const mascot = this.panel(mascotTexture, 2.85, 3.5, 4.7, 1.85, 45);
    mascot.material.alphaTest = 0.05; mascot.material.side = THREE.DoubleSide;
    this.shadow(4.7, 45, 3.8, 1.6);
    this.obstacles.push({ x: 4.7, z: 45, rx: 1.5, rz: 0.7 });
    const hello = this.canvasTexture(768, 190, (ctx) => {
      ctx.fillStyle = '#f7f3e7'; ctx.beginPath(); ctx.roundRect(0, 0, 768, 160, 32); ctx.fill();
      ctx.beginPath(); ctx.moveTo(345, 158); ctx.lineTo(377, 188); ctx.lineTo(407, 158); ctx.fill();
      ctx.fillStyle = '#385c49'; ctx.textAlign = 'center'; ctx.font = '34px "DM Sans", sans-serif';
      ctx.fillText(translate('Hello! Welcome to Vocab Hall.', this.options.locale), 384, 69, 704);
      ctx.font = '25px "DM Sans", sans-serif';
      ctx.fillText(translate('Take your time. Follow your curiosity.', this.options.locale), 384, 116, 704);
    }, true);
    this.panel(hello, 4.9, 1.21, 4.7, 4.25, 45.04);
  }

  private buildExhibits() {
    const loader = new THREE.TextureLoader();
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
    const videoTexture = this.canvasTexture(128, 92, (ctx) => {
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
    for (const [index, exhibit] of this.options.exhibits.entries()) {
      for (const placement of exhibitPlacements(exhibit)) {
        const outdoor = placement.area === GARDEN_INDEX;
        const group = new THREE.Group();
        group.position.set(placement.x, 0, placement.z);
        group.rotation.y = placement.yaw;
        group.scale.setScalar(outdoor ? 1 : 1.3);
        this.scene.add(group);
        if (outdoor) {
          // Solid, freestanding display walls face clear garden paths.
          this.box(5.6, 5.1, 0.28, 0.85, 2.55, -0.19, "#e8e3d1", group, true);
          this.box(5.85, 0.16, 0.48, 0.85, 5.18, -0.19, "#b8a078", group, true);
          this.box(5.7, 0.15, 0.65, 0.85, 0.075, -0.19, "#c6bfa6", group);
          const center = new THREE.Vector3(0.85, 0, -0.19).applyAxisAngle(
            Y_AXIS,
            placement.yaw,
          );
          const sideFacing = Math.abs(placement.yaw) > 1;
          this.obstacles.push({
            x: placement.x + center.x,
            z: placement.z + center.z,
            rx: sideFacing ? 0.65 : 3.2,
            rz: sideFacing ? 3.2 : 0.65,
          });
        }
        const frameColor = exhibit.room === 2 ? "#73533a" : "#9a744f";
        const frame = this.box(
          2.64,
          3.24,
          0.13,
          0,
          3.15,
          0.06,
          frameColor,
          group,
          true,
        );
        this.box(2.36, 2.96, 0.035, 0, 3.15, 0.14, "#eee8d7", group);
        this.box(2.2, 2.2, 0.012, 0, 2.85, 0.165, "#faf7e9", group);
        let texture = this.paintingTextures.get(exhibit.image);
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
        const art = this.panel(texture, 2.16, 2.16, 0, 2.85, 0.177, group);
        const target: ExhibitHit = {
          exhibit,
          action: "open",
          area: placement.area,
        };
        frame.userData.target = target;
        art.userData.target = target;
        frame.material = this.material(frameColor).clone();
        const isChecked = this.checked.has(exhibit.id);
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
        this.displayFrames.push({
          id: exhibit.id,
          material: frame.material,
          checkedColor: frameColor,
          checkbox,
          position: group.position.clone(),
          phase: index * 0.23,
        });
        // The icon occupies only the caption's top row, above all gloss text.
        const video = this.panel(
          videoTexture,
          0.24,
          0.1725,
          -1.06,
          1.335,
          0.1,
          group,
        );
        video.userData.target = { ...target, action: "video" };
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
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(exhibit.word, 512, 140);
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
        const label = this.canvasTexture(
          1024,
          310,
          (ctx) => {
            ctx.fillStyle = "#f5f1e6";
            ctx.fillRect(0, 0, 1024, 310);
            ctx.fillStyle = "#777d66";
            ctx.font = '20px "DM Sans"';
            ctx.fillText(
              `NO. ${String(index + 1).padStart(2, "0")}   /   ${translate(partOfSpeech(exhibit.pos), this.options.locale).toUpperCase()}`,
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
        this.panel(example, 1.45, 2.2, 2.16, 2.76, 0.03, group);
      }
    }
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

  private buildDecorations() {
    for (let room = 0; room < GALLERY_COUNT; room++) {
      const point = (x: number, z: number) => inGallery(room, x, z);
      const a = point(-10.3, 12), b = point(10.3, -12), seat = point(7.4, 5.15);
      this.plant(a.x, a.z, 1.65);
      this.plant(b.x, b.z, 1.6);
      // Upholstered gallery bench with a solid oak base.
      const bench = new THREE.Group();
      bench.position.set(seat.x, 0, seat.z);
      bench.rotation.y = seat.yaw;
      this.scene.add(bench);
      this.box(2.55, 0.13, 0.88, 0, 0.43, 0, "#957550", bench, true);
      this.box(
        2.48,
        0.17,
        0.86,
        0,
        0.58,
        0,
        ["#a6ac8b", "#9eafb0", "#b59a81"][room % 3],
        bench,
        true,
      );
      for (const x of [-0.93, 0.93])
        this.box(0.14, 0.42, 0.68, x, 0.21, 0, "#8c6f4a", bench, true);
      this.shadow(seat.x, seat.z, room < 3 ? 3.4 : 1.7, room < 3 ? 1.7 : 3.4);
      this.obstacles.push({ x: seat.x, z: seat.z, rx: room < 3 ? 1.53 : 0.72, rz: room < 3 ? 0.72 : 1.53 });
    }
    // A brass orbit sits in a side alcove, clear of the central promenade.
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.7, 0.9, 48),
      this.material("#e4decf"),
    );
    plinth.position.set(-7.2, 0.45, 12);
    plinth.castShadow = true;
    this.scene.add(plinth);
    this.shadow(-7.2, 12, 2.8, 2.8);
    const sculpture = new THREE.Group();
    sculpture.position.set(-7.2, 1.75, 12);
    this.scene.add(sculpture);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.77, 0.047, 12, 80),
        this.material("#bca276", 0.25, 0.65),
      );
      ring.rotation.set(0.3 + i * 0.68, 0.6 + i * 0.67, i * 0.4);
      ring.castShadow = true;
      sculpture.add(ring);
    }
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 24, 16),
      this.material("#62775a", 0.35, 0.15),
    );
    sculpture.add(orb);
    this.obstacles.push({ x: -7.2, z: 12, rx: 1, rz: 1 });
    // A small sculpture caption at floor level.
    const caption = this.canvasTexture(512, 200, (ctx) => {
      ctx.fillStyle = "#f5f0e4";
      ctx.fillRect(0, 0, 512, 200);
      ctx.fillStyle = "#5f634e";
      ctx.font = '36px "Cormorant Garamond"';
      ctx.textAlign = "center";
      ctx.fillText("The shape of curiosity", 256, 80);
      ctx.font = '18px "DM Sans"';
      ctx.fillText("An invitation to see things differently.", 256, 133);
    });
    const sign = this.panel(caption, 1, 0.39, -7.2, 0.52, 12.69);
    sign.rotation.x = -0.15;
  }

  private buildGarden() {
    // A level limestone terrace continues straight from the long gallery.
    const landscape = this.box(320, 0.15, 320, 0, -0.23, -70, "#8a9c72");
    landscape.receiveShadow = true;
    this.box(
      GARDEN_WIDTH,
      0.12,
      HALL_BACK - GARDEN_BACK,
      0,
      -0.065,
      -92,
      "#ded8c3",
    );
    for (let z = -73; z > GARDEN_BACK; z -= 4) {
      this.box(59.7, 0.004, 0.023, 0, 0.003, z, "#c8c4b0");
    }
    for (const x of [-4, 4])
      this.box(0.045, 0.006, 44, x, 0.01, -92, "#b5a172");

    // Low perimeter walls make the edge of the walkable grounds visible.
    for (const x of [-30, 30])
      this.box(0.45, 0.65, 44, x, 0.25, -92, "#c7c5ab");
    this.box(60, 0.65, 0.45, 0, 0.25, GARDEN_BACK, "#c7c5ab");
    for (const x of [-21, 21])
      this.box(18, 0.65, 0.45, x, 0.25, HALL_BACK, "#c7c5ab");

    // Walkable lawns are threaded with wide cross paths around the planting.
    for (const x of [-18, 18]) {
      for (const z of [-77, -96, -109]) {
        const depth = z === -96 ? 19 : 6;
        this.box(20, 0.03, depth, x, 0.005, z, "#8f9f71");
      }
    }
    this.box(8, 0.022, 44, 0, 0.015, -92, "#e4dfcd");
    for (const z of [-83, -105]) this.box(58, 0.025, 4, 0, 0.015, z, "#e4dfcd");

    // The reflecting pool sits to one side, leaving the promenade unobstructed.
    this.box(10, 0.16, 17, 12, 0.07, -94, "#bfbca1");
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: "#739e9b",
      roughness: 0.25,
      metalness: 0.28,
      transparent: true,
      opacity: 0.88,
    });
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(9.3, 16.3),
      waterMaterial,
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(12, 0.16, -94);
    this.scene.add(this.water);
    this.obstacles.push({ x: 12, z: -94, rx: 5.35, rz: 8.85 });
    for (let i = 0; i < 5; i++) {
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(0.95 + i * 0.5, 0.965 + i * 0.5, 64),
        new THREE.MeshBasicMaterial({
          color: "#d1e2d4",
          transparent: true,
          opacity: 0.18 - i * 0.025,
          side: THREE.DoubleSide,
        }),
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(12, 0.167 + i * 0.001, -91);
      ripple.scale.y = 1.6;
      this.scene.add(ripple);
    }
    // Notched, veined lily pads with layered blossoms float above the water.
    for (let i = 0; i < 12; i++) {
      const lily = this.botany.lily(i);
      lily.position.set(
        14.5 + Math.sin(i * 2.4) * 1.2,
        0.175,
        -98 + Math.cos(i * 3.1) * 2,
      );
      lily.rotation.y = i * 2.4;
      this.scene.add(lily);
    }
    // Branching trees use individual leaves; distant groves use fewer instances.
    const tree = (x: number, z: number, size: number, seed: number) => {
      const tree = this.botany.tree(size, seed, z < GARDEN_BACK);
      tree.position.set(x, 0, z);
      this.scene.add(tree);
      this.shadow(x, z, 5 * size, 5 * size);
      this.obstacles.push({ x, z, rx: 0.5 * size, rz: 0.5 * size });
    };
    for (const x of [-25.5, 25.5]) {
      [-76, -87, -99, -109].forEach((z, i) =>
        tree(x + Math.sin(i * 2) * 0.6, z, 1.05 + (i % 3) * 0.16, i),
      );
    }
    tree(-19, -103, 1.1, 3);
    tree(21, -104, 1.2, 4);
    tree(-18.5, -111, 1.15, 5);
    tree(18.5, -111, 1.2, 6);

    this.scene.add(this.botany.flowerBeds());

    // Seating occupies the entrance corner, clear of the outdoor viewing lanes.
    for (const x of [-23, -15]) {
      for (const z of [-72, -82]) {
        this.box(0.24, 3.7, 0.24, x, 1.85, z, "#a68d64", this.scene, true);
        this.obstacles.push({ x, z, rx: 0.45, rz: 0.45 });
      }
      this.box(0.3, 0.25, 11, x, 3.65, -77, "#ae946c", this.scene, true);
    }
    for (let z = -71.7; z >= -82.3; z -= 1.2)
      this.box(9, 0.2, 0.15, -19, 3.82, z, "#c1a881", this.scene, true);
    this.box(8, 0.025, 12, -19, 0.038, -77, "#d4cfb9");
    for (const z of [-74, -80]) {
      this.box(4.5, 0.17, 0.9, -19, 0.58, z, "#af926c", this.scene, true);
      for (const x of [-20.6, -17.4])
        this.box(0.22, 0.52, 0.66, x, 0.26, z, "#8c7654", this.scene, true);
      this.obstacles.push({ x: -19, z, rx: 2.55, rz: 0.75 });
    }

    // Distant wooded hills are scenery beyond the low garden boundary.
    for (let i = 0; i < 13; i++) {
      const hill = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 16),
        this.material(["#9ead8d", "#899e87", "#b2bca0"][i % 3]),
      );
      hill.position.set(-112 + i * 19, -5, -156 - (i % 3) * 17);
      hill.scale.set(25 + (i % 3) * 9, 15 + (i % 4) * 5, 24 + (i % 3) * 8);
      this.scene.add(hill);
    }
    for (let i = 0; i < 15; i++) {
      const x = -54 + i * 8;
      const z = -123 - (i % 3) * 5;
      // These trees are outside the grounds, so their trunks never obstruct walking.
      tree(x, z, 1.3 + (i % 3) * 0.25, i);
    }
    const gardenSign = this.canvasTexture(
      1024,
      300,
      (ctx) => {
        ctx.fillStyle = "#eeeadb";
        ctx.fillRect(0, 0, 1024, 300);
        ctx.textAlign = "center";
        ctx.fillStyle = "#5e7456";
        ctx.font = '25px "DM Sans", sans-serif';
        ctx.fillText(
          this.options.locale === "zh_TW"
            ? "戶外 · 靜謐花園"
            : "OUTDOORS · THE QUIET GARDEN",
          512,
          76,
        );
        ctx.font =
          this.options.locale === "zh_TW"
            ? '48px "DM Sans", sans-serif'
            : 'italic 72px "Cormorant Garamond"';
        ctx.fillText(
          this.options.locale === "zh_TW"
            ? "慢慢走，讓心自在呼吸。"
            : "Let your mind wander.",
          512,
          174,
        );
        ctx.font = '23px "DM Sans", sans-serif';
        ctx.fillText(
          this.options.locale === "zh_TW"
            ? "長廊、微風，與下一個新發現。"
            : "Open sky. Fresh air. Room for another idea.",
          512,
          244,
        );
      },
      true,
    );
    const signGroup = new THREE.Group();
    signGroup.position.set(-19, 0, -70.5);
    signGroup.rotation.y = Math.PI;
    this.scene.add(signGroup);
    this.box(4.6, 1.38, 0.15, 0, 1.45, 0, "#d9d3bc", signGroup);
    this.panel(gardenSign, 4.6, 1.38, 0, 1.45, 0.1, signGroup);
    for (const x of [-1.6, 1.6])
      this.box(0.09, 0.85, 0.09, x, 0.4, 0, "#a48f6a", signGroup);
    this.obstacles.push({ x: -19, z: -70.5, rx: 2.5, rz: 0.4 });
  }

  private buildCuriosities() {
    const vase = (
      parent: THREE.Object3D,
      x: number,
      y: number,
      z: number,
      color: string,
      size = 1,
    ) => {
      const points = [
        [0.17, 0],
        [0.3, 0.1],
        [0.34, 0.42],
        [0.17, 0.72],
        [0.14, 0.86],
      ].map(([r, h]) => new THREE.Vector2(r * size, h * size));
      const body = new THREE.Mesh(
        new THREE.LatheGeometry(points, 24),
        this.material(color, 0.55),
      );
      body.position.set(x, y, z);
      body.castShadow = true;
      parent.add(body);
    };
    const book = (
      parent: THREE.Object3D,
      x: number,
      y: number,
      z: number,
      color: string,
      turn: number,
    ) => {
      const group = new THREE.Group();
      group.position.set(x, y, z);
      group.rotation.y = turn;
      parent.add(group);
      this.box(0.75, 0.12, 0.52, 0, 0.06, 0, color, group, true);
      this.box(0.68, 0.08, 0.48, 0.01, 0.065, 0, "#eee5cf", group);
    };
    for (let room = 0; room < 3; room++) {
      const z = -room * HALL_SPACING;
      // Reading tables and little still lifes sit in the side bays.
      const table = new THREE.Group();
      table.position.set(-7.4, 0, z + 2.8);
      this.scene.add(table);
      this.box(2.2, 0.13, 1.1, 0, 0.84, 0, "#a78a62", table, true);
      for (const x of [-0.87, 0.87])
        for (const tz of [-0.35, 0.35])
          this.box(0.1, 0.78, 0.1, x, 0.39, tz, "#806b4f", table, true);
      book(table, -0.45, 0.91, 0, "#7e956f", 0.12);
      book(table, -0.43, 1.04, 0, "#c69771", -0.11);
      book(table, -0.47, 1.17, 0, "#bdb289", 0.06);
      vase(table, 0.6, 0.91, 0, "#ddd0b2", 0.8);
      this.obstacles.push({ x: -7.4, z: z + 2.8, rx: 1.4, rz: 0.85 });
      const stand = new THREE.Group();
      stand.position.set(-7.2, 0, z - 5.15);
      this.scene.add(stand);
      this.box(1.1, 1.25, 1.1, 0, 0.625, 0, "#d5d0bd", stand, true);
      const geometries = [
        new THREE.TorusKnotGeometry(0.45, 0.12, 64, 10),
        new THREE.DodecahedronGeometry(0.66),
        new THREE.TorusGeometry(0.55, 0.16, 14, 48),
      ];
      const sculpture = new THREE.Mesh(
        geometries[room],
        this.material(["#ad8260", "#849a92", "#bca574"][room], 0.43, 0.25),
      );
      geometries.forEach((geometry, i) => {
        if (i !== room) geometry.dispose();
      });
      sculpture.position.y = 2;
      sculpture.rotation.set(0.35, 0.6, 0.2);
      sculpture.castShadow = true;
      stand.add(sculpture);
      this.obstacles.push({ x: -7.2, z: z - 5.15, rx: 0.9, rz: 0.9 });
      // A ceramic grouping opposite the sculptures adds asymmetry.
      const ceramics = new THREE.Group();
      ceramics.position.set(8.3, 0, z - 11.5);
      this.scene.add(ceramics);
      vase(ceramics, -0.55, 0, 0, "#b68b70", 1.35);
      vase(ceramics, 0.35, 0, 0.3, "#d5c5a5", 1.05);
      this.obstacles.push({ x: 8.2, z: z - 11.4, rx: 1.15, rz: 0.85 });
    }

    // Garden stones have varied sizes and orientations, but stay off the paths.
    for (let i = 0; i < 14; i++) {
      const x = (i % 2 ? 27 : -27) + Math.sin(i * 2.4) * 0.9;
      const z = -80 - Math.floor(i / 2) * 4.4;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, 1),
        this.material(["#a7aa95", "#bdbaa0", "#9ca48f"][i % 3]),
      );
      rock.position.set(x, 0.2, z);
      rock.scale.set(0.6 + (i % 3) * 0.2, 0.4 + (i % 2) * 0.22, 0.7);
      rock.rotation.set(0.1, i * 1.7, 0.2);
      rock.castShadow = true;
      this.scene.add(rock);
      this.obstacles.push({ x, z, rx: 1, rz: 0.95 });
    }
    for (const x of [-27, 27])
      for (const z of [-82, -104]) {
        // Brass garden lanterns, with a warm frosted light.
        this.box(0.36, 0.1, 0.36, x, 0.06, z, "#857e61", this.scene, true);
        this.box(0.12, 0.68, 0.12, x, 0.39, z, "#857e61", this.scene, true);
        const lantern = this.box(
          0.28,
          0.4,
          0.28,
          x,
          0.92,
          z,
          "#eee1b4",
          this.scene,
          true,
        );
        lantern.material = this.material("#eee1b4").clone();
        lantern.material.emissive.set("#d7ba68");
        lantern.material.emissiveIntensity = 0.22;
        this.box(0.4, 0.08, 0.4, x, 1.16, z, "#857e61", this.scene, true);
        this.obstacles.push({ x, z, rx: 0.5, rz: 0.5 });
      }
    // Birdbath and a tiny bronze bird beyond the shaded seating.
    const birdbath = new THREE.Group();
    birdbath.position.set(-17, 0, -108);
    this.scene.add(birdbath);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.44, 0.9, 24),
      this.material("#c3bfa5"),
    );
    base.position.y = 0.45;
    birdbath.add(base);
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.45, 0.18, 32),
      this.material("#d3cdb5"),
    );
    basin.position.y = 0.96;
    birdbath.add(basin);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(0.67, 32),
      this.material("#93b0a8", 0.25),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 1.057;
    birdbath.add(water);
    const bird = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 8),
      this.material("#7c8773", 0.4, 0.2),
    );
    bird.scale.set(1.5, 1, 0.9);
    bird.position.set(0.53, 1.2, 0);
    birdbath.add(bird);
    this.obstacles.push({ x: -17, z: -108, rx: 1, rz: 1 });

    // A small gardener's corner: watering can, terracotta pots and tools.
    const corner = new THREE.Group();
    corner.position.set(-22.2, 0, -77);
    this.scene.add(corner);
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.29, 0.32, 0.52, 20),
      this.material("#8a9b7f", 0.45),
    );
    can.position.y = 0.3;
    corner.add(can);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.29, 0.038, 8, 24),
      this.material("#8a9b7f"),
    );
    handle.position.set(-0.3, 0.5, 0);
    corner.add(handle);
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.1, 0.6, 10),
      this.material("#8a9b7f"),
    );
    spout.position.set(0.42, 0.4, 0);
    spout.rotation.z = -0.9;
    corner.add(spout);
    vase(corner, 0.95, 0, 0.2, "#b28265", 0.6);
    vase(corner, -0.8, 0, 0.7, "#c99f7d", 0.8);
    this.obstacles.push({ x: -22.2, z: -77, rx: 1.25, rz: 1 });
  }

  private resize = () => {
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
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

  private pick(x: number, y: number): ExhibitHit | null {
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
        !(hit.object as THREE.Mesh).material ||
        !((hit.object as THREE.Mesh).material as THREE.Material).transparent ||
        hit.object.userData.target,
    );
    return first?.object.userData.target ?? null;
  }
  private updateHover(x: number, y: number) {
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
    }
    this.needsRender = true;
  }
  setLocale(locale: string) {
    this.options.locale = locale;
    this.localizedTextures.forEach((redraw) => redraw());
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
    if (room === GARDEN_INDEX) {
      this.moveCamera(new THREE.Vector3(0, EYE_HEIGHT, -77), -0.18, 0.055);
      return;
    }
    if (room === ENTRANCE_INDEX) {
      this.moveCamera(new THREE.Vector3(0.35, EYE_HEIGHT, 36), 0.015, 0.035);
      return;
    }
    const point = inGallery(room, GALLERY_ENTRY.x, GALLERY_ENTRY.z, GALLERY_ENTRY.yaw);
    this.moveCamera(new THREE.Vector3(point.x, EYE_HEIGHT, point.z), point.yaw, 0.055);
  }
  goToGate() {
    this.moveCamera(new THREE.Vector3(ENTRY.x, EYE_HEIGHT, ENTRY.z), ENTRY.yaw, 0.055);
  }

  goToExhibit(exhibit: Exhibit) {
    const placements = exhibitPlacements(exhibit);
    const placement =
      (areaAt(this.camera.position.x, this.camera.position.z) === GARDEN_INDEX
        ? placements.find((p) => p.area === GARDEN_INDEX)
        : null) || placements[0];
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(
      Y_AXIS,
      placement.yaw,
    );
    const position = new THREE.Vector3(
      placement.x,
      EYE_HEIGHT,
      placement.z,
    ).addScaledVector(normal, placement.area === GARDEN_INDEX ? 4.3 : 4.9);
    this.moveCamera(
      position,
      placement.yaw,
      placement.area === GARDEN_INDEX ? 0.2 : 0.29,
    );
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

  private canMove(x: number, z: number) {
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
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.pointerDown);
    canvas.removeEventListener("pointermove", this.pointerMove);
    canvas.removeEventListener("pointerup", this.pointerUp);
    canvas.removeEventListener("pointercancel", this.pointerCancel);
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
    this.renderer.dispose();
    canvas.remove();
  }
}
