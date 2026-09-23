import { JSDOM, VirtualConsole } from "jsdom";

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error) => errors.push(`jsdom: ${error.stack || error}`));
virtualConsole.on("error", (...args) => errors.push(`console: ${args.join(" ")}`));

const context = new Proxy(
  {
    measureText: (text) => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getLineDash: () => [],
  },
  {
    get(target, key) {
      if (key in target) return target[key];
      return () => {};
    },
    set() {
      return true;
    },
  },
);

const dom = await JSDOM.fromURL("http://127.0.0.1:8765/", {
  resources: "usable",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    window.HTMLCanvasElement.prototype.getContext = () => context;
    window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
    window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 900,
      bottom: 600,
      width: 900,
      height: 600,
      x: 0,
      y: 0,
      toJSON() {},
    });
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  },
});

await new Promise((resolve) => setTimeout(resolve, 1500));
const { document } = dom.window;
const canvas = document.querySelector("canvas");
const buttons = [...document.querySelectorAll("button")];
const pointButton = buttons.find((button) => button.textContent?.includes("נקודה"));
if (!canvas || !pointButton) errors.push("missing canvas or point tool");
else {
  pointButton.click();
  canvas.dispatchEvent(
    new dom.window.MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 480,
      clientY: 260,
      button: 0,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  const cards = document.querySelectorAll(".object-card");
  if (cards.length !== 1) errors.push(`expected 1 object card, got ${cards.length}`);
}

console.log(JSON.stringify({ errors, title: document.title, html: document.body.textContent?.slice(0, 200) }));
dom.window.close();
process.exit(errors.length ? 1 : 0);
