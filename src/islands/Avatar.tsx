import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Built URL of the .glb, resolved by Vite from the profile frontmatter. */
  src: string;
  /** Accessible description; the canvas is otherwise opaque to screen readers. */
  label: string;
  /** Sizing for the canvas host. The renderer follows it via ResizeObserver. */
  className?: string;
}

/**
 * Lazy 3D avatar.
 *
 * three.js and the model are ~600 KB combined, which is far more than the rest
 * of this page put together — so nothing is imported until the element is
 * actually scrolled into view, and the whole thing is skipped outright for
 * reduced-motion users and devices likely to struggle.
 *
 * Rendering is on-demand rather than a permanent rAF loop: an idle animation on
 * a portfolio hero should not keep a phone's GPU busy while someone reads.
 */
export default function Avatar({ src, label, className = 'h-56 w-full sm:h-72' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Honour the OS setting rather than animating regardless — vestibular
    // triggers are a real accessibility concern, not a preference toggle.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A rough proxy for "this device will not enjoy WebGL": low core count.
    const weakDevice = (navigator.hardwareConcurrency ?? 8) <= 2;
    if (reduceMotion || weakDevice) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void start();
      },
      { rootMargin: '200px' },
    );
    observer.observe(host);

    async function start() {
      try {
        // Dynamic imports: these bytes never load for a visitor who does not
        // scroll the hero into view, and never at all on a reduced-motion device.
        const [THREE, { GLTFLoader }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
        ]);
        if (cancelled || !hostRef.current) return;

        const el = hostRef.current;
        const width = el.clientWidth;
        const height = el.clientHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        // Cap DPR: a 3x retina phone would otherwise render 9x the pixels for
        // an effect nobody is inspecting closely.
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
        // Slightly above and in front, aimed at the model's centre. Without the
        // explicit lookAt the camera stares along -Z regardless of where it was
        // positioned, which frames the subject from the chin up.
        camera.position.set(0, 0.35, 4.6);
        camera.lookAt(0, 0, 0);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(2, 4, 3);
        scene.add(key);

        const gltf = await new GLTFLoader().loadAsync(src);
        if (cancelled) {
          renderer.dispose();
          return;
        }

        const model = gltf.scene;
        // Normalise unknown models to a predictable size: a Ready Player Me
        // export and a sample robot differ by orders of magnitude in scale.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 2.6 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        scene.add(model);

        // Play an idle clip if the model ships one.
        const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
        if (mixer) {
          const idle =
            gltf.animations.find((c) => /idle|wave|breath/i.test(c.name)) ?? gltf.animations[0]!;
          mixer.clipAction(idle).play();
        }

        // Cursor tracking, damped. Pointer position is normalised to the
        // viewport so the head turns toward the reader rather than snapping.
        const target = { x: 0, y: 0 };
        const current = { x: 0, y: 0 };
        const onPointer = (e: PointerEvent) => {
          target.x = (e.clientX / window.innerWidth) * 2 - 1;
          target.y = (e.clientY / window.innerHeight) * 2 - 1;
        };
        window.addEventListener('pointermove', onPointer, { passive: true });

        const clock = new THREE.Clock();
        let raf = 0;
        let running = true;

        const tick = () => {
          if (!running) return;
          raf = requestAnimationFrame(tick);
          const dt = clock.getDelta();
          mixer?.update(dt);
          current.x += (target.x - current.x) * Math.min(1, dt * 4);
          current.y += (target.y - current.y) * Math.min(1, dt * 4);
          model.rotation.y = current.x * 0.5;
          model.rotation.x = current.y * 0.18;
          renderer.render(scene, camera);
        };
        tick();

        // Stop rendering when off-screen or on a background tab — otherwise the
        // hero quietly drains battery for the entire session.
        const visibility = new IntersectionObserver(
          (entries) => {
            const visible = entries.some((e) => e.isIntersecting);
            if (visible && !running) {
              running = true;
              clock.getDelta(); // discard the gap so animation does not jump
              tick();
            } else if (!visible) {
              running = false;
              cancelAnimationFrame(raf);
            }
          },
          { threshold: 0.01 },
        );
        visibility.observe(el);

        const onResize = () => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (!w || !h) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        const resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(el);

        cleanup = () => {
          running = false;
          cancelAnimationFrame(raf);
          visibility.disconnect();
          resizeObserver.disconnect();
          window.removeEventListener('pointermove', onPointer);
          // Explicit teardown: WebGL contexts are a limited resource and are
          // not reclaimed just because the element was removed.
          scene.traverse((obj: any) => {
            obj.geometry?.dispose?.();
            const mat = obj.material;
            if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose?.());
            else mat?.dispose?.();
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (err) {
        console.debug('[avatar] failed to load', err);
        if (!cancelled) setFailed(true);
      }
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      cleanup?.();
    };
  }, [src]);

  if (failed) return null;

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      className={`pointer-events-none ${className}`}
    />
  );
}
