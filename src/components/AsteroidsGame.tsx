import { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useAsteroidsGameStore } from '../stores/asteroidsGameStore';
import { useSystemAudio } from '../hooks/useAudioVisualizer';
import { useThemeStore } from '../stores/themeStore';
import { drawBlockShip } from '../utils/drawBlockShip';

const ROT_SPEED = 0.045;
const THRUST = 0.09;
const MAX_SPEED = 4.5;
const DRAG = 0.988;
const BULLET_SPEED = 10;
const BULLET_LIFE = 65;
const SHIP_R = 12;
const RESPAWN_FRAMES = 120;
const INVINCIBLE_FRAMES = 100;

type Tier = 'large' | 'medium' | 'small';
interface Asteroid { x: number; y: number; vx: number; vy: number; r: number; rot: number; rotV: number; sides: number; tier: Tier; }
interface Bullet { x: number; y: number; vx: number; vy: number; life: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; }

interface GameState {
  ship: { x: number; y: number; angle: number; vx: number; vy: number; dead: boolean; deadTimer: number; invincible: number; thruster: boolean; };
  asteroids: Asteroid[];
  bullets: Bullet[];
  particles: Particle[];
  fastEnergy: number; slowEnergy: number;
  beatCooldown: number;
  score: number; lives: number; gameOver: boolean;
  frames: number; spawnTimer: number;
}

function spawnExplosion(particles: Particle[], x: number, y: number, count: number, r: number) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = (0.6 + Math.random() * 2.8) * Math.max(0.5, r / 22);
    const life = 35 + Math.floor(Math.random() * 45);
    particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life, maxLife: life, size: 1 + Math.random() * 2.5 });
  }
}

function spawnAsteroid(W: number, H: number, difficulty: number): Asteroid {
  const edge = Math.floor(Math.random() * 4);
  const ax = edge === 0 ? -35 : edge === 1 ? W + 35 : Math.random() * W;
  const ay = edge === 2 ? -35 : edge === 3 ? H + 35 : Math.random() * H;
  const toAngle = Math.atan2(H / 2 - ay, W / 2 - ax) + (Math.random() - 0.5) * 1.2;
  const spd = 0.45 + Math.random() * 0.5 + difficulty * 0.0004;
  return {
    x: ax, y: ay,
    vx: Math.cos(toAngle) * spd, vy: Math.sin(toAngle) * spd,
    r: 24 + Math.random() * 14,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.022,
    sides: 7 + Math.floor(Math.random() * 4),
    tier: 'large',
  };
}

function initGame(W: number, H: number): GameState {
  return {
    ship: { x: W / 2, y: H / 2, angle: -Math.PI / 2, vx: 0, vy: 0, dead: false, deadTimer: 0, invincible: INVINCIBLE_FRAMES, thruster: false },
    asteroids: [spawnAsteroid(W, H, 0), spawnAsteroid(W, H, 0), spawnAsteroid(W, H, 0)],
    bullets: [], particles: [],
    fastEnergy: 0, slowEnergy: 0, beatCooldown: 0,
    score: 0, lives: 3, gameOver: false, frames: 0, spawnTimer: 0,
  };
}

