import { useEffect, useRef } from 'react';
import { FractalEngine } from './FractalEngine';

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new FractalEngine({ canvas: canvasRef.current });

    return () => {
      engine.dispose();
    };
  }, []);

  return (
    <div className="h-dvh w-dvw bg-black">
      <div className="size-full p-4">
        <canvas ref={canvasRef} className="size-full" />
      </div>
    </div>
  );
}

export default App;
