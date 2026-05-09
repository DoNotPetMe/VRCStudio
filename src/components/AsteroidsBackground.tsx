import { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { drawBlockShip } from '../utils/drawBlockShip';

type Tier = 'large' | 'medium';
interface Asteroid { x: number; y: number; vx: number; vy: number; r: number; rot: number; rotV: number; sides: number; tier: Tier; }
interface Bullet   { x: number; y: number; vx: number; vy: number; life: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; }

interface BgState {
  ship:       { x: number; y: number; angle: number; vx: number; vy: number; };
  asteroids:  Asteroid[];
  bullets:    Bullet[];
  particles:  Particle[];
  fireCooldown: number;
  spawnTimer:   number;
}

const AI_ROT       = 0.032;
const AI_THRUST    = 0.038;
const AI_MAX_SPEED = 1.6;
const DRAG         = 0.993;
const DANGER_R     = 115;
const FIRE_CD      = 28;
const BULLET_SPEED = 5.5;
const BULLET_LIFE  = 75;
const MAX_AST      = 7;

function spawnAsteroid(st: BgState, W: number, H: number, tier: Tier = 'large') {
  const edge = Math.floor(Math.random() * 4);
  const x = edge === 0 ? -30 : edge === 1 ? W + 30 : Math.random() * W;
  const y = edge === 2 ? -30 : edge === 3 ? H + 30 : Math.random() * H;
  const spd = tier === 'large' ? 0.28 + Math.random() * 0.38 : 0.44 + Math.random() * 0.54;
  const toAng = Math.atan2(H / 2 - y, W / 2 - x) + (Math.random() - 0.5) * 1.3;
  st.asteroids.push({
    x, y,
    vx: Math.cos(toAng) * spd, vy: Math.sin(toAng) * spd,
    r: tier === 'large' ? 22 + Math.random() * 14 : 11 + Math.random() * 8,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.022,
    sides: tier === 'large' ? 7 + Math.floor(Math.random() * 4) : 5 + Math.floor(Math.random() * 3),
    tier,
  });
}

function initState(W: number, H: number): BgState {
  const st: BgState = {
    ship: { x: W / 2, y: H / 2, angle: -Math.PI / 2, vx: 0, vy: 0 },
    asteroids: [], bullets: [], particles: [],
    fireCooldown: 0, spawnTimer: 45,
  };
  for (let i = 0; i < 4; i++) spawnAsteroid(st, W, H);
  return st;
}

function update(st: BgState, W: number, H: number) {
  // Spawn asteroids at a calm pace
  st.spawnTimer++;
  if (st.spawnTimer >= 100 && st.asteroids.length < MAX_AST) {
    spawnAsteroid(st, W, H, 'large');
    st.spawnTimer = 0;
  }

  // Move + rotate asteroids
  for (const a of st.asteroids) {
    a.x = (a.x + a.vx + W) % W;
    a.y = (a.y + a.vy + H) % H;
    a.rot += a.rotV;
  }

  // AI: find nearest asteroid
  const ship = st.ship;
  let nearest: Asteroid | null = null;
  let nearestDist = Infinity;
  for (const a of st.asteroids) {
    const dist = Math.hypot(a.x - ship.x, a.y - ship.y) - a.r;
    if (dist < nearestDist) { nearest = a; nearestDist = dist; }
  }

  let desiredAngle = ship.angle;
  let shouldThrust = false;

  if (nearest) {
    const angleToAst = Math.atan2(nearest.y - ship.y, nearest.x - ship.x);

    if (nearestDist < DANGER_R) {
      // Dodge: go perpendicular, preferring the direction toward screen center
      const perp1 = angleToAst + Math.PI / 2;
      const perp2 = angleToAst - Math.PI / 2;
      const toCtr = Math.atan2(H / 2 - ship.y, W / 2 - ship.x);
      const d1 = Math.abs(Math.atan2(Math.sin(perp1 - toCtr), Math.cos(perp1 - toCtr)));
      const d2 = Math.abs(Math.atan2(Math.sin(perp2 - toCtr), Math.cos(perp2 - toCtr)));
      desiredAngle = d1 < d2 ? perp1 : perp2;
      shouldThrust = true;
    } else {
      // Aim at nearest
      desiredAngle = angleToAst;
      const aimErr = Math.abs(Math.atan2(Math.sin(desiredAngle - ship.angle), Math.cos(desiredAngle - ship.angle)));
      if (aimErr < 0.22 && st.fireCooldown === 0) {
        st.bullets.push({
          x: ship.x, y: ship.y,
          vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx,
          vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy,
          life: BULLET_LIFE,
        });
        st.fireCooldown = FIRE_CD;
      }
    }
  }

  // Steer toward desired angle
  const diff = Math.atan2(Math.sin(desiredAngle - ship.angle), Math.cos(desiredAngle - ship.angle));
  if (Math.abs(diff) > 0.015) ship.angle += Math.sign(diff) * Math.min(AI_ROT, Math.abs(diff));

  if (shouldThrust) {
    ship.vx += Math.cos(ship.angle) * AI_THRUST;
    ship.vy += Math.sin(ship.angle) * AI_THRUST;
  }
  const spd = Math.hypot(ship.vx, ship.vy);
  if (spd > AI_MAX_SPEED) { ship.vx *= AI_MAX_SPEED / spd; ship.vy *= AI_MAX_SPEED / spd; }
  ship.vx *= DRAG; ship.vy *= DRAG;
  ship.x = (ship.x + ship.vx + W) % W;
  ship.y = (ship.y + ship.vy + H) % H;

  if (st.fireCooldown > 0) st.fireCooldown--;

  // Bullets + collisions
  st.bullets = st.bullets.filter(b => {
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) return false;
    let hit = false;
    const kept: Asteroid[] = [];
    for (const a of st.asteroids) {
      const dx = b.x - a.x, dy = b.y - a.y;
      if (!hit && dx * dx + dy * dy <= a.r * a.r) {
        hit = true;
        const pCount = 5 + Math.floor(a.r / 5);
        for (let pi = 0; pi < pCount; pi++) {
          const ang = Math.random() * Math.PI * 2;
          const ps = 0.4 + Math.random() * 1.4;
          const life = 22 + Math.floor(Math.random() * 28);
          st.particles.push({ x: a.x, y: a.y, vx: Math.cos(ang)*ps, vy: Math.sin(ang)*ps, life, maxLife: life, size: 1 + Math.random() * 1.8 });
        }
        if (a.tier === 'large') {
          for (let i = 0; i < 2; i++) {
            const ang = Math.random() * Math.PI * 2;
            const ps = 0.35 + Math.random() * 0.45;
            kept.push({ x: a.x, y: a.y, vx: a.vx + Math.cos(ang)*ps, vy: a.vy + Math.sin(ang)*ps, r: a.r * 0.52, rot: Math.random()*Math.PI*2, rotV: (Math.random()-0.5)*0.032, sides: 5+Math.floor(Math.random()*3), tier: 'medium' });
          }
        }
      } else {
        kept.push(a);
      }
    }
    st.asteroids = kept;
    return !hit;
  });

  st.particles = st.particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy *= 0.97; p.life--;
    return p.life > 0;
  });
}

