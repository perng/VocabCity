import * as THREE from "three";

// Small moving things that make the city feel inhabited: bobbing boats, a drifting sea,
// circling gulls, a running fountain and pigeons that scatter when you walk through them.
// Everything here is decoration: it never blocks movement and it pauses with the scene.
export type Living = {
  x: number;
  z: number;
  /** Only animate while the visitor is within this distance. */
  reach: number;
  /** Skip this entry while it has nothing to show (for example, fireflies by day). */
  active?: () => boolean;
  /** Keep following the visitor even when motion is reduced (the star dome). */
  follow?: boolean;
  /** Return false when nothing moved, so the frame can be skipped. */
  update: (t: number, dt: number, viewer: THREE.Vector3) => void | boolean;
};

const FAR = new THREE.Vector3(1e6, 0, 1e6);
const material = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

export class CityLife {
  private living: Living[] = [];
  private disposables: { dispose: () => void }[] = [];
  constructor(private scene: THREE.Scene) {}

  /** Register a moving thing; the returned function stops animating it. */
  add(entry: Living) {
    this.living.push(entry);
    // Place it once right away (as if the visitor were far off), so nothing waits at the
    // world origin for its first frame, and reduced-motion visitors see a still scene.
    entry.update(0, 0, FAR);
    return () => { this.living = this.living.filter((other) => other !== entry); };
  }

  /** With reduced motion, only keep things that must travel with the visitor in place. */
  follow(viewer: THREE.Vector3) {
    let moved = false;
    for (const entry of this.living) if (entry.follow && entry.active?.() !== false && entry.update(0, 0, viewer) !== false) moved = true;
    return moved;
  }

  /** Advance nearby life; returns true when anything moved and a frame is needed. */
  step(t: number, dt: number, viewer: THREE.Vector3) {
    let moved = false;
    for (const entry of this.living) {
      if (Math.hypot(entry.x - viewer.x, entry.z - viewer.z) > entry.reach || entry.active?.() === false) continue;
      if (entry.update(t, dt, viewer) !== false) moved = true;
    }
    return moved;
  }

  private keep<T extends { dispose: () => void }>(item: T) { this.disposables.push(item); return item; }

  /** Gulls wheeling on wide, slightly tilted circles above the harbour. */
  addGulls(center: { x: number; z: number }, count: number) {
    const body = this.keep(new THREE.SphereGeometry(0.16, 10, 8));
    const wing = this.keep(new THREE.BoxGeometry(0.62, 0.025, 0.2));
    const white = this.keep(material("#f6f3ea")), grey = this.keep(material("#a9b1b0"));
    for (let i = 0; i < count; i++) {
      const gull = new THREE.Group();
      const torso = new THREE.Mesh(body, white); torso.scale.set(0.8, 0.7, 1.9); gull.add(torso);
      const wings = [-1, 1].map((side) => {
        const pivot = new THREE.Group(); pivot.position.x = side * 0.1;
        const mesh = new THREE.Mesh(wing, i % 2 ? white : grey); mesh.position.x = side * 0.31;
        pivot.add(mesh); gull.add(pivot); return { pivot, side };
      });
      this.scene.add(gull);
      const radius = 9 + (i * 7.3) % 14, height = 10 + (i * 3.1) % 7, speed = (0.16 + (i % 3) * 0.05) * (i % 2 ? 1 : -1);
      const cx = center.x + Math.sin(i * 2.1) * 30, cz = center.z + Math.cos(i * 1.7) * 12, phase = i * 1.9;
      this.add({ x: cx, z: cz, reach: 120, update: (t) => {
        const a = t * speed + phase;
        gull.position.set(cx + Math.cos(a) * radius, height + Math.sin(t * 0.6 + phase) * 1.2, cz + Math.sin(a) * radius);
        gull.rotation.set(0, -a + (speed > 0 ? Math.PI : 0), speed > 0 ? -0.25 : 0.25);
        // Flap in short bursts, then glide.
        const flap = Math.sin(t * 0.9 + phase) > 0.2 ? Math.sin(t * 9 + phase) * 0.55 : 0.12;
        for (const w of wings) w.pivot.rotation.z = w.side * flap;
      } });
    }
  }

