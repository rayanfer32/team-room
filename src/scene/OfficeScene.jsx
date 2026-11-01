import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import Office, { MeetingTable } from './Office'
import Person, { Chair } from './Person'

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
/**
 * Seats around the table. The host sits opposite the camera, facing it.
 * In an interview, your empty chair takes the seat nearest the camera, facing the panel.
 */
function useSeats(personas, hostName, candidate) {
  return useMemo(() => {
    const total = personas.length + (candidate ? 1 : 0)
    const SEAT_RADIUS = tableRadius(total) + 0.45
    const facing = Math.atan2(CAMERA[0], CAMERA[2]) + Math.PI
    const seat = (k, name) => {
      const angle = facing + (k * Math.PI * 2) / total
      const x = Math.sin(angle) * SEAT_RADIUS
      const z = Math.cos(angle) * SEAT_RADIUS - 0.2
      return { name, angle, x, z, rot: Math.atan2(-Math.sin(angle), -Math.cos(angle)) }
    }
    const order = [...personas]
    const hi = Math.max(0, order.findIndex((p) => p.name === hostName))
    const host = order.splice(hi, 1)[0]
    const youSlot = candidate ? Math.round(total / 2) : -1
    const list = []
    let next = 0
    for (let k = 0; k < total; k++) {
      if (k === youSlot) list.push({ ...seat(k, 'You'), candidate: true })
      else if (k === 0) list.push(seat(k, host.name))
      else list.push(seat(k, order[next++].name))
    }
    const byName = Object.fromEntries(list.map((s) => [s.name, s]))
    return { list, byName }
  }, [personas, hostName, candidate])
}

/** Your empty chair in an interview; it lights up when it's your turn. */
function CandidateSeat({ seat, live }) {
  const ring = useRef()
  useFrame((state, dt) => {
    const on = live.focus === 'You'
    const m = ring.current.material
    m.opacity += ((on ? 0.85 : 0.15) - m.opacity) * (1 - Math.exp(-dt * 4))
    ring.current.scale.setScalar(1 + (on ? Math.sin(state.clock.elapsedTime * 4) * 0.04 : 0))
  })
  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.rot, 0]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.5, 0.62, 48]} />
        <meshBasicMaterial color="#f2b134" transparent opacity={0.15} toneMapped={false} />
      </mesh>
      <Chair accent="#3d4a43" />
      <Html position={[0, 1.25, 0]} center zIndexRange={[20, 0]} pointerEvents="none">
        <div className="nametag you-tag">
          <b>You</b>
          <span className="role">Candidate</span>
        </div>
      </Html>
    </group>
  )
}

export default function OfficeScene({ personas, hostName, candidate, live, speaking, line, boardView }) {
  const seats = useSeats(personas, hostName, candidate)
  const tableR = tableRadius(seats.list.length)
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

      <Office boardView={boardView} tableR={tableR} />
      <group position={[0, 0, -0.2]}>
        <MeetingTable seatsList={seats.list} radius={tableR} />
      </group>
      {personas.map((p, i) => (
        <Person
          key={`${i}-${p.name}`}
          persona={p}
          seat={seats.byName[p.name]}
          seats={seats.byName}
          live={live}
          speaking={speaking === p.name}
          line={speaking === p.name ? line : null}
        />
      ))}
      {candidate && seats.byName.You && <CandidateSeat seat={seats.byName.You} live={live} />}

      <CameraFit count={seats.list.length} />
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
