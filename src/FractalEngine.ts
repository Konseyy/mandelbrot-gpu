import * as THREE from 'three/webgpu';
import { positionLocal, Fn, uniform, vec4, vec2, float, Loop, Break, dot, If, select, log2, bool } from 'three/tsl';
import debounce from 'lodash/debounce';

const MAX_ZOOM = 2.5;
const MIN_ZOOM = 0.0003;

const COLOR_0 = new THREE.Vector3(0.0, 7.0, 100.0).divideScalar(255.0);
const COLOR_1 = new THREE.Vector3(32.0, 107.0, 203.0).divideScalar(255.0);
const COLOR_2 = new THREE.Vector3(237.0, 255.0, 255.0).divideScalar(255.0);
const COLOR_3 = new THREE.Vector3(255.0, 170.0, 0.0).divideScalar(255.0);
const COLOR_4 = new THREE.Vector3(0.0, 2.0, 0.0).divideScalar(255.0);

const colorRotationAxis = new THREE.Vector3(1, 1, 1).normalize();

function rotateColor(color: THREE.Vector3, angle: number): THREE.Vector3 {
  return color.clone().applyAxisAngle(colorRotationAxis, angle);
}

export class FractalEngine {
  private canvas: HTMLCanvasElement;
  private canvasContainer: HTMLElement;
  private renderer: THREE.WebGPURenderer;
  private resizeObserver: ResizeObserver;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(
    -1, // left
    1, // right
    1, // top
    -1, // bottom
    0.6,
    2
  );

  private zoomingIn = true;

  private time: number | null = null;
  private uZoom = uniform(MAX_ZOOM);
  private uStart = uniform(vec2(-0.743643887037151, 0.13182590420533)); // Seahorse valley
  private uAspect = uniform(1);
  private uMaxIterations = uniform(100);

  private uColor0 = uniform(COLOR_0);
  private uColor1 = uniform(COLOR_1);
  private uColor2 = uniform(COLOR_2);
  private uColor3 = uniform(COLOR_3);
  private uColor4 = uniform(COLOR_4);

  constructor({ canvas }: { canvas: HTMLCanvasElement }) {
    this.canvas = canvas;
    this.canvasContainer = canvas.parentElement!;
    this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas });
    this.renderer.setClearColor(0xffffff, 1);

    const debouncedResizeHandler = debounce(this.onResize.bind(this), 100);
    this.resizeObserver = new ResizeObserver(debouncedResizeHandler);
    this.resizeObserver.observe(this.canvasContainer);

    const material = new THREE.MeshBasicNodeMaterial();

    const maxIterations = float(100);
    const b = float(256.0);

    // Color interpolation based on iteration count
    const rgbColorFromIteration = Fn(([iteration]: [ReturnType<typeof float>]) => {
      const fractionalIteration = iteration.div(maxIterations);

      // Use nested select for color gradient bands
      const color = select(
        fractionalIteration.lessThanEqual(0.16),
        this.uColor0.add(this.uColor1.sub(this.uColor0).mul(fractionalIteration.div(0.16))),
        select(
          fractionalIteration.lessThanEqual(0.42),
          this.uColor1.add(this.uColor2.sub(this.uColor1).mul(fractionalIteration.sub(0.16).div(0.42 - 0.16))),
          select(
            fractionalIteration.lessThanEqual(0.6425),
            this.uColor2.add(this.uColor3.sub(this.uColor2).mul(fractionalIteration.sub(0.42).div(0.6425 - 0.42))),
            select(
              fractionalIteration.lessThanEqual(0.8575),
              this.uColor3.add(this.uColor4.sub(this.uColor3).mul(fractionalIteration.sub(0.6425).div(0.8575 - 0.6425))),
              this.uColor4
            )
          )
        )
      );

      return color;
    });

    const iterateMandelbrot = Fn(([z, uv]: [ReturnType<typeof vec2>, ReturnType<typeof vec2>]) => {
      const n = float(0);
      // Mandelbrot iteration loop: z = z² + c
      Loop({ start: 0, end: this.uMaxIterations, type: 'int', condition: '<' }, () => {
        z.assign(vec2(z.x.mul(z.x).sub(z.y.mul(z.y)), float(2.0).mul(z.x).mul(z.y)).add(uv));

        If(dot(z, z).greaterThan(b.mul(b)), () => {
          Break();
        });
        n.addAssign(1);
      });

      const inSet = bool(false);

      If(n.greaterThanEqual(this.uMaxIterations.sub(1)), () => {
        inSet.value = true;
      });

      return select(inSet, 0, n.sub(log2(log2(dot(z, z))).add(4.0)));
    });

    const mandelBrot = Fn(() => {
      // Scale position by zoom and center on interesting region
      // Apply aspect ratio correction to x coordinate
      const pos = vec2(positionLocal.x.mul(this.uAspect), positionLocal.y);
      const scaled = pos.mul(this.uZoom).add(this.uStart);

      const z = vec2(0, 0);

      const iterations = iterateMandelbrot(z, scaled);

      return vec4(rgbColorFromIteration(iterations), 1.0);
    });

    material.fragmentNode = mandelBrot();

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.scene.add(mesh);

    this.camera.position.z = 1;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    this.renderer.setAnimationLoop(this.renderLoop.bind(this));
  }

  private onResize(entries: ResizeObserverEntry[]) {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      this.renderer.setSize(width, height);
      this.uAspect.value = width / height;
    }
    this.renderer.setPixelRatio(window.devicePixelRatio);
  }

  private renderLoop() {
    const currentTime = performance.now();
    const delta = this.time === null ? 0 : currentTime - this.time;
    this.time = currentTime;

    if (this.uZoom.value <= MIN_ZOOM) {
      this.zoomingIn = false;
    } else if (this.uZoom.value >= MAX_ZOOM) {
      this.zoomingIn = true;
    }

    this.uZoom.value = this.uZoom.value * (1 - delta * 0.0005 * (this.zoomingIn ? 1 : -1));

    this.uColor0.value = rotateColor(COLOR_0, currentTime * 0.0002);
    this.uColor1.value = rotateColor(COLOR_1, currentTime * 0.0003);
    this.uColor2.value = rotateColor(COLOR_2, currentTime * 0.0004);
    this.uColor3.value = rotateColor(COLOR_3, currentTime * 0.0005);
    this.uColor4.value = rotateColor(COLOR_4, currentTime * 0.0006);

    // Increase iterations as we zoom deeper for more detail
    const zoomDepth = Math.log2(2.5 / this.uZoom.value);
    this.uMaxIterations.value = Math.floor(100 + zoomDepth * 50);

    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    this.resizeObserver.unobserve(this.canvas);

    this.scene.traverse((object) => {
      if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) {
        object.geometry.dispose();
      }
      if ('material' in object) {
        const material = object.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => {
            if (mat instanceof THREE.Material) mat.dispose();
          });
        } else {
          if (material instanceof THREE.Material) material.dispose();
        }
      }
    });

    this.renderer.dispose();
  }
}
