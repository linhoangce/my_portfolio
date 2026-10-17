import { CAMERA } from "../constants";

/** Orbit state shared between the pointer input, the penguin (camera-relative movement) and the follow camera. */
export const cameraState = {
  yaw: 0,
  pitch: CAMERA.pitch,
  distance: CAMERA.distance,
  underwater: false,
};
