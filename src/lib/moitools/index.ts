import { initDns } from "./dnsleak";
import { initInfo } from "./clientinfo";
import { initIp } from "./ipchecker";
import { initSpeed, cancelActiveSpeedtest } from "./speedtest";
import { initWebrtc } from "./webrtc";
import {
  cancelBackgroundNetworkTasks,
  enqueueBackgroundNetworkTask,
} from "./network";

document.addEventListener("astro:before-swap", () => {
  bootGeneration += 1;
  cancelActiveSpeedtest();
  cancelBackgroundNetworkTasks();
});

let bootGeneration = 0;

const boot = () => {
  const trigger = document.getElementById("run-speedtest");
  if (!trigger || trigger.dataset.moitoolsBooted) return;
  trigger.dataset.moitoolsBooted = "true";
  const generation = ++bootGeneration;
  initInfo();
  const ipRequests = initIp();
  initSpeed();
  enqueueBackgroundNetworkTask(async (signal) => {
    if (generation !== bootGeneration) return;
    await ipRequests;
    if (generation !== bootGeneration) return;
    await initWebrtc(signal);
  });
  enqueueBackgroundNetworkTask(async (signal) => {
    if (generation !== bootGeneration) return;
    await initDns(signal);
  });
};

document.addEventListener("astro:page-load", boot);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
