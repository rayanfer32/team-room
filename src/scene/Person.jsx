import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { M, Limb } from './parts'

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

function Chair() {
  return (
    <group>
      <mesh position={[0, 0.43, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.09, 0.58]} />
        <M color="#3d4a43" />
      </mesh>
      <mesh position={[0, 0.85, -0.31]} rotation={[-0.12, 0, 0]} castShadow>
        <boxGeometry args={[0.56, 0.66, 0.08]} />
        <M color="#3d4a43" />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.36, 6]} />
        <M color="#2a2e2c" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[0, 0.05, 0.16]}>
              <boxGeometry args={[0.05, 0.04, 0.32]} />
              <M color="#2a2e2c" />
            </mesh>
            <mesh position={[0, 0.03, 0.31]}>
              <icosahedronGeometry args={[0.035, 0]} />
              <M color="#1c1f1d" />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function Hair({ look }) {
  const c = look.hair
  return (
    <group>
      <mesh position={[0, 0.06, -0.04]} scale={[1.05, 0.82, 0.97]} castShadow>
        <icosahedronGeometry args={[0.175, 1]} />
        <M color={c} />
      </mesh>
      {look.hairStyle === 'long' && (
        <mesh position={[0, -0.1, -0.1]} castShadow>
          <boxGeometry args={[0.34, 0.36, 0.14]} />
          <M color={c} />
        </mesh>
      )}
      {look.hairStyle === 'bob' && (
        <mesh position={[0, -0.04, -0.07]} castShadow>
          <boxGeometry args={[0.38, 0.2, 0.22]} />
          <M color={c} />
        </mesh>
      )}
      {look.hairStyle === 'bun' && (
        <mesh position={[0, 0.17, -0.12]} castShadow>
          <icosahedronGeometry args={[0.08, 0]} />
          <M color={c} />
        </mesh>
      )}
      {look.beard && (
        <mesh position={[0, -0.1, 0.05]} scale={[1, 0.75, 0.85]}>
          <icosahedronGeometry args={[0.13, 0]} />
          <M color={c} />
        </mesh>
      )}
    </group>
  )
}

function Glasses() {
  return (
    <group position={[0, 0.02, 0.168]}>
      {[-0.06, 0.06].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <torusGeometry args={[0.035, 0.008, 4, 8]} />
          <M color="#1d1d1d" />
        </mesh>
      ))}
      <mesh>
        <boxGeometry args={[0.05, 0.01, 0.01]} />
        <M color="#1d1d1d" />
      </mesh>
    </group>
  )
}

function Arm({ side, look, armRef }) {
  return (
    <group ref={armRef} position={[side * 0.27, 1.05, -0.04]}>
      <Limb from={[0, 0, 0]} to={[side * 0.03, -0.23, 0.2]} radius={0.065} color={look.shirt} />
      <Limb from={[side * 0.03, -0.23, 0.2]} to={[side * -0.03, -0.24, 0.52]} radius={0.055} color={look.shirt} />
      <mesh position={[side * -0.035, -0.245, 0.57]} castShadow>
        <icosahedronGeometry args={[0.055, 0]} />
        <M color={look.skin} />
      </mesh>
    </group>
  )
}