  /** A soft jet and falling droplets for a tiered fountain. */
  addFountain(x: number, z: number, top: number, basin: number, radius: number) {
    const count = 260;
    const positions = new Float32Array(count * 3);
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // Soft round droplets rather than square points.
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext("2d")!, glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, "rgba(255,255,255,1)"); glow.addColorStop(0.45, "rgba(235,248,250,.8)"); glow.addColorStop(1, "rgba(235,248,250,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 32, 32);
    const droplet = this.keep(new THREE.CanvasTexture(canvas));
    const points = new THREE.Points(geometry, this.keep(new THREE.PointsMaterial({
      color: "#e4f3f5", map: droplet, size: 0.13, transparent: true, opacity: 0.75, depthWrite: false,
    })));
    points.frustumCulled = false;
    this.scene.add(points);
    const seeds = Array.from({ length: count }, (_, i) => ({ angle: (Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) * Math.PI * 2, phase: (i * 0.618) % 1, jet: i % 4 === 0 }));
    this.add({ x, z, reach: 70, update: (t) => {
      seeds.forEach((seed, i) => {
        const life = (t * 0.7 + seed.phase) % 1;
        if (seed.jet) {
          // Straight up from the bowl, then falling back into it.
          const h = life * 2.2 * (1 - life) * 4 * 0.5;
          positions.set([x + Math.cos(seed.angle) * 0.06, top + h, z + Math.sin(seed.angle) * 0.06], i * 3);
        } else {
          // Spilling over the upper bowl's rim into the basin below.
          const r = 1.35 + life * (radius - 1.9);
          const y = top - 0.15 - (top - basin) * life * life;
          positions.set([x + Math.cos(seed.angle) * r, y, z + Math.sin(seed.angle) * r], i * 3);
        }
      });
      geometry.attributes.position.needsUpdate = true;
    } });
  }

  /** Pigeons pecking around a square; they take off when the visitor comes close. */
  addPigeons(spots: { x: number; z: number }[]) {
    const body = this.keep(new THREE.SphereGeometry(0.13, 10, 8)), head = this.keep(new THREE.SphereGeometry(0.065, 8, 6));
    const wing = this.keep(new THREE.BoxGeometry(0.3, 0.02, 0.14));
    const beak = this.keep(new THREE.ConeGeometry(0.018, 0.06, 6));
    const feathers = [this.keep(material("#8d949c")), this.keep(material("#a59a8d")), this.keep(material("#71777f"))];
    const neck = this.keep(material("#6c8479", { metalness: 0.3 })), bill = this.keep(material("#d7b27d"));
    spots.forEach((home, i) => {
      const pigeon = new THREE.Group();
      const torso = new THREE.Mesh(body, feathers[i % 3]); torso.scale.set(0.85, 0.8, 1.35); torso.position.y = 0.15; pigeon.add(torso);
      const headPivot = new THREE.Group(); headPivot.position.set(0, 0.24, 0.13); pigeon.add(headPivot);
      const h = new THREE.Mesh(head, neck); h.position.set(0, 0.04, 0.05); headPivot.add(h);
      const b = new THREE.Mesh(beak, bill); b.rotation.x = Math.PI / 2; b.position.set(0, 0.03, 0.12); headPivot.add(b);
      const wings = [-1, 1].map((side) => {
        const pivot = new THREE.Group(); pivot.position.set(side * 0.08, 0.2, 0);
        const mesh = new THREE.Mesh(wing, feathers[(i + 1) % 3]); mesh.position.x = side * 0.13; pivot.add(mesh); pigeon.add(pivot);
        return { pivot, side };
      });
      pigeon.position.set(home.x, 0, home.z);
      pigeon.rotation.y = i * 1.3;
      this.scene.add(pigeon);
      let state: "peck" | "fly" | "away" = "peck", since = 0, heading = 0;
      const spot = { x: home.x, z: home.z };
      this.add({ x: home.x, z: home.z, reach: 60, update: (t, dt, viewer) => {
        const near = Math.hypot(viewer.x - pigeon.position.x, viewer.z - pigeon.position.z);
        if (state === "peck") {
          headPivot.rotation.x = Math.max(0, Math.sin(t * 3 + i * 2)) ** 6 * 1.1;
          // A slow wander around its spot.
          const wander = t * 0.25 + i;
          pigeon.position.x = spot.x + Math.sin(wander) * 0.5; pigeon.position.z = spot.z + Math.cos(wander * 0.8) * 0.4;
          pigeon.rotation.y = wander + Math.PI / 2;
          for (const w of wings) w.pivot.rotation.z = 0;
          if (near < 3.4) {
            state = "fly"; since = t;
            heading = Math.atan2(pigeon.position.x - viewer.x, pigeon.position.z - viewer.z) + (Math.random() - 0.5) * 0.8;
          }
        } else if (state === "fly") {
          const age = t - since;
          pigeon.rotation.y = heading;
          pigeon.position.x += Math.sin(heading) * dt * 5.5; pigeon.position.z += Math.cos(heading) * dt * 5.5;
          pigeon.position.y = Math.min(9, age * age * 3 + age * 2.5);
          headPivot.rotation.x = 0;
          for (const w of wings) w.pivot.rotation.z = w.side * Math.sin(t * 22 + i) * 0.9;
          if (age > 2.6) { state = "away"; since = t; pigeon.visible = false; }
        } else if (t - since > 9 && Math.hypot(viewer.x - home.x, viewer.z - home.z) > 7) {
          // Settle back in once the visitor has moved on.
          state = "peck"; pigeon.visible = true; pigeon.position.set(home.x, 0, home.z);
        }
      } });
    });
  }

