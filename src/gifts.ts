import * as THREE from "three";

// Friendship gifts: once a neighbour's first favour is done, something of theirs appears
// beside them in the city. Each gift sits in the resident's own frame, to their right.
const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
function mesh(group: THREE.Group, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, extra?: THREE.MeshStandardMaterialParameters) {
  const m = new THREE.Mesh(geometry, mat(color, extra));
  m.position.set(x, y, z); m.castShadow = true; group.add(m); return m;
}

export function buildGift(id: string, color: string) {
  const gift = new THREE.Group();
  gift.name = `gift:${id}`;
  gift.position.set(1.25, 0, 0.1);
  switch (id) {
    case "sailor": { // A pennant on a little mast.
      mesh(gift, new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), "#8b7a5c", 0, 1.3, 0);
      const flag = new THREE.BufferGeometry();
      flag.setAttribute("position", new THREE.Float32BufferAttribute([0, 2.55, 0, 0, 2.05, 0, 0.9, 2.3, 0], 3)); flag.computeVertexNormals();
      const pennant = new THREE.Mesh(flag, mat(color, { side: THREE.DoubleSide })); gift.add(pennant);
      pennant.name = "pennant";
      break;
    }
    case "guide": { // A signpost pointing three ways.
      mesh(gift, new THREE.CylinderGeometry(0.05, 0.06, 2.2, 8), "#8b7a5c", 0, 1.1, 0);
      [[1.9, 0.4, color], [1.6, -0.5, "#e6d6a8"], [1.3, 2.6, "#7c9a86"]].forEach(([y, yaw, c]) => {
        const arm = mesh(gift, new THREE.BoxGeometry(0.75, 0.18, 0.04), c as string, 0, y as number, 0);
        arm.rotation.y = yaw as number; arm.translateX(0.3);
      });
      break;
    }
    case "gardener": { // A ring of flowers.
      const petals = ["#e58fa0", "#f2c14e", "#9fb7e8", "#f39a5a", color];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, x = Math.cos(a) * 0.5, z = Math.sin(a) * 0.5;
        mesh(gift, new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5), "#5d7d4a", x, 0.22, z);
        mesh(gift, new THREE.SphereGeometry(0.09, 8, 6), petals[i % petals.length], x, 0.48, z);
      }
      break;
    }
    case "merchant": { // A crate of fruit.
      mesh(gift, new THREE.BoxGeometry(0.8, 0.4, 0.55), "#a7825a", 0, 0.2, 0);
      const fruit = ["#d9573f", "#f0a33a", "#b9c94a", color];
      for (let i = 0; i < 10; i++) mesh(gift, new THREE.SphereGeometry(0.1, 8, 6), fruit[i % fruit.length], -0.3 + (i % 5) * 0.15, 0.47, -0.1 + Math.floor(i / 5) * 0.2);
      break;
    }
    case "historian": { // A stack of old books.
      ["#7a3b35", color, "#3f5b6b", "#b68b4c"].forEach((c, i) => {
        const book = mesh(gift, new THREE.BoxGeometry(0.6 - i * 0.06, 0.12, 0.42 - i * 0.03), c, 0, 0.06 + i * 0.12, 0);
        book.rotation.y = (i % 2 ? 0.25 : -0.15);
      });
      break;
    }
    case "librarian": { // A small bookcase.
      mesh(gift, new THREE.BoxGeometry(0.9, 1.2, 0.3), "#8a6c4c", 0, 0.6, -0.05);
      const spines = ["#7a3b35", "#3f5b6b", color, "#b68b4c", "#5d7d4a", "#6f5c86"];
      for (let shelf = 0; shelf < 2; shelf++) for (let i = 0; i < 6; i++)
        mesh(gift, new THREE.BoxGeometry(0.1, 0.36, 0.22), spines[(i + shelf * 2) % spines.length], -0.3 + i * 0.12, 0.3 + shelf * 0.52, 0.06);
      break;
    }
  }
  return gift;
}
