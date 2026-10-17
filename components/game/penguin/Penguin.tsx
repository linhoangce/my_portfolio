"use client";

import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, type RapierRigidBody, RigidBody, useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { world as worldData } from "@/data";
import { cameraState } from "../camera/cameraState";
import { GRAVITY, PENGUIN, PHYSICS } from "../constants";
import { consumeJump, input } from "../controller/input";
import type { MoveMode } from "../store";
import { useGame } from "../store";
import { PenguinModel } from "./PenguinModel";
import { penguinState, setPenguinBody } from "./penguinState";

const CAP = PENGUIN.halfHeight + PENGUIN.radius;
const SLOPE_COS = Math.cos((PENGUIN.slopeMaxDeg * Math.PI) / 180);
const WATER = worldData.waterLevel;
const DOWN = { x: 0, y: -1, z: 0 };

type Controller = {
  move: MoveMode;
  grounded: boolean;
  groundY: number;
  normal: { x: number; y: number; z: number };
  surface: string;
  platform: { x: number; y: number; z: number };
  lastGroundedAt: number;
  jumpedAt: number;
  slideAngle: number;
  slideSpeed: number;
  diving: boolean;
  yaw: number;
  teleportNonce: number;
};

const shortestTurn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const turnExp = (from: number, to: number, lambda: number, dt: number) => from + shortestTurn(from, to) * (1 - Math.exp(-lambda * dt));
const turnLinear = (from: number, to: number, rate: number, dt: number) => {
  const d = shortestTurn(from, to);
  const step = rate * dt;
  return from + Math.max(-step, Math.min(step, d));
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type UserData = { surface?: string } | undefined;

export function Penguin() {
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<THREE.Group>(null);
  const { world, rapier } = useRapier();
  const ctl = useRef<Controller>({
    move: "walk",
    grounded: false,
    groundY: 0,
    normal: { x: 0, y: 1, z: 0 },
    surface: "ice",
    platform: { x: 0, y: 0, z: 0 },
    lastGroundedAt: Number.NEGATIVE_INFINITY,
    jumpedAt: Number.NEGATIVE_INFINITY,
    slideAngle: 0,
    slideSpeed: 0,
    diving: false,
    yaw: worldData.spawn.yaw,
    teleportNonce: 0,
  }).current;

  useEffect(() => {
    setPenguinBody(body.current);
    return () => setPenguinBody(null);
  }, []);

  useBeforePhysicsStep(() => {
    const rb = body.current;
    if (!rb) return;
    const dt = PHYSICS.timeStep;
    const state = useGame.getState();
    const now = performance.now();

    // Teleport requests from the menu.
    const tr = state.teleportRequest;
    if (tr && tr.nonce !== ctl.teleportNonce) {
      ctl.teleportNonce = tr.nonce;
      rb.setTranslation({ x: tr.pos[0], y: tr.pos[1], z: tr.pos[2] }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setGravityScale(1, true);
      ctl.yaw = tr.yaw;
      ctl.move = "walk";
      ctl.diving = false;
      ctl.lastGroundedAt = Number.NEGATIVE_INFINITY;
    }

    const pos = rb.translation();
    const vel = rb.linvel();

    // Kill plane.
    if (pos.y < worldData.killY) {
      const r = state.respawn.pos;
      rb.setTranslation({ x: r[0], y: r[1], z: r[2] }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setGravityScale(1, true);
      ctl.move = "walk";
      return;
    }

    // Ground probe.
    const probeLen = CAP + PENGUIN.groundProbe;
    const ray = new rapier.Ray(pos, DOWN);
    const hit = world.castRayAndGetNormal(ray, probeLen, true, undefined, undefined, undefined, rb, (c) => !c.isSensor());
    let grounded = false;
    ctl.platform.x = 0;
    ctl.platform.y = 0;
    ctl.platform.z = 0;
    const recentlyJumped = now - ctl.jumpedAt < 120;
    if (hit && vel.y <= 1.5 && !recentlyJumped) {
      const n = hit.normal.y < 0 ? { x: -hit.normal.x, y: -hit.normal.y, z: -hit.normal.z } : hit.normal;
      if (n.y >= SLOPE_COS) {
        grounded = true;
        ctl.groundY = pos.y - hit.timeOfImpact;
        ctl.normal = n;
        const parent = hit.collider.parent();
        const ud = parent?.userData as UserData;
        ctl.surface = ctl.groundY < WATER - 0.05 ? "wet" : (ud?.surface ?? "rock");
        if (parent && parent.isKinematic()) {
          const pv = parent.linvel();
          ctl.platform.x = pv.x;
          ctl.platform.y = pv.y;
          ctl.platform.z = pv.z;
        }
      }
    }
    if (grounded) ctl.lastGroundedAt = now;
    ctl.grounded = grounded;
    const gap = hit ? hit.timeOfImpact - CAP : Number.POSITIVE_INFINITY;

    // Water membership by height; every body of water sits at the same level.
    // Hysteresis: wading (grounded, centre above -0.6) stays in walk mode; swimming
    // starts once the centre drops below -0.7 on the ground, or -0.12 when unsupported.
    const swimEnter = grounded ? pos.y < WATER - 0.7 : pos.y < WATER + PENGUIN.swimEnterDepth;
    if (ctl.move !== "swim" && swimEnter) {
      ctl.move = "swim";
      ctl.diving = false;
      rb.setGravityScale(0, true);
    } else if (ctl.move === "swim" && grounded && pos.y > WATER - 0.6) {
      ctl.move = "walk";
      rb.setGravityScale(1, true);
    } else if (ctl.move === "swim" && pos.y > WATER + 0.35) {
      ctl.move = "walk";
      rb.setGravityScale(1, true);
    }

    // Camera-relative wish direction.
    const cy = cameraState.yaw;
    const fx = -Math.sin(cy);
    const fz = -Math.cos(cy);
    const rx = Math.cos(cy);
    const rz = -Math.sin(cy);
    let wx = fx * input.move.y + rx * input.move.x;
    let wz = fz * input.move.y + rz * input.move.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const hasInput = wl > 0.01;
    const ux = hasInput ? wx / Math.min(wl, 1) : 0;
    const uz = hasInput ? wz / Math.min(wl, 1) : 0;

    let vx = vel.x;
    let vy = vel.y;
    let vz = vel.z;
    const relVx = vx - ctl.platform.x;
    const relVz = vz - ctl.platform.z;
    const hSpeed = Math.hypot(relVx, relVz);

    if (ctl.move === "swim") {
      if (consumeJump(PENGUIN.jumpBufferMs)) ctl.diving = !ctl.diving;
      const k = 1 - Math.exp(-PENGUIN.swimAccel * dt);
      vx += (wx * PENGUIN.swimSpeed - vx) * k;
      vz += (wz * PENGUIN.swimSpeed - vz) * k;
      const targetY = WATER + (ctl.diving ? PENGUIN.diveDepth : PENGUIN.surfaceDepth);
      const vyTarget = clamp((targetY - pos.y) * PENGUIN.buoyancy, -3, 3);
      vy += (vyTarget - vy) * (1 - Math.exp(-6 * dt));

      // Hop out onto a walkable edge ahead.
      if (hasInput && pos.y > WATER - 0.9) {
        const origin = { x: pos.x + ux * 1.1, y: pos.y + 1.7, z: pos.z + uz * 1.1 };
        const edgeRay = new rapier.Ray(origin, DOWN);
        const edge = world.castRayAndGetNormal(edgeRay, 2.6, true, undefined, undefined, undefined, rb, (c) => !c.isSensor());
        if (edge && Math.abs(edge.normal.y) >= SLOPE_COS) {
          const hy = origin.y - edge.timeOfImpact;
          const feet = pos.y - CAP;
          // Ground ahead is a step up (edge or shore) that is near or above the surface.
          if (hy > feet + 0.25 && hy > WATER - 0.5 && hy < pos.y + 1.25) {
            vy = PENGUIN.hopSpeed;
            vx = ux * PENGUIN.hopForward;
            vz = uz * PENGUIN.hopForward;
            ctl.move = "walk";
            ctl.diving = false;
            rb.setGravityScale(1, true);
            ctl.jumpedAt = now;
            ctl.lastGroundedAt = Number.NEGATIVE_INFINITY;
          }
        }
      }
      if (hasInput) ctl.yaw = turnExp(ctl.yaw, Math.atan2(ux, uz), PENGUIN.swimTurn, dt);
    } else if (ctl.move === "slide") {
      if (!input.slide || (grounded && ctl.surface !== "ice")) {
        ctl.move = "walk";
        rb.setGravityScale(1, true);
      } else if (grounded) {
        if (hasInput) ctl.slideAngle = turnLinear(ctl.slideAngle, Math.atan2(ux, uz), PENGUIN.slideSteer, dt);
        let dx = Math.sin(ctl.slideAngle);
        let dz = Math.cos(ctl.slideAngle);
        let svx = dx * ctl.slideSpeed;
        let svz = dz * ctl.slideSpeed;
        // Slopes: accelerate downhill, brake uphill.
        const n = ctl.normal;
        const tilt = Math.hypot(n.x, n.z);
        if (tilt > 1e-3) {
          const g = -GRAVITY * tilt;
          svx += (n.x / tilt) * g * dt;
          svz += (n.z / tilt) * g * dt;
        }
        let speed = Math.hypot(svx, svz);
        if (speed > 0.01) {
          dx = svx / speed;
          dz = svz / speed;
          ctl.slideAngle = Math.atan2(dx, dz);
        }
        speed *= Math.max(0, 1 - PENGUIN.slideDecay * dt);
        if (input.move.y > 0.3) speed += PENGUIN.slideThrust * dt;
        speed = Math.min(speed, PENGUIN.slideMaxSpeed);
        ctl.slideSpeed = speed;
        if (speed < PENGUIN.slideExitSpeed) {
          ctl.move = "walk";
        }
        vx = dx * speed + ctl.platform.x;
        vz = dz * speed + ctl.platform.z;
        if (consumeJump(PENGUIN.jumpBufferMs)) {
          vy = PENGUIN.jumpSpeed;
          rb.setGravityScale(1, true);
          ctl.jumpedAt = now;
          ctl.lastGroundedAt = Number.NEGATIVE_INFINITY;
        } else {
          rb.setGravityScale(0, true);
          vy = -(n.x * dx * speed + n.z * dz * speed) / n.y - 0.4;
          if (gap > 0.03) vy = Math.min(vy, -Math.min(gap / dt, 6));
        }
        ctl.yaw = ctl.slideAngle;
      } else {
        rb.setGravityScale(1, true);
        ctl.yaw = ctl.slideAngle;
      }
    }

    if (ctl.move === "walk") {
      const canSlide = input.slide && grounded && ctl.surface === "ice" && hSpeed >= PENGUIN.slideStartSpeed;
      if (canSlide) {
        ctl.move = "slide";
        const dx = hasInput ? ux : relVx / hSpeed;
        const dz = hasInput ? uz : relVz / hSpeed;
        ctl.slideAngle = Math.atan2(dx, dz);
        ctl.slideSpeed = Math.min(PENGUIN.slideMaxSpeed, hSpeed + PENGUIN.slideKick);
        vx = dx * ctl.slideSpeed + ctl.platform.x;
        vz = dz * ctl.slideSpeed + ctl.platform.z;
        ctl.yaw = ctl.slideAngle;
      } else {
        const rate = (hasInput ? PENGUIN.walkAccel : PENGUIN.walkDecel) * (grounded ? 1 : 0.45);
        const k = 1 - Math.exp(-rate * dt);
        vx += (wx * PENGUIN.walkSpeed + ctl.platform.x - vx) * k;
        vz += (wz * PENGUIN.walkSpeed + ctl.platform.z - vz) * k;

        const canJump = grounded || now - ctl.lastGroundedAt <= PENGUIN.coyoteMs;
        if (canJump && consumeJump(PENGUIN.jumpBufferMs)) {
          vy = PENGUIN.jumpSpeed;
          rb.setGravityScale(1, true);
          ctl.jumpedAt = now;
          ctl.lastGroundedAt = Number.NEGATIVE_INFINITY;
          grounded = false;
          ctl.grounded = false;
        } else if (grounded) {
          // Glue to the slope: follow the ground plane and push down slightly.
          const n = ctl.normal;
          const tvx = vx - ctl.platform.x;
          const tvz = vz - ctl.platform.z;
          vy = -(n.x * tvx + n.z * tvz) / n.y - 0.4 + ctl.platform.y;
          if (gap > 0.03) vy = Math.min(vy, -Math.min(gap / dt, 6));
          rb.setGravityScale(0, true);
        } else {
          rb.setGravityScale(1, true);
        }
        if (hasInput) ctl.yaw = turnExp(ctl.yaw, Math.atan2(ux, uz), PENGUIN.turnRate, dt);
      }
    }

    rb.setLinvel({ x: vx, y: vy, z: vz }, true);

    penguinState.pos.set(pos.x, pos.y, pos.z);
    penguinState.yaw = ctl.yaw;
    penguinState.move = ctl.move;
    penguinState.speed = Math.hypot(vx - ctl.platform.x, vz - ctl.platform.z);
    penguinState.grounded = grounded;
    penguinState.diving = ctl.move === "swim" && ctl.diving;
    penguinState.airborne = !grounded && ctl.move !== "swim";
    state.setMove(ctl.move, ctl.move === "swim" && ctl.diving);
  });

  useFrame(() => {
    const g = visual.current;
    if (!g) return;
    g.getWorldPosition(penguinState.visualPos);
  });

  const [sx, sy, sz] = worldData.spawn.position;

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={[sx, sy, sz]}
      lockRotations
      ccd
      canSleep={false}
      friction={0}
      restitution={0}
      linearDamping={0}
      angularDamping={0}
      userData={{ type: "penguin" }}
    >
      <CapsuleCollider args={[PENGUIN.halfHeight, PENGUIN.radius]} friction={0} restitution={0} mass={1} />
      <group ref={visual}>
        <PenguinModel />
        {/* blob shadow: cheap grounding cue on every device */}
        <mesh position={[0, -CAP + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <circleGeometry args={[0.42, 12]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      </group>
    </RigidBody>
  );
}
