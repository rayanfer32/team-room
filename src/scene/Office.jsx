import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { M, Limb, rng } from './parts'

const GREENS = ['#3f7a4a', '#4e8c52', '#5f9e57', '#346b45', '#6fae5e', '#2f5e3d']
const POT = ['#c77b4f', '#e7dccb', '#3f4f5a', '#a8573a', '#d9b35c']

/* ---------- plants ---------- */

function Pot({ r = 0.3, h = 0.45, color = POT[0], square = false }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        {square ? <boxGeometry args={[r * 1.7, h, r * 1.7]} /> : <cylinderGeometry args={[r, r * 0.75, h, 8]} />}
        <M color={color} />
      </mesh>
      <mesh position={[0, h - 0.01, 0]}>
        {square ? <boxGeometry args={[r * 1.55, 0.02, r * 1.55]} /> : <cylinderGeometry args={[r * 0.92, r * 0.92, 0.02, 8]} />}
        <M color="#3b2a1f" />
      </mesh>
    </group>
  )
}

/** Monstera-style: broad tilted leaves on thin stems. */
function LeafyPlant({ position, scale = 1, seed = 3, leaves = 10, pot = POT[0] }) {
  const items = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: leaves }, (_, i) => ({
      a: (i / leaves) * Math.PI * 2 + r() * 0.6,
      h: 0.35 + r() * 0.75,
      out: 0.18 + r() * 0.3,
      tilt: 0.35 + r() * 0.7,
      s: 0.8 + r() * 0.55,
      c: GREENS[Math.floor(r() * GREENS.length)],
    }))
  }, [seed, leaves])
  return (
    <group position={position} scale={scale}>
      <Pot r={0.3} h={0.48} color={pot} />
      {items.map((l, i) => (
        <group key={i} rotation={[0, l.a, 0]}>
          <Limb from={[0, 0.45, 0]} to={[0, 0.45 + l.h, l.out]} radius={0.012} color="#4a7a3f" castShadow={false} />
          <mesh position={[0, 0.45 + l.h + 0.02, l.out + 0.17 * l.s]} rotation={[l.tilt, 0, 0]} scale={[0.24 * l.s, 0.025, 0.34 * l.s]} castShadow>
            <icosahedronGeometry args={[1, 0]} />
            <M color={l.c} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Snake plant: tall pointed blades. */
function SnakePlant({ position, scale = 1, seed = 7 }) {
  const blades = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: 9 }, () => ({
      x: (r() - 0.5) * 0.3,
      z: (r() - 0.5) * 0.3,
      h: 0.6 + r() * 0.7,
      rx: (r() - 0.5) * 0.3,
      rz: (r() - 0.5) * 0.3,
      c: r() > 0.5 ? '#2f5e3d' : '#4f7f45',
    }))
  }, [seed])
  return (
    <group position={position} scale={scale}>
      <Pot r={0.26} h={0.42} color="#e7dccb" square />
      {blades.map((b, i) => (
        <mesh key={i} position={[b.x, 0.42 + b.h / 2, b.z]} rotation={[b.rx, i, b.rz]} scale={[1, 1, 0.35]} castShadow>
          <coneGeometry args={[0.07, b.h, 4]} />
          <M color={b.c} />
        </mesh>
      ))}
    </group>
  )
}

/** Indoor tree: trunk + stacked low-poly canopy. */
function PlantTree({ position, scale = 1, seed = 11 }) {
  const blobs = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: 7 }, (_, i) => ({
      p: [(r() - 0.5) * 0.7, 1.4 + i * 0.22 + r() * 0.15, (r() - 0.5) * 0.7],
      s: 0.32 + r() * 0.22,
      c: GREENS[Math.floor(r() * GREENS.length)],
    }))
  }, [seed])
  return (
    <group position={position} scale={scale}>
      <Pot r={0.34} h={0.55} color="#3f4f5a" />
      <Limb from={[0, 0.5, 0]} to={[0.05, 1.6, 0.02]} radius={0.045} color="#6b4a32" />
      <Limb from={[0.04, 1.2, 0]} to={[-0.25, 1.6, 0.1]} radius={0.025} color="#6b4a32" />
      {blobs.map((b, i) => (
        <mesh key={i} position={b.p} castShadow>
          <icosahedronGeometry args={[b.s, 0]} />
          <M color={b.c} />
        </mesh>
      ))}
    </group>
  )
}

