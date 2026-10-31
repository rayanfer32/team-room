import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/** Smooth-shaded material for the characters. */
function S({ color, rough = 0.72, ...props }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={0} {...props} />
}

function shade(hex, amt) {
  const c = new THREE.Color(hex)
  const hsl = {}
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amt, 0, 1))
  return `#${c.getHexString()}`
}

/** A rounded capsule stretched between two points: arms, legs, brows. */
function Capsule({ from, to, radius, color, rough, castShadow = true }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const dir = b.clone().sub(a)
    const length = dir.length()
    return {
      position: a.add(b).multiplyScalar(0.5).toArray(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
      length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.join(','), to.join(',')])
  return (
    <mesh position={position} quaternion={quaternion} castShadow={castShadow}>
      <capsuleGeometry args={[radius, Math.max(0.001, length), 8, 18]} />
      <S color={color} rough={rough} />
    </mesh>
  )
}

function Chair({ accent }) {
  return (
    <group>
      <RoundedBox args={[0.6, 0.1, 0.58]} radius={0.045} smoothness={4} position={[0, 0.43, -0.02]} castShadow receiveShadow>
        <S color={accent} rough={0.9} />
      </RoundedBox>
      <RoundedBox args={[0.56, 0.64, 0.09]} radius={0.045} smoothness={4} position={[0, 0.86, -0.31]} rotation={[-0.12, 0, 0]} castShadow>
        <S color={accent} rough={0.9} />
      </RoundedBox>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.36, 16]} />
        <meshStandardMaterial color="#9aa1a0" metalness={0.7} roughness={0.35} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} rotation={[0, (i / 5) * Math.PI * 2, 0]}>
          <Capsule from={[0, 0.06, 0.02]} to={[0, 0.05, 0.3]} radius={0.022} color="#2a2e2c" castShadow={false} />
          <mesh position={[0, 0.03, 0.31]}>
            <sphereGeometry args={[0.032, 12, 10]} />
            <S color="#1c1f1d" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Hair({ look }) {
  const c = look.hair
  const style = look.hairStyle
  if (style === 'none') return null
  const cover = { short: 0.42, bob: 0.47, long: 0.47, bun: 0.45 }[style] ?? 0.44
  return (
    <group>
      {/* the cap is tilted back so the forehead and brows stay visible */}
      <mesh rotation={[-0.42, 0, 0]} position={[0, 0.004, -0.006]} castShadow>
        <sphereGeometry args={[0.172, 40, 24, 0, Math.PI * 2, 0, Math.PI * cover]} />
        <S color={c} rough={0.55} side={THREE.DoubleSide} />
      </mesh>
      {style === 'short' && (
        <mesh position={[0, 0.02, -0.04]} scale={[1, 0.95, 0.95]} castShadow>
          <sphereGeometry args={[0.164, 32, 20, Math.PI, Math.PI, Math.PI * 0.35, Math.PI * 0.3]} />
          <S color={c} rough={0.55} side={THREE.DoubleSide} />
        </mesh>
      )}
      {style === 'long' && (
        <>
          <mesh position={[0, -0.1, -0.07]} scale={[1.15, 1, 0.62]} castShadow>
            <capsuleGeometry args={[0.13, 0.2, 8, 20]} />
            <S color={c} rough={0.55} />
          </mesh>
          {[-1, 1].map((s) => (
            <Capsule key={s} from={[s * 0.138, 0.02, 0.0]} to={[s * 0.13, -0.2, -0.01]} radius={0.04} color={c} rough={0.55} />
          ))}
        </>
      )}
      {style === 'bob' && (
        <>
          <mesh position={[0, -0.03, -0.06]} scale={[1.12, 0.85, 0.75]} castShadow>
            <sphereGeometry args={[0.17, 32, 20]} />
            <S color={c} rough={0.55} />
          </mesh>
          {[-1, 1].map((s) => (
            <Capsule key={s} from={[s * 0.14, 0.04, 0.02]} to={[s * 0.135, -0.09, 0.03]} radius={0.04} color={c} rough={0.55} />
          ))}
        </>
      )}
      {style === 'bun' && (
        <>
          <mesh position={[0, 0.13, -0.135]} castShadow>
            <sphereGeometry args={[0.072, 24, 18]} />
            <S color={c} rough={0.55} />
          </mesh>
          <mesh position={[0, 0.02, -0.06]} scale={[1, 0.95, 0.85]} castShadow>
            <sphereGeometry args={[0.165, 32, 20, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.35]} />
            <S color={c} rough={0.55} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  )
}

function Beard({ color }) {
  return (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[0.166, 32, 16, 0, Math.PI, Math.PI * 0.62, Math.PI * 0.3]} />
        <S color={color} rough={0.8} side={THREE.DoubleSide} />
      </mesh>
      <Capsule from={[-0.03, -0.052, 0.148]} to={[0.03, -0.052, 0.148]} radius={0.012} color={color} rough={0.8} castShadow={false} />
    </group>
  )
}

function Glasses() {
  return (
    <group>
      {[-0.056, 0.056].map((x) => (
        <mesh key={x} position={[x, 0.015, 0.168]}>
          <torusGeometry args={[0.034, 0.005, 10, 28]} />
          <meshStandardMaterial color="#202020" roughness={0.35} metalness={0.3} />
        </mesh>
      ))}
      <Capsule from={[-0.022, 0.02, 0.17]} to={[0.022, 0.02, 0.17]} radius={0.004} color="#202020" castShadow={false} />
      {[-1, 1].map((s) => (
        <Capsule key={s} from={[s * 0.09, 0.02, 0.16]} to={[s * 0.15, 0.025, 0.02]} radius={0.004} color="#202020" castShadow={false} />
      ))}
    </group>
  )
}

function Face({ look, eyes, mouth, brows }) {
  const lip = shade(look.skin, -0.28)
  return (
    <group>
      {/* ears */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.155, 0, 0]} scale={[0.45, 1, 0.75]}>
          <sphereGeometry args={[0.036, 16, 12]} />
          <S color={look.skin} rough={0.55} />
        </mesh>
      ))}
      {/* eyes: whites, irises and a tiny highlight */}
      <group ref={eyes}>
        {[-0.055, 0.055].map((x) => (
          <group key={x} position={[x, 0.014, 0]}>
            <mesh position={[0, 0, 0.137]}>
              <sphereGeometry args={[0.026, 20, 16]} />
              <S color="#f8f6f2" rough={0.3} />
            </mesh>
            <mesh position={[0, 0, 0.157]}>
              <sphereGeometry args={[0.0145, 16, 12]} />
              <S color="#2a1c14" rough={0.2} />
            </mesh>
            <mesh position={[0.006, 0.006, 0.17]}>
              <sphereGeometry args={[0.0045, 8, 6]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={brows}>
        {[-1, 1].map((s) => (
          <Capsule
            key={s}
            from={[s * 0.035, 0.064, 0.15]}
            to={[s * 0.078, 0.058, 0.138]}
            radius={0.0085}
            color={look.hairStyle === 'none' ? shade(look.skin, -0.3) : look.hair}
            castShadow={false}
          />
        ))}
      </group>
      {/* nose */}
      <mesh position={[0, -0.018, 0.158]} scale={[0.85, 1, 0.9]}>
        <sphereGeometry args={[0.022, 16, 12]} />
        <S color={shade(look.skin, -0.04)} rough={0.5} />
      </mesh>
      {/* cheeks */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.085, -0.035, 0.125]}>
          <sphereGeometry args={[0.026, 12, 10]} />
          <meshStandardMaterial color="#e48a7a" transparent opacity={0.22} roughness={0.6} depthWrite={false} />
        </mesh>
      ))}
      <group ref={mouth} position={[0, -0.07, 0.141]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.011, 0.04, 6, 12]} />
          <S color={lip} rough={0.45} />
        </mesh>
      </group>
    </group>
  )
}

