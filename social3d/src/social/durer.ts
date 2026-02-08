import * as THREE from 'three';

// "Durer-like" polyhedron approximation: a cube with two truncated corners.
// Matches the vibe of Melencolia I without chasing exactness.
export function createDurerGeometry(size = 150, cut = 0.45): THREE.PolyhedronGeometry {
  const c = cut;
  const v: Array<[number, number, number]> = [
    // 6 original cube vertices (excluding 2 truncated corners)
    [1, 1, -1], // 0
    [1, -1, 1], // 1
    [-1, 1, 1], // 2
    [-1, -1, 1], // 3
    [-1, 1, -1], // 4
    [1, -1, -1], // 5
    // 3 new verts near (1,1,1)
    [1, 1, 1 - 2 * c], // 6
    [1, 1 - 2 * c, 1], // 7
    [1 - 2 * c, 1, 1], // 8
    // 3 new verts near (-1,-1,-1)
    [-1, -1, -1 + 2 * c], // 9
    [-1, -1 + 2 * c, -1], // 10
    [-1 + 2 * c, -1, -1], // 11
  ];

  const verts = v.flat();
  const faces = [
    // Truncated triangles
    6, 7, 8,
    9, 10, 11,

    // 6 pentagons (triangulated)
    // x = +1: [0,6,7,1,5]
    0, 6, 7, 0, 7, 1, 0, 1, 5,
    // y = +1: [0,6,8,2,4]
    0, 6, 8, 0, 8, 2, 0, 2, 4,
    // z = +1: [1,7,8,2,3]
    1, 7, 8, 1, 8, 2, 1, 2, 3,
    // x = -1: [2,4,10,9,3]
    2, 4, 10, 2, 10, 9, 2, 9, 3,
    // y = -1: [1,3,9,11,5]
    1, 3, 9, 1, 9, 11, 1, 11, 5,
    // z = -1: [0,5,11,10,4]
    0, 5, 11, 0, 11, 10, 0, 10, 4,
  ];

  const g = new THREE.PolyhedronGeometry(verts, faces, size, 0);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function createDurerWireframe(size = 150, cut = 0.45) {
  const geo = createDurerGeometry(size, cut);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0x9fb3a8, wireframe: true, transparent: true, opacity: 0.55 }),
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 40),
    new THREE.LineBasicMaterial({ color: 0xe7e1d7, transparent: true, opacity: 0.14 }),
  );
  return { geo, mesh, edges };
}