/** Trailing pothos for shelves. */
function TrailingPlant({ position, seed = 5, length = 6 }) {
  const vines = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: 5 }, () => ({ a: r() * Math.PI * 2, n: 3 + Math.floor(r() * length), c: GREENS[Math.floor(r() * 4)] }))
  }, [seed, length])
  return (
    <group position={position}>
      <Pot r={0.14} h={0.2} color="#d9b35c" />
      {vines.map((v, i) => (
        <group key={i} rotation={[0, v.a, 0]}>
          {Array.from({ length: v.n }, (_, j) => (
            <mesh key={j} position={[0, 0.2 - j * 0.11, 0.15 + Math.min(j, 2) * 0.04]} rotation={[0.4, j, 0]} castShadow>
              <icosahedronGeometry args={[0.055, 0]} />
              <M color={v.c} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function Succulent({ position, scale = 1, color = '#7fae7a' }) {
  return (
    <group position={position} scale={scale}>
      <Pot r={0.09} h={0.12} color="#e7dccb" />
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[Math.sin(i * 0.8) * 0.04, 0.15, Math.cos(i * 0.8) * 0.04]} rotation={[Math.cos(i * 0.8) * 0.6, 0, -Math.sin(i * 0.8) * 0.6]}>
          <coneGeometry args={[0.03, 0.1, 4]} />
          <M color={i % 2 ? color : '#5f8f63'} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------- textures ---------- */

function useSkyTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 300
    const g = c.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 0, 300)
    grad.addColorStop(0, '#8fc3e6')
    grad.addColorStop(0.7, '#dcefe9')
    grad.addColorStop(1, '#f6e8c8')
    g.fillStyle = grad
    g.fillRect(0, 0, 512, 300)
    const hill = (color, base, amp, seed) => {
      const r = rng(seed)
      g.fillStyle = color
      g.beginPath()
      g.moveTo(0, 300)
      for (let x = 0; x <= 512; x += 64) g.lineTo(x, base - r() * amp)
      g.lineTo(512, 300)
      g.fill()
    }
    hill('#9cc39a', 230, 60, 2)
    hill('#6f9f6d', 260, 40, 9)
    hill('#4f7f55', 285, 25, 4)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
}

function wrapText(g, text, maxWidth) {
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (g.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

function useBoardTexture(topic) {
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 600
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return { canvas, texture }
  }, [])
  useEffect(() => {
    const draw = () => {
      const g = canvas.getContext('2d')
      g.fillStyle = '#f7f8f4'
      g.fillRect(0, 0, 1024, 600)
      g.fillStyle = '#2d5b8a'
      g.font = "600 44px 'Bricolage Grotesque', sans-serif"
      g.fillText('Today', 60, 90)
      g.fillStyle = '#1f2a24'
      g.font = "700 64px 'Bricolage Grotesque', sans-serif"
      const lines = wrapText(g, topic || 'Pick a topic to start the meeting', 640).slice(0, 5)
      lines.forEach((l, i) => g.fillText(l, 60, 180 + i * 76))
      g.strokeStyle = '#c44d3a'
      g.lineWidth = 6
      g.beginPath()
      g.moveTo(60, 200 + lines.length * 76 - 50)
      g.lineTo(380, 200 + lines.length * 76 - 56)
      g.stroke()
      const notes = ['#f6d365', '#9ee0b4', '#f7a8b8', '#a8c8f7', '#f6d365', '#9ee0b4']
      notes.forEach((c, i) => {
        const x = 760 + (i % 2) * 120
        const y = 60 + Math.floor(i / 2) * 150
        g.save()
        g.translate(x + 50, y + 50)
        g.rotate(((i * 37) % 9 - 4) * 0.02)
        g.fillStyle = c
        g.fillRect(-50, -50, 100, 100)
        g.fillStyle = 'rgba(0,0,0,0.35)'
        for (let k = 0; k < 3; k++) g.fillRect(-36, -26 + k * 20, 56 + ((i + k) % 3) * 8, 5)
        g.restore()
      })
      texture.needsUpdate = true
    }
    draw()
    document.fonts?.ready.then(draw)
  }, [topic, canvas, texture])
  return texture
}

/* ---------- furniture ---------- */

function Floor() {
  const tones = ['#b78a5c', '#ad8153', '#bf9365', '#b3875a']
  return (
    <group>
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[-7 + 0.7 + i * 1.4, -0.05, 0]} receiveShadow>
          <boxGeometry args={[1.38, 0.1, 14]} />
          <M color={tones[i % tones.length]} />
        </mesh>
      ))}
      <mesh position={[0, 0.006, -0.2]} receiveShadow>
        <cylinderGeometry args={[3.2, 3.2, 0.02, 12]} />
        <M color="#d4a86a" />
      </mesh>
      <mesh position={[0, 0.012, -0.2]} receiveShadow>
        <cylinderGeometry args={[2.9, 2.9, 0.02, 12]} />
        <M color="#e3c38b" />
      </mesh>
    </group>
  )
}

function Walls() {
  const sky = useSkyTexture()
  const wx = 1.2
  const wy = 2.5
  const ww = 3.6
  const wh = 2.1
  return (
    <group>
      {/* back wall with a window cut */}
      <mesh position={[0, 0.7, -7]} receiveShadow>
        <boxGeometry args={[14, 1.4, 0.2]} />
        <M color="#e9e1d1" />
      </mesh>
      <mesh position={[0, 4.05, -7]} receiveShadow>
        <boxGeometry args={[14, 1.1, 0.2]} />
        <M color="#e9e1d1" />
      </mesh>
      <mesh position={[(-7 + (wx - ww / 2)) / 2, wy, -7]} receiveShadow>
        <boxGeometry args={[wx - ww / 2 + 7, wh, 0.2]} />
        <M color="#e9e1d1" />
      </mesh>
      <mesh position={[(7 + (wx + ww / 2)) / 2, wy, -7]} receiveShadow>
        <boxGeometry args={[7 - (wx + ww / 2), wh, 0.2]} />
        <M color="#e9e1d1" />
      </mesh>
      <mesh position={[wx, wy, -7.05]}>
        <planeGeometry args={[ww, wh]} />
        <meshBasicMaterial map={sky} toneMapped={false} />
      </mesh>
      {/* window frame */}
      {[
        [wx, wy + wh / 2, ww + 0.16, 0.1],
        [wx, wy - wh / 2, ww + 0.16, 0.1],
        [wx, wy, ww, 0.06],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, -6.9]} castShadow>
          <boxGeometry args={[w, h, 0.12]} />
          <M color="#7a5a3f" />
        </mesh>
      ))}
      {[wx - ww / 2, wx, wx + ww / 2].map((x, i) => (
        <mesh key={i} position={[x, wy, -6.9]} castShadow>
          <boxGeometry args={[i === 1 ? 0.06 : 0.1, wh, 0.12]} />
          <M color="#7a5a3f" />
        </mesh>
      ))}
      <mesh position={[wx, wy - wh / 2 - 0.06, -6.76]} castShadow receiveShadow>
        <boxGeometry args={[ww + 0.4, 0.07, 0.36]} />
        <M color="#8a6849" />
      </mesh>
      <Succulent position={[wx - 1.2, wy - wh / 2 - 0.02, -6.76]} scale={1.4} />
      <Succulent position={[wx - 0.7, wy - wh / 2 - 0.02, -6.76]} scale={1.1} color="#9cc48a" />
      <TrailingPlant position={[wx + 1.2, wy - wh / 2 - 0.02, -6.78]} seed={21} length={4} />

      {/* left accent wall */}
      <mesh position={[-7, 2.3, 0]} receiveShadow>
        <boxGeometry args={[0.2, 4.6, 14]} />
        <M color="#47664f" />
      </mesh>
      {/* baseboards */}
      <mesh position={[0, 0.06, -6.88]}>
        <boxGeometry args={[14, 0.12, 0.04]} />
        <M color="#cfc4b0" />
      </mesh>
      <mesh position={[-6.88, 0.06, 0]}>
        <boxGeometry args={[0.04, 0.12, 14]} />
        <M color="#355040" />
      </mesh>

      {/* wall art */}
      {[
        [-4.2, 2.7, 1.1, 1.3, '#e0a458', '#3f6e5a'],
        [-2.7, 2.45, 0.8, 0.8, '#7fa7c9', '#2e4a63'],
      ].map(([x, y, w, h, a, b], i) => (
        <group key={i} position={[x, y, -6.88]}>
          <mesh>
            <boxGeometry args={[w + 0.1, h + 0.1, 0.05]} />
            <M color="#3a2c22" />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <planeGeometry args={[w, h]} />
            <M color="#f3eee3" />
          </mesh>
          <mesh position={[-w * 0.1, -h * 0.12, 0.035]}>
            <circleGeometry args={[w * 0.32, 3]} />
            <M color={a} />
          </mesh>
          <mesh position={[w * 0.15, -h * 0.2, 0.04]} rotation={[0, 0, 0.5]}>
            <circleGeometry args={[w * 0.26, 3]} />
            <M color={b} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Bookshelf({ position }) {
  const books = useMemo(() => {
    const r = rng(42)
    const colors = ['#c4553a', '#e0a458', '#3f6e5a', '#2e4a63', '#d8cbb0', '#8e5a8c', '#5a7d9a']
    const rows = []
    for (let s = 0; s < 4; s++) {
      let z = -0.8
      while (z < 0.75) {
        const w = 0.06 + r() * 0.06
        const h = 0.28 + r() * 0.16
        if (r() > 0.85) {
          z += 0.18
          continue
        }
        rows.push({ y: 0.12 + s * 0.52 + h / 2, z: z + w / 2, w, h, c: colors[Math.floor(r() * colors.length)], tilt: r() > 0.92 ? 0.25 : 0 })
        z += w + 0.01
      }
    }
    return rows
  }, [])
  return (
    <group position={position}>
      {[0, 0.52, 1.04, 1.56, 2.08].map((y) => (
        <mesh key={y} position={[0, y + 0.06, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.42, 0.04, 1.8]} />
          <M color="#8a6849" />
        </mesh>
      ))}
      {[-0.9, 0.9].map((z) => (
        <mesh key={z} position={[0, 1.07, z]} castShadow>
          <boxGeometry args={[0.42, 2.14, 0.05]} />
          <M color="#7a5a3f" />
        </mesh>
      ))}
      {books.map((b, i) => (
        <mesh key={i} position={[0.02, b.y, b.z]} rotation={[b.tilt, 0, 0]} castShadow>
          <boxGeometry args={[0.3, b.h, b.w]} />
          <M color={b.c} />
        </mesh>
      ))}
      <TrailingPlant position={[0, 2.1, 0.5]} seed={8} length={7} />
      <Succulent position={[0, 2.1, -0.4]} scale={1.6} />
    </group>
  )
}

function Whiteboard({ topic }) {
  const tex = useBoardTexture(topic)
  return (
    <group position={[-6.86, 2.1, 1.7]} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow>
        <boxGeometry args={[2.9, 1.75, 0.05]} />
        <M color="#b9bdb8" />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[2.78, 1.63]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.92, 0.08]}>
        <boxGeometry args={[2.4, 0.04, 0.12]} />
        <M color="#9aa09a" />
      </mesh>
      {['#c44d3a', '#2d5b8a', '#2f7f4f'].map((c, i) => (
        <mesh key={c} position={[-0.6 + i * 0.18, -0.89, 0.09]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.018, 0.018, 0.14, 6]} />
          <M color={c} />
        </mesh>
      ))}
    </group>
  )
}

function Sofa({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.42, 0.95]} />
        <M color="#2f7f86" />
      </mesh>
      <mesh position={[0, 0.7, -0.38]} castShadow>
        <boxGeometry args={[2.4, 0.6, 0.22]} />
        <M color="#2a7178" />
      </mesh>
      {[-1.12, 1.12].map((x) => (
        <mesh key={x} position={[x, 0.5, 0]} castShadow>
          <boxGeometry args={[0.2, 0.5, 0.95]} />
          <M color="#2a7178" />
        </mesh>
      ))}
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} position={[x, 0.52, 0.06]} castShadow>
          <boxGeometry args={[0.95, 0.12, 0.75]} />
          <M color="#3a9097" />
        </mesh>
      ))}
      <mesh position={[0.7, 0.75, -0.16]} rotation={[-0.3, 0.2, 0.15]} castShadow>
        <boxGeometry args={[0.42, 0.4, 0.12]} />
        <M color="#e0a458" />
      </mesh>
    </group>
  )
}