export default function Person({ persona, seat, seats, live, speaking, line }) {
  const { look } = persona
  const head = useRef()
  const torso = useRef()
  const mouth = useRef()
  const eyes = useRef()
  const armR = useRef()
  const ring = useRef()
  const phase = useRef(Math.random() * 10)

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime + phase.current
    const isMe = live.speakingId === persona.id
    const amp = isMe ? live.amp : 0

    torso.current.scale.y = 1 + Math.sin(t * 1.6) * 0.012

    // Look at whoever is talking; otherwise drift gently around the table.
    let targetYaw = Math.sin(t * 0.23) * 0.35
    let targetPitch = 0.08
    const speakerSeat = live.speakingId && live.speakingId !== persona.id && seats[live.speakingId]
    if (speakerSeat) {
      const world = Math.atan2(speakerSeat.x - seat.x, speakerSeat.z - seat.z)
      targetYaw = THREE.MathUtils.clamp(wrap(world - seat.rot), -1.25, 1.25)
      targetPitch = 0.02
    } else if (live.speakingId === 'you') {
      targetYaw = Math.sin(t * 0.5) * 0.2
    }
    if (isMe) {
      targetYaw = Math.sin(t * 0.9) * 0.45
      targetPitch = -0.04 + amp * 0.12 + Math.sin(t * 7) * 0.025 * amp
    }
    const k = 1 - Math.exp(-dt * 4)
    head.current.rotation.y += (targetYaw - head.current.rotation.y) * k
    head.current.rotation.x += (targetPitch - head.current.rotation.x) * k

    mouth.current.scale.y = 1 + amp * 5.5
    const blink = (t % 4.3) < 0.12 ? 0.15 : 1
    eyes.current.scale.y = blink

    const gesture = isMe ? -(0.35 + Math.sin(t * 3.2) * 0.22 * (0.4 + amp)) : 0
    armR.current.rotation.x += (gesture - armR.current.rotation.x) * k

    const mat = ring.current.material
    mat.opacity += ((isMe ? 0.85 : 0) - mat.opacity) * k
    ring.current.scale.setScalar(1 + (isMe ? Math.sin(t * 4) * 0.04 : 0))
  })

  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.rot, 0]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.5, 0.62, 24]} />
        <meshBasicMaterial color="#f2b134" transparent opacity={0} toneMapped={false} />
      </mesh>

      <Chair />

      {/* legs */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Limb from={[s * 0.11, 0.56, -0.08]} to={[s * 0.12, 0.54, 0.33]} radius={0.085} color={look.pants} />
          <Limb from={[s * 0.12, 0.54, 0.33]} to={[s * 0.12, 0.09, 0.36]} radius={0.07} color={look.pants} />
          <mesh position={[s * 0.12, 0.05, 0.42]} castShadow>
            <boxGeometry args={[0.13, 0.09, 0.24]} />
            <M color="#2b2522" />
          </mesh>
        </group>
      ))}

      {/* body */}
      <group ref={torso} position={[0, 0.55, -0.05]}>
        <mesh position={[0, 0.27, 0]} castShadow>
          <cylinderGeometry args={[0.21, 0.25, 0.55, 7]} />
          <M color={look.shirt} />
        </mesh>
        <mesh position={[0, 0.51, 0]} castShadow>
          <boxGeometry args={[0.58, 0.12, 0.26]} />
          <M color={look.shirt} />
        </mesh>
      </group>
      <Arm side={-1} look={look} />
      <Arm side={1} look={look} armRef={armR} />
      <mesh position={[0, 1.16, -0.04]}>
        <cylinderGeometry args={[0.06, 0.07, 0.12, 6]} />
        <M color={look.skin} />
      </mesh>

      {/* head */}
      <group ref={head} position={[0, 1.2, -0.03]}>
        <group position={[0, 0.13, 0]}>
          <mesh castShadow>
            <icosahedronGeometry args={[0.17, 1]} />
            <M color={look.skin} />
          </mesh>
          <group ref={eyes} position={[0, 0.02, 0.158]}>
            {[-0.06, 0.06].map((x) => (
              <mesh key={x} position={[x, 0, 0]}>
                <boxGeometry args={[0.03, 0.036, 0.02]} />
                <M color="#1a1412" />
              </mesh>
            ))}
          </group>
          <mesh position={[0, -0.025, 0.17]}>
            <boxGeometry args={[0.035, 0.05, 0.03]} />
            <M color={look.skin} />
          </mesh>
          <mesh ref={mouth} position={[0, -0.075, 0.162]}>
            <boxGeometry args={[0.07, 0.016, 0.02]} />
            <M color="#5a2a26" />
          </mesh>
          <Hair look={look} />
          {look.glasses && <Glasses />}
        </group>
      </group>

      <Html position={[0, 1.78, 0]} center zIndexRange={[20, 0]} pointerEvents="none">
        <div className={`nametag${speaking ? ' is-speaking' : ''}`}>
          <span className="dot" style={{ background: look.shirt }} />
          <b>{persona.name}</b>
          <span className="role">{persona.role}</span>
        </div>
      </Html>
      {speaking && line && (
        <Html position={[0, 1.95, 0]} zIndexRange={[30, 10]} pointerEvents="none">
          <div className="bubble" style={{ '--accent': look.shirt }}>
            {line}
          </div>
        </Html>
      )}
    </group>
  )
}
