"use client";

import { FollowCam } from "../camera/FollowCam";
import { Pointer } from "../controller/Pointer";
import { Cottage } from "../outpost/Cottage";
import { Dock } from "../outpost/Dock";
import { LabHut } from "../outpost/LabHut";
import { Lighthouse } from "../outpost/Lighthouse";
import { LookoutRock } from "../outpost/LookoutRock";
import { Props } from "../outpost/Props";
import { RadioShack } from "../outpost/RadioShack";
import { Penguin } from "../penguin/Penguin";
import { Bounds } from "./Bounds";
import { Floes } from "./Floes";
import { Kelp } from "./Kelp";
import { Sky } from "./Sky";
import { Terrain } from "./Terrain";
import { Water } from "./Water";

export function World({ shadows, lowDetail }: { shadows: boolean; lowDetail: boolean }) {
  return (
    <>
      <Sky shadows={shadows} starCount={lowDetail ? 1200 : 2600} />
      <Terrain />
      <Water />
      <Kelp count={lowDetail ? 50 : 90} />
      <Floes />
      <Bounds />

      <Lighthouse />
      <LabHut />
      <Cottage />
      <RadioShack />
      <Dock />
      <LookoutRock />
      <Props />

      <Penguin />
      <FollowCam />
      <Pointer />
    </>
  );
}