function FloorLamp({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.22, 0.25, 0.06, 8]} />
        <M color="#2a2e2c" />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.6, 6]} />
        <M color="#2a2e2c" />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.2, 0.32, 0.36, 8, 1, true]} />
        <meshStandardMaterial color="#f4dfb2" emissive="#ffcf87" emissiveIntensity={0.9} side={THREE.DoubleSide} flatShading />
      </mesh>
      <pointLight position={[0, 1.6, 0]} intensity={6} distance={6} decay={2} color="#ffc983" />
    </group>
  )
}

function PendantLamp() {
  return (
    <group position={[0, 0, -0.2]}>
      <mesh position={[0, 3.9, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 1.6, 4]} />
        <M color="#222" />
      </mesh>
      <mesh position={[0, 3.0, 0]}>
        <coneGeometry args={[0.5, 0.38, 8, 1, true]} />
        <meshStandardMaterial color="#2f5e3d" side={THREE.DoubleSide} flatShading roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.86, 0]}>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshBasicMaterial color="#fff1cf" toneMapped={false} />
      </mesh>
      <pointLight position={[0, 2.7, 0]} intensity={10} distance={7} decay={2} color="#ffd59a" />
    </group>
  )
}

function SideTable({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.05, 8]} />
        <M color="#8a6849" />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.52, 6]} />
        <M color="#5d4431" />
      </mesh>
      <Succulent position={[0.08, 0.58, 0]} scale={1.3} />
      <mesh position={[-0.12, 0.62, 0.06]}>
        <cylinderGeometry args={[0.05, 0.045, 0.1, 8]} />
        <M color="#e9e1d1" />
      </mesh>
    </group>
  )
}

