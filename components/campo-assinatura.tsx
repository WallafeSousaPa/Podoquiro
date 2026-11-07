"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type PointerEvent } from "react";
import {
  coordsCanvasAssinatura,
  exportarAssinaturaTermoJpeg,
  prepararCanvasAssinaturaTermo,
} from "@/lib/client/canvas-assinatura-termo";

export type CampoAssinaturaHandle = {
  exportarJpeg: () => string | null;
  temTraco: () => boolean;
};

type Props = {
  resetKey?: number;
};

function canvasTemTraco(c: HTMLCanvasElement): boolean {
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] ?? 255;
    const g = data[i + 1] ?? 255;
    const b = data[i + 2] ?? 255;
    if (r < 240 || g < 240 || b < 240) return true;
  }
  return false;
}

export const CampoAssinatura = forwardRef<CampoAssinaturaHandle, Props>(function CampoAssinatura(
  { resetKey = 0 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    const caixa = caixaRef.current;
    if (!c || !caixa) return;
    const aplicar = () => {
      const largura = Math.floor(caixa.clientWidth);
      if (largura < 40) return;
      prepararCanvasAssinaturaTermo(c, largura);
    };
    aplicar();
    const id = window.requestAnimationFrame(aplicar);
    const obs = new ResizeObserver(aplicar);
    obs.observe(caixa);
    return () => {
      window.cancelAnimationFrame(id);
      obs.disconnect();
    };
  }, [resetKey]);

  useImperativeHandle(ref, () => ({
    exportarJpeg: () => {
      const c = canvasRef.current;
      if (!c || !canvasTemTraco(c)) return null;
      return exportarAssinaturaTermoJpeg(c);
    },
    temTraco: () => {
      const c = canvasRef.current;
      return Boolean(c && canvasTemTraco(c));
    },
  }));

  function coords(ev: PointerEvent<HTMLCanvasElement>) {
    return coordsCanvasAssinatura(ev.currentTarget, ev.clientX, ev.clientY);
  }

  function onPointerDown(ev: PointerEvent<HTMLCanvasElement>) {
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    desenhando.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    const { x, y } = coords(ev);
    ultimo.current = { x, y };
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  }

  function onPointerMove(ev: PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current || !ultimo.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = coords(ev);
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ultimo.current = { x, y };
  }

  function onPointerUp(ev: PointerEvent<HTMLCanvasElement>) {
    desenhando.current = false;
    ultimo.current = null;
    try {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div ref={caixaRef} style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <canvas
        ref={canvasRef}
        className="border rounded bg-white d-block"
        style={{
          width: "100%",
          maxWidth: "100%",
          height: 200,
          boxSizing: "border-box",
          cursor: "crosshair",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
    </div>
  );
});
