import { useEffect, useRef } from 'react';

/**
 * Ambient 2D particle field.
 * Intentionally restrained: no WebGL, no pointer tracking, and pauses when
 * the tab is hidden or the user requests reduced motion.
 */
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionPreference.matches) return;

    type Particle = { x: number; y: number; vx: number; vy: number; radius: number; alpha: number };
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(34, Math.max(18, Math.round((width * height) / 42000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        radius: 0.7 + Math.random() * 1.1,
        alpha: 0.12 + Math.random() * 0.2,
      }));
    };

    const draw = () => {
      if (!running) return;
      context.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -8) p.x = width + 8;
        if (p.x > width + 8) p.x = -8;
        if (p.y < -8) p.y = height + 8;
        if (p.y > height + 8) p.y = -8;

        context.beginPath();
        context.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(91, 220, 205, ${p.alpha})`;
        context.fill();

        for (let j = i + 1; j < particles.length; j += 1) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 112) {
            context.beginPath();
            context.moveTo(p.x, p.y);
            context.lineTo(q.x, q.y);
            context.strokeStyle = `rgba(61, 173, 190, ${(1 - distance / 112) * 0.075})`;
            context.lineWidth = 0.65;
            context.stroke();
          }
        }
      }
      frame = window.requestAnimationFrame(draw);
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      frame = window.requestAnimationFrame(draw);
    };
    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frame);
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    start();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="app-ambient" aria-hidden="true">
      <div className="app-ambient-glow app-ambient-glow-a" />
      <div className="app-ambient-glow app-ambient-glow-b" />
      <canvas ref={canvasRef} className="app-ambient-canvas" />
    </div>
  );
}
