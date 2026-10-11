// Post passes: a firefly clamp (before bloom) and the final display-space grade
// (vignette, film grain and an optional colour tint).
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { Color } from 'three'

export function createGradePass(): ShaderPass {
  return new ShaderPass({
    name: 'GradeShader',
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uGrain: { value: 0.045 },
      uVignette: { value: 0.32 },
      uTint: { value: new Color(1, 1, 1) },
      uTintAmount: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uGrain;
      uniform float uVignette;
      uniform vec3 uTint;
      uniform float uTintAmount;
      varying vec2 vUv;

      float hash(vec2 p) {
        p = fract(p * vec2(443.897, 441.423));
        p += dot(p, p.yx + 19.19);
        return fract((p.x + p.y) * p.x);
      }

      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 d = vUv - 0.5;
        float v = smoothstep(0.85, 0.2, length(d * vec2(1.1, 1.0)));
        c.rgb *= mix(1.0 - uVignette, 1.0, v);
        c.rgb = mix(c.rgb, c.rgb * uTint, uTintAmount);
        float n = hash(vUv * 1000.0 + fract(uTime * 0.37) * 100.0) - 0.5;
        c.rgb += n * uGrain;
        gl_FragColor = c;
      }
    `,
  })
}

/** Caps HDR values so hot specular glints bloom as glints, not blobs. */
export function createClampPass(max = 6): ShaderPass {
  return new ShaderPass({
    name: 'ClampShader',
    uniforms: { tDiffuse: { value: null }, uMax: { value: max } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uMax;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = max(max(c.r, c.g), c.b);
        if (l > uMax) c.rgb *= uMax / l;
        gl_FragColor = c;
      }
    `,
  })
}
