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

const pause = () => new Promise((resolve) => setTimeout(resolve, 150));
const buttons = async () => page.$$("button");
const clickButton = async (wanted) => {
  const candidates = [];
  for (const button of await buttons()) {
    const text = await button.evaluate((element) =>
      (element.textContent || "").replace(/\s+/g, " ").trim(),
    );
    candidates.push({ button, text });
  }
  const candidate = candidates.find(({ text }) => text === wanted) ??
    candidates.find(({ text }) => text.includes(wanted));
  if (candidate) {
    await candidate.button.click();
    await pause();
    return;
  }
  throw new Error(`Button not found: ${wanted}`);
};
const objectCount = () => page.$$eval(".object-card", (cards) => cards.length);
const clickTool = async (wanted) => {
  const candidates = await page.$$(".tool-grid button");
  for (const button of candidates) {
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

await page.goto(process.env.TEST_URL || "http://127.0.0.1:8765/", { waitUntil: "networkidle0" });
await page.waitForSelector("canvas");
await page.$$eval("label.toggle", (labels) => {
  const snapLabel = labels.find((label) =>
    (label.textContent || "").includes("הצמדה"),
  );
  const checkbox = snapLabel?.querySelector("input");
  if (checkbox?.checked) checkbox.click();
});
await pause();
const canvas = await page.$("canvas");
const box = await canvas.boundingBox();
if (!box) throw new Error("Canvas has no bounding box");
const clickCanvas = async (xRatio, yRatio) => {
  const currentBox = await canvas.boundingBox();
  if (!currentBox) throw new Error("Canvas lost its bounding box");
  await page.mouse.click(
    currentBox.x + currentBox.width * xRatio,
    currentBox.y + currentBox.height * yRatio,
  );
  await pause();
};
const clickWorld = async (x, y) => {
  const currentBox = await canvas.boundingBox();
  if (!currentBox) throw new Error("Canvas lost its bounding box");
  await page.mouse.click(
    currentBox.x + currentBox.width / 2 + x * 64,
    currentBox.y + currentBox.height / 2 - y * 64,
  );
  await pause();
};
const readPointCoordinates = async (name) => {
  for (const card of await page.$$(".object-card")) {
    const main = await card.$(".object-main");
    if (!main) continue;
    const text = await main.evaluate((element) =>
      (element.textContent || "").replace(/\s+/g, " ").trim(),
    );
    if (!text.startsWith(`${name} (`)) continue;
    await main.click();
    await pause();
    const toggle = await card.$(".object-toggle");
    if (toggle) await toggle.click();
    await pause();
    const values = await page.$$eval(".properties .xy-row input", (inputs) =>
      inputs.map((input) => Number(input.value)),
    );
    if (values.length === 2) return { x: values[0], y: values[1] };
  }
  throw new Error(`Point not found: ${name}`);
};

// Point
await clickTool("נקודה");
await clickCanvas(0.42, 0.48);
if ((await objectCount()) !== 1) errors.push("point creation failed");

// Segment with generated endpoint names and no automatic measurement labels.
await page.select("#workspace-mode", "shapes");
await pause();
await clickTool("קטע");
await clickCanvas(0.30, 0.60);
await clickCanvas(0.55, 0.40);
if ((await objectCount()) !== 4) errors.push(`segment creation failed: ${await objectCount()}`);
const pointB = await readPointCoordinates("B");
const pointC = await readPointCoordinates("C");
const firstSidePick = {
  x: pointB.x + (pointC.x - pointB.x) * 0.3,
  y: pointB.y + (pointC.y - pointB.y) * 0.3,
};

// Circle by center and point.
await page.select("#workspace-mode", "measurement");
await pause();
await clickButton("קטעים וצורות");
await clickTool("מעגל: מרכז ונקודה");
await clickCanvas(0.68, 0.62);
const circleBox = await canvas.boundingBox();
if (!circleBox) throw new Error("Canvas lost its bounding box");
await page.mouse.move(
  circleBox.x + circleBox.width * 0.78,
  circleBox.y + circleBox.height * 0.52,
);
await pause();
const circlePreviewPoint = await page.$eval(
  "canvas",
  (element, ratios) => {
    const canvas = element;
    const context = canvas.getContext("2d");
    const pixel = context.getImageData(
      Math.round(canvas.width * ratios.x),
      Math.round(canvas.height * ratios.y),
      1,
      1,
    ).data;
    return [...pixel];
  },
  { x: 0.78, y: 0.52 },
);
if (circlePreviewPoint[3] === 0)
  errors.push("circle preview point is not visible");
await clickCanvas(0.78, 0.52);
if ((await objectCount()) !== 7) errors.push(`circle creation failed: ${await objectCount()}`);

const circleMeasurementDefaults = await page.$$eval(
  ".properties .toggle",
  (labels) =>
    labels.map((label) => ({
      text: (label.textContent || "").replace(/\s+/g, " ").trim(),
      checked: label.querySelector("input")?.checked,
    })),
);
for (const label of ["רדיוס", "קוטר", "היקף", "שטח"]) {
  const setting = circleMeasurementDefaults.find((item) => item.text.includes(label));
  if (!setting || setting.checked) errors.push(`circle ${label} is visible by default`);
}

// Object visibility control.
const visibilityControls = await page.$$(".object-visibility");
const visibility = visibilityControls.at(-1);
if (!visibility) errors.push("visibility control missing");
else {
  const visibilitySize = await visibility.evaluate((element) => {
    const dot = element.querySelector("i");
    const rect = dot?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : null;
  });
  if (
    !visibilitySize ||
    Math.abs(visibilitySize.width - visibilitySize.height) > 0.5 ||
    visibilitySize.height > 24
  )
    errors.push(`visibility control distorted: ${JSON.stringify(visibilitySize)}`);
  await visibility.click();
  await pause();
  if (!(await visibility.$("i.visibility-empty"))) errors.push("hide object failed");
  const hiddenSize = await visibility.evaluate((element) => {
    const dot = element.querySelector("i");
    const rect = dot?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : null;
  });
  if (
    !hiddenSize ||
    Math.abs(hiddenSize.width - hiddenSize.height) > 0.5 ||
    hiddenSize.height > 24
  )
    errors.push(`hidden visibility control distorted: ${JSON.stringify(hiddenSize)}`);
  await visibility.click();
  await pause();
  if (!(await visibility.$("i.filled"))) errors.push("show object failed");
}

// Parallel through a newly created point.
await clickTool("מקביל");
await clickWorld(firstSidePick.x, firstSidePick.y);
const parallelFeedback = await page.$eval(".canvas-hint", (element) => element.textContent);
await clickCanvas(0.72, 0.30);
if ((await objectCount()) !== 9) errors.push(`parallel creation failed: ${await objectCount()} (${parallelFeedback})`);
const parallelTexts = await page.$$eval(".object-description", (elements) =>
  elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim()),
);
if (!parallelTexts.some((text) => text?.includes("מקביל ל־")))
  errors.push(`parallel name is unclear: ${parallelTexts.join(" | ")}`);

// Perpendicular through a newly created point.
await clickTool("מאונך");
await clickWorld(firstSidePick.x, firstSidePick.y);
const perpendicularFirstFeedback = await page.$eval(
  ".canvas-hint",
  (element) => element.textContent?.replace(/\s+/g, " ").trim(),
);
await clickCanvas(0.72, 0.72);
const perpendicularSecondFeedback = await page.$eval(
  ".canvas-hint",
  (element) => element.textContent?.replace(/\s+/g, " ").trim(),
);
if ((await objectCount()) !== 11)
  errors.push(
    `perpendicular creation failed: ${await objectCount()} (${perpendicularFirstFeedback} / ${perpendicularSecondFeedback})`,
  );

// A second side sharing a vertex, followed by an angle bisector selected
// through the first side, its vertex and the second side.
await page.select("#workspace-mode", "shapes");
await pause();
await clickTool("קטע");
const secondSideEnd = { x: pointC.x + 2, y: pointC.y - 2 };
await clickWorld(pointC.x, pointC.y);
await clickWorld(secondSideEnd.x, secondSideEnd.y);
if ((await objectCount()) !== 13)
  errors.push(`second angle side creation failed: ${await objectCount()}`);
await page.select("#workspace-mode", "measurement");
await pause();
await clickTool("חוצה זווית");
await clickWorld(firstSidePick.x, firstSidePick.y);
await clickWorld(pointC.x, pointC.y);
await clickWorld(
  (pointC.x + secondSideEnd.x) / 2,
  (pointC.y + secondSideEnd.y) / 2,
);
if ((await objectCount()) !== 14)
  errors.push(`angle bisector creation failed: ${await objectCount()}`);

// Named function f(x).
await page.select("#workspace-mode", "graphs");
await pause();
await clickButton("הוספת פונקציה");
await page.waitForSelector("math-keyboard-field");
await page.$eval("math-keyboard-field", (field) => {
  field.value = "f(x)=2x+1";
  field.dispatchEvent(new CustomEvent("mkf-input", { bubbles: true, detail: { latex: "f(x)=2x+1" } }));
});
await pause();
await clickButton("הוספה למישור");
if ((await objectCount()) !== 15) errors.push(`function creation failed: ${await objectCount()}`);

const functionTitle = await page.$eval(
  ".function-object-label",
  (element) => element.getAttribute("title"),
);
if (functionTitle !== "f(x)=2x+1")
  errors.push(`named function was not preserved: ${functionTitle}`);

const state = await page.evaluate(() => ({
  title: document.title,
  canvas: Boolean(document.querySelector("canvas")),
  objects: document.querySelectorAll(".object-card").length,
  functionText: [...document.querySelectorAll(".function-object-label")].map((x) => x.textContent),
  bodyText: document.body.innerText.slice(0, 300),
}));
state.testPoints = { pointB, pointC, firstSidePick };
await page.screenshot({ path: "/tmp/mathfix-smoke.png", fullPage: true });
console.log(JSON.stringify({ errors, state }));
await browser.close();
process.exit(errors.length ? 1 : 0);
