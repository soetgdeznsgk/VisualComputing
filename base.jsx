// webxr_pose.js — the WebXR hero, on webgl.tree. A point placed in 3D space,
// two ways, painting a trail as it moves:
//
//   slider fake — the brush chapter's device. A 2D pointer fixes x and y; the
//                 third coordinate is guessed by a depth slider. The whole trail
//                 sits at that one depth, so it reads flat, and dragging the
//                 slider jerks every point through depth together, because depth
//                 is a single global knob, not a measurement.
//   posed       — a tracked controller sweeps the volume. Its pose supplies all
//                 three coordinates at once, so the trail traces a genuine 3D
//                 curve and the slider is gone. The pose drops into the exact
//                 slot the slider's fake occupied.
//
// Here the pose is simulated, so it runs everywhere: a device sweeping a
// Lissajous path, its heading the tangent. A real session reads the same
// { position, orientation } from XRFrame and feeds the identical slot.
//
//   {{< webgl-tree sketch="/sketches/webxr_pose.js" >}}

import * as twgl from 'twgl.js'
import { createCanvas, init, setCamera, bind, buffer, draw, grid, axes, mapLocation, tree, host } from 'webgl.tree'
import { createPanel } from '@nakednous/ui'
import { palette, onTheme, rgb } from 'nb/theme'
import { litProgram, TWO_LIGHT, eyeLights, UNLIT } from 'nb/lit'
import { alignY } from 'nb/mesh'
import { hudText } from 'nb/hud'

const BOX = 130, TRAIL_MAX = 140
const W = 600, H = 400

const gl = createCanvas(W, H, { attributes: { antialias: true } })
const canvas = gl.canvas
const canvasHost = host.createHost(canvas)
init(gl, { host: canvasHost })
gl.enable(gl.DEPTH_TEST)

const lit = litProgram(gl)
const lights = {}
const ball = buffer(gl, twgl.primitives.createSphereVertices(1, 12, 8))
const shaft = buffer(gl, twgl.primitives.createCubeVertices(1))
const q = tree.quat(), M = tree.mat4()
const qGround = tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2)
const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, qGround[0], qGround[1], qGround[2], qGround[3], 1, 1, 1)

const cam = tree.createCamera({ eye: [BOX * 1.7, BOX * 0.9, BOX * 2], fov: Math.PI / 3.2, near: 1, far: 4000 })
const orbit = canvasHost.orbit(cam)

const params = { posed: false, paint: true }
const panel = createPanel({ posed: { value: false }, paint: { value: true } }, {
  title: 'placement', x: 10, y: 10, width: 150, labels: true, collapsible: true, color: palette().ink,
  target: (name, value) => { params[name] = value },
})
// the depth slider: the fake third coordinate, seeded at the screen z of the origin on the first frame
const depthSlider = document.createElement('input')
Object.assign(depthSlider, { type: 'range', min: 0, max: 1, step: 0.001, value: 0.96 })
Object.assign(depthSlider.style, { position: 'absolute', left: '10px', top: (H - 28) + 'px', width: '360px' })
document.body.appendChild(depthSlider)
const tag = hudText({ left: 10, bottom: 24 }), note = hudText({ right: 10, bottom: 24 })
if (typeof navigator !== 'undefined' && 'xr' in navigator) note.set('navigator.xr present (real session not entered)')

// the pointer, in screen space
let mx = W / 2, my = H / 2
canvas.addEventListener('pointermove', (e) => { mx = e.offsetX; my = e.offsetY })

// the simulated controller: a Lissajous sweep through the upper half of the volume, heading along its tangent
const pose = { pos: tree.vec3(), dir: [0, 0, 1] }
function controllerPose(out, t) {
  const B = BOX, p = (t) => [B * 0.72 * Math.sin(t * 0.7), B * 0.35 + B * 0.28 * Math.sin(t * 1.3 + 0.5), B * 0.72 * Math.cos(t * 0.5)]
  const a = p(t), b = p(t + 0.016)
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], m = Math.hypot(dx, dy, dz) || 1
  out.pos[0] = a[0]; out.pos[1] = a[1]; out.pos[2] = a[2]
  out.dir[0] = dx / m; out.dir[1] = dy / m; out.dir[2] = dz / m
  return out
}

