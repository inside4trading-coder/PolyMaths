import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * "Order flow" particle field: thousands of points drifting along
 * pseudo-curl currents — liquidity and smart money moving through markets.
 * Amber = order flow, green = signal particles. Cursor disperses nearby flow.
 */

const PARTICLE_COUNT = 4500;
const BOUNDS = { x: 24, y: 12, z: 7 } as const;
const CURSOR_RADIUS = 3.2;
const CURSOR_FORCE = 2.4;
const FLOW_SPEED = 0.55;

// Soft round sprite so points render as glowing dots instead of squares
function createDotTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Layered trig field ≈ cheap curl noise: produces converging/diverging currents
function flowX(x: number, y: number, z: number, t: number): number {
  return Math.sin(y * 0.32 + t * 0.4) + 0.55 * Math.cos(z * 0.5 + t * 0.23) + 0.35;
}
function flowY(x: number, y: number, z: number, t: number): number {
  return 0.45 * Math.sin(x * 0.21 - t * 0.31) * Math.cos(y * 0.18 + t * 0.17);
}
function flowZ(x: number, y: number, _z: number, t: number): number {
  return 0.3 * Math.cos(x * 0.17 + t * 0.27) * Math.sin(y * 0.23 - t * 0.19);
}

function ParticleField() {
  const pointsRef = useRef<THREE.Points>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { pointer, camera } = useThree();

  const dotTexture = useMemo(createDotTexture, []);

  const { positions, colors, speeds } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);

    const amber = new THREE.Color().setHSL(38 / 360, 0.92, 0.5);
    const amberDim = new THREE.Color().setHSL(38 / 360, 0.7, 0.32);
    const signal = new THREE.Color().setHSL(142 / 360, 0.71, 0.45);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * BOUNDS.x;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * BOUNDS.y;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * BOUNDS.z;

      const roll = Math.random();
      const color = roll < 0.12 ? signal : roll < 0.55 ? amber : amberDim;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      speeds[i] = 0.5 + Math.random();
    }
    return { positions, colors, speeds };
  }, []);

  const cursorWorld = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const flowPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);

  useFrame((state, delta) => {
    const points = pointsRef.current;
    if (!points) return;

    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05); // clamp tab-switch spikes
    const pos = points.geometry.attributes.position.array as Float32Array;

    // Project cursor onto the particle plane for local dispersion
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(flowPlane, cursorWorld);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      let x = pos[ix];
      let y = pos[ix + 1];
      let z = pos[ix + 2];
      const speed = speeds[i] * FLOW_SPEED * dt;

      x += flowX(x, y, z, t) * speed;
      y += flowY(x, y, z, t) * speed;
      z += flowZ(x, y, z, t) * speed;

      const dx = x - cursorWorld.x;
      const dy = y - cursorWorld.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < CURSOR_RADIUS * CURSOR_RADIUS && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const push = ((CURSOR_RADIUS - dist) / CURSOR_RADIUS) * CURSOR_FORCE * dt;
        x += (dx / dist) * push;
        y += (dy / dist) * push;
      }

      // Wrap around so currents feel endless
      if (x > BOUNDS.x) x = -BOUNDS.x;
      else if (x < -BOUNDS.x) x = BOUNDS.x;
      if (y > BOUNDS.y) y = -BOUNDS.y;
      else if (y < -BOUNDS.y) y = BOUNDS.y;
      if (z > BOUNDS.z) z = -BOUNDS.z;
      else if (z < -BOUNDS.z) z = BOUNDS.z;

      pos[ix] = x;
      pos[ix + 1] = y;
      pos[ix + 2] = z;
    }
    points.geometry.attributes.position.needsUpdate = true;

    // Subtle parallax toward the cursor
    const group = groupRef.current;
    if (group) {
      group.rotation.y += (pointer.x * 0.08 - group.rotation.y) * 0.04;
      group.rotation.x += (-pointer.y * 0.05 - group.rotation.x) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={dotTexture}
          vertexColors
          size={0.14}
          sizeAttenuation
          transparent
          opacity={0.65}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

interface OrderFlowSceneProps {
  /** Pause rendering when the hero is off-screen */
  active: boolean;
}

export default function OrderFlowScene({ active }: OrderFlowSceneProps) {
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      dpr={[1, 2]}
      camera={{ position: [0, 0, 15], fov: 55 }}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      eventSource={typeof document !== 'undefined' ? document.body : undefined}
    >
      <ParticleField />
    </Canvas>
  );
}