export default function AsteroidsBackground() {
  const accentColor = useThemeStore(s => s.theme.accentColor);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);
  const stateRef  = useRef<BgState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const accentMap: Record<string, string> = {
      blue:   'rgba(96,165,250,0.9)',  purple: 'rgba(192,132,252,0.9)',
      green:  'rgba(74,222,128,0.9)',  rose:   'rgba(251,113,133,0.9)',
      amber:  'rgba(251,191,36,0.9)',  cyan:   'rgba(34,211,238,0.9)',
    };
    const color = accentMap[accentColor] ?? accentMap.blue;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!stateRef.current) stateRef.current = initState(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      if (!stateRef.current) return;
      const st = stateRef.current;

      update(st, W, H);
      ctx.clearRect(0, 0, W, H);

      // Stars (deterministic)
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      for (let s = 0; s < Math.floor(W * H / 48000); s++) {
        ctx.fillRect((s * 7919 + 3) % W, (s * 6271 + 11) % H, 1, 1);
      }

      // Particles
      for (const p of st.particles) {
        const a = p.life / p.maxLife;
        ctx.fillStyle = `rgba(255,${100 + Math.floor(a * 130)},40,${(a * 0.75).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * a), 0, Math.PI * 2);
        ctx.fill();
      }

      // Asteroids
      for (const ast of st.asteroids) {
        ctx.beginPath();
        for (let s = 0; s < ast.sides; s++) {
          const ang = ast.rot + (s / ast.sides) * Math.PI * 2;
          const r = ast.r * (0.76 + 0.24 * Math.sin(s * 2.4));
          s === 0 ? ctx.moveTo(ast.x + Math.cos(ang)*r, ast.y + Math.sin(ang)*r)
                  : ctx.lineTo(ast.x + Math.cos(ang)*r, ast.y + Math.sin(ang)*r);
        }
        ctx.closePath();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.72; ctx.stroke(); ctx.globalAlpha = 1;
      }

      // Bullets
      ctx.fillStyle = color;
      for (const b of st.bullets) {
        ctx.beginPath(); ctx.arc(b.x, b.y, 2, 0, Math.PI * 2); ctx.fill();
      }

      // Ship
      ctx.save();
      ctx.translate(st.ship.x, st.ship.y);
      ctx.rotate(st.ship.angle);
      drawBlockShip(ctx, color);
      ctx.restore();
    };

    draw();
    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [accentColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0.45 }}
      aria-hidden="true"
    />
  );
}
