import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Otimização de desempenho: mescla malhas estáticas que compartilham o mesmo material em uma única malha
 * (uma chamada de desenho por material em vez de uma por peça).
 *  - Suporta malhas com vários materiais (BoxGeometry com material por face), separando cada grupo.
 *  - Preserva castShadow/receiveShadow/renderOrder (fazem parte da chave do agrupamento).
 *  - InstancedMesh, Sprites, Lines e objetos marcados com userData.noBake são mantidos como estão.
 */

function bucketKey(material, castShadow, receiveShadow, renderOrder) {
    return `${material.uuid}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}|${renderOrder}`;
}

function normalizeGeometry(geo) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    g.morphAttributes = {};
    return g;
}

/** Extrai a parte [start, start+count) (em vértices de geometria não indexada) como nova geometria. */
function sliceGeometry(g, start, count) {
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
        const attr = g.attributes[name];
        const size = attr.itemSize;
        out.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(start * size, (start + count) * size), size));
    }
    return out;
}

/**
 * Mescla as malhas estáticas descendentes de `root`, no espaço local de `root`.
 * As malhas originais são removidas e substituídas pelas mescladas (filhas diretas de `root`).
 * @param {(mesh: THREE.Mesh) => boolean} [filter] retorna false para manter uma malha sem mesclar
 * @returns {{ before: number, after: number }} quantidade de malhas antes/depois
 */
export function bakeStaticByMaterial(root, filter = null) {
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map();
    const toRemove = [];
    let before = 0;

    root.traverse((obj) => {
        if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh) return;
        if (obj.userData && obj.userData.noBake) return;
        if (filter && !filter(obj)) return;
        if (!obj.visible) return;
        const geo = obj.geometry;
        if (!geo || !geo.attributes || !geo.attributes.position) return;
        before++;

        const local = new THREE.Matrix4().multiplyMatrices(rootInv, obj.matrixWorld);
        const g = normalizeGeometry(geo);
        g.applyMatrix4(local);

        const pieces = [];
        if (Array.isArray(obj.material)) {
            // Geometria não indexada: os grupos originais apontam para índices -> após toNonIndexed,
            // os grupos passam a contar vértices na mesma ordem (start/count continuam válidos)
            const groups = geo.groups.length ? geo.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
            groups.forEach((grp) => {
                const mat = obj.material[grp.materialIndex];
                if (!mat) return;
                const count = Math.min(grp.count, g.attributes.position.count - grp.start);
                if (count <= 0) return;
                pieces.push({ mat, geo: sliceGeometry(g, grp.start, count) });
            });
            g.dispose();
        } else {
            pieces.push({ mat: obj.material, geo: g });
        }

        pieces.forEach(({ mat, geo: pg }) => {
            const key = bucketKey(mat, obj.castShadow, obj.receiveShadow, obj.renderOrder);
            let b = buckets.get(key);
            if (!b) {
                b = { material: mat, castShadow: obj.castShadow, receiveShadow: obj.receiveShadow, renderOrder: obj.renderOrder, geos: [] };
                buckets.set(key, b);
            }
            b.geos.push(pg);
        });
        toRemove.push(obj);
    });

    if (toRemove.length === 0) return { before: 0, after: 0 };

    toRemove.forEach((obj) => {
        if (obj.parent) obj.parent.remove(obj);
    });
    // Remove grupos que ficaram vazios
    const pruneEmpty = (node) => {
        for (let i = node.children.length - 1; i >= 0; i--) {
            const c = node.children[i];
            pruneEmpty(c);
            if (c.type === 'Group' && c.children.length === 0 && !(c.userData && c.userData.keepEmpty)) node.remove(c);
        }
    };
    pruneEmpty(root);

    let after = 0;
    for (const b of buckets.values()) {
        const merged = BufferGeometryUtils.mergeGeometries(b.geos, false);
        b.geos.forEach((gg) => gg.dispose());
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, b.material);
        mesh.castShadow = b.castShadow;
        mesh.receiveShadow = b.receiveShadow;
        mesh.renderOrder = b.renderOrder;
        root.add(mesh);
        after++;
    }
    return { before, after };
}