export default function AsteroidsGame() {
  const close = useAsteroidsGameStore(s => s.close);
  const cfg = useThemeStore(s => s.theme.visualizer);
  const { getFrequencyData } = useSystemAudio(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const gameRef = useRef<GameState | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  const restart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameRef.current = initGame(canvas.width, canvas.height);
    setIsGameOver(false);
    setFinalScore(0);
  }, []);

  // Keyboard handling
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') close();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [close]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!gameRef.current) {
        gameRef.current = initGame(canvas.width, canvas.height);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const accentMap: Record<string, string> = {
      blue: 'rgba(100,180,255,0.9)', purple: 'rgba(192,132,252,0.9)',
      green: 'rgba(74,222,128,0.9)', rose: 'rgba(251,113,133,0.9)',
      amber: 'rgba(251,191,36,0.9)', cyan: 'rgba(34,211,238,0.9)',
    };
    const accentColor = useThemeStore.getState().theme.accentColor;
    const shipColor = accentMap[accentColor] ?? 'rgba(100,180,255,0.9)';

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      const gs = gameRef.current!;

      if (gs.gameOver) {
        ctx.fillStyle = 'rgba(5,8,18,0.6)';
        ctx.fillRect(0, 0, W, H);
        return;
      }

      const keys = keysRef.current;
      const left    = keys.has('ArrowLeft')  || keys.has('KeyA');
      const right   = keys.has('ArrowRight') || keys.has('KeyD');
      const thrust  = keys.has('ArrowUp')    || keys.has('KeyW');
      const firing  = keys.has('Space')      || keys.has('KeyF');

      // Audio
      const audioData = getFrequencyData();
      const bassN = audioData ? Math.max(1, Math.floor(audioData.length * 0.12)) : 8;
      const rawBass = audioData ? Array.from(audioData.slice(0, bassN)).reduce((s, v) => s + v / 255, 0) / bassN : 0;
      gs.fastEnergy = gs.fastEnergy * 0.5 + rawBass * 0.5;
      gs.slowEnergy = gs.slowEnergy * 0.92 + rawBass * 0.08;
      const isBeat = audioData !== null && gs.fastEnergy > gs.slowEnergy * 1.5 + 0.08 && gs.beatCooldown === 0;

      // Ship update
      if (!gs.ship.dead) {
        if (left)  gs.ship.angle -= ROT_SPEED;
        if (right) gs.ship.angle += ROT_SPEED;
        if (thrust) {
          gs.ship.vx += Math.cos(gs.ship.angle) * THRUST;
          gs.ship.vy += Math.sin(gs.ship.angle) * THRUST;
        }
        gs.ship.thruster = thrust;
        gs.ship.vx *= DRAG; gs.ship.vy *= DRAG;
        const spd = Math.hypot(gs.ship.vx, gs.ship.vy);
        if (spd > MAX_SPEED) { gs.ship.vx *= MAX_SPEED / spd; gs.ship.vy *= MAX_SPEED / spd; }
        gs.ship.x = (gs.ship.x + gs.ship.vx + W) % W;
        gs.ship.y = (gs.ship.y + gs.ship.vy + H) % H;
        if (gs.ship.invincible > 0) gs.ship.invincible--;
      } else {
        gs.ship.deadTimer--;
        if (gs.ship.deadTimer <= 0) {
          gs.ship.x = W / 2; gs.ship.y = H / 2;
          gs.ship.vx = 0; gs.ship.vy = 0; gs.ship.angle = -Math.PI / 2;
          gs.ship.dead = false; gs.ship.invincible = INVINCIBLE_FRAMES;
        }
      }

      // Fire (keyboard or beat)
      if (gs.beatCooldown > 0) gs.beatCooldown--;
      if (!gs.ship.dead && gs.beatCooldown === 0 && (firing || isBeat)) {
        gs.bullets.push({
          x: gs.ship.x, y: gs.ship.y,
          vx: Math.cos(gs.ship.angle) * BULLET_SPEED + gs.ship.vx,
          vy: Math.sin(gs.ship.angle) * BULLET_SPEED + gs.ship.vy,
          life: BULLET_LIFE,
        });
        gs.beatCooldown = firing ? 10 : 7;
      }

      // Move asteroids
      for (const a of gs.asteroids) {
        a.x = (a.x + a.vx + W) % W; a.y = (a.y + a.vy + H) % H; a.rot += a.rotV;
      }

      // Bullet-asteroid collisions with splitting
      gs.bullets = gs.bullets.filter(b => {
        b.x += b.vx; b.y += b.vy; b.life--;
        if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) return false;
        let hit = false;
        const kept: Asteroid[] = [];
        for (const a of gs.asteroids) {
          const dx = b.x - a.x, dy = b.y - a.y;
          if (!hit && dx * dx + dy * dy <= a.r * a.r) {
            hit = true;
            gs.score += a.tier === 'large' ? 20 : a.tier === 'medium' ? 50 : 100;
            spawnExplosion(gs.particles, a.x, a.y, 7 + Math.floor(a.r / 5), a.r);
            if (a.tier === 'large') {
              for (let i = 0; i < 2; i++) {
                const ang = Math.random() * Math.PI * 2, spd = 0.7 + Math.random() * 0.9;
                kept.push({ x: a.x, y: a.y, vx: a.vx + Math.cos(ang)*spd, vy: a.vy + Math.sin(ang)*spd, r: a.r * 0.53, rot: Math.random()*Math.PI*2, rotV: (Math.random()-0.5)*0.07, sides: 5+Math.floor(Math.random()*3), tier: 'medium' });
              }
            } else if (a.tier === 'medium') {
              const n = 2 + Math.floor(Math.random() * 2);
              for (let i = 0; i < n; i++) {
                const ang = Math.random() * Math.PI * 2, spd = 1.3 + Math.random() * 1.3;
                kept.push({ x: a.x, y: a.y, vx: a.vx + Math.cos(ang)*spd, vy: a.vy + Math.sin(ang)*spd, r: a.r * 0.50, rot: Math.random()*Math.PI*2, rotV: (Math.random()-0.5)*0.12, sides: 4+Math.floor(Math.random()*3), tier: 'small' });
              }
            }
            // small → just particles, no split
          } else {
            kept.push(a);
          }
        }
        gs.asteroids = kept;
        return !hit;
      });

      // Ship-asteroid collision
      if (!gs.ship.dead && gs.ship.invincible === 0) {
        for (const a of gs.asteroids) {
          const dx = gs.ship.x - a.x, dy = gs.ship.y - a.y;
          if (dx * dx + dy * dy < (a.r + SHIP_R) * (a.r + SHIP_R)) {
            spawnExplosion(gs.particles, gs.ship.x, gs.ship.y, 18, 20);
            gs.ship.dead = true; gs.ship.deadTimer = RESPAWN_FRAMES;
            gs.lives--;
            if (gs.lives <= 0) {
              gs.gameOver = true;
              setFinalScore(gs.score);
              setIsGameOver(true);
            }
            break;
          }
        }
      }

      // Particles
      gs.particles = gs.particles.filter(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy *= 0.97; p.life--; return p.life > 0; });

      // Continuous spawning — difficulty scales with time
      gs.frames++;
      const maxOnScreen = 3 + Math.min(8, Math.floor(gs.frames / 1800));
      const spawnInterval = Math.max(120, 300 - Math.floor(gs.frames / 600) * 15);
      gs.spawnTimer++;
      if (gs.spawnTimer >= spawnInterval && gs.asteroids.length < maxOnScreen) {
        gs.asteroids.push(spawnAsteroid(W, H, gs.frames));
        gs.spawnTimer = 0;
      }

      // ── Draw ──────────────────────────────────────────────
      ctx.fillStyle = 'rgb(5,8,18)';
      ctx.fillRect(0, 0, W, H);

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let s = 0; s < Math.floor(W * H / 40000); s++) {
        ctx.fillRect((s * 7919 + 3) % W, (s * 6271 + 11) % H, 1, 1);
      }

      // Particles
      for (const p of gs.particles) {
        const alpha = p.life / p.maxLife;
        ctx.fillStyle = `rgba(255,${120 + Math.floor(alpha * 120)},40,${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * alpha), 0, Math.PI * 2);
        ctx.fill();
      }

      // Asteroids
      for (const a of gs.asteroids) {
        ctx.beginPath();
        for (let s = 0; s < a.sides; s++) {
          const ang = a.rot + (s / a.sides) * Math.PI * 2;
          const r = a.r * (0.78 + 0.22 * Math.sin(s * 2.3));
          s === 0 ? ctx.moveTo(a.x + Math.cos(ang)*r, a.y + Math.sin(ang)*r)
                   : ctx.lineTo(a.x + Math.cos(ang)*r, a.y + Math.sin(ang)*r);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(180,200,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Bullets
      ctx.fillStyle = 'rgba(255,255,150,0.95)';
      for (const b of gs.bullets) {
        ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }

      // Ship
      if (!gs.ship.dead) {
        const blink = gs.ship.invincible > 0 && Math.floor(gs.ship.invincible / 6) % 2 === 0;
        if (!blink) {
          ctx.save();
          ctx.translate(gs.ship.x, gs.ship.y);
          ctx.rotate(gs.ship.angle);
          drawBlockShip(ctx, shipColor, gs.ship.thruster);
          ctx.restore();
        }
      }

      // HUD
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(`SCORE: ${gs.score}`, 16, 28);
      for (let i = 0; i < gs.lives; i++) {
        ctx.save();
        ctx.translate(18 + i * 22, H - 22);
        ctx.rotate(-Math.PI / 2);
        drawBlockShip(ctx, 'rgba(255,255,255,0.55)', false, 0.7);
        ctx.restore();
      }
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [getFrequencyData]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#050812] overflow-hidden" style={{ isolation: 'isolate' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Quit */}
      <button
        onClick={close}
        className="fixed top-4 right-4 z-10 flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded font-mono transition-colors bg-black/40"
      >
        <X size={11} /> QUIT [ESC]
      </button>

      {/* Controls hint */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 text-[10px] text-white/30 font-mono">
        WASD / ARROWS to steer · SPACE to fire
      </div>

      {/* Game over */}
      {isGameOver && (
        <div className="fixed inset-0 flex items-center justify-center z-20 bg-black/70">
          <div className="text-center space-y-6">
            <div className="text-5xl font-bold text-white font-mono tracking-widest">GAME OVER</div>
            <div className="text-2xl text-white/60 font-mono">SCORE: {finalScore}</div>
            <div className="flex gap-4 justify-center mt-2">
              <button
                onClick={restart}
                className="px-6 py-2 border border-white/30 text-white font-mono hover:bg-white/10 transition-colors rounded text-sm"
              >
                RESTART
              </button>
              <button
                onClick={close}
                className="px-6 py-2 border border-white/20 text-white/50 font-mono hover:bg-white/5 transition-colors rounded text-sm"
              >
                QUIT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