  /** A dome of stars that travels with the visitor, hidden until evening. */
  addStars(visible: () => boolean) {
    const count = 700, positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, h = 0.12 + Math.pow(Math.random(), 0.7) * 0.85, r = 300;
      positions.set([Math.cos(a) * Math.cos(h) * r, Math.sin(h) * r, Math.sin(a) * Math.cos(h) * r - 80], i * 3);
    }
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(geometry, this.keep(new THREE.PointsMaterial({ color: "#fff6dc", size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));
    stars.frustumCulled = false; stars.visible = false; stars.renderOrder = -1;
    this.scene.add(stars);
    this.add({ x: 0, z: 0, reach: Infinity, active: visible, follow: true, update: (_t, _dt, viewer) => {
      if (stars.position.x === viewer.x && stars.position.z === viewer.z + 80) return false;
      stars.position.set(viewer.x, 0, viewer.z + 80);
    } });
    return stars;
  }

  /** Fireflies drifting low over a lawn; hidden (and still) until evening. */
  addFireflies(box: { x0: number; x1: number; z0: number; z1: number }, count: number, visible: () => boolean) {
    const positions = new Float32Array(count * 3);
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const flies = new THREE.Points(geometry, this.keep(new THREE.PointsMaterial({
      color: "#e9ff9a", size: 5, sizeAttenuation: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    })));
    flies.frustumCulled = false; flies.visible = false;
    this.scene.add(flies);
    const seeds = Array.from({ length: count }, () => ({
      x: box.x0 + Math.random() * (box.x1 - box.x0), z: box.z0 + Math.random() * (box.z1 - box.z0), p: Math.random() * 10, s: 0.2 + Math.random() * 0.3,
    }));
    const material = flies.material as THREE.PointsMaterial;
    this.add({ x: (box.x0 + box.x1) / 2, z: (box.z0 + box.z1) / 2, reach: 90, active: visible, update: (t) => {
      seeds.forEach((f, i) => positions.set([f.x + Math.sin(t * f.s + f.p) * 2.2, 0.6 + Math.sin(t * f.s * 1.7 + f.p) * 0.5 + 0.5, f.z + Math.cos(t * f.s * 0.8 + f.p) * 2.2], i * 3));
      material.opacity = 0.55 + Math.sin(t * 2.3) * 0.35;
      geometry.attributes.position.needsUpdate = true;
    } });
    return flies;
  }

  dispose() { this.disposables.forEach((item) => item.dispose()); this.living = []; }
}
