import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type TextureFactory = (
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) => THREE.Texture;
const up = new THREE.Vector3(0, 1, 0);
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

// A curved leaf with a raised midrib: real silhouette and surface, not a sphere.
function leafGeometry() {
  const vertices: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let row = 0; row <= 7; row++) {
    const t = row / 7;
    const width = Math.pow(Math.sin(Math.PI * t), 0.72) * 0.5 + 0.002;
    for (let col = 0; col < 3; col++) {
      vertices.push(
        (col - 1) * width,
        Math.sin(t * Math.PI) * (col === 1 ? 0.1 : 0.025) - t * t * 0.12,
        t,
      );
      uvs.push(col / 2, t);
    }
    if (row < 7)
      for (let col = 0; col < 2; col++) {
        const a = row * 3 + col;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function branch(points: THREE.Vector3[], radius: number, tip = radius * 0.15) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 10, 1, 6, false);
  const position = geometry.getAttribute("position");
  for (let ring = 0; ring <= 10; ring++) {
    const t = ring / 10,
      center = curve.getPointAt(t),
      r = THREE.MathUtils.lerp(radius, tip, t);
    for (let j = 0; j <= 6; j++) {
      const i = ring * 7 + j;
      const p = new THREE.Vector3()
        .fromBufferAttribute(position, i)
        .sub(center)
        .multiplyScalar(r)
        .add(center);
      position.setXYZ(i, p.x, p.y, p.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

export class Botany {
  private leaf = leafGeometry();
  private foliage: THREE.MeshStandardMaterial;
  private bark: THREE.MeshStandardMaterial;
  private petal = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  private stem = new THREE.MeshStandardMaterial({
    color: "#617b42",
    roughness: 0.9,
  });
  constructor(texture: TextureFactory) {
    const veins = texture(128, 256, (ctx) => {
      const wash = ctx.createLinearGradient(0, 0, 128, 0);
      wash.addColorStop(0, "#8e9b78");
      wash.addColorStop(0.48, "#d6dec2");
      wash.addColorStop(0.52, "#e8ebd2");
      wash.addColorStop(1, "#a4ae8b");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, 128, 256);
      ctx.strokeStyle = "#e8ecd388";
      ctx.lineWidth = 1.8;
      for (let y = 25; y < 242; y += 24)
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(64, y);
          ctx.quadraticCurveTo(64 + side * 22, y + 3, 64 + side * 55, y + 25);
          ctx.stroke();
        }
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(64, 0);
      ctx.lineTo(64, 256);
      ctx.stroke();
    });
    const bark = texture(256, 256, (ctx) => {
      const rnd = random(73);
      ctx.fillStyle = "#b2a692";
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 210; i++) {
        const x = rnd() * 256,
          y = rnd() * 256;
        ctx.strokeStyle = i % 3 ? "#71654b45" : "#e1d6b970";
        ctx.lineWidth = 0.5 + rnd() * 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 7, y + 13, x - 5, y + 32, x + rnd() * 5, y + 60);
        ctx.stroke();
      }
    });
    this.foliage = new THREE.MeshStandardMaterial({
      map: veins,
      color: "#ffffff",
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    this.bark = new THREE.MeshStandardMaterial({
      map: bark,
      color: "#8c795e",
      roughness: 1,
    });
  }
  private wood(geometries: THREE.BufferGeometry[], parent: THREE.Group) {
    const merged = mergeGeometries(geometries)!;
    geometries.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, this.bark);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
  tree(size: number, seed: number, distant = false) {
    const group = new THREE.Group();
    group.scale.setScalar(size);
    const rnd = random(seed * 781 + 42),
      wood: THREE.BufferGeometry[] = [];
    wood.push(
      branch(
        [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0.13, 0.9, 0.05),
          new THREE.Vector3(-0.08, 1.9, 0.13),
          new THREE.Vector3(0.13, 3.55, 0),
        ],
        0.22,
        0.055,
      ),
    );
    const count = distant ? 220 : 950;
    const leaves = new THREE.InstancedMesh(this.leaf, this.foliage, count);
    const dummy = new THREE.Object3D();
    const centers: THREE.Vector3[] = [];
    for (let arm = 0; arm < 8; arm++) {
      const a = arm * 2.4 + seed,
        radius = arm === 7 ? 0.25 : 1.25;
      const end = new THREE.Vector3(
        Math.cos(a) * radius,
        3.1 + rnd() * 0.9,
        Math.sin(a) * radius,
      );
      centers.push(end);
      const start = new THREE.Vector3(0, 1.5 + rnd() * 0.9, 0);
      wood.push(
        branch(
          [
            start,
            start
              .clone()
              .lerp(end, 0.55)
              .add(new THREE.Vector3(0, -0.15, 0)),
            end,
          ],
          0.07,
          0.014,
        ),
      );
      if (!distant)
        for (let twig = 0; twig < 3; twig++) {
          const to = end
            .clone()
            .add(
              new THREE.Vector3(
                (rnd() - 0.5) * 1.35,
                rnd() * 0.55,
                (rnd() - 0.5) * 1.35,
              ),
            );
          wood.push(
            branch([start.clone().lerp(end, 0.65), end, to], 0.025, 0.004),
          );
        }
    }
    for (let i = 0; i < count; i++) {
      const center = centers[i % centers.length],
        theta = rnd() * Math.PI * 2,
        vertical = rnd() * 2 - 1;
      const r = Math.cbrt(rnd()),
        radial = Math.sqrt(1 - vertical * vertical);
      dummy.position
        .copy(center)
        .add(
          new THREE.Vector3(
            Math.cos(theta) * radial * r,
            vertical * r * 0.65,
            Math.sin(theta) * radial * r,
          ),
        );
      const length = distant ? 0.7 + rnd() * 0.3 : 0.26 + rnd() * 0.23;
      dummy.scale.set(length * 0.52, length, length);
      dummy.rotation.set(
        (rnd() - 0.5) * 2.2,
        rnd() * Math.PI * 2,
        (rnd() - 0.5) * 1.7,
      );
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      leaves.setColorAt(
        i,
        new THREE.Color(
          ["#537343", "#718b57", "#8da16b", "#617d4b", "#a1af7b"][i % 5],
        ),
      );
    }
    leaves.castShadow = !distant;
    leaves.receiveShadow = true;
    group.add(leaves);
    this.wood(wood, group);
    if (!distant) group.add(this.fern(seed));
    return group;
  }
  private fern(seed: number) {
    const group = new THREE.Group(),
      rnd = random(seed + 73),
      dummy = new THREE.Object3D();
    const leaflets = new THREE.InstancedMesh(this.leaf, this.foliage, 144);
    let i = 0;
    for (let frond = 0; frond < 6; frond++) {
      const angle = (frond * Math.PI) / 3 + rnd() * 0.3;
      for (let n = 0; n < 12; n++)
        for (const side of [-1, 1]) {
          const t = (n + 1) / 13;
          dummy.position.set(
            Math.cos(angle) * t * 0.78,
            0.1 + Math.sin(t * Math.PI) * 0.32,
            Math.sin(angle) * t * 0.78,
          );
          dummy.rotation.set(
            0.1,
            -angle + Math.PI / 2 + side * 0.95,
            side * 0.25,
          );
          const length = Math.sin(t * Math.PI) * 0.2 + 0.04;
          dummy.scale.set(length * 0.35, length, length);
          dummy.updateMatrix();
          leaflets.setMatrixAt(i, dummy.matrix);
          leaflets.setColorAt(
            i++,
            new THREE.Color(frond % 2 ? "#597743" : "#789052"),
          );
        }
    }
    leaflets.receiveShadow = true;
    group.add(leaflets);
    return group;
  }
  pottedPlant(seed: number) {
    const group = new THREE.Group(),
      rnd = random(seed + 107);
    const profile = [
      [0.23, 0],
      [0.26, 0.025],
      [0.27, 0.11],
      [0.33, 0.47],
      [0.35, 0.52],
      [0.355, 0.56],
      [0.32, 0.565],
      [0.315, 0.515],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const potMaterial = new THREE.MeshStandardMaterial({
      color: seed % 2 ? "#bba486" : "#c4ad94",
      roughness: 0.82,
    });
    const pot = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 48),
      potMaterial,
    );
    pot.castShadow = true;
    pot.receiveShadow = true;
    group.add(pot);
    for (const y of [0.1, 0.47, 0.53]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(y < 0.2 ? 0.266 : 0.338, 0.008, 6, 48),
        potMaterial,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      group.add(ring);
    }
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.312, 0.312, 0.035, 32),
      new THREE.MeshStandardMaterial({ color: "#4f4937", roughness: 1 }),
    );
    soil.position.y = 0.515;
    group.add(soil);
    const pebbles = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: "#9c9277", roughness: 1 }),
      34,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2,
        r = Math.sqrt(rnd()) * 0.29;
      dummy.position.set(Math.cos(a) * r, 0.541, Math.sin(a) * r);
      dummy.scale.set(0.014 + rnd() * 0.02, 0.008, 0.018);
      dummy.rotation.set(0, rnd() * 4, 0);
      dummy.updateMatrix();
      pebbles.setMatrixAt(i, dummy.matrix);
    }
    group.add(pebbles);
    const stems = [
      branch(
        [
          new THREE.Vector3(0, 0.54, 0),
          new THREE.Vector3(0.025, 1.1, 0.03),
          new THREE.Vector3(-0.03, 2.1, 0),
        ],
        0.035,
        0.01,
      ),
    ];
    const leaves = new THREE.InstancedMesh(this.leaf, this.foliage, 26);
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4,
        y = 0.75 + i * 0.05,
        r = 0.16 + rnd() * 0.12;
      const start = new THREE.Vector3(0, y, 0),
        end = new THREE.Vector3(Math.cos(a) * r, y + 0.1, Math.sin(a) * r);
      stems.push(
        branch(
          [
            start,
            start
              .clone()
              .lerp(end, 0.6)
              .add(new THREE.Vector3(0, 0.04, 0)),
            end,
          ],
          0.008,
          0.003,
        ),
      );
      dummy.position.copy(end);
      dummy.rotation.set(
        -0.25 + rnd() * 0.55,
        -a + Math.PI / 2,
        (rnd() - 0.5) * 0.5,
      );
      const length = 0.36 + rnd() * 0.26;
      dummy.scale.set(length * 0.66, length, length);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      leaves.setColorAt(
        i,
        new THREE.Color(["#416a3b", "#567e44", "#7e9857", "#648647"][i % 4]),
      );
    }
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    group.add(leaves);
    this.wood(stems, group);
    return group;
  }
  flowerBeds() {
    const group = new THREE.Group(),
      rnd = random(927),
      dummy = new THREE.Object3D();
    const stems = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.009, 0.014, 1, 5),
      this.stem,
      240,
    );
    const petals = new THREE.InstancedMesh(this.leaf, this.petal, 80 * 8);
    const centers = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 5),
      new THREE.MeshStandardMaterial({ color: "#cb9d43", roughness: 0.92 }),
      80,
    );
    const lavender = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 6, 4),
      this.petal,
      160 * 14,
    );
    const leaves = new THREE.InstancedMesh(this.leaf, this.foliage, 240 * 4);
    let pi = 0,
      ci = 0,
      li = 0,
      vi = 0;
    for (let i = 0; i < 240; i++) {
      const band = Math.floor(i / 60),
        x = [-21, -18, 21, 18][band] + Math.sin(i * 2.399) * 1.15,
        z = -87 - (i % 60) * 0.25;
      const h = 0.35 + rnd() * 0.29;
      dummy.position.set(x, h / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 4; k++) {
        dummy.position.set(x, h * (0.2 + k * 0.15), z);
        dummy.rotation.set(-0.3, i * 2.4 + k * 2.4, 0);
        dummy.scale.set(0.04, 0.17, 0.17);
        dummy.updateMatrix();
        leaves.setMatrixAt(li, dummy.matrix);
        leaves.setColorAt(li++, new THREE.Color(k % 2 ? "#79975b" : "#597d47"));
      }
      if (i % 3 === 0) {
        const color = new THREE.Color(i % 2 ? "#ecd1c9" : "#f6eedb");
        for (let k = 0; k < 8; k++) {
          dummy.position.set(x, h, z);
          dummy.rotation.set(-0.12, (k * Math.PI) / 4 + i, 0);
          dummy.scale.set(0.072, 0.14, 0.14);
          dummy.updateMatrix();
          petals.setMatrixAt(pi, dummy.matrix);
          petals.setColorAt(pi++, color);
        }
        dummy.position.set(x, h + 0.015, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.037, 0.022, 0.037);
        dummy.updateMatrix();
        centers.setMatrixAt(ci++, dummy.matrix);
      } else {
        for (let k = 0; k < 14; k++) {
          const a = k * 2.4;
          dummy.position.set(
            x + Math.cos(a) * 0.028,
            h - 0.06 + k * 0.011,
            z + Math.sin(a) * 0.028,
          );
          dummy.rotation.set(0, a, 0.35);
          dummy.scale.set(0.032, 0.027, 0.023);
          dummy.updateMatrix();
          lavender.setMatrixAt(vi, dummy.matrix);
          lavender.setColorAt(
            vi++,
            new THREE.Color(k % 3 ? "#a18bb0" : "#c1a8c7"),
          );
        }
      }
    }
    for (const mesh of [stems, petals, centers, lavender, leaves]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
  lily(index: number) {
    const group = new THREE.Group(),
      shape = new THREE.Shape();
    const radius = 0.19 + (index % 3) * 0.08;
    shape.moveTo(0, 0);
    for (let i = 0; i <= 32; i++) {
      const a = 0.15 + (i / 32) * (Math.PI * 2 - 0.3);
      shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    shape.lineTo(0, 0);
    const pad = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.foliage);
    pad.material = this.foliage.clone();
    pad.material.color.set("#729155");
    pad.rotation.x = -Math.PI / 2;
    group.add(pad);
    if (index % 3 === 0) {
      const petals = new THREE.InstancedMesh(this.leaf, this.petal, 16),
        dummy = new THREE.Object3D();
      for (let i = 0; i < 16; i++) {
        dummy.position.set(0, 0.018, 0);
        dummy.rotation.set(
          i < 8 ? -0.3 : -0.7,
          (i * Math.PI) / 4 + (i < 8 ? 0 : 0.3),
          0,
        );
        dummy.scale.set(0.085, 0.18, 0.18);
        dummy.updateMatrix();
        petals.setMatrixAt(i, dummy.matrix);
        petals.setColorAt(i, new THREE.Color(i < 8 ? "#f3d8dd" : "#fff0df"));
      }
      group.add(petals);
      const center = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 10, 6),
        new THREE.MeshStandardMaterial({ color: "#d8b655" }),
      );
      center.position.y = 0.05;
      group.add(center);
    }
    return group;
  }
}
