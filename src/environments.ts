import * as THREE from 'three';
import type { Botany } from './botany';
import { PLACES, PLACE_START, ROUTE_BACK, galleryTransform, placeExhibitSlot } from './layout';

type Builder = {
  scene: THREE.Scene;
  botany: Botany;
  box: (w: number, h: number, d: number, x: number, y: number, z: number, color: string, parent?: THREE.Object3D, shadow?: boolean) => THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  material: (color: string, roughness?: number, metalness?: number) => THREE.MeshStandardMaterial;
  texture: (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, localized?: boolean) => THREE.Texture;
  obstacle: (obstacle: { x: number; z: number; rx: number; rz: number }) => void;
  title: (room: number) => string;
  translate: (text: string) => string;
};

// All trunks, rocks, lamps, and crystals sit outside the clear exhibition lanes.
// The route shares its level floor and broad boundaries with layout.ts.
export function buildEnvironments(b: Builder) {
  const { scene, botany, box, material, texture } = b;
  const stoneTexture = texture(512, 512, ctx => {
    let seed = 163;
    const rnd = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
    ctx.fillStyle = '#b5b0a0'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6200; i++) {
      ctx.fillStyle = i % 3 ? `rgba(44,48,44,${rnd() * 0.16})` : `rgba(246,237,218,${rnd() * 0.3})`;
      ctx.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 5, 1 + rnd() * 3);
    }
    for (let row = 0; row < 24; row++) {
      ctx.beginPath(); ctx.moveTo(0, row * 23);
      for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, row * 23 + Math.sin(x * 0.027 + row) * 8 + rnd() * 5);
      ctx.strokeStyle = row % 4 ? '#66675c35' : '#ede3c36b'; ctx.lineWidth = row % 3 + 1; ctx.stroke();
    }
  });
  stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
  const rockMaterials = ['#767d78', '#8f8c7c', '#667975'].map(color => new THREE.MeshStandardMaterial({ map: stoneTexture, color, roughness: 0.96, side: THREE.DoubleSide }));
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  const rock = (x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number) => {
    const mesh = new THREE.Mesh(rockGeometry, rockMaterials[seed % 3]);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.set(seed * 0.3, seed * 1.4, seed * 0.07);
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
  };
  const sign = (room: number, z: number, cave: boolean) => {
    const map = texture(1024, 200, ctx => {
      ctx.fillStyle = PLACES[room - PLACE_START].color; ctx.fillRect(0, 0, 1024, 200);
      ctx.strokeStyle = '#b4a377'; ctx.lineWidth = 3; ctx.strokeRect(16, 16, 992, 168);
      ctx.fillStyle = '#f5ecd5'; ctx.textAlign = 'center'; ctx.font = '43px "DM Sans", sans-serif';
      ctx.fillText(b.title(room), 512, 86, 930);
      ctx.fillStyle = '#c7cfb0'; ctx.font = '24px "DM Sans", sans-serif';
      ctx.fillText(b.translate('SIX WORDS · A NEW PERSPECTIVE'), 512, 143, 930);
    }, true);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.29), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, toneMapped: false }));
    mesh.position.set(0, 7.2, z); scene.add(mesh);
    const halfWidth = PLACES[room - PLACE_START].width / 2;
    box(halfWidth * 2, 0.12, 0.12, 0, 7.9, z, '#7c795d');
    for (const x of [-halfWidth, halfWidth]) box(0.14, 7.9, 0.14, x, 3.95, z, '#7c795d');
  };
  const lamp = (x: number, z: number, cave: boolean) => {
    box(0.32, 1.35, 0.32, x, 0.675, z, cave ? '#4d5551' : '#736247');
    const glass = box(0.24, 0.35, 0.24, x, 1.32, z, '#efd29a');
    glass.material = material('#efd29a').clone(); glass.material.emissive.set('#ffd494'); glass.material.emissiveIntensity = 1.2;
    box(0.4, 0.07, 0.4, x, 1.53, z, '#5c6651');
  };
  const crystalGeometry = new THREE.CylinderGeometry(0.04, 0.27, 1.4, 6);
  const crystalMaterials = ['#98b5b2', '#bbced0', '#b1a3bc', '#bbd1b9'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.23, metalness: 0.25, emissive: color, emissiveIntensity: 0.1 }));
  const crystals = (x: number, z: number, seed: number) => {
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(crystalGeometry, crystalMaterials[(seed + i) % 4]);
      const size = 0.65 + (Math.sin(i * 3 + seed) + 1) * 0.7;
      mesh.scale.set(1, size, 1); mesh.position.set(x + Math.sin(i * 2.4) * 0.65, size * 0.6, z + Math.cos(i * 2.4) * 0.65);
      mesh.rotation.set(Math.sin(i) * 0.28, i, Math.cos(i) * 0.25); mesh.castShadow = true; scene.add(mesh);
    }
  };

  const cylinder = (x: number, y: number, z: number, radius: number, height: number, color: string, parent: THREE.Object3D = scene) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), material(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const ball = (x: number, y: number, z: number, radius: number, color: string, parent: THREE.Object3D = scene) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), material(color));
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const plant = (x: number, z: number, seed: number, scale = 1) => {
    const pot = botany.pottedPlant(seed);
    pot.scale.setScalar(scale); pot.position.set(x, 0, z); scene.add(pot);
    b.obstacle({ x, z, rx: scale * 0.55, rz: scale * 0.55 });
  };
  const floor = (room: number, color: string, path: string) => {
    const { z } = galleryTransform(room), width = PLACES[room - PLACE_START].width;
    box(width, 0.12, 36, 0, -0.06, z, color);
    box(8, 0.012, 36, 0, 0.01, z, path);
    for (const x of [-4, 4]) box(0.065, 0.012, 36, x, 0.025, z, '#b7a276');
  };

  // The forest has a living canopy, with the artwork below its branching arches.
  {
    const room = 9, { z: center } = galleryTransform(room);
    box(30, 0.1, 36, 0, -0.1, center, '#83956b');
    floor(room, '#c2bea3', '#e0d8bd');
    sign(room, center + 16.5, false);
    for (const offset of [-16, -5, 5, 16]) {
      const bay = botany.tunnelBay(room * 7 + offset);
      bay.position.z = center + offset; scene.add(bay);
      for (const side of [-1, 1]) {
        rock(side * 13.3, 0.2, center + offset + 1, 0.8, 0.5, 0.7, room + offset + 30);
        lamp(side * 12.9, center + offset - 1.2, false);
      }
    }
    for (const side of [-1, 1]) {
      const grove = botany.tree(2.6, room * 11 + side, true);
      grove.position.set(side * 21, 0, center); scene.add(grove);
      box(0.5, 0.3, 36, side * 12.25, 0.14, center, '#7c855e');
    }
    const leafGeometry = new THREE.CircleGeometry(0.12, 5), leafMaterial = material('#869365');
    for (let i = 0; i < 70; i++) {
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.rotation.x = -Math.PI / 2; leaf.scale.y = 1.7;
      leaf.position.set(Math.sin(i * 7.7) * 10, 0.035, center + Math.cos(i * 4.9) * 17); scene.add(leaf);
    }
  }

  // A sunlit palace: marble inlay, fluted columns, coffered wings and chandeliers.
  {
    const room = 10, { z: center } = galleryTransform(room);
    floor(room, '#e6ddd0', '#eee9de');
    sign(room, center + 16.5, false);
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 10; col++) {
        const x = -15.3 + col * 3.4, z = center + 16.5 - row * 3;
        box(3.36, 0.009, 2.96, x, 0.019, z, (row + col) % 2 ? '#ebe5d9' : '#d2ccbf');
      }
    }
    // The eight-meter center stays open through both ends of the palace.
    for (const side of [-1, 1]) {
      box(0.6, 13, 36, side * 17.3, 6.5, center, '#e0d1bd');
      box(0.75, 0.6, 36, side * 17.1, 0.3, center, '#b5a58c');
      for (const y of [5.6, 11.8, 12.4]) box(0.9, 0.14, 36, side * 17.05, y, center, '#ae9060');
      for (const offset of [-16, -5, 5, 16]) {
        const x = side * 16.65, z = center + offset;
        cylinder(x, 5.75, z, 0.45, 10.6, '#eadeca');
        for (let flute = 0; flute < 12; flute++) cylinder(x + Math.sin(flute * Math.PI / 6) * 0.43, 5.75, z + Math.cos(flute * Math.PI / 6) * 0.43, 0.045, 10, '#cbbba3');
        box(1.4, 0.45, 1.4, x, 0.225, z, '#c5b291');
        box(1.5, 0.32, 1.5, x, 11.15, z, '#ba9c6c');
      }
      box(12.8, 0.45, 36, side * 10.6, 12.8, center, '#e7dac3');
      for (const offset of [-15, -9, -3, 3, 9, 15]) {
        box(11, 0.12, 0.14, side * 10.3, 12.51, center + offset, '#b69a6d');
        box(0.16, 0.12, 36, side * 10.3, 12.51, center, '#b69a6d');
      }
    }
    // Transparent skylight fills the palace with daylight without closing its vista.
    const skylight = box(8, 0.08, 36, 0, 13, center, '#c6dfdf');
    skylight.material = new THREE.MeshStandardMaterial({ color: '#d4ece9', transparent: true, opacity: 0.22, roughness: 0.15, depthWrite: false });
    for (const offset of [-14, -7, 0, 7, 14]) box(34, 0.25, 0.25, 0, 12.6, center + offset, '#bda883');
    for (const offset of [-9, 9]) {
      const z = center + offset;
      cylinder(0, 11.5, z, 0.05, 2, '#9b7b40');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.055, 6, 24), material('#b08a44', 0.3, 0.5));
      ring.rotation.x = Math.PI / 2; ring.position.set(0, 10.2, z); scene.add(ring);
      for (let i = 0; i < 10; i++) {
        const x = Math.sin(i * Math.PI / 5) * 1.65, dz = Math.cos(i * Math.PI / 5) * 1.65;
        cylinder(x, 10.4, z + dz, 0.06, 0.45, '#b49354');
        const glow = ball(x, 10.7, z + dz, 0.15, '#fff3cf');
        glow.material.emissive.set('#ffe8ae'); glow.material.emissiveIntensity = 1;
      }
    }
  }

  // An open neighborhood street, lined with pastel facades and flowered balconies.
  {
    const room = 11, { z: center } = galleryTransform(room);
    floor(room, '#d4cbbb', '#bcb8ae');
    sign(room, center + 16.5, false);
    const colors = ['#c5957f', '#ded4ae', '#91aaa5', '#cab699', '#b2b4a3', '#d0a696'];
    for (const side of [-1, 1]) {
      box(3, 0.12, 36, side * 12.5, 0, center, '#e3dac8');
      for (let i = 0; i < 3; i++) {
        const z = center + 12 - i * 12, color = colors[i + (side > 0 ? 3 : 0)];
        box(8, 13 + i % 2, 11.8, side * 18, (13 + i % 2) / 2, z, color);
        box(8.3, 0.4, 12, side * 18, 13.4 + i % 2, z, '#8e796a');
        for (const y of [6.8, 10.3]) for (const dz of [-3, 2.5]) {
          box(0.15, 2.5, 1.7, side * 13.9, y, z + dz, '#eae2d1');
          box(0.17, 2.15, 1.4, side * 13.79, y, z + dz, '#597978');
          box(0.2, 0.08, 1.4, side * 13.66, y, z + dz, '#d6d6bd');
          box(0.2, 2.15, 0.06, side * 13.66, y, z + dz, '#d6d6bd');
          for (const dz2 of [-1.15, 1.15]) box(0.18, 2.45, 0.5, side * 13.72, y, z + dz + dz2, '#6e8171');
          box(0.8, 0.3, 2.15, side * 13.5, y - 1.4, z + dz, '#a27d5e');
          for (let flower = 0; flower < 9; flower++) {
            ball(side * (13.45 + Math.sin(flower) * 0.15), y - 1.15, z + dz - 0.85 + flower * 0.21, 0.18, flower % 3 ? '#a35365' : '#d7b978');
          }
        }
        // High striped shop awnings leave the complete display visible below.
        for (let stripe = 0; stripe < 12; stripe++) {
          const awning = box(1.7, 0.09, 0.7, side * 13.15, 5.9, z - 4.2 + stripe * 0.7, stripe % 2 ? '#f2e5c9' : '#8a9a84');
          awning.rotation.z = side * 0.12;
        }
      }
      for (const offset of [-16, 15]) {
        cylinder(side * 11.3, 2.5, center + offset, 0.08, 5, '#5c655e');
        const bulb = ball(side * 11.3, 5.15, center + offset, 0.3, '#f3dab0');
        bulb.material.emissive.set('#f4dfb8'); bulb.material.emissiveIntensity = 1;
        plant(side * 11.2, center + offset + (offset < 0 ? 2 : -2), room + side + offset, 0.9);
      }
    }
    for (let i = 0; i < 24; i++) box(0.06, 0.009, 36, -11.5 + i, 0.025, center, '#c4c0b6');
    for (let i = 0; i < 36; i++) box(24, 0.009, 0.035, 0, 0.027, center - 17.5 + i, '#c8c4b9');
  }

  // Six independent stalls face into a broad square, with art among the market life.
  {
    const room = 12, { z: center } = galleryTransform(room);
    floor(room, '#d9cbb1', '#e3d8bf');
    sign(room, center + 17, false);
    for (let i = 0; i < 12; i++) box(48, 0.01, 0.045, 0, 0.018, center - 16.5 + i * 3, '#bdae92');
    for (const side of [-1, 1]) {
      box(0.4, 0.55, 36, side * 24, 0.25, center, '#b7aa88');
      for (const offset of [-15, 15]) {
        const tree = botany.tree(2.2, 70 + side + offset, true);
        tree.position.set(side * 27, 0, center + offset); scene.add(tree);
      }
    }
    const stallColors = ['#a26055', '#748c76', '#c09c56', '#7395a1', '#a77d93', '#bf805e'];
    for (let slot = 0; slot < 6; slot++) {
      const p = placeExhibitSlot(room, slot), g = new THREE.Group();
      g.position.set(p.x, 0, center + p.z); g.rotation.y = p.yaw; scene.add(g);
      const color = stallColors[slot];
      // The stall's goods and posts are behind its painting, never across its view.
      box(7.2, 0.2, 3, 0.85, 0.1, -1.5, '#b7a181', g);
      box(7.2, 1.15, 0.8, 0.85, 0.65, -2.2, '#95734e', g);
      for (const x of [-2.6, 4.3]) for (const z of [-0.6, -2.8]) box(0.11, 6.2, 0.11, x, 3.1, z, '#8d7050', g);
      for (let stripe = 0; stripe < 12; stripe++) {
        const roof = box(0.62, 0.09, 3.7, -2.55 + stripe * 0.62, 6.15, -1.55, stripe % 2 ? '#f4e3bf' : color, g);
        roof.rotation.x = -0.09;
        box(0.62, 0.3, 0.08, -2.55 + stripe * 0.62, 5.86, 0.29, stripe % 2 ? '#f4e3bf' : color, g);
      }
      for (let crate = 0; crate < 3; crate++) {
        const x = -1.65 + crate * 2.3;
        box(1.7, 0.45, 0.7, x, 1.35, -2.2, '#b18b54', g);
        for (let slat = 0; slat < 4; slat++) box(0.08, 0.5, 0.77, x - 0.7 + slat * 0.46, 1.35, -2.2, '#775d3a', g);
        for (let fruit = 0; fruit < 8; fruit++) ball(x - 0.55 + (fruit % 4) * 0.36, 1.63 + (fruit > 3 ? 0.07 : 0), -2.38 + Math.floor(fruit / 4) * 0.34, 0.19, ['#c68244', '#7c9957', '#b8624e'][(slot + crate) % 3], g);
      }
      const obstacleCenter = new THREE.Vector3(0.85, 0, -1.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      const c = Math.abs(Math.cos(p.yaw)), s = Math.abs(Math.sin(p.yaw));
      b.obstacle({ x: p.x + obstacleCenter.x, z: center + p.z + obstacleCenter.z, rx: c * 3.8 + s * 1.7, rz: s * 3.8 + c * 1.7 });
    }
    // Bunting and festoon lights span the square well above the artwork.
    for (const offset of [-9, 9]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 30; i++) points.push(new THREE.Vector3(-24 + i * 1.6, 8.8 - Math.sin(i / 30 * Math.PI) * 1.3, center + offset));
      const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, 0.025, 4, false), material('#756b50')); scene.add(cord);
      for (let i = 1; i < 30; i++) {
        const p = points[i];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.38, 0, 0, 0.38, 0, 0, 0, -0.75, 0], 3)); geometry.computeVertexNormals();
        const flag = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: stallColors[i % 6], side: THREE.DoubleSide }));
        flag.position.copy(p); scene.add(flag);
      }
      for (const x of [-24, 24]) cylinder(x, 4.5, center + offset, 0.08, 9, '#807157');
    }
  }
  // Open-ended cave shells: no doors, pinch points, steps, or low ceilings.
  for (const room of [13]) {
    const { z: center } = galleryTransform(room);
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    const rings = 18, slices = 24;
    for (let row = 0; row <= rings; row++) {
      const localZ = 18 - row * 2;
      for (let col = 0; col <= slices; col++) {
        const angle = col / slices * Math.PI;
        const wave = Math.sin(row * 0.8 + col * 1.7 + room) * 0.42;
        const radius = 15.2 + Math.sin(row * 0.43) * 0.5;
        positions.push(Math.cos(angle) * (radius + wave), Math.sin(angle) * (13.8 + wave + Math.sin(localZ * 0.11) * 0.8), center + localZ);
        uvs.push(col / slices * 5, row / rings * 5);
        if (row < rings && col < slices) {
          const a = row * (slices + 1) + col;
          indices.push(a, a + 1, a + slices + 1, a + 1, a + slices + 2, a + slices + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const shell = new THREE.Mesh(geometry, rockMaterials[0]);
    shell.castShadow = true; shell.receiveShadow = true; scene.add(shell);
    box(30, 0.12, 36, 0, -0.06, center, '#888a7a');
    box(8, 0.015, 36, 0, 0.02, center, '#c4b795');
    sign(room, center + 16, true);
    for (const side of [-1, 1]) {
      box(0.1, 0.03, 36, side * 4, 0.037, center, '#d4b876');
      box(0.65, 0.4, 36, side * 12.35, 0.2, center, '#6d746b');
      for (const offset of [-16, -5, 5, 16]) {
        const z = center + offset;
        rock(side * 14.5, 1.2, z, 1.2, 2.1, 1.5, room + offset + 30);
        crystals(side * 13.35, z + 1, room + offset + 30);
        lamp(side * 12.8, z - 1, true);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.8, 9), rockMaterials[room % 3]);
        cone.position.set(side * 7.5, 10.8 + Math.sin(z) * 0.3, z); cone.rotation.z = Math.PI; scene.add(cone);
      }
    }
    const light = new THREE.PointLight('#ffd99e', 25, 34, 1.6);
    light.position.set(0, 8.5, center); scene.add(light);
  }
  // Give both cave openings a thick, irregular stone face around the clear arch.
  for (const z of [-260, -295.5]) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 24; i++) {
      const angle = i / 24 * Math.PI, wobble = Math.sin(i * 2.7) * 0.6;
      const x = Math.cos(angle) * (18.2 + wobble), y = Math.sin(angle) * (16.4 + wobble);
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    for (let i = 24; i >= 0; i--) {
      const angle = i / 24 * Math.PI;
      shape.lineTo(Math.cos(angle) * (14.9 + Math.sin(i * 1.3) * 0.25), Math.sin(angle) * (12.8 + Math.cos(i * 2) * 0.3));
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 1, steps: 1 });
    // World-scale UVs keep the fine stone grain consistent with the inner shell.
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.17, uv.getY(i) * 0.17);
    const face = new THREE.Mesh(geometry, rockMaterials[1]);
    face.position.z = z; face.castShadow = true; face.receiveShadow = true; scene.add(face);
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      rock(side * (16.6 + Math.sin(i) * 0.5), 0.8 + i * 2.4, z + 1.2, 1.5, 2.1, 1.8, i + 20);
    }
  }

  // The waterfront is a broad terrace with open views, moored boats and a pier.
  {
    const room = 14, { z: center } = galleryTransform(room);
    floor(room, '#d8d2bb', '#e6deca');
    box(40, 0.12, 22, 0, -0.06, -341, '#d8d2bb');
    sign(room, center + 16.5, false);
    const water = box(180, 0.08, 100, 0, -0.12, -340, '#79aaa9');
    water.material = new THREE.MeshStandardMaterial({ color: '#79aaa9', metalness: 0.22, roughness: 0.33 });
    for (let i = 0; i < 100; i++) {
      const x = Math.sin(i * 6.7) * 85, z = -295 - (i * 13.7 % 92);
      if (Math.abs(x) < 21 && z > ROUTE_BACK) continue;
      box(1 + i % 4, 0.008, 0.04, x, -0.074, z, i % 3 ? '#a6cac4' : '#669c9e');
    }
    const railing = (x: number, z: number, across: boolean, length: number) => {
      for (let i = 0; i <= length; i += 2) cylinder(x + (across ? i : 0), 0.55, z + (across ? 0 : i), 0.045, 1.1, '#687c78');
      box(across ? length : 0.08, 0.08, across ? 0.08 : length, x + (across ? length / 2 : 0), 1.13, z + (across ? 0 : length / 2), '#8b947f');
      box(across ? length : 0.04, 0.04, across ? 0.04 : length, x + (across ? length / 2 : 0), 0.55, z + (across ? 0 : length / 2), '#778d86');
    };
    for (const side of [-1, 1]) {
      railing(side * 20, ROUTE_BACK, false, 58);
      for (const offset of [-15, 15]) plant(side * 18.2, center + offset, 100 + side + offset, 1.4);
      for (const z of [-306, -318, -345]) {
        cylinder(side * 19.4, 2, z, 0.08, 4, '#5f7773');
        const bulb = ball(side * 19.4, 4.2, z, 0.25, '#ffe8ba'); bulb.material.emissive.set('#ffe8ba'); bulb.material.emissiveIntensity = 1;
      }
      box(4, 0.25, 1.2, side * 11, 0.65, -344, '#968268');
      box(4, 0.6, 0.13, side * 11, 1.02, -344.5, '#968268');
      for (const leg of [-1.4, 1.4]) box(0.15, 0.6, 1.1, side * 11 + leg, 0.3, -344, '#6c7d75');
      b.obstacle({ x: side * 11, z: -344, rx: 2.3, rz: 0.9 });
    }
    railing(-20, ROUTE_BACK, true, 40);
    for (let i = 0; i < 28; i++) box(40, 0.008, 0.055, 0, 0.013, -296 - i * 2, '#bcb69f');
    // A decorative dock and two small sailboats remain beyond the promenade rail.
    box(14, 0.2, 3, 27, -0.04, -328, '#ac9170');
    for (const z of [-326.6, -329.4]) for (const x of [22, 27, 32]) cylinder(x, -0.15, z, 0.13, 1.7, '#756d55');
    for (const [x, z, color] of [[30, -317, '#b37661'], [-31, -339, '#73959e']] as const) {
      const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), material(color));
      hull.scale.set(1.4, 0.75, 3.2); hull.position.set(x, -0.3, z); scene.add(hull);
      box(2.1, 0.12, 4.8, x, 0.24, z, '#d6ba87');
      cylinder(x, 3.65, z, 0.065, 7, '#a8926a');
      const sailGeometry = new THREE.BufferGeometry();
      sailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 6.8, 0, 0, 1.3, 0, 0, 1.3, 3.1], 3)); sailGeometry.computeVertexNormals();
      const sail = new THREE.Mesh(sailGeometry, new THREE.MeshStandardMaterial({ color: '#f3e7cc', side: THREE.DoubleSide })); sail.position.set(x, 0, z); scene.add(sail);
    }
  }
}
