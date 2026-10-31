import { useMemo } from 'react'
import * as THREE from 'three'

/** Flat-shaded standard material: the core of the low-poly look. */
export function M({ color, ...props }) {
  return <meshStandardMaterial color={color} flatShading roughness={0.85} metalness={0} {...props} />
}

const UP = new THREE.Vector3(0, 1, 0)

/** A cylinder stretched between two points (arms, legs, stems). */
export function Limb({ from, to, radius = 0.06, color, segments = 6, castShadow = true }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const dir = b.clone().sub(a)
    const length = dir.length()
    const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize())
    return { position: a.add(b).multiplyScalar(0.5).toArray(), quaternion, length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.join(','), to.join(',')])
  return (
    <mesh position={position} quaternion={quaternion} castShadow={castShadow}>
      <cylinderGeometry args={[radius, radius * 0.9, length, segments]} />
      <M color={color} />
    </mesh>
  )
}

/** Deterministic random so plants look the same on every load. */
export function rng(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}
