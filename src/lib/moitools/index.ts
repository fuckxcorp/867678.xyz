import { initDns } from "./dnsleak";
import { initInfo } from "./clientinfo";
import { initIp } from "./ipchecker";
import { initSpeed, cancelActiveSpeedtest } from "./speedtest";
import { initWebrtc } from "./webrtc";
import {
  cancelBackgroundNetworkTasks,
  enqueueBackgroundNetworkTask,
} from "./network";

// 客户端路由离开时终止测速并立即放行后台任务；
// 否则测速窗口会拖着僵尸请求再跑十几秒，返回本页时所有面板都在等它。
document.addEventListener("astro:before-swap", () => {
  bootGeneration += 1;
  cancelActiveSpeedtest();
  cancelBackgroundNetworkTasks();
});

// 每次进入页面都会排一份后台任务；离开再返回时队列里会新旧叠加，
// 用代数让旧实例的任务自动跳过，只保留最新一次的。
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

// astro:page-load 在脚本加载慢时可能先于本模块触发而被错过，
// 所以首次进入页面额外用 DOMContentLoaded 兜底；dataset 标记防止双跑。
document.addEventListener("astro:page-load", boot);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
