import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { ModelResult } from "../types";
export function meshGeometry(m: ModelResult) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  return g;
}
export function exportStl(m: ModelResult) {
  const g = meshGeometry(m),
    material = new THREE.MeshStandardMaterial(),
    mesh = new THREE.Mesh(g, material);
  try {
    return new STLExporter().parse(mesh, { binary: true });
  } finally {
    g.dispose();
    material.dispose();
  }
}
export async function exportGlb(m: ModelResult) {
  const g = meshGeometry(m),
    material = new THREE.MeshStandardMaterial({ color: 0x7694b7 }),
    mesh = new THREE.Mesh(g, material);
  // glTF uses meters and Y-up; keep project/STL in mm and Z-up.
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2;
  group.scale.setScalar(0.001);
  group.add(mesh);
  group.updateMatrixWorld(true);
  try {
    return (await new GLTFExporter().parseAsync(group, {
      binary: true,
    })) as ArrayBuffer;
  } finally {
    g.dispose();
    material.dispose();
  }
}