/* ---------- meeting table ---------- */

function Laptop({ color = '#c9ccc8', glow = '#bfe3d6' }) {
  return (
    <group>
      <mesh position={[0, 0.012, 0]} castShadow>
        <boxGeometry args={[0.38, 0.02, 0.26]} />
        <M color={color} />
      </mesh>
      <group position={[0, 0.02, 0.13]} rotation={[0.32, 0, 0]}>
        <mesh position={[0, 0.13, 0]} castShadow>
          <boxGeometry args={[0.38, 0.26, 0.015]} />
          <M color={color} />
        </mesh>
        <mesh position={[0, 0.13, -0.009]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.34, 0.22]} />
          <meshBasicMaterial color={glow} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Mug({ color }) {
  return (
    <group>
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.045, 0.12, 8]} />
        <M color={color} />
      </mesh>
      <mesh position={[0.055, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.03, 0.01, 4, 8]} />
        <M color={color} />
      </mesh>
      <mesh position={[0, 0.115, 0]}>
        <cylinderGeometry args={[0.044, 0.044, 0.01, 8]} />
        <M color="#4a2c1c" />
      </mesh>
    </group>
  )
}

export function MeetingTable({ seatsList }) {
  const top = 0.78
  return (
    <group>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.6, 1.6, 0.08, 10]} />
        <M color="#c99a6a" />
      </mesh>
      <mesh position={[0, 0.69, 0]}>
        <cylinderGeometry args={[1.55, 1.5, 0.04, 10]} />
        <M color="#a87e55" />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 0.66, 6]} />
        <M color="#5d4431" />
      </mesh>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[0.7, 0.75, 0.06, 6]} />
        <M color="#5d4431" />
      </mesh>
      {seatsList.map((s, i) => {
        const a = s.angle
        const lr = 1.15
        const mr = 1.2
        return (
          <group key={s.id}>
            <group position={[Math.sin(a) * lr, top, Math.cos(a) * lr]} rotation={[0, s.rot, 0]}>
              {i % 2 === 0 ? (
                <Laptop color={i === 0 ? '#d8d2c6' : '#9aa0a6'} glow={['#bfe3d6', '#f2d8a7', '#c8d7f2'][i % 3]} />
              ) : (
                <group position={[0, 0.006, 0]} rotation={[0, 0.3, 0]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.26, 0.012, 0.34]} />
                    <M color={['#f3eee3', '#e8f0e2'][i % 2]} />
                  </mesh>
                  <mesh position={[0.06, 0.012, 0]} rotation={[0, 0.4, Math.PI / 2]}>
                    <cylinderGeometry args={[0.008, 0.008, 0.18, 5]} />
                    <M color="#2d5b8a" />
                  </mesh>
                </group>
              )}
            </group>
            <group position={[Math.sin(a + 0.32) * mr, top, Math.cos(a + 0.32) * mr]}>
              <Mug color={['#e9e1d1', '#c4553a', '#2f5e3d', '#e0a458', '#2e4a63'][i % 5]} />
            </group>
          </group>
        )
      })}
      <Succulent position={[0, top, 0]} scale={2} />
      <mesh position={[0.35, top + 0.01, 0.2]} rotation={[0, 0.5, 0]}>
        <boxGeometry args={[0.18, 0.02, 0.18]} />
        <M color="#f6d365" />
      </mesh>
    </group>
  )
}

export default function Office({ topic }) {
  return (
    <group>
      <Floor />
      <Walls />
      <Bookshelf position={[-6.65, 0, -3.6]} />
      <Whiteboard topic={topic} />
      <Sofa position={[4.4, 0, -6.1]} />
      <SideTable position={[2.7, 0, -6.2]} />
      <FloorLamp position={[6.2, 0, -6.3]} />
      <PendantLamp />
      <PlantTree position={[-6.1, 0, -6.1]} scale={1.15} />
      <LeafyPlant position={[6.2, 0, -4.4]} scale={1.3} seed={4} leaves={12} />
      <SnakePlant position={[-6.3, 0, -1.6]} scale={1.2} />
      <LeafyPlant position={[-6.1, 0, 4.9]} scale={1.1} seed={17} leaves={9} pot="#e7dccb" />
      <SnakePlant position={[6.3, 0, 1.4]} scale={1} seed={13} />
      <LeafyPlant position={[0.2, 0, -6.4]} scale={0.8} seed={29} leaves={8} pot="#d9b35c" />
    </group>
  )
}
