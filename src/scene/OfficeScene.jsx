import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import Office, { MeetingTable } from './Office'
import Person from './Person'

/** Table grows a little for bigger teams so nobody is squeezed. */
export const tableRadius = (n) => Math.max(1.6, 1.6 + (n - 5) * 0.3)
const CAMERA = [5.4, 4.1, 6.3]

/** Pull the camera back on tall, narrow screens so the whole table fits. */
function CameraFit({ count }) {
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / s.size.height)
  const tall = aspect < 0.9
  useEffect(() => {
    const k = (tall ? 1.75 : 1) * (1 + Math.max(0, count - 5) * 0.08)
    camera.position.set(CAMERA[0] * k, CAMERA[1] * k, CAMERA[2] * k)
    camera.updateProjectionMatrix()
  }, [tall, camera, count])
  return null
}

/** Seats around the table; the manager sits opposite the camera, facing it. */
function useSeats(personas, managerId) {
  return useMemo(() => {
    const SEAT_RADIUS = tableRadius(personas.length) + 0.45
    const facing = Math.atan2(CAMERA[0], CAMERA[2]) + Math.PI
    const mi = Math.max(0, personas.findIndex((p) => p.id === managerId))
    const list = personas.map((p, i) => {
      const angle = facing + ((i - mi) * Math.PI * 2) / personas.length
      const x = Math.sin(angle) * SEAT_RADIUS
      const z = Math.cos(angle) * SEAT_RADIUS - 0.2
      return { id: p.id, angle, x, z, rot: Math.atan2(-Math.sin(angle), -Math.cos(angle)) }
    })
    const byId = Object.fromEntries(list.map((s) => [s.id, s]))
    return { list, byId }
  }, [personas, managerId])
}

export default function OfficeScene({ personas, managerId, live, speakingId, line, topic }) {
  const seats = useSeats(personas, managerId)
  const tableR = tableRadius(personas.length)
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: CAMERA, fov: 42, near: 0.1, far: 80 }} gl={{ antialias: true }}>
      <color attach="background" args={['#1e2b25']} />
      <fog attach="fog" args={['#1e2b25', 18, 34]} />

      <hemisphereLight args={['#fff1dc', '#6d5a48', 1.0]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[6, 10, 5]}
        intensity={1.7}
        color="#ffe2b8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />
      <pointLight position={[1.2, 2.6, -6.2]} intensity={5} distance={7} decay={2} color="#d8ecff" />

      <Office topic={topic} tableR={tableR} />
      <group position={[0, 0, -0.2]}>
        <MeetingTable seatsList={seats.list} radius={tableR} />
      </group>
      {personas.map((p) => (
        <Person
          key={p.id}
          persona={p}
          seat={seats.byId[p.id]}
          seats={seats.byId}
          live={live}
          speaking={speakingId === p.id}
          line={speakingId === p.id ? line : null}
        />
      ))}

      <CameraFit count={personas.length} />
      <OrbitControls
        makeDefault
        target={[-0.3, 0.9, -0.5]}
        enablePan={false}
        enableDamping
        minDistance={4}
        maxDistance={18}
        maxPolarAngle={1.42}
        minAzimuthAngle={-0.35}
        maxAzimuthAngle={1.9}
      />
    </Canvas>
  )
}