function Arm({ side, look, armRef }) {
  const sleeve = look.shirt
  return (
    <group ref={armRef} position={[side * 0.25, 1.04, -0.05]}>
      <mesh>
        <sphereGeometry args={[0.078, 20, 16]} />
        <S color={sleeve} rough={0.85} />
      </mesh>
      <Capsule from={[0, 0, 0]} to={[side * 0.04, -0.21, 0.2]} radius={0.062} color={sleeve} rough={0.85} />
      <Capsule from={[side * 0.04, -0.21, 0.2]} to={[side * -0.04, -0.22, 0.5]} radius={0.052} color={sleeve} rough={0.85} />
      <mesh position={[side * -0.05, -0.225, 0.555]} scale={[1, 0.72, 1.25]} castShadow>
        <sphereGeometry args={[0.05, 20, 16]} />
        <S color={look.skin} rough={0.55} />
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
  const brows = useRef()
  const armR = useRef()
  const armL = useRef()
  const ring = useRef()
  const phase = useRef(Math.random() * 10)
  const chairColor = useMemo(() => shade(look.shirt, -0.32), [look.shirt])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime + phase.current
    const isMe = live.speakingId === persona.id
    const amp = isMe ? live.amp : 0
    const k = 1 - Math.exp(-dt * 4)

    torso.current.scale.y = 1 + Math.sin(t * 1.6) * 0.01

    // Look at whoever is talking; otherwise glance around the table.
    let yaw = Math.sin(t * 0.23) * 0.35
    let pitch = 0.06
    let lean = 0
    const other = live.speakingId && live.speakingId !== persona.id && seats[live.speakingId]
    if (other) {
      const world = Math.atan2(other.x - seat.x, other.z - seat.z)
      yaw = THREE.MathUtils.clamp(wrap(world - seat.rot), -1.25, 1.25)
      pitch = 0.02 + Math.max(0, Math.sin(t * 1.1)) ** 8 * 0.12 // an occasional nod
      lean = yaw * 0.12
    }
    if (isMe) {
      yaw = Math.sin(t * 0.9) * 0.45
      pitch = -0.04 + amp * 0.1 + Math.sin(t * 7) * 0.02 * amp
    }
    head.current.rotation.y += (yaw - head.current.rotation.y) * k
    head.current.rotation.x += (pitch - head.current.rotation.x) * k
    torso.current.rotation.y += (lean - torso.current.rotation.y) * k

    mouth.current.scale.y = 1 + amp * 3.2
    mouth.current.scale.x = 1 - amp * 0.2
    eyes.current.scale.y = t % 4.3 < 0.12 ? 0.1 : 1
    brows.current.position.y += ((isMe ? amp * 0.012 + 0.003 : 0) - brows.current.position.y) * k

    const gesture = isMe ? -(0.35 + Math.sin(t * 3.2) * 0.22 * (0.4 + amp)) : 0
    armR.current.rotation.x += (gesture - armR.current.rotation.x) * k
    const fidget = isMe ? -0.1 - Math.sin(t * 2.1) * 0.08 * amp : Math.sin(t * 0.7) * 0.02
    armL.current.rotation.x += (fidget - armL.current.rotation.x) * k

    const mat = ring.current.material
    mat.opacity += ((isMe ? 0.85 : 0) - mat.opacity) * k
    ring.current.scale.setScalar(1 + (isMe ? Math.sin(t * 4) * 0.04 : 0))
  })

  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.rot, 0]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.5, 0.62, 48]} />
        <meshBasicMaterial color="#f2b134" transparent opacity={0} toneMapped={false} />
      </mesh>

      <Chair accent={chairColor} />

      {/* legs */}
      <Capsule from={[-0.11, 0.54, -0.06]} to={[0.11, 0.54, -0.06]} radius={0.12} color={look.pants} rough={0.85} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Capsule from={[s * 0.11, 0.54, -0.02]} to={[s * 0.12, 0.53, 0.32]} radius={0.085} color={look.pants} rough={0.85} />
          <Capsule from={[s * 0.12, 0.52, 0.34]} to={[s * 0.12, 0.11, 0.37]} radius={0.065} color={look.pants} rough={0.85} />
          <group position={[s * 0.12, 0.05, 0.42]} scale={[1, 0.75, 1]}>
            <Capsule from={[0, 0, -0.08]} to={[0, 0, 0.08]} radius={0.055} color="#2b2522" rough={0.5} />
          </group>
        </group>
      ))}

      {/* body */}
      <group ref={torso} position={[0, 0.55, -0.05]}>
        <mesh position={[0, 0.3, 0]} scale={[1.18, 1, 0.78]} castShadow>
          <capsuleGeometry args={[0.2, 0.3, 10, 24]} />
          <S color={look.shirt} rough={0.85} />
        </mesh>
        <mesh position={[0, 0.6, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.066, 0.022, 10, 24]} />
          <S color={shade(look.shirt, -0.08)} rough={0.85} />
        </mesh>
      </group>
      <Arm side={-1} look={look} armRef={armL} />
      <Arm side={1} look={look} armRef={armR} />
      <mesh position={[0, 1.17, -0.04]}>
        <cylinderGeometry args={[0.052, 0.058, 0.13, 20]} />
        <S color={look.skin} rough={0.55} />
      </mesh>

      {/* head */}
      <group ref={head} position={[0, 1.22, -0.03]}>
        <group position={[0, 0.15, 0]} scale={[0.95, 1.05, 0.98]}>
          <mesh castShadow>
            <sphereGeometry args={[0.16, 40, 32]} />
            <S color={look.skin} rough={0.55} />
          </mesh>
          <Face look={look} eyes={eyes} mouth={mouth} brows={brows} />
          <Hair look={look} />
          {look.beard && <Beard color={look.hair} />}
          {look.glasses && <Glasses />}
        </group>
      </group>

      <Html position={[0, 1.8, 0]} center zIndexRange={[20, 0]} pointerEvents="none">
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