// the trail: a ring of recent tip positions, each tagged with its colour; older ones shrink
const trail = []
let lastPosed = null
function pushTrail(x, y, z, color) { trail.push({ x, y, z, color }); if (trail.length > TRAIL_MAX) trail.shift() }

let bg, col
function theme() {
  const C = palette(); bg = rgb(C.bg)
  col = { grid: [...rgb(C.grid), 1], orange: rgb(C.orange), cyan: rgb(C.cyan) }
  panel.el.style.color = C.ink
}
theme()
onTheme(theme)

const r = tree.vec3()
let seeded = false
function render(ms) {
  gl.clearColor(bg[0], bg[1], bg[2], 1)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  setCamera(gl, cam)
  if (orbit.update()) setCamera(gl, cam)
  if (!seeded) { mapLocation(gl, r, 0, 0, 0, tree.WORLD, tree.SCREEN); depthSlider.value = r[2]; seeded = true }

  grid(gl, { M: ground, size: BOX * 2, subdivisions: 10, color: col.grid })
  axes(gl, { size: BOX * 0.3, bits: tree.X | tree.Y | tree.Z })
  bind(gl, lit, eyeLights(gl, lights, TWO_LIGHT))
  depthSlider.style.display = params.posed ? 'none' : 'block'   // the slider belongs to the fake only

  if (params.posed) {
    // the measurement: all three coordinates from the device
    controllerPose(pose, ms / 1000)
    const p = pose.pos, d = pose.dir, L = 26
    twgl.setUniforms(lit, { uColor: UNLIT, uEmissive: col.cyan })
    alignY(q, d[0], d[1], d[2])
    draw(gl, shaft, tree.mat4FromTRS(M, p[0] - d[0] * L / 2, p[1] - d[1] * L / 2, p[2] - d[2] * L / 2, q[0], q[1], q[2], q[3], 2, L, 2))
    draw(gl, ball, tree.mat4FromTRS(M, p[0], p[1], p[2], 0, 0, 0, 1, 4, 4, 4))
    if (params.paint) {
      if (lastPosed !== true) trail.length = 0
      pushTrail(p[0], p[1], p[2], col.cyan)
      lastPosed = true
    }
  } else {
    // the fake: x, y from the 2D pointer, z guessed by the slider
    mapLocation(gl, r, mx, my, +depthSlider.value, tree.SCREEN, tree.WORLD)   // tip = inverse(P · V) · ndc
    twgl.setUniforms(lit, { uColor: UNLIT, uEmissive: col.orange })
    draw(gl, ball, tree.mat4FromTRS(M, r[0], r[1], r[2], 0, 0, 0, 1, 4, 4, 4))
    if (params.paint) {
      if (lastPosed !== false) trail.length = 0
      pushTrail(r[0], r[1], r[2], col.orange)
      lastPosed = false
    }
  }

  for (let i = 0; i < trail.length; i++) {                // older → smaller
    const p = trail[i], a = (i + 1) / trail.length, sz = 2.4 * (0.4 + 0.6 * a)
    twgl.setUniforms(lit, { uColor: UNLIT, uEmissive: p.color })
    draw(gl, ball, tree.mat4FromTRS(M, p.x, p.y, p.z, 0, 0, 0, 1, sz, sz, sz))
  }

  tag.set(params.posed ? 'posed · 6 DOF measured · no slider' : 'slider fake · depth is one global guess')
  panel.tick()
  canvasHost.pointer.flush()
  requestAnimationFrame(render)
}
requestAnimationFrame(render)