import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  executablePath: "/tmp/chromium",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("response", (response) => {
  if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
});
const pause = () => new Promise((resolve) => setTimeout(resolve, 120));
const clickButton = async (wanted) => {
  for (const button of await page.$$("button")) {
    const text = await button.evaluate((element) =>
      (element.textContent || "").replace(/\s+/g, " ").trim(),
    );
    if (text === wanted || text.includes(wanted)) {
      await button.click();
      await pause();
      return;
    }
  }
  throw new Error(`Button not found: ${wanted}`);
};
const clickTool = async (wanted) => {
  for (const button of await page.$$(".tool-grid button")) {
    const text = await button.evaluate((element) =>
      (element.textContent || "").replace(/\s+/g, " ").trim(),
    );
    if (text.endsWith(wanted)) {
      await button.click();
      await pause();
      return;
    }
  }
  throw new Error(`Tool not found: ${wanted}`);
};
const canvas = async () => page.$("canvas");
const clickWorld = async (x, y) => {
  const element = await canvas();
  const box = await element.boundingBox();
  await page.mouse.click(box.x + box.width / 2 + x * 64, box.y + box.height / 2 - y * 64);
  await pause();
};
const reset = async () => {
  page.once("dialog", (dialog) => dialog.accept());
  await clickButton("חדש");
  await pause();
};
const addPoint = async (x, y) => {
  await clickTool("נקודה");
  await clickWorld(x, y);
};
const cardTexts = () =>
  page.$$eval(".object-description", (elements) =>
    elements.map((element) => (element.textContent || "").replace(/\s+/g, " ").trim()),
  );

await page.goto(process.env.TEST_URL || "http://127.0.0.1:8765/math-grids-81/", {
  waitUntil: "networkidle0",
});
await page.waitForSelector("canvas");
console.log("stage: loaded");

// Three-point angle bisector: first point, vertex, third point.
await page.select("#workspace-mode", "measurement");
await pause();
await clickButton("קטעים וצורות");
await addPoint(-3, 0);
await addPoint(0, 0);
await addPoint(0, 3);
await clickTool("חוצה זווית");
await clickWorld(-3, 0);
await clickWorld(0, 0);
await clickWorld(0, 3);
let texts = await cardTexts();
if (!texts.some((text) => text.includes("חוצה זווית ABC")))
  errors.push(`three-point angle bisector failed: ${texts.join(" | ")}`);
console.log("stage: bisector", texts);

// A displayed angle label can be dragged locally without moving the plane.
await clickTool("זווית");
await clickWorld(-3, 0);
await clickWorld(0, 0);
await clickWorld(0, 3);
await clickButton("בחירה");
const element = await canvas();
const box = await element.boundingBox();
const labelX = box.x + box.width / 2 - 37;
const labelY = box.y + box.height / 2 - 37;
const hashRegion = async (x, y, width, height) =>
  element.evaluate(
    (canvas, region) => {
      const data = canvas.getContext("2d").getImageData(region.x, region.y, region.width, region.height).data;
      let hash = 2166136261;
      for (const byte of data) hash = Math.imul(hash ^ byte, 16777619);
      return hash >>> 0;
    },
    { x, y, width, height },
  );
const localX = labelX - box.x;
const localY = labelY - box.y;
const beforeLabel = await hashRegion(localX - 35, localY - 18, 70, 36);
await page.screenshot({ path: "/tmp/math-grids-before-label.png", fullPage: true });
await page.mouse.move(labelX, labelY);
await page.mouse.down();
await page.mouse.move(labelX + 30, labelY + 20, { steps: 5 });
await page.mouse.up();
await pause();
const afterLabel = await hashRegion(localX - 35, localY - 18, 70, 36);
if (beforeLabel === afterLabel) errors.push("angle label did not move");
console.log("stage: label", { beforeLabel, afterLabel });

// Triangle/function: two intersections appear as candidates and only the clicked one is created.
await reset();
await page.select("#workspace-mode", "shapes");
await pause();
await clickTool("מצולע");
await clickWorld(-3, -2);
console.log("stage: polygon");
await clickWorld(3, -2);
await clickWorld(0, 3);
await clickWorld(-3, -2);
await page.select("#workspace-mode", "graphs");
await pause();
await clickButton("הוספת פונקציה");
await page.waitForSelector("math-keyboard-field");
console.log("stage: function dialog");
await page.$eval("math-keyboard-field", (field) => {
  field.value = "f(x)=0";
  field.dispatchEvent(
    new CustomEvent("mkf-input", { bubbles: true, detail: { latex: "f(x)=0" } }),
  );
});
await clickButton("הוספה למישור");
console.log("stage: function added");
await clickButton("מדידה ובניות");
console.log(
  "tools:",
  await page.$$eval(".tool-grid button", (buttons) =>
    buttons.map((button) => (button.textContent || "").replace(/\s+/g, " ").trim()),
  ),
);
await clickTool("נקודות חיתוך");
await clickWorld(0, -2);
await clickWorld(0, 0);
console.log("stage: intersection selected");
const candidateHint = await page.$eval(".canvas-hint", (node) => node.textContent || "");
if (!candidateHint.includes("2 נקודות חיתוך"))
  errors.push(`multiple intersection candidates missing: ${candidateHint}`);
await clickWorld(-1.8, 0);
texts = await cardTexts();
const selectedIntersection = texts.find((text) => text.startsWith("D ("));
if (!selectedIntersection || !selectedIntersection.includes("(-1.8, 0)"))
  errors.push(`chosen polygon/function intersection failed: ${texts.join(" | ")}`);
if ((await page.$$(".object-card")).length !== 6)
  errors.push(`intersection created the wrong number of objects: ${(await page.$$(".object-card")).length}`);

await page.screenshot({ path: "/tmp/math-grids-feature-smoke.png", fullPage: true });
console.log(JSON.stringify({ errors, candidateHint, texts }));
await browser.close();
process.exit(errors.length ? 1 : 0);
