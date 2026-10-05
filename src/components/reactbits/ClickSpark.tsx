import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';

// Adapted from React Bits' ClickSpark: the canvas is a fixed, full-viewport
// overlay above the HUD (instead of sitting under its children), and an
// imperative burst() lets the game fire sparks on a correct answer — most
// answers are typed + Enter, so click-only sparks would rarely be seen.

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  extraScale?: number;
  children?: React.ReactNode;
}

export interface BurstOptions {
  color?: string;
  count?: number;
  scale?: number;
}

export interface ClickSparkHandle {
  burst: (x: number, y: number, options?: BurstOptions) => void;
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
  color: string;
  scale: number;
}

const ClickSpark = forwardRef<ClickSparkHandle, ClickSparkProps>(function ClickSpark(
  {
    sparkColor = '#fff',
    sparkSize = 10,
    sparkRadius = 15,
    sparkCount = 8,
    duration = 400,
    easing = 'ease-out',
    extraScale = 1.0,
    children,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const easeFunc = useCallback(
    (t: number) => {
      switch (easing) {
        case 'linear':
          return t;
        case 'ease-in':
          return t * t;
        case 'ease-in-out':
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        default:
          return t * (2 - t);
      }
    },
    [easing],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const draw = (timestamp: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration * spark.scale) return false;

        const eased = easeFunc(elapsed / (duration * spark.scale));
        const distance = eased * sparkRadius * extraScale * spark.scale;
        const lineLength = sparkSize * spark.scale * (1 - eased);

        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

        ctx.strokeStyle = spark.color;
        ctx.lineWidth = 2 + spark.scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        return true;
      });

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [sparkSize, sparkRadius, duration, easeFunc, extraScale]);

  const burst = useCallback(
    (x: number, y: number, options: BurstOptions = {}) => {
      const count = options.count ?? sparkCount;
      const now = performance.now();
      for (let i = 0; i < count; i++) {
        sparksRef.current.push({
          x,
          y,
          angle: (2 * Math.PI * i) / count,
          startTime: now,
          color: options.color ?? sparkColor,
          scale: options.scale ?? 1,
        });
      }
    },
    [sparkCount, sparkColor],
  );

  useImperativeHandle(ref, () => ({ burst }), [burst]);

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onClick={(e) => burst(e.clientX, e.clientY)}
    >
      {children}
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1000 }}
      />
    </div>
  );
});

export default ClickSpark;
